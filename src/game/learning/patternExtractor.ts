import type { GameState, PlayerIndex, Move, CubeCoord } from '@/types/game';
import type { GamePatterns, PlayerGameMetrics, GameSummary } from './types';
import { coordKey, cubeDistance, centroid } from '../coordinates';
import { getGoalPositionsForState } from '../state';
import { DIRECTIONS } from '../constants';
import { extractEndgameMetrics } from './endgamePatternExtractor';

/**
 * Extract learning patterns from a completed game
 */
export function extractGamePatterns(
  finalState: GameState,
  gameId: string
): GamePatterns {
  const { moveHistory, activePlayers, winner, playerCount, isCustomLayout } = finalState;

  // Group moves by player
  const movesByPlayer = new Map<PlayerIndex, Move[]>();
  for (const player of activePlayers) {
    movesByPlayer.set(player, []);
  }
  for (const move of moveHistory) {
    // Moves in history always have a player set
    if (move.player === undefined) continue;
    const playerMoves = movesByPlayer.get(move.player);
    if (playerMoves) {
      playerMoves.push(move);
    }
  }

  // Extract metrics for each player
  const playerMetrics: Partial<Record<PlayerIndex, PlayerGameMetrics>> = {};
  for (const player of activePlayers) {
    const moves = movesByPlayer.get(player) || [];
    playerMetrics[player] = extractPlayerMetrics(
      finalState,
      player,
      moves,
      moveHistory,
      player === winner
    );
  }

  // Calculate winner's move count
  const winnerMoveCount = winner !== null
    ? (movesByPlayer.get(winner)?.length || 0)
    : moveHistory.length;

  // Extract endgame metrics for the winner
  const endgameMetrics = winner !== null
    ? extractEndgameMetrics(finalState, winner)
    : undefined;

  return {
    gameId,
    timestamp: Date.now(),
    isCustomLayout: isCustomLayout || false,
    playerCount,
    winner,
    playerMetrics,
    totalMoves: moveHistory.length,
    winnerMoveCount,
    endgameMetrics,
  };
}

/**
 * Extract metrics for a single player's performance in a game
 */
function extractPlayerMetrics(
  state: GameState,
  player: PlayerIndex,
  playerMoves: Move[],
  allMoves: Move[],
  isWinner: boolean
): PlayerGameMetrics {
  const goalPositions = getGoalPositionsForState(state, player);
  const goalCenter = centroid(goalPositions);
  const goalKeys = new Set(goalPositions.map(g => coordKey(g)));

  // Count move types
  let jumpMoves = 0;
  let stepMoves = 0;
  let swapMoves = 0;
  let totalDistanceGained = 0;
  let totalJumpChainLength = 0;
  let maxJumpChainLength = 0;

  for (const move of playerMoves) {
    if (move.isSwap) {
      swapMoves++;
    } else if (move.isJump) {
      jumpMoves++;
      const chainLength = move.jumpPath?.length || 1;
      totalJumpChainLength += chainLength;
      maxJumpChainLength = Math.max(maxJumpChainLength, chainLength);
    } else {
      stepMoves++;
    }

    // Calculate distance gained toward goal
    const distBefore = cubeDistance(move.from, goalCenter);
    const distAfter = cubeDistance(move.to, goalCenter);
    totalDistanceGained += (distBefore - distAfter);
  }

  // Calculate progression milestones
  let movesToFirstGoalEntry: number | null = null;
  let movesToHalfGoalFilled: number | null = null;
  let piecesInGoal = 0;
  let moveIndex = 0;

  // Replay through all moves to find milestones
  const piecePositions = new Map<string, CubeCoord>(); // Track piece positions

  // Initialize with starting positions (we'd need to reconstruct, so approximate)
  for (let i = 0; i < allMoves.length; i++) {
    const move = allMoves[i];
    if (move.player === undefined || move.player !== player) continue;

    moveIndex++;

    // Check if this move enters a goal
    if (goalKeys.has(coordKey(move.to))) {
      if (movesToFirstGoalEntry === null) {
        movesToFirstGoalEntry = moveIndex;
      }
      piecesInGoal++;
      if (piecesInGoal >= 5 && movesToHalfGoalFilled === null) {
        movesToHalfGoalFilled = moveIndex;
      }
    }

    // Check if leaving a goal
    if (goalKeys.has(coordKey(move.from))) {
      piecesInGoal--;
    }
  }

  // Calculate piece cohesion (average over sampled states)
  // This is expensive to compute exactly, so we estimate
  const avgPieceCohesion = estimateCohesion(playerMoves);

  return {
    totalMoves: playerMoves.length,
    jumpMoves,
    stepMoves,
    swapMoves,
    avgDistanceGainedPerMove: playerMoves.length > 0
      ? totalDistanceGained / playerMoves.length
      : 0,
    avgJumpChainLength: jumpMoves > 0
      ? totalJumpChainLength / jumpMoves
      : 0,
    maxJumpChainLength,
    movesToFirstGoalEntry,
    movesToHalfGoalFilled,
    avgPieceCohesion,
    isWinner,
  };
}

/**
 * Estimate piece cohesion from move patterns
 * Cohesion = how often pieces are within jumping range of each other
 */
function estimateCohesion(moves: Move[]): number {
  if (moves.length < 2) return 0.5;

  // Count how many moves were jumps (indicates pieces were near each other)
  const jumpRatio = moves.filter(m => m.isJump).length / moves.length;

  // Higher jump ratio suggests better piece coordination
  return Math.min(1, jumpRatio * 1.5);
}

/**
 * Calculate a quality score for a game (higher = more valuable for learning)
 */
export function calculateGameQuality(patterns: GamePatterns): number {
  // No winner = low quality (incomplete or draw)
  if (patterns.winner === null) {
    return 0.1;
  }

  const winnerMetrics = patterns.playerMetrics[patterns.winner];
  if (!winnerMetrics) return 0.1;

  // Base quality on efficiency (fewer moves = better)
  // Normalize: 30 moves = excellent, 100 moves = poor
  const moveEfficiency = Math.max(0, Math.min(1,
    (100 - winnerMetrics.totalMoves) / 70
  ));

  // Bonus for high jump utilization (indicates skillful play)
  const jumpUtilization = winnerMetrics.totalMoves > 0
    ? winnerMetrics.jumpMoves / winnerMetrics.totalMoves
    : 0;

  // Bonus for good distance gained per move
  const distanceEfficiency = Math.min(1, winnerMetrics.avgDistanceGainedPerMove / 2);

  // Combine factors
  const quality = (
    moveEfficiency * 0.5 +
    jumpUtilization * 0.25 +
    distanceEfficiency * 0.25
  );

  return Math.max(0.1, Math.min(1, quality));
}

/**
 * Create a game summary from patterns
 */
export function createGameSummary(
  patterns: GamePatterns,
  layoutId?: string
): GameSummary {
  return {
    gameId: patterns.gameId,
    timestamp: patterns.timestamp,
    isCustomLayout: patterns.isCustomLayout,
    layoutId,
    playerCount: patterns.playerCount,
    winner: patterns.winner,
    totalMoves: patterns.totalMoves,
    winnerMoveCount: patterns.winnerMoveCount,
    patterns,
    qualityScore: calculateGameQuality(patterns),
  };
}
