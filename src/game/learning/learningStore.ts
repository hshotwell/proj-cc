import type { LearningData, LearnedWeights, GameSummary, GamePatterns, PlayerGameMetrics } from './types';
import { DEFAULT_LEARNING_DATA, DEFAULT_LEARNED_WEIGHTS } from './types';

const STORAGE_KEY = 'chinese-checkers-learned-patterns';
const MAX_RECENT_GAMES = 100; // Keep last N games for analysis

/**
 * Load learning data from localStorage
 */
export function loadLearningData(): LearningData {
  if (typeof window === 'undefined') {
    return DEFAULT_LEARNING_DATA;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored) as LearningData;
      // Ensure all fields exist (handle version upgrades)
      return {
        ...DEFAULT_LEARNING_DATA,
        ...data,
        weights: {
          ...DEFAULT_LEARNED_WEIGHTS,
          ...data.weights,
        },
        stats: {
          ...DEFAULT_LEARNING_DATA.stats,
          ...data.stats,
        },
      };
    }
  } catch (e) {
    console.error('Failed to load learning data:', e);
  }

  return DEFAULT_LEARNING_DATA;
}

/**
 * Save learning data to localStorage
 */
export function saveLearningData(data: LearningData): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save learning data:', e);
  }
}

/**
 * Add a game summary to the learning data and update weights
 */
export function learnFromGame(summary: GameSummary): void {
  const data = loadLearningData();

  // Add to recent games (keep max N)
  data.recentGames.unshift(summary);
  if (data.recentGames.length > MAX_RECENT_GAMES) {
    data.recentGames = data.recentGames.slice(0, MAX_RECENT_GAMES);
  }

  // Update statistics
  data.stats.totalGamesAnalyzed++;
  if (summary.winner !== null) {
    data.stats.totalWinsAnalyzed++;

    // Update average moves to win
    const oldAvg = data.stats.avgMovesToWin;
    const n = data.stats.totalWinsAnalyzed;
    data.stats.avgMovesToWin = oldAvg + (summary.winnerMoveCount - oldAvg) / n;

    // Update by player count
    const pc = summary.playerCount;
    const oldPcAvg = data.stats.avgMovesToWinByPlayerCount[pc] || summary.winnerMoveCount;
    const pcCount = data.recentGames.filter(
      g => g.playerCount === pc && g.winner !== null
    ).length;
    data.stats.avgMovesToWinByPlayerCount[pc] = oldPcAvg + (summary.winnerMoveCount - oldPcAvg) / pcCount;
  }

  // Recompute weights from recent games
  data.weights = computeWeightsFromGames(data.recentGames);
  data.weights.gamesAnalyzed = data.stats.totalGamesAnalyzed;
  data.weights.lastUpdated = Date.now();

  saveLearningData(data);
}

/**
 * Compute learned weights from game summaries
 */
function computeWeightsFromGames(games: GameSummary[]): LearnedWeights {
  if (games.length === 0) {
    return DEFAULT_LEARNED_WEIGHTS;
  }

  // Filter to winning games only for learning
  const winningGames = games.filter(g => g.winner !== null);
  if (winningGames.length === 0) {
    return DEFAULT_LEARNED_WEIGHTS;
  }

  // Weight each game by quality score
  let totalWeight = 0;
  let weightedDistanceGain = 0;
  let weightedJumpRatio = 0;
  let weightedAvgChainLength = 0;
  let weightedCohesion = 0;
  let weightedMoveCount = 0;

  for (const game of winningGames) {
    const winner = game.winner!;
    const metrics = game.patterns.playerMetrics[winner];
    if (!metrics) continue;

    const weight = game.qualityScore;
    totalWeight += weight;

    weightedDistanceGain += metrics.avgDistanceGainedPerMove * weight;
    weightedJumpRatio += (metrics.jumpMoves / Math.max(1, metrics.totalMoves)) * weight;
    weightedAvgChainLength += metrics.avgJumpChainLength * weight;
    weightedCohesion += metrics.avgPieceCohesion * weight;
    weightedMoveCount += metrics.totalMoves * weight;
  }

  if (totalWeight === 0) {
    return DEFAULT_LEARNED_WEIGHTS;
  }

  // Normalize
  const avgDistanceGain = weightedDistanceGain / totalWeight;
  const avgJumpRatio = weightedJumpRatio / totalWeight;
  const avgChainLength = weightedAvgChainLength / totalWeight;
  const avgCohesion = weightedCohesion / totalWeight;
  const avgMoveCount = weightedMoveCount / totalWeight;

  // Convert to weight modifiers
  // These adjust the base AI evaluation weights

  // Distance weight: if good players gain more distance, emphasize distance
  // Baseline expectation: ~0.5 distance per move
  const distanceWeight = 0.8 + (avgDistanceGain / 2) * 0.4;

  // Jump preference: if winners jump more, prefer jumps
  // Baseline: 50% jumps
  const jumpPreference = 0.8 + avgJumpRatio * 0.4;

  // Cohesion: if winners keep pieces together, value cohesion more
  const cohesionWeight = 0.8 + avgCohesion * 0.4;

  // Mobility: inverse of cohesion (spread vs clustered tradeoff)
  const mobilityWeight = 1.2 - avgCohesion * 0.4;

  // Advancement balance: based on whether quick wins favor aggressive advancement
  // Lower move counts suggest aggressive forward play
  const advancementBalance = avgMoveCount < 40 ? 1.2 : (avgMoveCount < 60 ? 1.0 : 0.9);

  // Goal occupation: faster goal entry = higher weight
  const goalOccupationWeight = 1.0; // TODO: derive from movesToFirstGoalEntry

  return {
    version: DEFAULT_LEARNED_WEIGHTS.version,
    lastUpdated: Date.now(),
    gamesAnalyzed: winningGames.length,

    distanceWeight: clamp(distanceWeight, 0.5, 1.5),
    cohesionWeight: clamp(cohesionWeight, 0.5, 1.5),
    mobilityWeight: clamp(mobilityWeight, 0.5, 1.5),
    advancementBalance: clamp(advancementBalance, 0.7, 1.3),
    jumpPreference: clamp(jumpPreference, 0.5, 1.5),
    goalOccupationWeight: clamp(goalOccupationWeight, 0.5, 1.5),

    avgWinningMoveCount: avgMoveCount,
    optimalJumpChainLength: avgChainLength,
    optimalCohesionLevel: avgCohesion,
  };
}

/**
 * Clamp a value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Get the current learned weights
 */
export function getLearnedWeights(): LearnedWeights {
  const data = loadLearningData();
  return data.weights;
}

/**
 * Get learning statistics
 */
export function getLearningStats(): LearningData['stats'] {
  const data = loadLearningData();
  return data.stats;
}

/**
 * Clear all learning data (reset to defaults)
 */
export function clearLearningData(): void {
  saveLearningData(DEFAULT_LEARNING_DATA);
}

/**
 * Export learning data for backup/sharing
 */
export function exportLearningData(): string {
  const data = loadLearningData();
  return JSON.stringify(data, null, 2);
}

/**
 * Import learning data from backup
 */
export function importLearningData(json: string): boolean {
  try {
    const data = JSON.parse(json) as LearningData;
    // Validate structure
    if (!data.weights || !data.stats || !Array.isArray(data.recentGames)) {
      return false;
    }
    saveLearningData(data);
    return true;
  } catch {
    return false;
  }
}
