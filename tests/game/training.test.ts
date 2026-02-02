import { describe, it, expect } from 'vitest';
import { createGame } from '@/game/setup';
import type { Genome } from '@/types/training';
import {
  DEFAULT_GENOME,
  evaluateWithGenome,
  findBestMoveWithGenome,
  computeRegressionPenaltyWithGenome,
  computeRepetitionPenaltyWithGenome,
} from '@/game/training/evaluate';
import {
  createRandomGenome,
  crossover,
  mutate,
  tournamentSelect,
  createInitialPopulation,
  evolveGeneration,
} from '@/game/training/evolution';
import { runHeadlessGame } from '@/game/training/runner';
import { DEFAULT_TRAINING_CONFIG } from '@/types/training';
import type { Individual } from '@/types/training';

describe('DEFAULT_GENOME', () => {
  it('has all 15 expected fields', () => {
    const keys = Object.keys(DEFAULT_GENOME);
    expect(keys).toHaveLength(15);
    expect(DEFAULT_GENOME.progress).toBe(3.0);
    expect(DEFAULT_GENOME.goalDistance).toBe(2.5);
    expect(DEFAULT_GENOME.centerControl).toBe(1.0);
    expect(DEFAULT_GENOME.blocking).toBe(1.0);
    expect(DEFAULT_GENOME.jumpPotential).toBe(0.5);
    expect(DEFAULT_GENOME.stragglerDivisor).toBe(5);
    expect(DEFAULT_GENOME.regressionMultiplier).toBe(5);
    expect(DEFAULT_GENOME.goalLeavePenalty).toBe(60);
    expect(DEFAULT_GENOME.endgameThreshold).toBe(7);
  });
});

describe('createRandomGenome', () => {
  it('returns a genome with all 15 fields', () => {
    const genome = createRandomGenome();
    const keys = Object.keys(genome);
    expect(keys).toHaveLength(15);
  });

  it('produces genomes that differ from the default', () => {
    const genome = createRandomGenome();
    // At least one field should differ (very unlikely all are identical)
    const diffCount = Object.keys(DEFAULT_GENOME).filter(
      (key) =>
        genome[key as keyof Genome] !== DEFAULT_GENOME[key as keyof Genome]
    ).length;
    expect(diffCount).toBeGreaterThan(0);
  });

  it('produces different genomes on successive calls', () => {
    const g1 = createRandomGenome();
    const g2 = createRandomGenome();
    const sameCount = Object.keys(g1).filter(
      (key) => g1[key as keyof Genome] === g2[key as keyof Genome]
    ).length;
    // Extremely unlikely all 15 values are identical
    expect(sameCount).toBeLessThan(15);
  });
});

describe('crossover', () => {
  it('produces a child with genes only from the two parents', () => {
    const parent1: Genome = { ...DEFAULT_GENOME, progress: 1.0, goalDistance: 10.0 };
    const parent2: Genome = { ...DEFAULT_GENOME, progress: 9.0, goalDistance: 1.0 };
    const child = crossover(parent1, parent2);

    for (const key of Object.keys(DEFAULT_GENOME) as (keyof Genome)[]) {
      expect([parent1[key], parent2[key]]).toContain(child[key]);
    }
  });
});

describe('mutate', () => {
  it('with rate=1, modifies at least some genes', () => {
    const genome = { ...DEFAULT_GENOME };
    const mutated = mutate(genome, 1.0, 0.5);
    const diffCount = Object.keys(genome).filter(
      (key) => mutated[key as keyof Genome] !== genome[key as keyof Genome]
    ).length;
    // With rate 1.0, all genes get perturbation (very unlikely all stay same)
    expect(diffCount).toBeGreaterThan(0);
  });

  it('with rate=0, does not modify genes', () => {
    const genome = { ...DEFAULT_GENOME };
    const mutated = mutate(genome, 0, 0.5);
    for (const key of Object.keys(genome) as (keyof Genome)[]) {
      expect(mutated[key]).toBe(genome[key]);
    }
  });

  it('clamps values to valid ranges', () => {
    // Create a genome at extreme values
    const extreme: Genome = {
      ...DEFAULT_GENOME,
      progress: 0.5,
      goalDistance: 10,
    };
    // Mutate many times to stress clamping
    let g = extreme;
    for (let i = 0; i < 50; i++) {
      g = mutate(g, 1.0, 1.0);
    }
    // All values should still be within valid ranges
    expect(g.progress).toBeGreaterThanOrEqual(0.5);
    expect(g.progress).toBeLessThanOrEqual(10);
    expect(g.stragglerDivisor).toBeGreaterThanOrEqual(1);
    expect(g.endgameThreshold).toBeGreaterThanOrEqual(4);
    expect(g.endgameThreshold).toBeLessThanOrEqual(9);
  });
});

describe('tournamentSelect', () => {
  it('returns a high-fitness individual over many runs', () => {
    const population: Individual[] = [
      { genome: DEFAULT_GENOME, fitness: 1, wins: 0, gamesPlayed: 1 },
      { genome: DEFAULT_GENOME, fitness: 10, wins: 5, gamesPlayed: 5 },
      { genome: DEFAULT_GENOME, fitness: 5, wins: 2, gamesPlayed: 5 },
    ];
    // Run many tournaments; the best should win most of the time
    let bestWins = 0;
    const trials = 100;
    for (let i = 0; i < trials; i++) {
      const winner = tournamentSelect(population, population.length);
      if (winner.fitness === 10) bestWins++;
    }
    // With tournament size = population.length, best should win >80% of the time
    expect(bestWins).toBeGreaterThan(60);
  });
});

