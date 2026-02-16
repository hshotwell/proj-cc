import type { GameState, PlayerIndex, Move, CubeCoord } from '@/types/game';
import type { SavedGameSummary, SavedGameData } from '@/types/replay';
import { normalizeMoveHistory, findLongestHop } from './replay';
import {
  localGameStorage,
  cloudGameStorage,
} from '@/services/storage';

const GAMES_INDEX_KEY = 'chinese-checkers-saved-games';
const GAME_DATA_PREFIX = 'chinese-checkers-game-';
const MAX_SAVED_GAMES = 20;

// Serialize CubeCoord for JSON (strip computed s field from jumpPath)
function serializeMove(move: Move): Move {
  return {
    from: { q: move.from.q, r: move.from.r, s: move.from.s },
    to: { q: move.to.q, r: move.to.r, s: move.to.s },
    isJump: move.isJump,
    ...(move.jumpPath ? {
      jumpPath: move.jumpPath.map(c => ({ q: c.q, r: c.r, s: c.s })),
    } : {}),
    ...(move.isSwap ? { isSwap: true } : {}),
    ...(move.player !== undefined ? { player: move.player } : {}),
    ...(move.turnNumber !== undefined ? { turnNumber: move.turnNumber } : {}),
  };
}

export function saveCompletedGame(gameId: string, finalState: GameState): SavedGameSummary {
  const normalizedMoves = normalizeMoveHistory(finalState.moveHistory, finalState.activePlayers);
  const longestHopResult = findLongestHop(normalizedMoves);
  const dateSaved = Date.now();

  const summary: SavedGameSummary = {
    id: gameId,
    dateSaved,
    playerCount: finalState.playerCount,
    activePlayers: [...finalState.activePlayers],
    winner: finalState.winner ?? finalState.finishedPlayers[0]?.player ?? (0 as PlayerIndex),
    totalMoves: normalizedMoves.length,
    // turnNumber is incremented after the final move, so subtract 1 for actual turns played
    totalTurns: Math.max(1, finalState.turnNumber - 1),
    longestHop: longestHopResult?.jumpLength ?? 0,
    ...(finalState.playerColors ? { playerColors: { ...finalState.playerColors } } : {}),
    ...(finalState.aiPlayers ? { aiPlayers: { ...finalState.aiPlayers } } : {}),
  };

  // Build custom layout data if this is a custom board
  const customLayoutData = finalState.isCustomLayout ? {
    isCustomLayout: true,
    customCells: Array.from(finalState.board.keys()),
    customStartingPositions: finalState.startingPositions ? { ...finalState.startingPositions } : undefined,
    customGoalPositions: finalState.customGoalPositions ? { ...finalState.customGoalPositions } : undefined,
    customWalls: Array.from(finalState.board.entries())
      .filter(([_, content]) => content.type === 'wall')
      .map(([key]) => key),
  } : {};

  const gameData: SavedGameData = {
    id: gameId,
    initialConfig: {
      playerCount: finalState.playerCount,
      activePlayers: [...finalState.activePlayers],
      ...(finalState.playerColors ? { playerColors: { ...finalState.playerColors } } : {}),
      ...(finalState.aiPlayers ? { aiPlayers: { ...finalState.aiPlayers } } : {}),
      ...customLayoutData,
    },
    moves: normalizedMoves.map(serializeMove),
    finishedPlayers: finalState.finishedPlayers.map(fp => ({ ...fp })),
    dateSaved,
  };

  // Save to localStorage
  try {
    localStorage.setItem(GAME_DATA_PREFIX + gameId, JSON.stringify(gameData));
  } catch {
    return summary;
  }

  // Update index
  const index = getSavedGamesList();
  // Remove if already exists (re-save)
  const filtered = index.filter(g => g.id !== gameId);
  filtered.unshift(summary);

  // Cap at MAX_SAVED_GAMES, evict oldest
  while (filtered.length > MAX_SAVED_GAMES) {
    const evicted = filtered.pop()!;
    try {
      localStorage.removeItem(GAME_DATA_PREFIX + evicted.id);
    } catch {
      // ignore
    }
  }

  try {
    localStorage.setItem(GAMES_INDEX_KEY, JSON.stringify(filtered));
  } catch {
    // ignore
  }

  // Sync to cloud in background (fire and forget)
  cloudGameStorage.saveGame(gameId, gameData, summary).catch((e) => {
    console.error('Failed to sync game to cloud:', e);
  });

  return summary;
}

export function getSavedGamesList(): SavedGameSummary[] {
  try {
    const raw = localStorage.getItem(GAMES_INDEX_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedGameSummary[];
  } catch {
    return [];
  }
}

export function loadSavedGame(id: string): SavedGameData | null {
  try {
    const raw = localStorage.getItem(GAME_DATA_PREFIX + id);
    if (!raw) return null;
    const data = JSON.parse(raw) as SavedGameData;
    // Restore s coordinates for CubeCoords
    data.moves = data.moves.map(m => ({
      ...m,
      from: { q: m.from.q, r: m.from.r, s: -m.from.q - m.from.r },
      to: { q: m.to.q, r: m.to.r, s: -m.to.q - m.to.r },
      ...(m.jumpPath ? {
        jumpPath: m.jumpPath.map((c: CubeCoord) => ({ q: c.q, r: c.r, s: -c.q - c.r })),
      } : {}),
    }));
    return data;
  } catch {
    return null;
  }
}

export function deleteSavedGame(id: string): void {
  try {
    localStorage.removeItem(GAME_DATA_PREFIX + id);
  } catch {
    // ignore
  }

  try {
    const index = getSavedGamesList();
    const filtered = index.filter(g => g.id !== id);
    localStorage.setItem(GAMES_INDEX_KEY, JSON.stringify(filtered));
  } catch {
    // ignore
  }

  // Delete from cloud in background
  cloudGameStorage.deleteGame(id).catch((e) => {
    console.error('Failed to delete game from cloud:', e);
  });
}

// Cloud sync functions for use when authenticated
export async function getSavedGamesListFromCloud(): Promise<SavedGameSummary[]> {
  return cloudGameStorage.loadList();
}

export async function loadSavedGameFromCloud(id: string): Promise<SavedGameData | null> {
  return cloudGameStorage.loadGame(id);
}

// Merge local and cloud game lists
export async function syncGamesFromCloud(): Promise<SavedGameSummary[]> {
  const localGames = getSavedGamesList();
  const cloudGames = await getSavedGamesListFromCloud();

  // Merge: cloud takes precedence, add local-only games
  const merged = new Map<string, SavedGameSummary>();

  for (const game of cloudGames) {
    merged.set(game.id, game);
  }

  for (const game of localGames) {
    if (!merged.has(game.id)) {
      merged.set(game.id, game);
      // Also sync local-only games to cloud
      const gameData = loadSavedGame(game.id);
      if (gameData) {
        cloudGameStorage.saveGame(game.id, gameData, game).catch((e) => {
          console.error('Failed to sync local game to cloud:', e);
        });
      }
    }
  }

  // Sort by date saved (newest first)
  const result = Array.from(merged.values()).sort((a, b) => b.dateSaved - a.dateSaved);

  // Update local storage with merged list
  try {
    localStorage.setItem(GAMES_INDEX_KEY, JSON.stringify(result.slice(0, MAX_SAVED_GAMES)));
  } catch {
    // ignore
  }

  return result;
}
