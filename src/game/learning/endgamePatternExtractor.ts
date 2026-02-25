import type { GameState, PlayerIndex, Move } from '@/types/game';
import type { EndgameMetrics } from './types';
import { coordKey, cubeDistance } from '../coordinates';
import { getGoalPositionsForState } from '../state';

/**
 * Extract endgame-specific metrics for a player from a completed game.
 * Replays move history to track when pieces entered goal and how.
 */
export function extractEndgameMetrics(
  finalState: GameState,
  player: PlayerIndex
): EndgameMetrics {
  const goalPositions = getGoalPositionsForState(finalState, player);
  const goalKeys = new Set(goalPositions.map(g => coordKey(g)));

  // Build a depth lookup for goal positions (distance from board center)
  const goalDepths = new Map<string, number>();
  const boardCenter = { q: 0, r: 0, s: 0 };
  for (const g of goalPositions) {
    goalDepths.set(coordKey(g), cubeDistance(g, boardCenter));
  }

  // Track state as we replay moves
  let piecesInGoal = 0;
  let playerMoveIndex = 0;
  let movesFrom7ToFinish: number | null = null;
  let movesFrom8ToFinish: number | null = null;
  let movesFrom9ToFinish: number | null = null;
  let moveAt7: number | null = null;
  let moveAt8: number | null = null;
  let moveAt9: number | null = null;
  let shuffleMovesInEndgame = 0; // Moves where both from and to are in goal
  let exitAndReenterCount = 0;   // Times a piece left goal then re-entered
  const goalFillOrder: number[] = []; // Depth of each goal as it was filled

  // Track which goal positions are occupied to detect exits
  const occupiedGoals = new Set<string>();

  for (const move of finalState.moveHistory) {
    if (move.player !== player) continue;
    playerMoveIndex++;

    const fromKey = coordKey(move.from);
    const toKey = coordKey(move.to);
    const fromInGoal = goalKeys.has(fromKey);
    const toInGoal = goalKeys.has(toKey);

    if (fromInGoal && toInGoal) {
      // Shuffle within goal
      if (piecesInGoal >= 7) {
        shuffleMovesInEndgame++;
      }
      occupiedGoals.delete(fromKey);
      occupiedGoals.add(toKey);
    } else if (!fromInGoal && toInGoal) {
      // Entering goal
      piecesInGoal++;
      occupiedGoals.add(toKey);

      // Record the depth of the goal position filled
      const depth = goalDepths.get(toKey);
      if (depth !== undefined) {
        goalFillOrder.push(depth);
      }

      // Track milestone move counts
      if (piecesInGoal === 7 && moveAt7 === null) {
        moveAt7 = playerMoveIndex;
      }
      if (piecesInGoal === 8 && moveAt8 === null) {
        moveAt8 = playerMoveIndex;
      }
      if (piecesInGoal === 9 && moveAt9 === null) {
        moveAt9 = playerMoveIndex;
      }
    } else if (fromInGoal && !toInGoal) {
      // Leaving goal
      piecesInGoal--;
      occupiedGoals.delete(fromKey);
      exitAndReenterCount++;
    }
    // !fromInGoal && !toInGoal: outside movement, no tracking needed
  }

  // Calculate moves from milestone to finish (10 in goal)
  const totalPlayerMoves = playerMoveIndex;
  if (piecesInGoal >= 10) {
    if (moveAt7 !== null) {
      movesFrom7ToFinish = totalPlayerMoves - moveAt7;
    }
    if (moveAt8 !== null) {
      movesFrom8ToFinish = totalPlayerMoves - moveAt8;
    }
    if (moveAt9 !== null) {
      movesFrom9ToFinish = totalPlayerMoves - moveAt9;
    }
  }

  return {
    movesFrom7ToFinish,
    movesFrom8ToFinish,
    movesFrom9ToFinish,
    goalFillOrder,
    shuffleMovesInEndgame,
    exitAndReenterCount,
  };
}

/**
 * Score how "optimal" the goal fill order was.
 * Optimal = deepest positions filled first (score 1.0).
 * Reverse order (shallowest first) = score 0.0.
 */
export function scoreGoalFillOrder(goalFillOrder: number[]): number {
  if (goalFillOrder.length <= 1) return 0.5;

  // Count inversions: pairs where a shallower position was filled before a deeper one
  let inversions = 0;
  let totalPairs = 0;
  for (let i = 0; i < goalFillOrder.length; i++) {
    for (let j = i + 1; j < goalFillOrder.length; j++) {
      totalPairs++;
      // We want deeper (higher) filled first, so it's an inversion
      // if the earlier entry is shallower (lower depth)
      if (goalFillOrder[i] < goalFillOrder[j]) {
        inversions++;
      }
    }
  }

  // 0 inversions = perfectly deep-first = score 1.0
  // All inversions = perfectly shallow-first = score 0.0
  return totalPairs > 0 ? 1 - (inversions / totalPairs) : 0.5;
}
