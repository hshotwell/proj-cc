import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { auth } from "./auth";

// Default colors for player slots
const SLOT_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#f97316", "#a855f7", "#facc15"];

export const createLobby = mutation({
  args: {
    playerCount: v.number(),
    receiverId: v.id("users"),
  },
  handler: async (ctx, { playerCount, receiverId }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const host = await ctx.db.get(userId);
    if (!host) throw new Error("User not found");

    const receiver = await ctx.db.get(receiverId);
    if (!receiver) throw new Error("Receiver not found");

    // Build initial player slots
    const players = [];
    for (let i = 0; i < playerCount; i++) {
      if (i === 0) {
        players.push({
          slot: i,
          type: "human" as const,
          userId,
          username: host.username || host.name || "Host",
          color: SLOT_COLORS[i],
          isReady: false,
        });
      } else if (i === 1) {
        // Reserve slot for invited player
        players.push({
          slot: i,
          type: "human" as const,
          userId: receiverId,
          username: receiver.username || receiver.name || "Guest",
          color: SLOT_COLORS[i],
          isReady: false,
        });
      } else {
        players.push({
          slot: i,
          type: "empty" as const,
          color: SLOT_COLORS[i],
          isReady: false,
        });
      }
    }

    const gameId = await ctx.db.insert("onlineGames", {
      hostId: userId,
      status: "lobby",
      playerCount,
      boardType: "standard",
      players,
      createdAt: Date.now(),
    });

    // Create invite for receiver
    await ctx.db.insert("gameInvites", {
      gameId,
      senderId: userId,
      receiverId,
      status: "pending",
      createdAt: Date.now(),
    });

    return gameId;
  },
});

export const getLobby = query({
  args: { gameId: v.id("onlineGames") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get(gameId);
    if (!game) return null;
    return game;
  },
});

export const updateBoardConfig = mutation({
  args: {
    gameId: v.id("onlineGames"),
    boardType: v.union(v.literal("standard"), v.literal("custom")),
    playerCount: v.number(),
    customLayout: v.optional(v.any()),
  },
  handler: async (ctx, { gameId, boardType, playerCount, customLayout }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.hostId !== userId) throw new Error("Only the host can update board config");
    if (game.status !== "lobby") throw new Error("Game is not in lobby");

    // Rebuild player slots preserving existing humans
    const existingHumans = (game.players as any[]).filter(
      (p: any) => p.type === "human" && p.userId
    );

    const players = [];
    for (let i = 0; i < playerCount; i++) {
      const existingHuman = existingHumans.find((_: any, idx: number) => idx === i);
      if (existingHuman) {
        players.push({ ...existingHuman, slot: i, color: SLOT_COLORS[i], isReady: false });
      } else {
        players.push({
          slot: i,
          type: "empty" as const,
          color: SLOT_COLORS[i],
          isReady: false,
        });
      }
    }

    await ctx.db.patch(gameId, {
      boardType,
      playerCount,
      customLayout: boardType === "custom" ? customLayout : undefined,
      players,
    });

    // Clean up orphaned invites for players that no longer have a slot
    const remainingUserIds = new Set(
      players.filter((p: any) => p.userId).map((p: any) => p.userId)
    );
    const invites = await ctx.db
      .query("gameInvites")
      .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
      .collect();
    for (const invite of invites) {
      if (invite.status === "pending" && !remainingUserIds.has(invite.receiverId)) {
        await ctx.db.patch(invite._id, { status: "declined" });
      }
    }
  },
});

