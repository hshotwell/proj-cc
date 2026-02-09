import type { GameState, PlayerIndex, CubeCoord, Move } from '@/types/game';
import type { LearnedWeights } from './types';
import { getLearnedWeights } from './learningStore';
import { DEFAULT_LEARNED_WEIGHTS } from './types';
import { coordKey, cubeDistance, centroid } from '../coordinates';
import { getGoalPositionsForState } from '../state';
import { getPlayerPieces } from '../setup';
import { DIRECTIONS } from '../constants';

// Cache learned weights to avoid repeated localStorage reads
let cachedWeights: LearnedWeights | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 1 minute

/**
 * Get learned weights with caching
 */
export function getCachedLearnedWeights(): LearnedWeights {
  const now = Date.now();
  if (!cachedWeights || now - cacheTimestamp > CACHE_TTL) {
    cachedWeights = getLearnedWeights();
    cacheTimestamp = now;
  }
  return cachedWeights;
}

/**
 * Clear the weights cache (call after learning from a new game)
 */
export function clearWeightsCache(): void {
  cachedWeights = null;
  cacheTimestamp = 0;
}

/**
 * Apply learned weights to adjust a base evaluation score
 *
 * @param baseScore - The original evaluation score from the AI
 * @param state - Current game state
 * @param player - Player being evaluated
 * @param factors - Breakdown of what contributed to the base score
 */
export function applyLearnedWeights(
  baseScore: number,
  state: GameState,
  player: PlayerIndex,
  factors: EvaluationFactors
): number {
  const weights = getCachedLearnedWeights();

  // If no learning data, return base score
  if (weights.gamesAnalyzed === 0) {
    return baseScore;
  }

  // Apply weight modifiers to each factor
  let adjustedScore = 0;

  // Distance component
  adjustedScore += factors.distanceScore * weights.distanceWeight;

  // Cohesion component
  adjustedScore += factors.cohesionScore * weights.cohesionWeight;

  // Mobility component
  adjustedScore += factors.mobilityScore * weights.mobilityWeight;

  // Goal occupation component
  adjustedScore += factors.goalOccupationScore * weights.goalOccupationWeight;

  // Advancement balance component
  adjustedScore += factors.advancementBalanceScore * weights.advancementBalance;

  return adjustedScore;
}

/**
 * Factors that contribute to an evaluation score
 */
export interface EvaluationFactors {
  distanceScore: number;        // Based on distance to goals
  cohesionScore: number;        // Based on piece clustering
  mobilityScore: number;        // Based on available moves
  goalOccupationScore: number;  // Based on pieces in goal
  advancementBalanceScore: number; // Based on piece spread
}

/**
 * Compute evaluation factors for a position
 * These can be used with applyLearnedWeights
 */
export function computeEvaluationFactors(
  state: GameState,
  player: PlayerIndex
): EvaluationFactors {
  const pieces = getPlayerPieces(state, player);
  const goalPositions = getGoalPositionsForState(state, player);
  const goalCenter = centroid(goalPositions);
  const goalKeys = new Set(goalPositions.map(g => coordKey(g)));

  // Distance score: negative distance (closer = better)
  let totalDistance = 0;
  for (const piece of pieces) {
    totalDistance += cubeDistance(piece, goalCenter);
  }
  const avgDistance = pieces.length > 0 ? totalDistance / pieces.length : 0;
  const distanceScore = -avgDistance; // Negative because closer is better

  // Cohesion score: how many pieces are within jump range of others
  const cohesionScore = computeCohesionScore(pieces);

  // Mobility score: estimate based on piece positions (not computing actual moves)
  const mobilityScore = estimateMobilityScore(state, pieces);

  // Goal occupation: pieces already in goal
  let piecesInGoal = 0;
  for (const piece of pieces) {
    if (goalKeys.has(coordKey(piece))) {
      piecesInGoal++;
    }
  }
  const goalOccupationScore = piecesInGoal * 10; // Significant bonus per piece in goal

  // Advancement balance: penalize if pieces are too spread out in advancement
  const advancementBalanceScore = computeAdvancementBalance(pieces, goalCenter);

  return {
    distanceScore,
    cohesionScore,
    mobilityScore,
    goalOccupationScore,
    advancementBalanceScore,
  };
}

/**
 * Compute cohesion score based on piece clustering
 */
function computeCohesionScore(pieces: CubeCoord[]): number {
  if (pieces.length <= 1) return 0;

  let pairsWithinJumpRange = 0;
  let totalPairs = 0;

  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      totalPairs++;
      const dist = cubeDistance(pieces[i], pieces[j]);
      // Within jump range means distance of 2 (can jump over something between)
      if (dist <= 3) {
        pairsWithinJumpRange++;
      }
    }
  }

  return totalPairs > 0 ? (pairsWithinJumpRange / totalPairs) * 10 : 0;
}

/**
 * Estimate mobility without computing actual moves
 */
function estimateMobilityScore(state: GameState, pieces: CubeCoord[]): number {
  let mobilityEstimate = 0;

  for (const piece of pieces) {
    // Count empty neighbors (potential step moves)
    let emptyNeighbors = 0;
    let occupiedNeighbors = 0;

    for (const dir of DIRECTIONS) {
      const neighborKey = coordKey({
        q: piece.q + dir.q,
        r: piece.r + dir.r,
        s: piece.s + dir.s,
      });
      const content = state.board.get(neighborKey);
      if (content?.type === 'empty') {
        emptyNeighbors++;
      } else if (content?.type === 'piece') {
        occupiedNeighbors++;
      }
    }

    // More empty neighbors = more step options
    // More occupied neighbors = more potential jump options
    mobilityEstimate += emptyNeighbors + occupiedNeighbors * 0.5;
  }

  return mobilityEstimate;
}

/**
 * Compute advancement balance score
 * Penalizes positions where pieces are too spread out in their advancement
 */
function computeAdvancementBalance(pieces: CubeCoord[], goalCenter: CubeCoord): number {
  if (pieces.length <= 1) return 0;

  // Calculate distance of each piece to goal
  const distances = pieces.map(p => cubeDistance(p, goalCenter));
  const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;

  // Calculate variance
  const variance = distances.reduce((sum, d) => sum + Math.pow(d - avgDistance, 2), 0) / distances.length;
  const stdDev = Math.sqrt(variance);

  // Lower spread = better balance
  // Return negative stdDev (penalize high spread)
  return -stdDev;
}

/**
 * Evaluate a move using learned preferences
 */
export function evaluateMoveWithLearning(
  state: GameState,
  move: Move,
  player: PlayerIndex
): number {
  const weights = getCachedLearnedWeights();

  let score = 0;

  // Prefer jumps if learned weights favor them
  if (move.isJump) {
    const chainLength = move.jumpPath?.length || 1;

    // Base jump bonus
    score += 5 * weights.jumpPreference;

    // Bonus for chain length close to optimal
    const optimalLength = weights.optimalJumpChainLength;
    const lengthDiff = Math.abs(chainLength - optimalLength);
    score += Math.max(0, 3 - lengthDiff) * weights.jumpPreference;
  }

  // Calculate distance gained
  const goalPositions = getGoalPositionsForState(state, player);
  const goalCenter = centroid(goalPositions);
  const distBefore = cubeDistance(move.from, goalCenter);
  const distAfter = cubeDistance(move.to, goalCenter);
  const distanceGained = distBefore - distAfter;

  // Apply distance weight
  score += distanceGained * 2 * weights.distanceWeight;

  return score;
}
