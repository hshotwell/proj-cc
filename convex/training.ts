import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";

/**
 * Load current training state.
 */
export const getTrainingState = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("trainingState").first();
  },
});

/**
 * Save training progress (upsert the single training state row).
 */
export const saveTrainingProgress = internalMutation({
  args: {
    config: v.any(),
    currentGeneration: v.number(),
    population: v.any(),
    bestGenome: v.optional(v.any()),
    generationHistory: v.any(),
    matchupSchedule: v.any(),
    matchupIndex: v.number(),
    gameWithinMatchup: v.number(),
    gamesCompletedInGeneration: v.number(),
    lastUpdated: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("trainingState").first();
    if (existing) {
      await ctx.db.replace(existing._id, args);
    } else {
      await ctx.db.insert("trainingState", args);
    }
  },
});

/**
 * Save the best evolved genome (upsert).
 */
export const saveBestGenome = internalMutation({
  args: {
    genome: v.any(),
    generation: v.number(),
    fitness: v.number(),
  },
  handler: async (ctx, { genome, generation, fitness }) => {
    const existing = await ctx.db.query("evolvedGenome").first();
    const data = { genome, generation, fitness, lastUpdated: Date.now() };
    if (existing) {
      await ctx.db.replace(existing._id, data);
    } else {
      await ctx.db.insert("evolvedGenome", data);
    }
  },
});

/**
 * Public query: get the current best evolved genome.
 * Used by clients to load evolved AI weights.
 */
export const getEvolvedGenome = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("evolvedGenome").first();
  },
});
