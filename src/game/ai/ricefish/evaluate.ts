import type { CubeCoord, GameState, PlayerIndex } from '@/types/game';
import type { AIPersonality } from '@/types/ai';
import { coordKey, cubeDistance } from '@/game/coordinates';
import { getGoalPositionsForState, hasPlayerWon } from '@/game/state';
import { getPlayerPieces } from '@/game/setup';

export const MATE = 1_000_000_000;

/**
 * Surcharge added to playerDistance per matched (outside-piece → goal-cell)
 * pair where the goal cell currently holds an opponent piece. Without this,
 * a swap-eviction is roughly net-zero in eval (our piece −1 distance, the
 * displaced opponent advances toward their own goal), so the search saw no
 * gradient toward the swap and would oscillate in endgame stalemates.
 *
 * Surgical: applied only inside the greedy matching, so blockers on goal
 * cells that the matching doesn't pick (because closer empty goals exist)
 * cost nothing.
 */
export const OBSTRUCTION_PENALTY = 1.5;

/**
 * Extra weight on the *farthest* matched piece-to-goal distance. Sum of
 * distances treats "advance a near piece by 1" and "advance the back piece
 * by 1" as equal, so the AI naturally pulls already-close pieces forward
 * (move ordering tiebreaks by travel distance, which favors jumps on near
 * pieces) and leaves stragglers stranded.
 *
 * 0.5 is enough to tiebreak the back piece's forward step ahead of a same-
 * size near-piece step, without dragging the AI into pulling the back piece
 * when other pieces have much larger gains available.
 */
export const STRAGGLER_WEIGHT = 0.5;

// Cache the goal-cell list per player for one search call. Each entry's
// "filled" membership is recomputed per-state at the call site (cheap —
// just board lookups), so the cache stores only the immutable cell list.
export type GoalCellsCache = Map<PlayerIndex, CubeCoord[]>;

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
  if (piecesOutside.length === 0) return 0;

  const pieceKeys = new Set(pieces.map(coordKey));
  const unfilled = goals.filter((g) => !pieceKeys.has(coordKey(g)));
  if (unfilled.length === 0) return 0;

  const { cost, obstructed, maxDist } = greedyAssignmentCost(state, player, piecesOutside, unfilled);
  return cost + OBSTRUCTION_PENALTY * obstructed + STRAGGLER_WEIGHT * maxDist;
}

/**
 * Greedy minimum-cost bipartite matching by repeatedly taking the closest
 * (piece, goal) pair among remaining options. Also counts how many of the
 * matched goal cells are occupied by an opponent piece (blockers we'll need
 * to swap-evict) and tracks the largest matched distance (the straggler).
 */
function greedyAssignmentCost(
  state: GameState,
  player: PlayerIndex,
  pieces: CubeCoord[],
  goals: CubeCoord[],
): { cost: number; obstructed: number; maxDist: number } {
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
  let obstructed = 0;
  let maxDist = 0;
  for (const { pi, gj, d } of pairs) {
    if (usedP.size >= limit) break;
    if (usedP.has(pi) || usedG.has(gj)) continue;
    total += d;
    if (d > maxDist) maxDist = d;
    const cell = state.board.get(coordKey(goals[gj]));
    if (cell?.type === 'piece' && cell.player !== player) obstructed++;
    usedP.add(pi);
    usedG.add(gj);
  }
  return { cost: total, obstructed, maxDist };
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
 * Terminal: returns +MATE if `player` has won. Does NOT short-circuit when an
 * opponent has won — the game continues until all players finish, and a flat
 * -MATE would make every move look equivalent and the AI would shuffle
 * sideways. Falling through to the normal eval lets our own distance keep
 * driving the search so the loser still advances its remaining pieces.
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
  if (hasPlayerWon(state, player)) return MATE;

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

export type RicefishScoreFn = (
  state: GameState,
  player: PlayerIndex,
  personality: AIPersonality,
  cache?: GoalCellsCache,
) => number;
