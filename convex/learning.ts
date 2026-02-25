import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { auth } from "./auth";

/**
 * Submit game insights after an online game finishes.
 * Incrementally updates the single aggregated learnedInsights row.
 */
export const submitGameInsights = mutation({
  args: {
    gameId: v.id("onlineGames"),
    playerCount: v.number(),
    winnerMoveCount: v.number(),
    winnerMetrics: v.any(),    // PlayerGameMetrics
    endgameMetrics: v.optional(v.any()), // EndgameMetrics
  },
  handler: async (ctx, { gameId, playerCount, winnerMoveCount, winnerMetrics, endgameMetrics }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Validate caller was in the game
    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "finished") throw new Error("Game is not finished");

    const players = game.players as any[];
    const isParticipant = players.some((p: any) => p.userId === userId);
    if (!isParticipant) throw new Error("Not a participant in this game");

    // Get or create the single aggregated row
    const existing = await ctx.db.query("learnedInsights").first();

    if (!existing) {
      // First game ever — create the row
      const weights = computeInitialWeights(winnerMetrics);
      const endgameStats = endgameMetrics
        ? computeInitialEndgameStats(endgameMetrics)
        : defaultEndgameStats();

      await ctx.db.insert("learnedInsights", {
        gamesAnalyzed: 1,
        weights,
        endgameStats,
        lastUpdated: Date.now(),
      });
      return;
    }

    // Incrementally update using running averages
    const n = existing.gamesAnalyzed + 1;
    const oldWeights = existing.weights as Record<string, number>;
    const newWeights = updateWeightsRunningAverage(oldWeights, winnerMetrics, n);

    const oldEndgame = existing.endgameStats as Record<string, number>;
    const newEndgame = endgameMetrics
      ? updateEndgameStatsRunningAverage(oldEndgame, endgameMetrics, n)
      : oldEndgame;

    await ctx.db.patch(existing._id, {
      gamesAnalyzed: n,
      weights: newWeights,
      endgameStats: newEndgame,
      lastUpdated: Date.now(),
    });
  },
});

/**
 * Get current shared insights. Public read — no auth required.
 */
export const getSharedInsights = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("learnedInsights").first();
  },
});

// --- Helper functions ---

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function computeInitialWeights(metrics: any) {
  const jumpRatio = metrics.totalMoves > 0
    ? metrics.jumpMoves / metrics.totalMoves
    : 0.5;

  return {
    distanceWeight: clamp(0.8 + (metrics.avgDistanceGainedPerMove / 2) * 0.4, 0.5, 1.5),
    cohesionWeight: clamp(0.8 + metrics.avgPieceCohesion * 0.4, 0.5, 1.5),
    mobilityWeight: clamp(1.2 - metrics.avgPieceCohesion * 0.4, 0.5, 1.5),
    advancementBalance: metrics.totalMoves < 40 ? 1.2 : (metrics.totalMoves < 60 ? 1.0 : 0.9),
    jumpPreference: clamp(0.8 + jumpRatio * 0.4, 0.5, 1.5),
    goalOccupationWeight: 1.0,
    avgWinningMoveCount: metrics.totalMoves,
    optimalJumpChainLength: metrics.avgJumpChainLength,
    optimalCohesionLevel: metrics.avgPieceCohesion,
  };
}

