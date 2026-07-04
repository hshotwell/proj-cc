'use node';

import { internalAction } from './_generated/server';
import { internal } from './_generated/api';
import {
  DEFAULT_DEFAULT_GENOME,
  DEFAULT_RICEFISH_GENOME,
  DEFAULT_RICEFISH_PLUS_GENOME,
  createRandomDefaultGenome,
  createRandomRicefishGenome,
  createRandomRicefishPlusGenome,
  mutateDefaultGenome,
  mutateRicefishGenome,
  mutateRicefishPlusGenome,
  crossoverDefaultGenome,
  crossoverRicefishGenome,
  crossoverRicefishPlusGenome,
  type DefaultGenome,
  type RicefishGenome,
  type RicefishPlusGenome,
} from '../src/game/training-v2/genomes';
import { evolveGeneration, type Individual, type EvolveConfig } from '../src/game/training-v2/evolve';
import { runTournamentGame, type EngineGenome } from '../src/game/training-v2/tournament';
import { runChallengeMatch, shouldPromote, CHALLENGE_GAMES } from '../src/game/training-v2/promote';

const ENGINES = ['default', 'ricefish', 'ricefish-plus'] as const;
type Engine = typeof ENGINES[number];
const PERSONALITIES = ['generalist', 'defensive', 'aggressive'] as const;

const CONFIG: EvolveConfig = {
  populationSize: 12,
  eliteCount: 2,
  tournamentSize: 3,
  mutationRate: 0.15,
  mutationStrength: 0.3,
};
const GAMES_PER_MATCHUP = 3;
const MAX_MOVES = 200;
const GAMES_PER_BATCH = 20;
const BATCH_TIME_LIMIT_MS = 90_000;

/**
 * Schedule slot: one game between an individual (identified by index) and
 * a champion identified by (engine, personality). candidatePersonality
 * cycles as gameIdx % 3 so each individual is evaluated across all three
 * personalities.
 */
interface ScheduleSlot {
  individualIdx: number;
  opponentEngine: Engine;
  opponentPersonality: typeof PERSONALITIES[number];
  gameIdx: number;
}

function buildSchedule(populationSize: number): ScheduleSlot[] {
  const schedule: ScheduleSlot[] = [];
  for (let i = 0; i < populationSize; i++) {
    for (const opponentEngine of ENGINES) {
      for (const opponentPersonality of PERSONALITIES) {
        for (let g = 0; g < GAMES_PER_MATCHUP; g++) {
          schedule.push({ individualIdx: i, opponentEngine, opponentPersonality, gameIdx: g });
        }
      }
    }
  }
  return schedule;
}

function createRandomFor(engine: Engine): DefaultGenome | RicefishGenome | RicefishPlusGenome {
  switch (engine) {
    case 'default':       return createRandomDefaultGenome();
    case 'ricefish':      return createRandomRicefishGenome();
    case 'ricefish-plus': return createRandomRicefishPlusGenome();
  }
}

function mutateFor(engine: Engine, g: any, rate: number, strength: number): any {
  switch (engine) {
    case 'default':       return mutateDefaultGenome(g, rate, strength);
    case 'ricefish':      return mutateRicefishGenome(g, rate, strength);
    case 'ricefish-plus': return mutateRicefishPlusGenome(g, rate, strength);
  }
}

function crossoverFor(engine: Engine, a: any, b: any): any {
  switch (engine) {
    case 'default':       return crossoverDefaultGenome(a, b);
    case 'ricefish':      return crossoverRicefishGenome(a, b);
    case 'ricefish-plus': return crossoverRicefishPlusGenome(a, b);
  }
}

function defaultGenomeFor(engine: Engine): any {
  switch (engine) {
    case 'default':       return DEFAULT_DEFAULT_GENOME;
    case 'ricefish':      return DEFAULT_RICEFISH_GENOME;
    case 'ricefish-plus': return DEFAULT_RICEFISH_PLUS_GENOME;
  }
}

function nextEngineAfter(engine: Engine): Engine {
  const idx = ENGINES.indexOf(engine);
  return ENGINES[(idx + 1) % ENGINES.length];
}

function createInitialPopulation(engine: Engine): Individual<any>[] {
  const pop: Individual<any>[] = [{
    genome: defaultGenomeFor(engine),
    fitness: 0, wins: 0, gamesPlayed: 0,
  }];
  for (let i = 1; i < CONFIG.populationSize; i++) {
    pop.push({ genome: createRandomFor(engine), fitness: 0, wins: 0, gamesPlayed: 0 });
  }
  return pop;
}

