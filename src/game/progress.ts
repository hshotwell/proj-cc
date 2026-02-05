import type { GameState, PlayerIndex } from '@/types/game';
import { getPlayerPieces } from './setup';
import { getGoalPositionsForState, getHomePositionsForState } from './state';
import { cubeDistance, centroid } from './coordinates';
import { computePathBasedProgress } from './pathfinding';

// Cache starting and goal total distances per player for default layouts only
const startingTotalDistCache = new Map<PlayerIndex, number>();
const goalTotalDistCache = new Map<PlayerIndex, number>();

function getStartingTotalDist(state: GameState, player: PlayerIndex): number {
  // For custom layouts, this is not used (we use path-based progress instead)
  if (state.isCustomLayout) {
    return 0;
  }

  // For standard layouts, use cache
  if (startingTotalDistCache.has(player)) {
    return startingTotalDistCache.get(player)!;
  }
  const homePositions = getHomePositionsForState(state, player);
  const goalPositions = getGoalPositionsForState(state, player);
  const goalCenter = centroid(goalPositions);
  const totalDist = homePositions.reduce(
    (sum, pos) => sum + cubeDistance(pos, goalCenter),
    0
  );
  startingTotalDistCache.set(player, totalDist);
  return totalDist;
}

function getGoalTotalDist(state: GameState, player: PlayerIndex): number {
  // For custom layouts, this is not used (we use path-based progress instead)
  if (state.isCustomLayout) {
    return 0;
  }

  // For standard layouts, use cache
  if (goalTotalDistCache.has(player)) {
    return goalTotalDistCache.get(player)!;
  }
  const goalPositions = getGoalPositionsForState(state, player);
  const goalCenter = centroid(goalPositions);
  const totalDist = goalPositions.reduce(
    (sum, pos) => sum + cubeDistance(pos, goalCenter),
    0
  );
  goalTotalDistCache.set(player, totalDist);
  return totalDist;
}

/**
 * Compute a player's progress as a percentage (0-100).
 *
 * For standard layouts:
 * Formula: (startingTotalDist - currentTotalDist) / (startingTotalDist - goalTotalDist) * 100
 *
 * For custom layouts:
 * Uses path-based progress that computes actual move distances through the board
 * topology, with optimal assignment of pieces to goals.
 *
 * - 0% when all pieces are in their home positions
 * - 100% when all pieces are in their goal positions
 */
export function computePlayerProgress(
  state: GameState,
  player: PlayerIndex
): number {
  const pieces = getPlayerPieces(state, player);
  const goalPositions = getGoalPositionsForState(state, player);

  if (goalPositions.length === 0 || pieces.length === 0) return 0;

  // For custom layouts, use path-based progress that accounts for board topology
  if (state.isCustomLayout) {
    const homePositions = getHomePositionsForState(state, player);
    return computePathBasedProgress(state, player, pieces, goalPositions, homePositions);
  }

  // For standard layouts, use efficient distance-based calculation
  const goalCenter = centroid(goalPositions);

  const currentTotalDist = pieces.reduce(
    (sum, pos) => sum + cubeDistance(pos, goalCenter),
    0
  );

  const startingTotalDist = getStartingTotalDist(state, player);
  const goalTotalDist = getGoalTotalDist(state, player);
  const range = startingTotalDist - goalTotalDist;

  if (range <= 0) return 100;

  const progress = ((startingTotalDist - currentTotalDist) / range) * 100;
  return Math.max(0, Math.min(100, progress));
}
