import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

  users: defineTable({
    // Fields from @convex-dev/auth
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // Custom fields
    username: v.optional(v.string()),
    displayName: v.optional(v.string()),
    authProvider: v.optional(v.string()),
  })
    .index("email", ["email"])
    .index("by_username", ["username"]),

  userSettings: defineTable({
    userId: v.id("users"),
    showAllMoves: v.boolean(),
    animateMoves: v.boolean(),
    rotateBoard: v.boolean(),
    showTriangleLines: v.boolean(),
    showLastMoves: v.boolean(),
    showCoordinates: v.boolean(),
    autoConfirm: v.boolean(),
    showPlayerProgress: v.boolean(),
    darkMode: v.optional(v.boolean()),
  }).index("by_userId", ["userId"]),

  boardLayouts: defineTable({
    userId: v.id("users"),
    layoutId: v.string(),
    name: v.string(),
    cells: v.any(),
    startingPositions: v.any(),
    goalPositions: v.any(),
    walls: v.optional(v.any()),
    isDefault: v.boolean(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_layoutId", ["userId", "layoutId"]),

  savedGames: defineTable({
    userId: v.id("users"),
    gameId: v.string(),
    gameData: v.any(),
    summary: v.any(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_gameId", ["userId", "gameId"]),

  passwordResetTokens: defineTable({
    userId: v.id("users"),
    token: v.string(),
    expiresAt: v.number(),
    used: v.boolean(),
  })
    .index("by_token", ["token"])
    .index("by_userId", ["userId"]),

  friendships: defineTable({
    senderId: v.id("users"),
    receiverId: v.id("users"),
    status: v.union(v.literal("pending"), v.literal("accepted")),
  })
    .index("by_senderId", ["senderId"])
    .index("by_receiverId", ["receiverId"])
    .index("by_senderId_status", ["senderId", "status"])
    .index("by_receiverId_status", ["receiverId", "status"])
    .index("by_pair", ["senderId", "receiverId"]),

  presence: defineTable({
    userId: v.id("users"),
    lastSeen: v.number(),
  }).index("by_userId", ["userId"]),
});
