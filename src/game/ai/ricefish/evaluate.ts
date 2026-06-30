import type { CubeCoord, GameState, PlayerIndex } from '@/types/game';
import type { AIPersonality } from '@/types/ai';
import { coordKey, cubeAdd, cubeDistance } from '@/game/coordinates';
import { DIRECTIONS } from '@/game/constants';
import { getGoalPositionsForState, hasPlayerWon } from '@/game/state';
import { getPlayerPieces } from '@/game/setup';

export const MATE = 1_000_000_000;

// Each opponent piece sitting inside this player's goal triangle adds this
// many distance units. Without it the matching eval thinks blocker-cells
// are "reachable at cubeDistance" — which is mostly true, but the act of
// swapping them out is a discrete win the eval should reward, otherwise
// the search has no gradient pushing it to clear blockers.
const BLOCKER_PENALTY = 3;

// Extra penalty per unit of "depth" a blocker sits at. Depth = BFS distance
// from the entry edge of the goal area (entry cells = depth 0, the tip =
// max). This creates a gradient where each swap that shifts a blocker
// toward the entry shows up as a real eval improvement, so the search can
// chain multi-step blocker-evictions even when no single move directly
// fills a goal.
const BLOCKER_DEPTH_WEIGHT = 2;

// Bonus per unit of depth for each of my own pieces sitting in the goal.
// Encourages packing pieces toward the back of the triangle so the entry
// row stays open for late arrivals (and so swaps that pull a piece deeper
// register as positive progress).
const OWN_DEPTH_WEIGHT = 1;

// Endgame multiplier on the blocker-related terms. When most of my pieces
// are already home, removing the remaining blockers is essentially the
// whole game — small improvements elsewhere shouldn't outweigh a swap.
// Triggers at the fractions below; values chosen so a swap that displaces
// a blocker beats almost any non-swap forward step.
function endgameBlockerMultiplier(inGoalFraction: number): number {
  if (inGoalFraction >= 0.8) return 3.0;
  if (inGoalFraction >= 0.6) return 1.75;
  return 1.0;
}

// Bonus for each of my pieces adjacent to a blocker — they're "primed" for
// a swap on the next ply. Encourages the search to walk pieces toward
// blockers as setup moves even before a direct swap is available, which
// is the key to multi-swap chain plans deeper than the search horizon.
const SWAP_SETUP_BONUS = 2;

// Cache per player for one search call. Stores both the goal-cell list and
// the depth map (depth = BFS distance from entry cells, where entry cells
// are goal cells with at least one on-board non-goal neighbor).
interface GoalsAndDepths {
  goals: CubeCoord[];
  depths: Map<string, number>;
}
type GoalCellsCache = Map<PlayerIndex, GoalsAndDepths>;

function getOrComputeGoalData(
  state: GameState,
  player: PlayerIndex,
  cache?: GoalCellsCache,
): GoalsAndDepths {
  const cached = cache?.get(player);
  if (cached) return cached;
  const goals = getGoalPositionsForState(state, player);
  const depths = computeGoalDepths(goals, state);
  const data: GoalsAndDepths = { goals, depths };
  cache?.set(player, data);
  return data;
}

/**
 * BFS from entry cells to compute per-cell depth. "Entry cells" are goal
 * cells with at least one on-board neighbor that is NOT a goal cell — i.e.
 * the boundary between the goal area and the rest of the board. Cells
 * surrounded entirely by other goal cells (or by off-board) sit deeper.
 *
 * For the standard top triangle: entry row {(1,-5)..(4,-5)} = depth 0,
 * second row {(2,-6)..(4,-6)} = 1, third row {(3,-7),(4,-7)} = 2, tip
 * (4,-8) = 3.
 */
