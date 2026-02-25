"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

const SERVER_TRAINING_CONFIG = {
  populationSize: 12,
  generations: 50,
  gamesPerMatchup: 2,
  mutationRate: 0.15,
  mutationStrength: 0.3,
  eliteCount: 2,
  tournamentSize: 3,
  maxMovesPerGame: 300,
};

const GAMES_PER_BATCH = 20;

function buildMatchupSchedule(populationSize: number): [number, number][] {
  const schedule: [number, number][] = [];
  for (let i = 0; i < populationSize; i++) {
    for (let j = i + 1; j < populationSize; j++) {
      schedule.push([i, j]);
    }
  }
  return schedule;
}

/**
 * Main training step — called by cron every 2 minutes.
 * Runs a batch of headless games, then saves progress.
 */
export const runTrainingStep = internalAction({
  args: {},
  handler: async (ctx) => {
    // Dynamically import game engine modules (Node runtime)
    const { runHeadlessGame } = await import("../src/game/training/runner");
    const { createInitialPopulation, evolveGeneration } = await import("../src/game/training/evolution");

    // Load current state
    const state = await ctx.runQuery(internal.training.getTrainingState);

    if (!state) {
      // Initialize training from scratch
      const population = createInitialPopulation(SERVER_TRAINING_CONFIG.populationSize);
      const matchupSchedule = buildMatchupSchedule(SERVER_TRAINING_CONFIG.populationSize);

      await ctx.runMutation(internal.training.saveTrainingProgress, {
        config: SERVER_TRAINING_CONFIG,
        currentGeneration: 0,
        population,
        bestGenome: undefined,
        generationHistory: [],
        matchupSchedule,
        matchupIndex: 0,
        gameWithinMatchup: 0,
        gamesCompletedInGeneration: 0,
        lastUpdated: Date.now(),
      });
      console.log("[Training] Initialized population of", SERVER_TRAINING_CONFIG.populationSize);
      return;
    }

    const config = state.config as typeof SERVER_TRAINING_CONFIG;
    const population = state.population as { genome: any; fitness: number; wins: number; gamesPlayed: number }[];
    const matchupSchedule = state.matchupSchedule as [number, number][];
    let matchupIndex = state.matchupIndex;
    let gameWithinMatchup = state.gameWithinMatchup;
    let gamesCompleted = state.gamesCompletedInGeneration;
    const currentGeneration = state.currentGeneration;
    let generationHistory = state.generationHistory as any[];
    let bestGenome = state.bestGenome as any | undefined;

    let gamesThisBatch = 0;

    // Run games until batch limit or generation done
    while (gamesThisBatch < GAMES_PER_BATCH && matchupIndex < matchupSchedule.length) {
      const [i, j] = matchupSchedule[matchupIndex];

      // Alternate who goes first
      const first = gameWithinMatchup % 2 === 0 ? i : j;
      const second = first === i ? j : i;

      const result = runHeadlessGame(
        population[first].genome,
        population[second].genome,
        config.maxMovesPerGame
      );

      population[first].gamesPlayed++;
      population[second].gamesPlayed++;

      if (result.winner === 0) {
        population[first].wins++;
        population[first].fitness += 3;
      } else if (result.winner === 1) {
        population[second].wins++;
        population[second].fitness += 3;
      } else {
        population[first].fitness += 1;
        population[second].fitness += 1;
      }

      gamesThisBatch++;
      gamesCompleted++;
      gameWithinMatchup++;

      // Move to next matchup if games for this one are done
      if (gameWithinMatchup >= config.gamesPerMatchup) {
        matchupIndex++;
        gameWithinMatchup = 0;
      }
    }

    console.log(
      `[Training] Gen ${currentGeneration}: played ${gamesThisBatch} games (${gamesCompleted} total in gen, matchup ${matchupIndex}/${matchupSchedule.length})`
    );

    // Check if generation is complete
    if (matchupIndex >= matchupSchedule.length) {
      // Find best individual
      const sorted = [...population].sort((a, b) => b.fitness - a.fitness);
      const genBest = sorted[0];

      const genResult = {
        generation: currentGeneration,
        bestFitness: genBest.fitness,
        avgFitness: population.reduce((s, ind) => s + ind.fitness, 0) / population.length,
        bestGenome: genBest.genome,
      };
      generationHistory = [...generationHistory, genResult];

      // Update best genome if improved
      if (!bestGenome || genBest.fitness > (state.bestGenome as any)?.fitness) {
        bestGenome = genBest.genome;
        await ctx.runMutation(internal.training.saveBestGenome, {
          genome: genBest.genome,
          generation: currentGeneration,
          fitness: genBest.fitness,
        });
        console.log(`[Training] New best genome at gen ${currentGeneration} with fitness ${genBest.fitness}`);
      }

      // Evolve to next generation
      const nextGen = currentGeneration + 1;

      if (nextGen >= config.generations) {
        // Cycle complete — restart with evolved population
        console.log(`[Training] Completed ${config.generations} generations. Restarting cycle.`);
        const newPopulation = evolveGeneration(population as any, config as any);
        const newSchedule = buildMatchupSchedule(config.populationSize);

        await ctx.runMutation(internal.training.saveTrainingProgress, {
          config,
          currentGeneration: 0,
          population: newPopulation,
          bestGenome: bestGenome,
          generationHistory: [],
          matchupSchedule: newSchedule,
          matchupIndex: 0,
          gameWithinMatchup: 0,
          gamesCompletedInGeneration: 0,
          lastUpdated: Date.now(),
        });
      } else {
        // Evolve and start next generation
        const newPopulation = evolveGeneration(population as any, config as any);
        const newSchedule = buildMatchupSchedule(config.populationSize);

        await ctx.runMutation(internal.training.saveTrainingProgress, {
          config,
          currentGeneration: nextGen,
          population: newPopulation,
          bestGenome: bestGenome,
          generationHistory,
          matchupSchedule: newSchedule,
          matchupIndex: 0,
          gameWithinMatchup: 0,
          gamesCompletedInGeneration: 0,
          lastUpdated: Date.now(),
        });
      }
    } else {
      // Save mid-generation progress
      await ctx.runMutation(internal.training.saveTrainingProgress, {
        config,
        currentGeneration,
        population,
        bestGenome: bestGenome,
        generationHistory,
        matchupSchedule,
        matchupIndex,
        gameWithinMatchup,
        gamesCompletedInGeneration: gamesCompleted,
        lastUpdated: Date.now(),
      });
    }
  },
});