export const inviteToLobby = mutation({
  args: {
    gameId: v.id("onlineGames"),
    friendId: v.id("users"),
    slot: v.number(),
  },
  handler: async (ctx, { gameId, friendId, slot }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.hostId !== userId) throw new Error("Only the host can invite players");
    if (game.status !== "lobby") throw new Error("Game is not in lobby");

    const players = game.players as any[];
    if (slot < 0 || slot >= players.length) throw new Error("Invalid slot");
    if (players[slot].type !== "empty") throw new Error("Slot is not empty");

    // Check friend is not already in the game
    const alreadyInGame = players.some((p: any) => p.userId === friendId);
    if (alreadyInGame) throw new Error("Player is already in this game");

    // Verify they are actually friends
    const friendship1 = await ctx.db
      .query("friendships")
      .withIndex("by_pair", (q) => q.eq("senderId", userId).eq("receiverId", friendId))
      .first();
    const friendship2 = await ctx.db
      .query("friendships")
      .withIndex("by_pair", (q) => q.eq("senderId", friendId).eq("receiverId", userId))
      .first();
    const areFriends =
      (friendship1 && friendship1.status === "accepted") ||
      (friendship2 && friendship2.status === "accepted");
    if (!areFriends) throw new Error("You can only invite friends");

    const friend = await ctx.db.get(friendId);
    if (!friend) throw new Error("User not found");

    // Reserve the slot for the invited friend
    const updated = [...players];
    updated[slot] = {
      slot,
      type: "human" as const,
      userId: friendId,
      username: friend.username || friend.name || "Guest",
      color: updated[slot].color,
      isReady: false,
    };
    await ctx.db.patch(gameId, { players: updated });

    // Create game invite
    await ctx.db.insert("gameInvites", {
      gameId,
      senderId: userId,
      receiverId: friendId,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

export const cancelSlotInvite = mutation({
  args: {
    gameId: v.id("onlineGames"),
    slot: v.number(),
  },
  handler: async (ctx, { gameId, slot }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.hostId !== userId) throw new Error("Only the host can cancel invites");
    if (game.status !== "lobby") throw new Error("Game is not in lobby");

    const players = game.players as any[];
    if (slot < 0 || slot >= players.length) throw new Error("Invalid slot");
    if (players[slot].type !== "human") throw new Error("Slot is not a human player");
    if (players[slot].userId === userId) throw new Error("Cannot remove yourself");

    const removedUserId = players[slot].userId;

    // Reset slot to empty
    const updated = [...players];
    updated[slot] = {
      slot,
      type: "empty" as const,
      color: updated[slot].color,
      isReady: false,
    };
    await ctx.db.patch(gameId, { players: updated });

    // Find and decline the associated invite
    const invite = await ctx.db
      .query("gameInvites")
      .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
      .filter((q) => q.eq(q.field("receiverId"), removedUserId))
      .first();
    if (invite) {
      await ctx.db.patch(invite._id, { status: "declined" });
    }
  },
});

export const selectColor = mutation({
  args: {
    gameId: v.id("onlineGames"),
    color: v.string(),
  },
  handler: async (ctx, { gameId, color }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "lobby") throw new Error("Game is not in lobby");

    const players = game.players as any[];

    // Check no other player has this color
    const colorTaken = players.some(
      (p: any) => p.color === color && p.userId !== userId
    );
    if (colorTaken) throw new Error("Color already taken");

    // Update this player's color
    const updated = players.map((p: any) =>
      p.userId === userId ? { ...p, color } : p
    );

    await ctx.db.patch(gameId, { players: updated });
  },
});

export const configureAI = mutation({
  args: {
    gameId: v.id("onlineGames"),
    slot: v.number(),
    aiConfig: v.object({
      difficulty: v.string(),
      personality: v.string(),
    }),
  },
  handler: async (ctx, { gameId, slot, aiConfig }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.hostId !== userId) throw new Error("Only the host can configure AI");
    if (game.status !== "lobby") throw new Error("Game is not in lobby");

    const players = game.players as any[];
    if (slot < 0 || slot >= players.length) throw new Error("Invalid slot");
    if (players[slot].type === "human" && players[slot].userId) {
      throw new Error("Cannot replace a human player with AI");
    }

    const updated = [...players];
    updated[slot] = {
      slot,
      type: "ai",
      color: updated[slot].color,
      aiConfig,
      isReady: true,
    };

    await ctx.db.patch(gameId, { players: updated });
  },
});

export const removeAI = mutation({
  args: {
    gameId: v.id("onlineGames"),
    slot: v.number(),
  },
  handler: async (ctx, { gameId, slot }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.hostId !== userId) throw new Error("Only the host can remove AI");
    if (game.status !== "lobby") throw new Error("Game is not in lobby");

    const players = game.players as any[];
    if (slot < 0 || slot >= players.length) throw new Error("Invalid slot");
    if (players[slot].type !== "ai") throw new Error("Slot is not AI");

    const updated = [...players];
    updated[slot] = {
      slot,
      type: "empty",
      color: updated[slot].color,
      isReady: false,
    };

    await ctx.db.patch(gameId, { players: updated });
  },
});

export const reorderPlayers = mutation({
  args: {
    gameId: v.id("onlineGames"),
    fromSlot: v.number(),
    toSlot: v.number(),
  },
  handler: async (ctx, { gameId, fromSlot, toSlot }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.hostId !== userId) throw new Error("Only the host can reorder players");
    if (game.status !== "lobby") throw new Error("Game is not in lobby");

    const players = game.players as any[];
    if (fromSlot < 0 || fromSlot >= players.length) throw new Error("Invalid fromSlot");
    if (toSlot < 0 || toSlot >= players.length) throw new Error("Invalid toSlot");
    if (fromSlot === toSlot) return;

    // Swap the two players, each keeps their chosen color
    const updated = [...players];
    const fromPlayer = { ...updated[fromSlot] };
    const toPlayer = { ...updated[toSlot] };

    // Swap colors so each player keeps their own color in the new slot
    const fromColor = fromPlayer.color;
    const toColor = toPlayer.color;
    updated[fromSlot] = { ...toPlayer, slot: fromSlot, color: toColor };
    updated[toSlot] = { ...fromPlayer, slot: toSlot, color: fromColor };

    // Reset ready status for all human players since order changed
    for (let i = 0; i < updated.length; i++) {
      if (updated[i].type === "human") {
        updated[i] = { ...updated[i], isReady: false };
      }
    }

    await ctx.db.patch(gameId, { players: updated });
  },
});