function computeGoalDepths(
  goals: CubeCoord[],
  state: GameState,
): Map<string, number> {
  const goalSet = new Set(goals.map(coordKey));
  const depths = new Map<string, number>();
  const queue: Array<{ cell: CubeCoord; depth: number }> = [];

  for (const g of goals) {
    for (const dir of DIRECTIONS) {
      const n = cubeAdd(g, dir);
      const nKey = coordKey(n);
      const onBoard = state.board.has(nKey);
      if (onBoard && !goalSet.has(nKey)) {
        queue.push({ cell: g, depth: 0 });
        depths.set(coordKey(g), 0);
        break;
      }
    }
  }

  let head = 0;
  while (head < queue.length) {
    const { cell, depth } = queue[head++];
    for (const dir of DIRECTIONS) {
      const n = cubeAdd(cell, dir);
      const nKey = coordKey(n);
      if (goalSet.has(nKey) && !depths.has(nKey)) {
        depths.set(nKey, depth + 1);
        queue.push({ cell: n, depth: depth + 1 });
      }
    }
  }

  // Any goal cell not reached by BFS (fully isolated, no entry neighbor on
  // board) gets depth 0. Shouldn't happen on the standard board but is a
  // safety net for pathological custom layouts.
  for (const g of goals) {
    const k = coordKey(g);
    if (!depths.has(k)) depths.set(k, 0);
  }
  return depths;
}

/**
 * Sum of hex distances from each *outside* piece (one not yet in a goal cell)
 * to a unique unfilled goal cell, under a greedy minimum-cost matching.
 *
 * Why a matching rather than "nearest-unfilled-goal per piece independently":
 * with the latter, two pieces can both "claim" the same close goal, which
 * understates the true endgame distance (one piece would still have to travel
 * to the OTHER empty goal). Empirically this caused infinite oscillation when
 * 8/10 pieces were in goal and two outside pieces both targeted the closer
 * empty slot. The greedy assignment forces each piece to its own goal cell.
 *
 * Greedy here is sub-optimal vs Hungarian but cheap (O((P·G)·log(P·G)) per
 * eval) and good enough for this endgame.
 */
export function playerDistance(
  state: GameState,
  player: PlayerIndex,
  cache?: GoalCellsCache,
): number {
  const { goals, depths } = getOrComputeGoalData(state, player, cache);
  const pieces = getPlayerPieces(state, player);
  if (pieces.length === 0 || goals.length === 0) return 0;

  const goalKeys = new Set(goals.map(coordKey));
  const piecesOutside: CubeCoord[] = [];
  let ownDepthBonus = 0;
  for (const piece of pieces) {
    const k = coordKey(piece);
    if (goalKeys.has(k)) {
      ownDepthBonus += depths.get(k) ?? 0;
    } else {
      piecesOutside.push(piece);
    }
  }

  // Walk all goal cells: count opponents sitting in them (blockers), sum
  // their depths, tally how many cells are filled (for the endgame
  // multiplier), and remember each blocker's coord so we can compute the
  // "setup" bonus below.
  let blockerCount = 0;
  let blockerDepthSum = 0;
  let filledGoalCells = 0;
  const blockerKeys = new Set<string>();
  for (const g of goals) {
    const k = coordKey(g);
    const c = state.board.get(k);
    if (c?.type === 'piece') {
      filledGoalCells++;
      if (c.player !== player) {
        blockerCount++;
        blockerDepthSum += depths.get(k) ?? 0;
        blockerKeys.add(k);
      }
    }
  }

  // Setup bonus: each of my pieces that is adjacent to a blocker counts
  // as "primed" — it can swap next turn. Encourages the search to walk
  // pieces toward blockers as preparation, not just when a direct swap
  // is one ply away.
  let setupCount = 0;
  if (blockerKeys.size > 0) {
    for (const piece of pieces) {
      for (const dir of DIRECTIONS) {
        const n = cubeAdd(piece, dir);
        if (blockerKeys.has(coordKey(n))) {
          setupCount++;
          break;
        }
      }
    }
  }

  // Endgame multiplier is tied to *goal occupancy* (filled cells / total
  // goal cells), not to my in-goal count. If I step a piece OUT of goal,
  // filled drops by 1 — but blockers still sit there, so the multiplier
  // stays high. Without this, the AI discovers it can dodge the blocker
  // penalty by abandoning its own goal cells.
  const mult = endgameBlockerMultiplier(filledGoalCells / goals.length);
  const blockerTerm = mult * (BLOCKER_PENALTY * blockerCount + BLOCKER_DEPTH_WEIGHT * blockerDepthSum);
  const ownDepthTerm = OWN_DEPTH_WEIGHT * ownDepthBonus;
  const setupTerm = SWAP_SETUP_BONUS * setupCount;

  if (piecesOutside.length === 0) return blockerTerm - ownDepthTerm - setupTerm;

  const pieceKeys = new Set(pieces.map(coordKey));
  const unfilled = goals.filter((g) => !pieceKeys.has(coordKey(g)));
  if (unfilled.length === 0) return blockerTerm - ownDepthTerm - setupTerm;

  return greedyAssignmentCost(piecesOutside, unfilled) + blockerTerm - ownDepthTerm - setupTerm;
}

