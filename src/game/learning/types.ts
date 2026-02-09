import type { PlayerIndex, GameState, Move } from '@/types/game';

/**
 * Extracted patterns from a single game
 */
export interface GamePatterns {
  // Game metadata
  gameId: string;
  timestamp: number;
  isCustomLayout: boolean;
  playerCount: number;
  winner: PlayerIndex | null;

  // Efficiency metrics (per player)
  playerMetrics: Partial<Record<PlayerIndex, PlayerGameMetrics>>;

  // Overall game metrics
  totalMoves: number;
  winnerMoveCount: number; // Moves made by the winner
}

/**
 * Metrics extracted for a single player in a game
 */
export interface PlayerGameMetrics {
  // Move counts
  totalMoves: number;
  jumpMoves: number;
  stepMoves: number;
  swapMoves: number;

  // Efficiency
  avgDistanceGainedPerMove: number; // Toward goal
  avgJumpChainLength: number; // For jump moves
  maxJumpChainLength: number;

  // Progression
  movesToFirstGoalEntry: number | null; // Moves until first piece enters goal
  movesToHalfGoalFilled: number | null; // Moves until 5 pieces in goal

  // Piece coordination
  avgPieceCohesion: number; // Average pieces within jump range of each other

  // Did this player win?
  isWinner: boolean;
}

/**
 * Aggregated learned weights for AI evaluation
 */
export interface LearnedWeights {
  // Version for cache invalidation
  version: number;
  lastUpdated: number;
  gamesAnalyzed: number;

  // Evaluation weight modifiers (multiply with base weights)
  distanceWeight: number;      // Base: importance of distance to goal
  cohesionWeight: number;      // Importance of keeping pieces together
  mobilityWeight: number;      // Value of having many available moves
  advancementBalance: number;  // Balance between leading/lagging pieces
  jumpPreference: number;      // Preference for jumps over steps
  goalOccupationWeight: number; // Urgency of filling goal positions

  // Derived insights
  avgWinningMoveCount: number;       // Average moves for winners
  optimalJumpChainLength: number;    // Most efficient jump chain length
  optimalCohesionLevel: number;      // Best piece clustering level
}

/**
 * Summary of a completed game for learning
 */
export interface GameSummary {
  gameId: string;
  timestamp: number;
  isCustomLayout: boolean;
  layoutId?: string;
  playerCount: number;
  winner: PlayerIndex | null;
  totalMoves: number;
  winnerMoveCount: number;
  patterns: GamePatterns;

  // Quality score for weighting (higher = more valuable for learning)
  qualityScore: number;
}

/**
 * The full learning data stored in localStorage
 */
export interface LearningData {
  version: number;
  weights: LearnedWeights;

  // Recent game summaries (keep last N for analysis)
  recentGames: GameSummary[];

  // Aggregated statistics
  stats: {
    totalGamesAnalyzed: number;
    totalWinsAnalyzed: number;
    avgMovesToWin: number;
    avgMovesToWinByPlayerCount: Partial<Record<number, number>>;
  };
}

/**
 * Default weights before any learning
 */
export const DEFAULT_LEARNED_WEIGHTS: LearnedWeights = {
  version: 1,
  lastUpdated: 0,
  gamesAnalyzed: 0,

  distanceWeight: 1.0,
  cohesionWeight: 1.0,
  mobilityWeight: 1.0,
  advancementBalance: 1.0,
  jumpPreference: 1.0,
  goalOccupationWeight: 1.0,

  avgWinningMoveCount: 50,
  optimalJumpChainLength: 3,
  optimalCohesionLevel: 0.5,
};

/**
 * Default learning data
 */
export const DEFAULT_LEARNING_DATA: LearningData = {
  version: 1,
  weights: DEFAULT_LEARNED_WEIGHTS,
  recentGames: [],
  stats: {
    totalGamesAnalyzed: 0,
    totalWinsAnalyzed: 0,
    avgMovesToWin: 50,
    avgMovesToWinByPlayerCount: {},
  },
};
