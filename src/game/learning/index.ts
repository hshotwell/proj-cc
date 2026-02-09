// Learning module - extracts patterns from games and applies them to AI

export type {
  GamePatterns,
  PlayerGameMetrics,
  LearnedWeights,
  GameSummary,
  LearningData,
} from './types';

export {
  DEFAULT_LEARNED_WEIGHTS,
  DEFAULT_LEARNING_DATA,
} from './types';

export {
  extractGamePatterns,
  calculateGameQuality,
  createGameSummary,
} from './patternExtractor';

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
  clearWeightsCache,
  applyLearnedWeights,
  computeEvaluationFactors,
  evaluateMoveWithLearning,
} from './learnedEvaluator';

export type { EvaluationFactors } from './learnedEvaluator';
