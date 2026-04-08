"use node";

import { internalAction } from "./_generated/server";
import { internal, api } from "./_generated/api";
import {
  createInitialPopulation,
  evolveGeneration,
} from "../src/game/training/evolution";
import { scoreGenomeOnPuzzles } from "../src/game/training/endgameRunner";
import type { Individual } from "../src/types/training";

// ── Config ────────────────────────────────────────────────────────────────────

const CONFIG = {
  populationSize: 8,
  // GA operators (same ranges as general training)
  mutationRate: 0.20,
  mutationStrength: 0.35,
  eliteCount: 2,
  tournamentSize: 3,
  // How many generations to run per action invocation
  generationsPerBatch: 5,
  // Safety cut-off: stop the batch early if we approach Convex's 2-min limit
  batchTimeLimitMs: 50_000, // 50 s — generous with only 5 gens of fast puzzle runs
};

// ── Seed puzzles ──────────────────────────────────────────────────────────────
// Player 0 goal zone = player 3's starting positions (bottom-right triangle).
// All positions are valid board cells (standard 121-cell board).
// Pieces listed: (in-goal cells first, then approaching pieces).

const GOAL: string[] = [
  '1,4', '2,3', '3,2', '4,1', '4,2', '3,3', '2,4', '4,3', '4,4', '3,4',
];

const SEED_PUZZLES = [
  {
    name: 'Endgame Seed · Nearly Done',
    // 9 pieces in goal, 1 just outside the entry
    positions: ['2,3', '3,2', '4,1', '4,2', '3,3', '2,4', '4,3', '4,4', '3,4', '0,3'],
    goalPositions: GOAL,
    par: 2,
    source: 'seeded',
  },
  {
    name: 'Endgame Seed · Two to Go',
    // 8 in goal, 2 approaching
    positions: ['3,2', '4,1', '4,2', '3,3', '2,4', '4,3', '4,4', '3,4', '0,3', '1,2'],
    goalPositions: GOAL,
    par: 4,
    source: 'seeded',
  },
  {
    name: 'Endgame Seed · Set Up the Chain',
    // 7 in goal, 3 pieces that reward chaining
    positions: ['4,1', '4,2', '3,3', '2,4', '4,3', '4,4', '3,4', '0,3', '1,2', '0,1'],
    goalPositions: GOAL,
    par: 6,
    source: 'seeded',
  },
  {
    name: 'Endgame Seed · Mid-Endgame',
    // 5 in goal, 5 in the approach corridor
    positions: ['3,3', '2,4', '4,3', '4,4', '3,4', '0,3', '1,2', '0,1', '-1,2', '2,1'],
    goalPositions: GOAL,
    par: 9,
    source: 'seeded',
  },
  {
    name: 'Endgame Seed · The Sprint',
    // 4 in goal, 6 pieces spread through the approach
    positions: ['2,4', '4,3', '4,4', '3,4', '0,3', '1,2', '0,1', '-1,2', '2,1', '1,1'],
    goalPositions: GOAL,
    par: 12,
    source: 'seeded',
  },
];

// ── Main action ───────────────────────────────────────────────────────────────

/**
 * Endgame training step — called by cron every 60 minutes.
 *
 * Each invocation:
 *  1. Seeds puzzles on first run (if table is empty).
 *  2. Initialises population from the best general genome + variations.
 *  3. Runs CONFIG.generationsPerBatch generations:
 *       – Evaluate every genome on every stored puzzle.
 *       – Evolve: elitism + tournament + crossover + mutation.
 *       – Save state and best genome after each generation.
 *  4. Stops early if approaching the Convex 2-minute action time limit.
 *
 * Compute budget: ~5 gens × 8 genomes × 8 puzzles ≈ 320 greedy puzzle runs
 * per invocation. Each run completes in <10 ms → <5 s total per action.
 * At 24 invocations/day with 256 MB RAM: ~0.008 GB-hours/day. Well under 0.5 GB.
 */