describe('createInitialPopulation', () => {
  it('creates the right number of individuals', () => {
    const pop = createInitialPopulation(10);
    expect(pop).toHaveLength(10);
  });

  it('first individual is the default genome', () => {
    const pop = createInitialPopulation(5);
    for (const key of Object.keys(DEFAULT_GENOME) as (keyof Genome)[]) {
      expect(pop[0].genome[key]).toBe(DEFAULT_GENOME[key]);
    }
  });

  it('all individuals start with zero fitness', () => {
    const pop = createInitialPopulation(5);
    for (const ind of pop) {
      expect(ind.fitness).toBe(0);
      expect(ind.wins).toBe(0);
      expect(ind.gamesPlayed).toBe(0);
    }
  });
});

describe('evolveGeneration', () => {
  it('preserves population size', () => {
    const config = { ...DEFAULT_TRAINING_CONFIG, populationSize: 8 };
    const pop = createInitialPopulation(8);
    // Give them some fitness values
    pop.forEach((ind, i) => { ind.fitness = i; });
    const next = evolveGeneration(pop, config);
    expect(next).toHaveLength(8);
  });

  it('carries forward elites', () => {
    const config = { ...DEFAULT_TRAINING_CONFIG, populationSize: 6, eliteCount: 2 };
    const pop = createInitialPopulation(6);
    pop[0].fitness = 100;
    pop[1].fitness = 50;
    pop[2].fitness = 10;
    pop[3].fitness = 5;
    pop[4].fitness = 2;
    pop[5].fitness = 1;

    const next = evolveGeneration(pop, config);
    // First two should be elites (highest fitness), with their genomes preserved
    expect(next[0].genome).toEqual(pop[0].genome);
    expect(next[1].genome).toEqual(pop[1].genome);
    // Fitness should be reset to 0
    expect(next[0].fitness).toBe(0);
  });
});

describe('evaluateWithGenome', () => {
  it('returns a numeric score for a starting position', () => {
    const state = createGame(2);
    const score = evaluateWithGenome(state, 0, DEFAULT_GENOME);
    expect(typeof score).toBe('number');
    expect(isFinite(score)).toBe(true);
  });

  it('gives different scores for different genomes', () => {
    const state = createGame(2);
    const genome2: Genome = {
      ...DEFAULT_GENOME,
      progress: 10,
      goalDistance: 0.5,
    };
    const s1 = evaluateWithGenome(state, 0, DEFAULT_GENOME);
    const s2 = evaluateWithGenome(state, 0, genome2);
    expect(s1).not.toBe(s2);
  });
});

describe('computeRegressionPenaltyWithGenome', () => {
  it('returns 0 for moves toward the goal', () => {
    const state = createGame(2);
    const move = {
      from: { q: 0, r: 0, s: 0 },
      to: { q: -1, r: 1, s: 0 },
      isJump: false,
    };
    const penalty = computeRegressionPenaltyWithGenome(state, move, 0, DEFAULT_GENOME);
    expect(penalty).toBe(0);
  });

  it('applies penalty for moves away from goal', () => {
    const state = createGame(2);
    const move = {
      from: { q: -1, r: 1, s: 0 },
      to: { q: 0, r: 0, s: 0 },
      isJump: false,
    };
    const penalty = computeRegressionPenaltyWithGenome(state, move, 0, DEFAULT_GENOME);
    expect(penalty).toBeGreaterThan(0);
  });
});

describe('computeRepetitionPenaltyWithGenome', () => {
  it('returns 0 when move history is empty', () => {
    const state = createGame(2);
    const move = {
      from: { q: 0, r: -4, s: 4 },
      to: { q: 0, r: -5, s: 5 },
      isJump: false,
    };
    const penalty = computeRepetitionPenaltyWithGenome(state, move, 0, DEFAULT_GENOME);
    expect(penalty).toBe(0);
  });
});

describe('findBestMoveWithGenome', () => {
  it('returns a valid move for a starting position', () => {
    const state = createGame(2);
    const move = findBestMoveWithGenome(state, DEFAULT_GENOME);
    expect(move).not.toBeNull();
    expect(move!.from).toBeDefined();
    expect(move!.to).toBeDefined();
  });
});

describe('runHeadlessGame', () => {
  it('completes a game with a result', () => {
    // Use a very low move limit to ensure it terminates quickly
    const result = runHeadlessGame(DEFAULT_GENOME, DEFAULT_GENOME, 4);
    expect(result).toHaveProperty('winner');
    expect(result).toHaveProperty('totalMoves');
    expect(result.totalMoves).toBeLessThanOrEqual(4);
    expect(result.totalMoves).toBe(result.player1Moves + result.player2Moves);
    // Winner is null (draw due to limit), 0, or 1
    expect([null, 0, 1]).toContain(result.winner);
  }, 60000);

  it('both players accumulate moves', () => {
    const result = runHeadlessGame(DEFAULT_GENOME, DEFAULT_GENOME, 4);
    // With 4 moves total, both players should get at least some moves
    expect(result.player1Moves + result.player2Moves).toBe(result.totalMoves);
    if (result.totalMoves >= 2) {
      expect(result.player1Moves).toBeGreaterThan(0);
      expect(result.player2Moves).toBeGreaterThan(0);
    }
  }, 60000);
});
