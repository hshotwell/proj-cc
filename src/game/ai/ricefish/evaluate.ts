import type { CubeCoord, GameState, PlayerIndex } from '@/types/game';
import type { AIPersonality } from '@/types/ai';
import { coordKey, cubeDistance } from '@/game/coordinates';
import { getGoalPositionsForState, hasPlayerWon } from '@/game/state';
import { getPlayerPieces } from '@/game/setup';

export const MATE = 1_000_000_000;

// Each opponent piece sitting inside this player's goal triangle adds this
// many distance units. Without it the matching eval thinks blocker-cells
// are "reachable at cubeDistance" — which is mostly true, but the act of
// swapping them out is a discrete win the eval should reward, otherwise
// the search has no gradient pushing it to clear blockers. Empirically
// chosen: large enough to dominate a one-hex step's worth of progress so
// that a useful swap looks strictly better than a sideways shuffle.
const BLOCKER_PENALTY = 3;

// Cache the goal-cell list per player for one search call. Each entry's
// "filled" membership is recomputed per-state at the call site (cheap —
// just board lookups), so the cache stores only the immutable cell list.
type GoalCellsCache = Map<PlayerIndex, CubeCoord[]>;

function getOrComputeGoals(
  state: GameState,
  player: PlayerIndex,
  cache?: GoalCellsCache,
): CubeCoord[] {
  const cached = cache?.get(player);
  if (cached) return cached;
  const goals = getGoalPositionsForState(state, player);
  cache?.set(player, goals);
  return goals;
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
  const goals = getOrComputeGoals(state, player, cache);
  const pieces = getPlayerPieces(state, player);
  if (pieces.length === 0 || goals.length === 0) return 0;

  const goalKeys = new Set(goals.map(coordKey));
  const piecesOutside: CubeCoord[] = [];
  for (const piece of pieces) {
    if (!goalKeys.has(coordKey(piece))) piecesOutside.push(piece);
  }

  // Count opponent pieces currently occupying my goal cells. These need to
  // be displaced (via swap) before I can finish the game; every extra
  // blocker raises my effective distance.
  let blockers = 0;
  for (const g of goals) {
    const c = state.board.get(coordKey(g));
    if (c?.type === 'piece' && c.player !== player) blockers++;
  }

  if (piecesOutside.length === 0) return BLOCKER_PENALTY * blockers;

  const pieceKeys = new Set(pieces.map(coordKey));
  const unfilled = goals.filter((g) => !pieceKeys.has(coordKey(g)));
  if (unfilled.length === 0) return BLOCKER_PENALTY * blockers;

  return greedyAssignmentCost(piecesOutside, unfilled) + BLOCKER_PENALTY * blockers;
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