export const runEndgameTrainingStep = internalAction({
  args: {},
  handler: async (ctx) => {
    const startTime = Date.now();

    try {
      // ── 1. Seed puzzles if needed ──────────────────────────────────────
      const puzzleCount: number = await ctx.runQuery(
        internal.endgameTraining.getPuzzleCount
      );

      if (puzzleCount === 0) {
        await ctx.runMutation(internal.endgameTraining.seedPuzzles, {
          puzzles: SEED_PUZZLES.map((p) => ({ ...p, createdAt: Date.now() })),
        });
        console.log(`[EndgameTraining] Seeded ${SEED_PUZZLES.length} puzzles`);
        return; // Next invocation picks up with training
      }

      // ── 2. Load puzzles ────────────────────────────────────────────────
      const puzzles: Array<{
        positions: string[];
        goalPositions: string[];
        par: number;
      }> = await ctx.runQuery(internal.endgameTraining.getPuzzles);

      // ── 3. Load or initialise population ──────────────────────────────
      let state: {
        generation: number;
        population: Individual[];
        bestFitness: number;
        generationHistory: any[];
        puzzleCount: number;
      } | null = await ctx.runQuery(
        internal.endgameTraining.getEndgameTrainingState
      );

      let population: Individual[];
      let generation: number;
      let bestFitness: number;
      let generationHistory: any[];

      if (!state) {
        // Warm-start from the best general genome (if available), else default
        const generalBest: { genome: any } | null = await ctx.runQuery(
          api.training.getEvolvedGenome
        );
        population = createInitialPopulation(CONFIG.populationSize);
        if (generalBest?.genome) {
          // Replace the first individual with the best general genome
          population[0] = {
            genome: generalBest.genome,
            fitness: 0,
            wins: 0,
            gamesPlayed: 0,
          };
        }
        generation = 0;
        bestFitness = 0;
        generationHistory = [];
        console.log("[EndgameTraining] Initialised new population");
      } else {
        population = state.population as Individual[];
        generation = state.generation;
        bestFitness = state.bestFitness;
        generationHistory = state.generationHistory as any[];
      }

      // ── 4. Run generationsPerBatch generations ─────────────────────────
      let generationsRun = 0;

      for (let b = 0; b < CONFIG.generationsPerBatch; b++) {
        if (Date.now() - startTime > CONFIG.batchTimeLimitMs) {
          console.log("[EndgameTraining] Approaching time limit — stopping batch early");
          break;
        }

        // Evaluate every individual
        const scores: number[] = [];
        for (const ind of population) {
          const score = scoreGenomeOnPuzzles(ind.genome, puzzles);
          ind.fitness = score;
          scores.push(score);
        }

        const genBest = Math.max(...scores);
        const genAvg = scores.reduce((a, b) => a + b, 0) / scores.length;
        generationHistory = [
          ...generationHistory,
          { generation, bestFitness: genBest, avgFitness: genAvg },
        ];

        // Save best genome if improved
        if (genBest > bestFitness) {
          bestFitness = genBest;
          const bestInd = population.reduce((a, b) => (a.fitness > b.fitness ? a : b));
          await ctx.runMutation(internal.endgameTraining.saveEndgameEvolvedGenome, {
            genome: bestInd.genome,
            generation,
            fitness: genBest,
            puzzleCount: puzzles.length,
          });
          console.log(
            `[EndgameTraining] New best genome at gen ${generation}: fitness=${genBest.toFixed(1)} (${puzzles.length} puzzles)`
          );
        }

        console.log(
          `[EndgameTraining] Gen ${generation}: best=${genBest.toFixed(1)} avg=${genAvg.toFixed(1)}`
        );

        // Evolve
        population = evolveGeneration(population, {
          populationSize: CONFIG.populationSize,
          mutationRate: CONFIG.mutationRate,
          mutationStrength: CONFIG.mutationStrength,
          eliteCount: CONFIG.eliteCount,
          tournamentSize: CONFIG.tournamentSize,
          // Unused by evolveGeneration but required by TrainingConfig type
          generations: 0,
          gamesPerMatchup: 0,
          maxMovesPerGame: 0,
        });

        generation++;
        generationsRun++;
      }

      // ── 5. Persist state ───────────────────────────────────────────────
      await ctx.runMutation(internal.endgameTraining.saveEndgameTrainingState, {
        generation,
        population,
        bestFitness,
        generationHistory: generationHistory.slice(-100), // cap history size
        puzzleCount: puzzles.length,
        lastUpdated: Date.now(),
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(
        `[EndgameTraining] Batch complete: ${generationsRun} gens in ${elapsed}s (gen ${generation}, best=${bestFitness.toFixed(1)})`
      );
    } catch (err) {
      console.error("[EndgameTraining] FAILED:", String(err));
      throw err;
    }
  },
});
