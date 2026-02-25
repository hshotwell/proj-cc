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

  onlineGames: defineTable({
    hostId: v.id("users"),
    status: v.union(v.literal("lobby"), v.literal("playing"), v.literal("finished"), v.literal("abandoned")),
    playerCount: v.number(),
    boardType: v.union(v.literal("standard"), v.literal("custom")),
    customLayout: v.optional(v.any()),
    players: v.any(),
    turns: v.optional(v.any()),
    currentPlayerIndex: v.optional(v.number()),
    winner: v.optional(v.number()),
    finishedPlayers: v.optional(v.any()),
    createdAt: v.number(),
    rematchRequestedBy: v.optional(v.id("users")),
    rematchAcceptedBy: v.optional(v.any()),
    rematchDeclinedBy: v.optional(v.id("users")),
    rematchGameId: v.optional(v.id("onlineGames")),
  })
    .index("by_hostId", ["hostId"])
    .index("by_status", ["status"]),

  gameInvites: defineTable({
    gameId: v.id("onlineGames"),
    senderId: v.id("users"),
    receiverId: v.id("users"),
    status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("declined")),
    createdAt: v.number(),
  })
    .index("by_receiverId_status", ["receiverId", "status"])
    .index("by_gameId", ["gameId"]),

  learnedInsights: defineTable({
    gamesAnalyzed: v.number(),
    weights: v.any(),
    endgameStats: v.any(),
    lastUpdated: v.number(),
  }),

  trainingState: defineTable({
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
  }),

  evolvedGenome: defineTable({
    genome: v.any(),
    generation: v.number(),
    fitness: v.number(),
    lastUpdated: v.number(),
  }),
});