/**
 * Greedy minimum-cost bipartite matching by repeatedly taking the closest
 * (piece, goal) pair among remaining options.
 */
function greedyAssignmentCost(pieces: CubeCoord[], goals: CubeCoord[]): number {
  const pairs: Array<{ pi: number; gj: number; d: number }> = [];
  for (let i = 0; i < pieces.length; i++) {
    for (let j = 0; j < goals.length; j++) {
      pairs.push({ pi: i, gj: j, d: cubeDistance(pieces[i], goals[j]) });
    }
  }
  pairs.sort((a, b) => a.d - b.d);

  const usedP = new Set<number>();
  const usedG = new Set<number>();
  const limit = Math.min(pieces.length, goals.length);
  let total = 0;
  for (const { pi, gj, d } of pairs) {
    if (usedP.size >= limit) break;
    if (usedP.has(pi) || usedG.has(gj)) continue;
    total += d;
    usedP.add(pi);
    usedG.add(gj);
  }
  return total;
}

function defenseWeight(personality: AIPersonality): number {
  switch (personality) {
    case 'defensive': return 2.0;
    case 'aggressive': return 0.75;
    case 'generalist':
    default: return 1.0;
  }
}

/**
 * Score the position from `player`'s perspective. Higher is better for `player`.
 *
 * Terminal: returns ±MATE if any player has won the game.
 * Otherwise: (weighted sum of all opponents' distances) − (player's distance).
 *
 * Ricefish's original `score_by_side` did `their_dist - our_dist` for the 2-player
 * case. We generalize: an opponent making progress (smaller their_dist) is bad
 * for us, so opponents' distance enters with a positive sign and our own with
 * a negative one. The `defenseWeight` from personality scales opponent terms.
 */
export function ricefishScore(
  state: GameState,
  player: PlayerIndex,
  personality: AIPersonality,
  cache?: GoalCellsCache,
): number {
  // Terminal shortcut. If `player` is finished they're winning from their
  // POV regardless of search depth left.
  if (hasPlayerWon(state, player)) return MATE;
  for (const other of state.activePlayers) {
    if (other === player) continue;
    if (hasPlayerWon(state, other)) return -MATE;
  }

  const w = defenseWeight(personality);
  let oppTotal = 0;
  for (const other of state.activePlayers) {
    if (other === player) continue;
    oppTotal += playerDistance(state, other, cache);
  }
  const ourDist = playerDistance(state, player, cache);
  return w * oppTotal - ourDist;
}

/**
 * Construct a fresh goal-cells cache. Callers re-use this across all node
 * evaluations within a single search so each player's goal cell list is
 * fetched at most once.
 */
export function createGoalCentroidCache(): GoalCellsCache {
  return new Map();
}
