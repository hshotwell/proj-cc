import type { GameState, PlayerIndex, CubeCoord } from '@/types/game';
import { getPlayerPieces } from './setup';
import { getGoalPositions, getHomePositions } from './state';
import { cubeDistance, centroid } from './coordinates';

// Cache starting and goal total distances per player (they never change)
const startingTotalDistCache = new Map<PlayerIndex, number>();
const goalTotalDistCache = new Map<PlayerIndex, number>();

function getStartingTotalDist(player: PlayerIndex): number {
  if (startingTotalDistCache.has(player)) {
    return startingTotalDistCache.get(player)!;
  }
  const homePositions = getHomePositions(player);
  const goalPositions = getGoalPositions(player);
  const goalCenter = centroid(goalPositions);
  const totalDist = homePositions.reduce(
    (sum, pos) => sum + cubeDistance(pos, goalCenter),
    0
  );
  startingTotalDistCache.set(player, totalDist);
  return totalDist;
}

function getGoalTotalDist(player: PlayerIndex): number {
  if (goalTotalDistCache.has(player)) {
    return goalTotalDistCache.get(player)!;
  }
  const goalPositions = getGoalPositions(player);
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
 * Formula: (startingTotalDist - currentTotalDist) / (startingTotalDist - goalTotalDist) * 100
 *
 * - 0% when all pieces are in their home positions
 * - 100% when all pieces are in their goal positions
 */
export function computePlayerProgress(
  state: GameState,
  player: PlayerIndex
): number {
  const pieces = getPlayerPieces(state, player);
  const goalPositions = getGoalPositions(player);
  const goalCenter = centroid(goalPositions);

  const currentTotalDist = pieces.reduce(
    (sum, pos) => sum + cubeDistance(pos, goalCenter),
    0
  );

  const startingTotalDist = getStartingTotalDist(player);
  const goalTotalDist = getGoalTotalDist(player);
  const range = startingTotalDist - goalTotalDist;

  if (range <= 0) return 100;

  const progress = ((startingTotalDist - currentTotalDist) / range) * 100;
  return Math.max(0, Math.min(100, progress));
}
