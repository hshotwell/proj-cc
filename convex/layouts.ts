import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { auth } from "./auth";

// List all layouts for the current user
export const listLayouts = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    const layouts = await ctx.db
      .query("boardLayouts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    return layouts.map((l) => ({
      id: l.layoutId,
      name: l.name,
      cells: l.cells,
      startingPositions: l.startingPositions,
      goalPositions: l.goalPositions,
      walls: l.walls,
      isDefault: l.isDefault,
    }));
  },
});

// Save a layout (upsert)
export const saveLayout = mutation({
  args: {
    layoutId: v.string(),
    name: v.string(),
    cells: v.any(),
    startingPositions: v.any(),
    goalPositions: v.any(),
    walls: v.optional(v.any()),
    isDefault: v.boolean(),
  },
  handler: async (ctx, { layoutId, name, cells, startingPositions, goalPositions, walls, isDefault }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("boardLayouts")
      .withIndex("by_userId_layoutId", (q) =>
        q.eq("userId", userId).eq("layoutId", layoutId)
      )
      .first();

    // If setting as default, unset all others
    if (isDefault) {
      const allLayouts = await ctx.db
        .query("boardLayouts")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect();
      for (const layout of allLayouts) {
        if (layout.isDefault && layout.layoutId !== layoutId) {
          await ctx.db.patch(layout._id, { isDefault: false });
        }
      }
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        name,
        cells,
        startingPositions,
        goalPositions,
        walls,
        isDefault,
      });
    } else {
      await ctx.db.insert("boardLayouts", {
        userId,
        layoutId,
        name,
        cells,
        startingPositions,
        goalPositions,
        walls,
        isDefault,
      });
    }

    return { success: true };
  },
});

// Update a layout
export const updateLayout = mutation({
  args: {
    layoutId: v.string(),
    name: v.optional(v.string()),
    cells: v.optional(v.any()),
    startingPositions: v.optional(v.any()),
    goalPositions: v.optional(v.any()),
    walls: v.optional(v.any()),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, { layoutId, ...updates }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("boardLayouts")
      .withIndex("by_userId_layoutId", (q) =>
        q.eq("userId", userId).eq("layoutId", layoutId)
      )
      .first();

    if (!existing) {
      throw new Error("Layout not found");
    }

    // If setting as default, unset all others
    if (updates.isDefault) {
      const allLayouts = await ctx.db
        .query("boardLayouts")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect();
      for (const layout of allLayouts) {
        if (layout.isDefault && layout.layoutId !== layoutId) {
          await ctx.db.patch(layout._id, { isDefault: false });
        }
      }
    }

    // Build patch object, omitting undefined values
    const patch: Record<string, unknown> = {};
    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.cells !== undefined) patch.cells = updates.cells;
    if (updates.startingPositions !== undefined) patch.startingPositions = updates.startingPositions;
    if (updates.goalPositions !== undefined) patch.goalPositions = updates.goalPositions;
    if (updates.walls !== undefined) patch.walls = updates.walls;
    if (updates.isDefault !== undefined) patch.isDefault = updates.isDefault;

    await ctx.db.patch(existing._id, patch);

    return { success: true };
  },
});

// Delete a layout
export const deleteLayout = mutation({
  args: { layoutId: v.string() },
  handler: async (ctx, { layoutId }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("boardLayouts")
      .withIndex("by_userId_layoutId", (q) =>
        q.eq("userId", userId).eq("layoutId", layoutId)
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }

    return { success: true };
  },
});
