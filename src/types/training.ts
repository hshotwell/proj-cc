export interface Genome {
  // Evaluation weights
  progress: number;
  goalDistance: number;
  centerControl: number;
  blocking: number;
  jumpPotential: number;
  // Scoring constants
  stragglerDivisor: number;
  centerPieceValue: number;
  blockingBaseValue: number;
  jumpPotentialMultiplier: number;
  jumpPotentialCap: number;
  // Penalty constants
  regressionMultiplier: number;
  goalLeavePenalty: number;
  repetitionPenalty: number;
  cyclePenalty: number;
  endgameThreshold: number;
}

export interface Individual {
  genome: Genome;
  fitness: number;
  wins: number;
  gamesPlayed: number;
}

export interface TrainingConfig {
  populationSize: number;
  generations: number;
  gamesPerMatchup: number;
  mutationRate: number;
  mutationStrength: number;
  eliteCount: number;
  tournamentSize: number;
  maxMovesPerGame: number;
}

export interface GenerationResult {
  generation: number;
  bestFitness: number;
  avgFitness: number;
  bestGenome: Genome;
}

export const DEFAULT_TRAINING_CONFIG: TrainingConfig = {
  populationSize: 20,
  generations: 30,
  gamesPerMatchup: 2,
  mutationRate: 0.15,
  mutationStrength: 0.3,
  eliteCount: 2,
  tournamentSize: 3,
  maxMovesPerGame: 500,
};