export const runTrainingV2Step = internalAction({
  args: {},
  handler: async (ctx) => {
    const startTime = Date.now();
    try {
      // ── 1. Determine which subpop gets this tick ────────────────────────
      let cursor = await ctx.runQuery(internal.trainingV2.getCronCursor);
      const engine: Engine = cursor?.nextEngine ?? 'default';

      // ── 2. Seed champions if empty ───────────────────────────────────────
      for (const e of ENGINES) {
        for (const p of PERSONALITIES) {
          const existing = await ctx.runQuery(internal.trainingV2.getChampion, { engine: e, personality: p });
          if (!existing) {
            await ctx.runMutation(internal.trainingV2.saveChampion, {
              engine: e,
              personality: p,
              genome: defaultGenomeFor(e),
              fitness: 0,
              challengeEntry: {
                candidateGenome: defaultGenomeFor(e),
                wins: 0,
                played: 0,
                date: Date.now(),
                promoted: true,
              },
              replaceGenome: true,
            });
            console.log(`[TrainingV2] Seeded champion ${e}/${p} from default`);
          }
        }
      }

      // ── 3. Load subpop state, initialize if empty ────────────────────────
      let state = await ctx.runQuery(internal.trainingV2.getTrainingStateV2, { engine });
      if (!state) {
        const population = createInitialPopulation(engine);
        const matchupSchedule = buildSchedule(CONFIG.populationSize);
        await ctx.runMutation(internal.trainingV2.saveTrainingStateV2, {
          engine,
          currentGeneration: 0,
          population,
          matchupSchedule,
          matchupIndex: 0,
          gamesCompletedInGeneration: 0,
          lastUpdated: Date.now(),
        });
        state = { engine, currentGeneration: 0, population, matchupSchedule, matchupIndex: 0, gamesCompletedInGeneration: 0, lastUpdated: Date.now() } as any;
        console.log(`[TrainingV2] Initialized ${engine} subpop`);
      }

      // ── 4. Load champions map for this tick ──────────────────────────────
      const championsMap: Record<Engine, Record<typeof PERSONALITIES[number], any>> = {
        default: {} as any,
        ricefish: {} as any,
        'ricefish-plus': {} as any,
      };
      for (const e of ENGINES) {
        for (const p of PERSONALITIES) {
          const row = await ctx.runQuery(internal.trainingV2.getChampion, { engine: e, personality: p });
          championsMap[e][p] = row!.genome;
        }
      }

      // ── 5. Run batch of games ────────────────────────────────────────────
      const population: Individual<any>[] = state!.population as any;
      const schedule: ScheduleSlot[] = state!.matchupSchedule as any;
      let matchupIndex: number = state!.matchupIndex;
      let gamesCompletedInGeneration: number = state!.gamesCompletedInGeneration;
      const currentGeneration: number = state!.currentGeneration;

      let gamesThisBatch = 0;
      while (gamesThisBatch < GAMES_PER_BATCH && matchupIndex < schedule.length) {
        if (Date.now() - startTime > BATCH_TIME_LIMIT_MS) {
          console.log(`[TrainingV2] Time cap hit, saving progress`);
          break;
        }
        const slot = schedule[matchupIndex];
        const candidatePersonality = PERSONALITIES[slot.gameIdx % PERSONALITIES.length];
        const candidateEG: EngineGenome = { engine, genome: population[slot.individualIdx].genome };
        const opponentEG: EngineGenome = {
          engine: slot.opponentEngine,
          genome: championsMap[slot.opponentEngine][slot.opponentPersonality],
        };

        const res = runTournamentGame(
          candidateEG,
          opponentEG,
          candidatePersonality,
          slot.opponentPersonality,
          slot.gameIdx % 2 === 0,
          MAX_MOVES,
        );

        population[slot.individualIdx].gamesPlayed++;
        if (res.winner === 'candidate')      { population[slot.individualIdx].wins++; population[slot.individualIdx].fitness += 3; }
        else if (res.winner === 'opponent')  {                                                                     population[slot.individualIdx].fitness += 0; }
        else                                 {                                                                     population[slot.individualIdx].fitness += 1; }

        matchupIndex++;
        gamesCompletedInGeneration++;
        gamesThisBatch++;
      }

      // ── 6. Generation complete? evolve + promote ────────────────────────
      if (matchupIndex >= schedule.length) {
        const sorted = [...population].sort((a, b) => b.fitness - a.fitness);
        const champion = sorted[0];

        for (const p of PERSONALITIES) {
          const currentChampion = championsMap[engine][p];
          const challenge = runChallengeMatch(
            { engine, genome: champion.genome },
            { engine, genome: currentChampion },
            p,
          );
          const promoted = shouldPromote({ candidateWins: challenge.candidateWins, gamesPlayed: challenge.gamesPlayed });
          await ctx.runMutation(internal.trainingV2.saveChampion, {
            engine,
            personality: p,
            genome: champion.genome,
            fitness: champion.fitness,
            challengeEntry: {
              candidateGenome: champion.genome,
              wins: challenge.candidateWins,
              played: CHALLENGE_GAMES,
              date: Date.now(),
              promoted,
            },
            replaceGenome: promoted,
          });
          console.log(`[TrainingV2] ${engine}/${p} challenge: ${challenge.candidateWins}/${CHALLENGE_GAMES} (${promoted ? 'PROMOTED' : 'rejected'})`);
        }

        const next = evolveGeneration(
          population,
          CONFIG,
          () => createRandomFor(engine),
          (g, r, s) => mutateFor(engine, g, r, s),
          (a, b) => crossoverFor(engine, a, b),
        );
        const newSchedule = buildSchedule(CONFIG.populationSize);
        await ctx.runMutation(internal.trainingV2.saveTrainingStateV2, {
          engine,
          currentGeneration: currentGeneration + 1,
          population: next,
          matchupSchedule: newSchedule,
          matchupIndex: 0,
          gamesCompletedInGeneration: 0,
          lastUpdated: Date.now(),
        });
      } else {
        await ctx.runMutation(internal.trainingV2.saveTrainingStateV2, {
          engine,
          currentGeneration,
          population,
          matchupSchedule: schedule,
          matchupIndex,
          gamesCompletedInGeneration,
          lastUpdated: Date.now(),
        });
      }

      // ── 7. Advance cron cursor ──────────────────────────────────────────
      await ctx.runMutation(internal.trainingV2.saveCronCursor, {
        nextEngine: nextEngineAfter(engine),
        lastTick: Date.now(),
      });

      console.log(`[TrainingV2] Tick complete for ${engine} in ${((Date.now() - startTime) / 1000).toFixed(1)}s (${gamesThisBatch} games)`);
    } catch (error) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.error(`[TrainingV2] FAILED after ${elapsed}s:`, String(error));
      // Do not rethrow — spec constraint (throw would cause retry and cost).
    }
  },
});
