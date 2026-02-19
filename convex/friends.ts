import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { auth } from "./auth";

const ONLINE_THRESHOLD_MS = 60_000; // 60 seconds

export const searchUsers = query({
  args: { query: v.string() },
  handler: async (ctx, { query: searchQuery }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];
    if (searchQuery.length < 2) return [];

    const lowerQuery = searchQuery.toLowerCase();
    // Prefix range query on by_username index
    const users = await ctx.db
      .query("users")
      .withIndex("by_username", (q) =>
        q.gte("username", lowerQuery).lt("username", lowerQuery + "\uffff")
      )
      .take(20);

    const results = [];
    for (const user of users) {
      if (user._id === userId) continue;
      if (!user.username) continue;

      // Check friendship status
      const sentRequest = await ctx.db
        .query("friendships")
        .withIndex("by_pair", (q) =>
          q.eq("senderId", userId).eq("receiverId", user._id)
        )
        .first();
      const receivedRequest = await ctx.db
        .query("friendships")
        .withIndex("by_pair", (q) =>
          q.eq("senderId", user._id).eq("receiverId", userId)
        )
        .first();

      let friendshipStatus: "none" | "pending_sent" | "pending_received" | "accepted" = "none";
      if (sentRequest) {
        friendshipStatus = sentRequest.status === "accepted" ? "accepted" : "pending_sent";
      } else if (receivedRequest) {
        friendshipStatus = receivedRequest.status === "accepted" ? "accepted" : "pending_received";
      }

      results.push({
        id: user._id,
        username: user.username,
        displayName: user.displayName || user.name || null,
        image: user.image || null,
        friendshipStatus,
      });

      if (results.length >= 10) break;
    }

    return results;
  },
});

export const listFriends = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    const sentAccepted = await ctx.db
      .query("friendships")
      .withIndex("by_senderId_status", (q) =>
        q.eq("senderId", userId).eq("status", "accepted")
      )
      .collect();

    const receivedAccepted = await ctx.db
      .query("friendships")
      .withIndex("by_receiverId_status", (q) =>
        q.eq("receiverId", userId).eq("status", "accepted")
      )
      .collect();

    const now = Date.now();
    const friends = [];

    for (const f of sentAccepted) {
      const friend = await ctx.db.get(f.receiverId);
      if (!friend) continue;
      const presence = await ctx.db
        .query("presence")
        .withIndex("by_userId", (q) => q.eq("userId", f.receiverId))
        .first();
      friends.push({
        friendshipId: f._id,
        id: friend._id,
        username: friend.username || null,
        displayName: friend.displayName || friend.name || null,
        image: friend.image || null,
        online: presence ? now - presence.lastSeen < ONLINE_THRESHOLD_MS : false,
      });
    }

    for (const f of receivedAccepted) {
      const friend = await ctx.db.get(f.senderId);
      if (!friend) continue;
      const presence = await ctx.db
        .query("presence")
        .withIndex("by_userId", (q) => q.eq("userId", f.senderId))
        .first();
      friends.push({
        friendshipId: f._id,
        id: friend._id,
        username: friend.username || null,
        displayName: friend.displayName || friend.name || null,
        image: friend.image || null,
        online: presence ? now - presence.lastSeen < ONLINE_THRESHOLD_MS : false,
      });
    }

    return friends;
  },
});

export const listPendingRequests = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    const pending = await ctx.db
      .query("friendships")
      .withIndex("by_receiverId_status", (q) =>
        q.eq("receiverId", userId).eq("status", "pending")
      )
      .collect();

    const results = [];
    for (const f of pending) {
      const sender = await ctx.db.get(f.senderId);
      if (!sender) continue;
      results.push({
        friendshipId: f._id,
        id: sender._id,
        username: sender.username || null,
        displayName: sender.displayName || sender.name || null,
        image: sender.image || null,
      });
    }

    return results;
  },
});

export const listSentRequests = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    const sent = await ctx.db
      .query("friendships")
      .withIndex("by_senderId_status", (q) =>
        q.eq("senderId", userId).eq("status", "pending")
      )
      .collect();

    const results = [];
    for (const f of sent) {
      const receiver = await ctx.db.get(f.receiverId);
      if (!receiver) continue;
      results.push({
        friendshipId: f._id,
        id: receiver._id,
        username: receiver.username || null,
        displayName: receiver.displayName || receiver.name || null,
        image: receiver.image || null,
      });
    }

    return results;
  },
});

export const sendRequest = mutation({
  args: { receiverId: v.id("users") },
  handler: async (ctx, { receiverId }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    if (userId === receiverId) throw new Error("Cannot send request to yourself");

    // Check if friendship already exists in either direction
    const existing1 = await ctx.db
      .query("friendships")
      .withIndex("by_pair", (q) =>
        q.eq("senderId", userId).eq("receiverId", receiverId)
      )
      .first();
    if (existing1) throw new Error("Friendship already exists");

    const existing2 = await ctx.db
      .query("friendships")
      .withIndex("by_pair", (q) =>
        q.eq("senderId", receiverId).eq("receiverId", userId)
      )
      .first();
    if (existing2) throw new Error("Friendship already exists");

    await ctx.db.insert("friendships", {
      senderId: userId,
      receiverId,
      status: "pending",
    });
  },
});

export const acceptRequest = mutation({
  args: { friendshipId: v.id("friendships") },
  handler: async (ctx, { friendshipId }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const friendship = await ctx.db.get(friendshipId);
    if (!friendship) throw new Error("Request not found");
    if (friendship.receiverId !== userId) throw new Error("Not authorized");
    if (friendship.status !== "pending") throw new Error("Request is not pending");

    await ctx.db.patch(friendshipId, { status: "accepted" });
  },
});

export const rejectRequest = mutation({
  args: { friendshipId: v.id("friendships") },
  handler: async (ctx, { friendshipId }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const friendship = await ctx.db.get(friendshipId);
    if (!friendship) throw new Error("Request not found");
    if (friendship.receiverId !== userId) throw new Error("Not authorized");

    await ctx.db.delete(friendshipId);
  },
});

export const removeFriend = mutation({
  args: { friendshipId: v.id("friendships") },
  handler: async (ctx, { friendshipId }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const friendship = await ctx.db.get(friendshipId);
    if (!friendship) throw new Error("Friendship not found");
    if (friendship.senderId !== userId && friendship.receiverId !== userId) {
      throw new Error("Not authorized");
    }

    await ctx.db.delete(friendshipId);
  },
});

export const cancelRequest = mutation({
  args: { friendshipId: v.id("friendships") },
  handler: async (ctx, { friendshipId }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const friendship = await ctx.db.get(friendshipId);
    if (!friendship) throw new Error("Request not found");
    if (friendship.senderId !== userId) throw new Error("Not authorized");

    await ctx.db.delete(friendshipId);
  },
});
