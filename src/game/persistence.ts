import type { GameState, PlayerIndex, Move, CubeCoord } from '@/types/game';
import type { SavedGameSummary, SavedGameData } from '@/types/replay';
import { normalizeMoveHistory, findLongestHop } from './replay';

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
    totalTurns: finalState.turnNumber,
    longestHop: longestHopResult?.jumpLength ?? 0,
    ...(finalState.playerColors ? { playerColors: { ...finalState.playerColors } } : {}),
    ...(finalState.aiPlayers ? { aiPlayers: { ...finalState.aiPlayers } } : {}),
  };

  const gameData: SavedGameData = {
    id: gameId,
    initialConfig: {
      playerCount: finalState.playerCount,
      activePlayers: [...finalState.activePlayers],
      ...(finalState.playerColors ? { playerColors: { ...finalState.playerColors } } : {}),
      ...(finalState.aiPlayers ? { aiPlayers: { ...finalState.aiPlayers } } : {}),
      ...(finalState.isCustomLayout ? { isCustomLayout: true } : {}),
    },
    moves: normalizedMoves.map(serializeMove),
    finishedPlayers: finalState.finishedPlayers.map(fp => ({ ...fp })),
    dateSaved,
  };

  // Save game data
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
}
