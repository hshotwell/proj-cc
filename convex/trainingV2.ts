import { v } from 'convex/values';
import { internalMutation, internalQuery, query } from './_generated/server';

const engineValidator = v.union(
  v.literal('default'),
  v.literal('ricefish'),
  v.literal('ricefish-plus'),
);
const personalityValidator = v.union(
  v.literal('generalist'),
  v.literal('defensive'),
  v.literal('aggressive'),
);

export const getTrainingStateV2 = internalQuery({
  args: { engine: engineValidator },
  handler: async (ctx, { engine }) => {
    return await ctx.db
      .query('trainingStateV2')
      .withIndex('by_engine', (q) => q.eq('engine', engine))
      .first();
  },
});

export const saveTrainingStateV2 = internalMutation({
  args: {
    engine: engineValidator,
    currentGeneration: v.number(),
    population: v.any(),
    matchupSchedule: v.any(),
    matchupIndex: v.number(),
    gamesCompletedInGeneration: v.number(),
    lastUpdated: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('trainingStateV2')
      .withIndex('by_engine', (q) => q.eq('engine', args.engine))
      .first();
    if (existing) {
      await ctx.db.replace(existing._id, args);
    } else {
      await ctx.db.insert('trainingStateV2', args);
    }
  },
});

export const getChampion = internalQuery({
  args: { engine: engineValidator, personality: personalityValidator },
  handler: async (ctx, { engine, personality }) => {
    return await ctx.db
      .query('championsV2')
      .withIndex('by_engine_personality', (q) =>
        q.eq('engine', engine).eq('personality', personality)
      )
      .first();
  },
});

export const saveChampion = internalMutation({
  args: {
    engine: engineValidator,
    personality: personalityValidator,
    genome: v.any(),
    fitness: v.number(),
    challengeEntry: v.optional(v.object({
      candidateGenome: v.any(),
      wins: v.number(),
      played: v.number(),
      date: v.number(),
      promoted: v.boolean(),
    })),
    replaceGenome: v.boolean(),
  },
  handler: async (ctx, { engine, personality, genome, fitness, challengeEntry, replaceGenome }) => {
    const existing = await ctx.db
      .query('championsV2')
      .withIndex('by_engine_personality', (q) =>
        q.eq('engine', engine).eq('personality', personality)
      )
      .first();
    const now = Date.now();
    if (existing) {
      const history = challengeEntry ? [...(existing.challengeHistory ?? []), challengeEntry] : (existing.challengeHistory ?? []);
      await ctx.db.patch(existing._id, {
        genome: replaceGenome ? genome : existing.genome,
        fitness: replaceGenome ? fitness : existing.fitness,
        promotedAt: replaceGenome ? now : existing.promotedAt,
        challengeHistory: history,
      });
    } else {
      await ctx.db.insert('championsV2', {
        engine,
        personality,
        genome,
        fitness,
        promotedAt: now,
        challengeHistory: challengeEntry ? [challengeEntry] : [],
      });
    }
  },
});

export const getCronCursor = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('cronCursorV2').first();
  },
});

export const saveCronCursor = internalMutation({
  args: {
    nextEngine: engineValidator,
    lastTick: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('cronCursorV2').first();
    if (existing) {
      await ctx.db.replace(existing._id, args);
    } else {
      await ctx.db.insert('cronCursorV2', args);
    }
  },
});

/**
 * Public query used by clients to fetch all champions in one round trip.
 * Returns null if any of the 9 rows are missing (bootstrap in progress).
 */
export const getAllChampions = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query('championsV2').collect();
    if (rows.length < 9) return null;
    const engines = ['default', 'ricefish', 'ricefish-plus'] as const;
    const personalities = ['generalist', 'defensive', 'aggressive'] as const;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = { default: {}, ricefish: {}, 'ricefish-plus': {} };
    for (const e of engines) {
      for (const p of personalities) {
        const row = rows.find((r) => r.engine === e && r.personality === p);
        if (!row) return null;
        result[e][p] = row.genome;
      }
    }
    return result;
  },
});
