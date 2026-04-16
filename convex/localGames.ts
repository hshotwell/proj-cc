import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { auth } from "./auth";

const MAX_IN_PROGRESS = 10;

export const listInProgress = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    const games = await ctx.db
      .query("inProgressLocalGames")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(MAX_IN_PROGRESS + 1);

    return games.map((g) => ({ ...g.summary, gameId: g.gameId, updatedAt: g.updatedAt }));
  },
});

export const getInProgress = query({
  args: { gameId: v.string() },
  handler: async (ctx, { gameId }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;

    const game = await ctx.db
      .query("inProgressLocalGames")
      .withIndex("by_userId_gameId", (q) => q.eq("userId", userId).eq("gameId", gameId))
      .first();

    return game ? game.gameData : null;
  },
});

export const saveInProgress = mutation({
  args: {
    gameId: v.string(),
    gameData: v.any(),
    summary: v.any(),
  },
  handler: async (ctx, { gameId, gameData, summary }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("inProgressLocalGames")
      .withIndex("by_userId_gameId", (q) => q.eq("userId", userId).eq("gameId", gameId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { gameData, summary, updatedAt: Date.now() });
    } else {
      // Enforce limit before inserting
      const count = await ctx.db
        .query("inProgressLocalGames")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect();
      if (count.length >= MAX_IN_PROGRESS) {
        throw new Error(`You already have ${MAX_IN_PROGRESS} active local games. Finish or abandon one first.`);
      }
      await ctx.db.insert("inProgressLocalGames", {
        userId,
        gameId,
        gameData,
        summary,
        updatedAt: Date.now(),
      });
    }
  },
});

export const deleteInProgress = mutation({
  args: { gameId: v.string() },
  handler: async (ctx, { gameId }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const game = await ctx.db
      .query("inProgressLocalGames")
      .withIndex("by_userId_gameId", (q) => q.eq("userId", userId).eq("gameId", gameId))
      .first();

    if (game) {
      await ctx.db.delete(game._id);
    }
  },
});

export const getInProgressCount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return { count: 0, atLimit: false };

    const games = await ctx.db
      .query("inProgressLocalGames")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    return { count: games.length, atLimit: games.length >= MAX_IN_PROGRESS };
  },
});
