import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";

// ── Puzzle storage ────────────────────────────────────────────────────────────

export const getPuzzles = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("endgameTrainingPuzzles").collect();
  },
});

export const getPuzzleCount = internalQuery({
  args: {},
  handler: async (ctx) => {
    const puzzles = await ctx.db.query("endgameTrainingPuzzles").collect();
    return puzzles.length;
  },
});

export const seedPuzzles = internalMutation({
  args: {
    puzzles: v.array(
      v.object({
        name: v.string(),
        positions: v.array(v.string()),
        goalPositions: v.array(v.string()),
        par: v.number(),
        source: v.string(),
        createdAt: v.number(),
      })
    ),
  },
  handler: async (ctx, { puzzles }) => {
    for (const puzzle of puzzles) {
      await ctx.db.insert("endgameTrainingPuzzles", puzzle);
    }
  },
});

/**
 * Public mutation: upload a puzzle from the client (extracted from a real game).
 * Idempotent by name — won't insert a duplicate.
 */
export const uploadPuzzle = mutation({
  args: {
    name: v.string(),
    positions: v.array(v.string()),
    goalPositions: v.array(v.string()),
    par: v.number(),
  },
  handler: async (ctx, { name, positions, goalPositions, par }) => {
    const existing = await ctx.db
      .query("endgameTrainingPuzzles")
      .filter((q) => q.eq(q.field("name"), name))
      .first();
    if (existing) return existing._id;
    return await ctx.db.insert("endgameTrainingPuzzles", {
      name,
      positions,
      goalPositions,
      par,
      source: "uploaded",
      createdAt: Date.now(),
    });
  },
});

// ── Training state ────────────────────────────────────────────────────────────

export const getEndgameTrainingState = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("endgameTrainingState").first();
  },
});

export const saveEndgameTrainingState = internalMutation({
  args: {
    generation: v.number(),
    population: v.any(),
    bestFitness: v.number(),
    generationHistory: v.any(),
    puzzleCount: v.number(),
    lastUpdated: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("endgameTrainingState").first();
    if (existing) {
      await ctx.db.replace(existing._id, args);
    } else {
      await ctx.db.insert("endgameTrainingState", args);
    }
  },
});

// ── Best genome ───────────────────────────────────────────────────────────────

export const saveEndgameEvolvedGenome = internalMutation({
  args: {
    genome: v.any(),
    generation: v.number(),
    fitness: v.number(),
    puzzleCount: v.number(),
  },
  handler: async (ctx, { genome, generation, fitness, puzzleCount }) => {
    const existing = await ctx.db.query("endgameEvolvedGenome").first();
    const data = { genome, generation, fitness, puzzleCount, lastUpdated: Date.now() };
    if (existing) {
      await ctx.db.replace(existing._id, data);
    } else {
      await ctx.db.insert("endgameEvolvedGenome", data);
    }
  },
});

/** Public query — lets the client load the endgame-trained genome. */
export const getEndgameEvolvedGenome = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("endgameEvolvedGenome").first();
  },
});

/** Public query — basic stats for a dashboard / debug view. */
export const getEndgameTrainingStats = query({
  args: {},
  handler: async (ctx) => {
    const state = await ctx.db.query("endgameTrainingState").first();
    const best = await ctx.db.query("endgameEvolvedGenome").first();
    const puzzleCount = (await ctx.db.query("endgameTrainingPuzzles").collect()).length;
    return { state, best, puzzleCount };
  },
});