export const toggleReady = mutation({
  args: { gameId: v.id("onlineGames") },
  handler: async (ctx, { gameId }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "lobby") throw new Error("Game is not in lobby");

    const players = game.players as any[];
    const playerIdx = players.findIndex((p: any) => p.userId === userId);
    if (playerIdx === -1) throw new Error("Not a participant");

    const updated = [...players];
    updated[playerIdx] = { ...updated[playerIdx], isReady: !updated[playerIdx].isReady };

    // Check if all slots are filled and all humans are ready → auto-start
    const hasEmpty = updated.some((p: any) => p.type === "empty");
    const allHumansReady = updated
      .filter((p: any) => p.type === "human")
      .every((p: any) => p.isReady);

    if (!hasEmpty && allHumansReady) {
      await ctx.db.patch(gameId, {
        players: updated,
        status: "playing",
        turns: [],
        currentPlayerIndex: 0,
        finishedPlayers: [],
      });
    } else {
      await ctx.db.patch(gameId, { players: updated });
    }
  },
});

export const startGame = mutation({
  args: { gameId: v.id("onlineGames") },
  handler: async (ctx, { gameId }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.hostId !== userId) throw new Error("Only the host can start");
    if (game.status !== "lobby") throw new Error("Game is not in lobby");

    const players = game.players as any[];

    // Verify no empty slots
    const hasEmpty = players.some((p: any) => p.type === "empty");
    if (hasEmpty) throw new Error("All slots must be filled");

    // Verify all humans are ready
    const unreadyHumans = players.filter(
      (p: any) => p.type === "human" && !p.isReady
    );
    if (unreadyHumans.length > 0) throw new Error("All human players must be ready");

    await ctx.db.patch(gameId, {
      status: "playing",
      turns: [],
      currentPlayerIndex: 0,
      finishedPlayers: [],
    });
  },
});

export const submitTurn = mutation({
  args: {
    gameId: v.id("onlineGames"),
    moves: v.any(),
    playerFinished: v.optional(v.boolean()),
  },
  handler: async (ctx, { gameId, moves, playerFinished }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "playing") throw new Error("Game is not in progress");

    const players = game.players as any[];
    const currentPlayerIndex = game.currentPlayerIndex ?? 0;
    const currentSlot = players[currentPlayerIndex];

    // Validate: caller must be the current player, OR the host submitting an AI turn
    const isCurrentPlayer = currentSlot.type === "human" && currentSlot.userId === userId;
    const isHostForAI = currentSlot.type === "ai" && game.hostId === userId;
    if (!isCurrentPlayer && !isHostForAI) {
      throw new Error("Not your turn");
    }

    const turns = (game.turns as any[]) || [];
    const finishedPlayers = (game.finishedPlayers as number[]) || [];

    turns.push({
      playerIndex: currentPlayerIndex,
      moves,
    });

    // Handle player finishing
    if (playerFinished && !finishedPlayers.includes(currentPlayerIndex)) {
      finishedPlayers.push(currentPlayerIndex);
    }

    const allFinished = players.every((_: any, i: number) => finishedPlayers.includes(i));

    // Advance to next player, skipping finished ones
    const numPlayers = players.length;
    let nextIndex = (currentPlayerIndex + 1) % numPlayers;
    for (let i = 0; i < numPlayers; i++) {
      if (!finishedPlayers.includes(nextIndex)) break;
      nextIndex = (nextIndex + 1) % numPlayers;
    }

    await ctx.db.patch(gameId, {
      turns,
      currentPlayerIndex: nextIndex,
      finishedPlayers,
      winner: playerFinished ? (game.winner ?? currentPlayerIndex) : game.winner,
      status: allFinished ? "finished" : game.status,
    });
  },
});

export const requestRematch = mutation({
  args: { gameId: v.id("onlineGames") },
  handler: async (ctx, { gameId }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "finished") throw new Error("Game is not finished");

    const players = game.players as any[];
    const isParticipant = players.some((p: any) => p.userId === userId);
    if (!isParticipant) throw new Error("Not a participant");

    await ctx.db.patch(gameId, {
      rematchRequestedBy: userId,
      rematchAcceptedBy: [userId],
      rematchDeclinedBy: undefined,
    });
  },
});

