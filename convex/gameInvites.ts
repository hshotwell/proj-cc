import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { auth } from "./auth";

export const listPendingInvites = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    const invites = await ctx.db
      .query("gameInvites")
      .withIndex("by_receiverId_status", (q) =>
        q.eq("receiverId", userId).eq("status", "pending")
      )
      .collect();

    const results = [];
    for (const invite of invites) {
      const sender = await ctx.db.get(invite.senderId);
      if (!sender) continue;

      const game = await ctx.db.get(invite.gameId);
      if (!game || game.status !== "lobby") continue;

      results.push({
        inviteId: invite._id,
        gameId: invite.gameId,
        senderUsername: sender.username || sender.name || "Unknown",
        senderImage: sender.image || null,
        playerCount: game.playerCount,
        createdAt: invite.createdAt,
      });
    }

    return results;
  },
});

export const acceptInvite = mutation({
  args: { inviteId: v.id("gameInvites") },
  handler: async (ctx, { inviteId }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const invite = await ctx.db.get(inviteId);
    if (!invite) throw new Error("Invite not found");
    if (invite.receiverId !== userId) throw new Error("Not your invite");
    if (invite.status !== "pending") throw new Error("Invite is not pending");

    const game = await ctx.db.get(invite.gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "lobby") throw new Error("Game is no longer in lobby");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    // Set invite as accepted
    await ctx.db.patch(inviteId, { status: "accepted" });

    // Add user to first available slot (or their reserved slot)
    const players = game.players as any[];
    let slotFound = false;

    const updated = players.map((p: any) => {
      // Check if there's already a reserved slot for this user
      if (p.userId === userId) {
        slotFound = true;
        return { ...p, type: "human" };
      }
      // Find first empty slot
      if (!slotFound && p.type === "empty") {
        slotFound = true;
        return {
          ...p,
          type: "human",
          userId,
          username: user.username || user.name || "Guest",
        };
      }
      return p;
    });

    if (!slotFound) throw new Error("No available slots");

    await ctx.db.patch(invite.gameId, { players: updated });

    return invite.gameId;
  },
});

export const declineInvite = mutation({
  args: { inviteId: v.id("gameInvites") },
  handler: async (ctx, { inviteId }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const invite = await ctx.db.get(inviteId);
    if (!invite) throw new Error("Invite not found");
    if (invite.receiverId !== userId) throw new Error("Not your invite");

    await ctx.db.patch(inviteId, { status: "declined" });
  },
});

export const countPendingInvites = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return 0;

    const invites = await ctx.db
      .query("gameInvites")
      .withIndex("by_receiverId_status", (q) =>
        q.eq("receiverId", userId).eq("status", "pending")
      )
      .collect();

    // Only count invites for games still in lobby
    let count = 0;
    for (const invite of invites) {
      const game = await ctx.db.get(invite.gameId);
      if (game && game.status === "lobby") count++;
    }

    return count;
  },
});
