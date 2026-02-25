// Learning module - extracts patterns from games and applies them to AI

export type {
  GamePatterns,
  PlayerGameMetrics,
  LearnedWeights,
  GameSummary,
  LearningData,
  EndgameMetrics,
  EndgameInsights,
} from './types';

export {
  DEFAULT_LEARNED_WEIGHTS,
  DEFAULT_LEARNING_DATA,
  DEFAULT_ENDGAME_INSIGHTS,
} from './types';

export {
  extractGamePatterns,
  calculateGameQuality,
  createGameSummary,
} from './patternExtractor';

export {
  extractEndgameMetrics,
  scoreGoalFillOrder,
} from './endgamePatternExtractor';

export {
  loadLearningData,
  saveLearningData,
  learnFromGame,
  getLearnedWeights,
  getLearningStats,
  clearLearningData,
  exportLearningData,
  importLearningData,
} from './learningStore';

export {
  getCachedLearnedWeights,
  getCachedEndgameInsights,
  clearWeightsCache,
  applyLearnedWeights,
  computeEvaluationFactors,
  evaluateMoveWithLearning,
} from './learnedEvaluator';

export type { EvaluationFactors } from './learnedEvaluator';