export const acceptRematch = mutation({
  args: { gameId: v.id("onlineGames") },
  handler: async (ctx, { gameId }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (!game.rematchRequestedBy) throw new Error("No rematch requested");

    const players = game.players as any[];
    const isParticipant = players.some((p: any) => p.userId === userId);
    if (!isParticipant) throw new Error("Not a participant");

    const accepted = (game.rematchAcceptedBy as string[]) || [];
    if (accepted.includes(userId)) return; // Already accepted
    accepted.push(userId);

    // Check if all human players have accepted
    const humanPlayers = players.filter((p: any) => p.type === "human" && p.userId);
    const allAccepted = humanPlayers.every((p: any) => accepted.includes(p.userId));

    if (allAccepted) {
      // Reorder players by finish placement — first finisher goes first in rematch
      const finishedSlots = (game.finishedPlayers as number[]) || [];
      const orderedPlayers: any[] = [];

      // Add finished players in their finish order
      for (const slotIdx of finishedSlots) {
        if (players[slotIdx]) {
          orderedPlayers.push(players[slotIdx]);
        }
      }
      // Append any unfinished players (edge case: abandoned games)
      for (let i = 0; i < players.length; i++) {
        if (!finishedSlots.includes(i) && players[i]) {
          orderedPlayers.push(players[i]);
        }
      }

      // Reassign slot indices to new positions
      const newPlayers = orderedPlayers.map((p: any, i: number) => ({
        ...p,
        slot: i,
        isReady: true,
      }));

      const newGameId = await ctx.db.insert("onlineGames", {
        hostId: game.hostId,
        status: "playing",
        playerCount: game.playerCount,
        boardType: game.boardType,
        customLayout: game.customLayout,
        players: newPlayers,
        turns: [],
        currentPlayerIndex: 0,
        finishedPlayers: [],
        createdAt: Date.now(),
      });

      await ctx.db.patch(gameId, {
        rematchAcceptedBy: accepted,
        rematchGameId: newGameId,
      });
    } else {
      await ctx.db.patch(gameId, {
        rematchAcceptedBy: accepted,
      });
    }
  },
});

export const declineRematch = mutation({
  args: { gameId: v.id("onlineGames") },
  handler: async (ctx, { gameId }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (!game.rematchRequestedBy) throw new Error("No rematch requested");

    await ctx.db.patch(gameId, {
      rematchDeclinedBy: userId,
      rematchRequestedBy: undefined,
      rematchAcceptedBy: undefined,
    });
  },
});

export const abandonGame = mutation({
  args: { gameId: v.id("onlineGames") },
  handler: async (ctx, { gameId }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");

    // Must be a participant
    const players = game.players as any[];
    const isParticipant = players.some((p: any) => p.userId === userId) || game.hostId === userId;
    if (!isParticipant) throw new Error("Not a participant");

    await ctx.db.patch(gameId, { status: "abandoned" });
  },
});

export const leaveLobby = mutation({
  args: { gameId: v.id("onlineGames") },
  handler: async (ctx, { gameId }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "lobby") throw new Error("Game is not in lobby");

    if (game.hostId === userId) {
      // Host leaves -> abandon
      await ctx.db.patch(gameId, { status: "abandoned" });
    } else {
      // Guest leaves -> remove from players, delete their invite
      const players = game.players as any[];
      const updated = players.map((p: any) =>
        p.userId === userId
          ? { slot: p.slot, type: "empty", color: p.color, isReady: false }
          : p
      );
      await ctx.db.patch(gameId, { players: updated });

      // Delete invite
      const invite = await ctx.db
        .query("gameInvites")
        .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
        .filter((q) => q.eq(q.field("receiverId"), userId))
        .first();
      if (invite) {
        await ctx.db.delete(invite._id);
      }
    }
  },
});

export const listActiveGames = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    // Get games where user is host
    const hostedGames = await ctx.db
      .query("onlineGames")
      .withIndex("by_hostId", (q) => q.eq("hostId", userId))
      .collect();

    // Filter to active (lobby or playing) and where user is participant
    const activeGames = hostedGames.filter(
      (g) => g.status === "lobby" || g.status === "playing"
    );

    // Also find games where user is a non-host participant
    const lobbyGames = await ctx.db
      .query("onlineGames")
      .withIndex("by_status", (q) => q.eq("status", "lobby"))
      .collect();

    const playingGames = await ctx.db
      .query("onlineGames")
      .withIndex("by_status", (q) => q.eq("status", "playing"))
      .collect();

    const otherGames = [...lobbyGames, ...playingGames].filter((g) => {
      if (g.hostId === userId) return false; // Already in hostedGames
      const players = g.players as any[];
      return players.some((p: any) => p.userId === userId);
    });

    return [...activeGames, ...otherGames];
  },
});
