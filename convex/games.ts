import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { auth } from "./auth";

// List saved games for the current user
export const listGames = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    const games = await ctx.db
      .query("savedGames")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);

    return games.map((g) => g.summary);
  },
});

// Get a single game by ID
export const getGame = query({
  args: { gameId: v.string() },
  handler: async (ctx, { gameId }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;

    const game = await ctx.db
      .query("savedGames")
      .withIndex("by_userId_gameId", (q) =>
        q.eq("userId", userId).eq("gameId", gameId)
      )
      .first();

    if (!game) return null;

    return game.gameData;
  },
});

// Save a game (upsert)
export const saveGame = mutation({
  args: {
    gameId: v.string(),
    gameData: v.any(),
    summary: v.any(),
  },
  handler: async (ctx, { gameId, gameData, summary }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("savedGames")
      .withIndex("by_userId_gameId", (q) =>
        q.eq("userId", userId).eq("gameId", gameId)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { gameData, summary });
    } else {
      await ctx.db.insert("savedGames", {
        userId,
        gameId,
        gameData,
        summary,
      });
    }

    return { success: true };
  },
});

// Delete a game
export const deleteGame = mutation({
  args: { gameId: v.string() },
  handler: async (ctx, { gameId }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const game = await ctx.db
      .query("savedGames")
      .withIndex("by_userId_gameId", (q) =>
        q.eq("userId", userId).eq("gameId", gameId)
      )
      .first();

    if (game) {
      await ctx.db.delete(game._id);
    }

    return { success: true };
  },
});