function updateWeightsRunningAverage(
  old: Record<string, number>,
  metrics: any,
  n: number
) {
  const jumpRatio = metrics.totalMoves > 0
    ? metrics.jumpMoves / metrics.totalMoves
    : 0.5;

  const newDistWeight = clamp(0.8 + (metrics.avgDistanceGainedPerMove / 2) * 0.4, 0.5, 1.5);
  const newJumpPref = clamp(0.8 + jumpRatio * 0.4, 0.5, 1.5);
  const newCohesion = clamp(0.8 + metrics.avgPieceCohesion * 0.4, 0.5, 1.5);
  const newMobility = clamp(1.2 - metrics.avgPieceCohesion * 0.4, 0.5, 1.5);
  const newAdvancement = metrics.totalMoves < 40 ? 1.2 : (metrics.totalMoves < 60 ? 1.0 : 0.9);

  // Running average: old + (new - old) / n
  const avg = (oldVal: number, newVal: number) => oldVal + (newVal - oldVal) / n;

  return {
    distanceWeight: clamp(avg(old.distanceWeight ?? 1.0, newDistWeight), 0.5, 1.5),
    cohesionWeight: clamp(avg(old.cohesionWeight ?? 1.0, newCohesion), 0.5, 1.5),
    mobilityWeight: clamp(avg(old.mobilityWeight ?? 1.0, newMobility), 0.5, 1.5),
    advancementBalance: clamp(avg(old.advancementBalance ?? 1.0, newAdvancement), 0.7, 1.3),
    jumpPreference: clamp(avg(old.jumpPreference ?? 1.0, newJumpPref), 0.5, 1.5),
    goalOccupationWeight: clamp(avg(old.goalOccupationWeight ?? 1.0, 1.0), 0.5, 1.5),
    avgWinningMoveCount: avg(old.avgWinningMoveCount ?? 50, metrics.totalMoves),
    optimalJumpChainLength: avg(old.optimalJumpChainLength ?? 3, metrics.avgJumpChainLength),
    optimalCohesionLevel: avg(old.optimalCohesionLevel ?? 0.5, metrics.avgPieceCohesion),
  };
}

function defaultEndgameStats() {
  return {
    avgMovesFrom7: 20,
    avgMovesFrom8: 12,
    avgMovesFrom9: 5,
    optimalFillOrderScore: 0.5,
    avgShuffleMoves: 5,
    gamesAnalyzed: 0,
  };
}

function computeInitialEndgameStats(endgame: any) {
  return {
    avgMovesFrom7: endgame.movesFrom7ToFinish ?? 20,
    avgMovesFrom8: endgame.movesFrom8ToFinish ?? 12,
    avgMovesFrom9: endgame.movesFrom9ToFinish ?? 5,
    optimalFillOrderScore: computeFillOrderScore(endgame.goalFillOrder ?? []),
    avgShuffleMoves: endgame.shuffleMovesInEndgame ?? 5,
    gamesAnalyzed: 1,
  };
}

function updateEndgameStatsRunningAverage(
  old: Record<string, number>,
  endgame: any,
  n: number
) {
  const egN = (old.gamesAnalyzed ?? 0) + 1;
  const avg = (oldVal: number, newVal: number | null, fallback: number) => {
    if (newVal === null) return oldVal;
    return oldVal + (newVal - oldVal) / egN;
  };

  return {
    avgMovesFrom7: avg(old.avgMovesFrom7 ?? 20, endgame.movesFrom7ToFinish, 20),
    avgMovesFrom8: avg(old.avgMovesFrom8 ?? 12, endgame.movesFrom8ToFinish, 12),
    avgMovesFrom9: avg(old.avgMovesFrom9 ?? 5, endgame.movesFrom9ToFinish, 5),
    optimalFillOrderScore: avg(
      old.optimalFillOrderScore ?? 0.5,
      computeFillOrderScore(endgame.goalFillOrder ?? []),
      0.5
    ),
    avgShuffleMoves: avg(old.avgShuffleMoves ?? 5, endgame.shuffleMovesInEndgame, 5),
    gamesAnalyzed: egN,
  };
}

function computeFillOrderScore(goalFillOrder: number[]): number {
  if (goalFillOrder.length <= 1) return 0.5;

  let inversions = 0;
  let totalPairs = 0;
  for (let i = 0; i < goalFillOrder.length; i++) {
    for (let j = i + 1; j < goalFillOrder.length; j++) {
      totalPairs++;
      if (goalFillOrder[i] < goalFillOrder[j]) {
        inversions++;
      }
    }
  }

  return totalPairs > 0 ? 1 - (inversions / totalPairs) : 0.5;
}
