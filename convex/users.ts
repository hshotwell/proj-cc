import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { auth } from "./auth";

// Get the current user's profile
export const getProfile = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;

    const user = await ctx.db.get(userId);
    if (!user) return null;

    return {
      id: user._id,
      email: user.email || "",
      name: user.displayName || user.name || null,
      image: user.image || null,
      username: user.username ?? null,
      isEmailVerified: user.emailVerificationTime != null,
    };
  },
});

// Update the current user's profile
export const updateProfile = mutation({
  args: {
    displayName: v.optional(v.string()),
  },
  handler: async (ctx, { displayName }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const updates: Record<string, string> = {};
    if (displayName !== undefined) {
      updates.displayName = displayName;
      updates.name = displayName;
    }

    await ctx.db.patch(userId, updates);
    return { success: true };
  },
});

// Get user settings
export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;

    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!settings) {
      // Return defaults
      return {
        showAllMoves: true,
        animateMoves: false,
        rotateBoard: true,
        showTriangleLines: true,
        showLastMoves: false,
        showCoordinates: false,
        autoConfirm: false,
        showPlayerProgress: false,
        darkMode: false,
      };
    }

    return {
      showAllMoves: settings.showAllMoves,
      animateMoves: settings.animateMoves,
      rotateBoard: settings.rotateBoard,
      showTriangleLines: settings.showTriangleLines,
      showLastMoves: settings.showLastMoves,
      showCoordinates: settings.showCoordinates,
      autoConfirm: settings.autoConfirm,
      showPlayerProgress: settings.showPlayerProgress,
      darkMode: settings.darkMode ?? false,
    };
  },
});

// Save user settings
export const saveSettings = mutation({
  args: {
    showAllMoves: v.boolean(),
    animateMoves: v.boolean(),
    rotateBoard: v.boolean(),
    showTriangleLines: v.boolean(),
    showLastMoves: v.boolean(),
    showCoordinates: v.boolean(),
    autoConfirm: v.boolean(),
    showPlayerProgress: v.boolean(),
    darkMode: v.optional(v.boolean()),
  },
  handler: async (ctx, settings) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, settings);
    } else {
      await ctx.db.insert("userSettings", { userId, ...settings });
    }

    return { success: true };
  },
});
