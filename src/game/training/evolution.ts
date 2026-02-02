import type { Genome, Individual, TrainingConfig } from '@/types/training';
import { DEFAULT_GENOME } from './evaluate';
import { runHeadlessGame } from './runner';

// Gene ranges: [min, max] for clamping after mutation
const GENE_RANGES: Record<keyof Genome, [number, number]> = {
  progress: [0.5, 10],
  goalDistance: [0.5, 10],
  centerControl: [0, 5],
  blocking: [0, 8],
  jumpPotential: [0, 5],
  stragglerDivisor: [1, 20],
  centerPieceValue: [0.5, 10],
  blockingBaseValue: [1, 15],
  jumpPotentialMultiplier: [0.5, 5],
  jumpPotentialCap: [10, 80],
  regressionMultiplier: [1, 15],
  goalLeavePenalty: [10, 120],
  repetitionPenalty: [20, 150],
  cyclePenalty: [10, 100],
  endgameThreshold: [4, 9],
};

const GENOME_KEYS = Object.keys(DEFAULT_GENOME) as (keyof Genome)[];

// Box-Muller transform for gaussian random numbers
function gaussianRandom(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export function createRandomGenome(): Genome {
  const genome = { ...DEFAULT_GENOME };
  for (const key of GENOME_KEYS) {
    const [min, max] = GENE_RANGES[key];
    const range = max - min;
    // Random value centered on default with variance proportional to range
    const value = genome[key] + gaussianRandom() * range * 0.3;
    genome[key] = Math.max(min, Math.min(max, value));
  }
  return genome;
}

export function crossover(a: Genome, b: Genome): Genome {
  const child: Genome = { ...a };
  for (const key of GENOME_KEYS) {
    // Uniform crossover: 50% chance each gene from either parent
    child[key] = Math.random() < 0.5 ? a[key] : b[key];
  }
  return child;
}

export function mutate(
  genome: Genome,
  rate: number,
  strength: number
): Genome {
  const mutated = { ...genome };
  for (const key of GENOME_KEYS) {
    if (Math.random() < rate) {
      const [min, max] = GENE_RANGES[key];
      const range = max - min;
      const perturbation = gaussianRandom() * range * strength;
      mutated[key] = Math.max(min, Math.min(max, mutated[key] + perturbation));
    }
  }
  return mutated;
}

export function tournamentSelect(
  population: Individual[],
  size: number
): Individual {
  let best: Individual | null = null;
  for (let i = 0; i < size; i++) {
    const idx = Math.floor(Math.random() * population.length);
    const candidate = population[idx];
    if (best === null || candidate.fitness > best.fitness) {
      best = candidate;
    }
  }
  return best!;
}

export function createInitialPopulation(size: number): Individual[] {
  const population: Individual[] = [];
  // First individual is the default genome
  population.push({
    genome: { ...DEFAULT_GENOME },
    fitness: 0,
    wins: 0,
    gamesPlayed: 0,
  });
  // Rest are random variations
  for (let i = 1; i < size; i++) {
    population.push({
      genome: createRandomGenome(),
      fitness: 0,
      wins: 0,
      gamesPlayed: 0,
    });
  }
  return population;
}

// Run round-robin tournament: each individual plays against a sample of opponents
// Returns total number of games played
export function roundRobinTournament(
  population: Individual[],
  gamesPerMatchup: number,
  maxMoves: number,
  onGameComplete?: () => void
): number {
  // Reset fitness
  for (const ind of population) {
    ind.fitness = 0;
    ind.wins = 0;
    ind.gamesPlayed = 0;
  }

  let gamesPlayed = 0;

  // Each individual plays against every other
  for (let i = 0; i < population.length; i++) {
    for (let j = i + 1; j < population.length; j++) {
      for (let g = 0; g < gamesPerMatchup; g++) {
        // Alternate who goes first
        const first = g % 2 === 0 ? i : j;
        const second = first === i ? j : i;

        const result = runHeadlessGame(
          population[first].genome,
          population[second].genome,
          maxMoves
        );

        population[first].gamesPlayed++;
        population[second].gamesPlayed++;

        if (result.winner === 0) {
          population[first].wins++;
          population[first].fitness += 3; // Win = 3 points
        } else if (result.winner === 1) {
          population[second].wins++;
          population[second].fitness += 3;
        } else {
          // Draw = 1 point each
          population[first].fitness += 1;
          population[second].fitness += 1;
        }

        gamesPlayed++;
        onGameComplete?.();
      }
    }
  }

  return gamesPlayed;
}

export function evolveGeneration(
  population: Individual[],
  config: TrainingConfig
): Individual[] {
  // Sort by fitness descending
  const sorted = [...population].sort((a, b) => b.fitness - a.fitness);

  const newPopulation: Individual[] = [];

  // Elite carry-forward
  for (let i = 0; i < config.eliteCount && i < sorted.length; i++) {
    newPopulation.push({
      genome: { ...sorted[i].genome },
      fitness: 0,
      wins: 0,
      gamesPlayed: 0,
    });
  }

  // Fill rest with tournament selection + crossover + mutation
  while (newPopulation.length < config.populationSize) {
    const parent1 = tournamentSelect(sorted, config.tournamentSize);
    const parent2 = tournamentSelect(sorted, config.tournamentSize);
    let childGenome = crossover(parent1.genome, parent2.genome);
    childGenome = mutate(childGenome, config.mutationRate, config.mutationStrength);
    newPopulation.push({
      genome: childGenome,
      fitness: 0,
      wins: 0,
      gamesPlayed: 0,
    });
  }

  return newPopulation;
}
