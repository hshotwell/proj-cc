import type { PieceColor } from '@/types/game';
import type {
  HexChessConfig,
  HexChessState,
  HexMove,
  HexPlayerIndex,
  HexEndReason,
} from './state';

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const GAMES_INDEX_KEY = 'hexchess-saved-games';
const GAME_DATA_PREFIX = 'hexchess-game-';
const MAX_SAVED_GAMES = 20;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SavedHexChessGame {
  schemaVersion: 1;
  mode: 'hexchess';
  id: string;
  createdAt: number;
  updatedAt: number;
  config: HexChessConfig;
  state: HexChessState;
  moveHistory: HexMove[];
  result: null | { winner: HexPlayerIndex | 'draw'; reason: HexEndReason };
}

export interface HexChessSavedGameSummary {
  id: string;
  mode: 'hexchess';
  createdAt: number;
  updatedAt: number;
  players: { color: PieceColor; name: string; isAI: boolean }[];
  result: null | { winnerLabel: string; reason: string };
}

// ---------------------------------------------------------------------------
// SSR guard
// ---------------------------------------------------------------------------

function isSSR(): boolean {
  return typeof window === 'undefined';
}

// ---------------------------------------------------------------------------
// Index helpers
// ---------------------------------------------------------------------------

function readIndex(): HexChessSavedGameSummary[] {
  if (isSSR()) return [];
  try {
    const raw = localStorage.getItem(GAMES_INDEX_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HexChessSavedGameSummary[];
  } catch {
    return [];
  }
}

function writeIndex(index: HexChessSavedGameSummary[]): void {
  if (isSSR()) return;
  try {
    localStorage.setItem(GAMES_INDEX_KEY, JSON.stringify(index));
  } catch {
    // ignore write failures
  }
}

// ---------------------------------------------------------------------------
// Result label helpers
// ---------------------------------------------------------------------------

function buildResultSummary(
  result: SavedHexChessGame['result'],
  config: HexChessConfig,
): HexChessSavedGameSummary['result'] {
  if (!result) return null;
  if (result.winner === 'draw') {
    return { winnerLabel: 'Draw', reason: result.reason };
  }
  const winnerName = config.players[result.winner]?.name ?? `Player ${result.winner + 1}`;
  return { winnerLabel: winnerName, reason: result.reason };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Save (or update) a hex chess game to localStorage.
 *
 * - Creates a full record under `hexchess-game-{id}`.
 * - Updates the summary index at `hexchess-saved-games`.
 * - Enforces 20-game cap by evicting the oldest entry (by updatedAt).
 * - Preserves `createdAt` on re-saves; bumps `updatedAt` every time.
 */
export function saveHexChessGame(config: HexChessConfig, state: HexChessState): void {
  if (isSSR()) return;

  const id = config.id;
  const now = Date.now();

  // Determine createdAt: preserve from existing record if present.
  let createdAt = now;
  try {
    const existing = loadHexChessGame(id);
    if (existing) createdAt = existing.createdAt;
  } catch {
    // fallback to now
  }

  const record: SavedHexChessGame = {
    schemaVersion: 1,
    mode: 'hexchess',
    id,
    createdAt,
    updatedAt: now,
    config,
    state,
    moveHistory: state.moveHistory,
    result: state.result,
  };

  // Write full record
  try {
    localStorage.setItem(GAME_DATA_PREFIX + id, JSON.stringify(record));
  } catch {
    return;
  }

  // Build summary for the index
  const summary: HexChessSavedGameSummary = {
    id,
    mode: 'hexchess',
    createdAt,
    updatedAt: now,
    players: config.players.map(p => ({
      color: p.color,
      name: p.name,
      isAI: p.isAI,
    })),
    result: buildResultSummary(record.result, config),
  };

  // Update index: remove old entry, prepend updated summary
  const index = readIndex();
  const filtered = index.filter(g => g.id !== id);
  filtered.unshift(summary);

  // Enforce 20-cap: sort by updatedAt desc and evict the oldest
  filtered.sort((a, b) => b.updatedAt - a.updatedAt);
  while (filtered.length > MAX_SAVED_GAMES) {
    const evicted = filtered.pop()!;
    try {
      localStorage.removeItem(GAME_DATA_PREFIX + evicted.id);
    } catch {
      // ignore
    }
  }

  writeIndex(filtered);
}

/**
 * Load a full hex chess game record by id.
 * Returns null if not found or if the stored JSON is malformed.
 */
export function loadHexChessGame(id: string): SavedHexChessGame | null {
  if (isSSR()) return null;
  try {
    const raw = localStorage.getItem(GAME_DATA_PREFIX + id);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedHexChessGame;
    // Basic sanity check
    if (parsed.mode !== 'hexchess' || !parsed.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Return the saved game summary index, sorted by updatedAt descending.
 */
export function listSavedHexChessGames(): HexChessSavedGameSummary[] {
  const index = readIndex();
  return index.slice().sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Delete a hex chess game from both the full record store and the index.
 */
export function deleteHexChessGame(id: string): void {
  if (isSSR()) return;

  try {
    localStorage.removeItem(GAME_DATA_PREFIX + id);
  } catch {
    // ignore
  }

  try {
    const index = readIndex();
    const filtered = index.filter(g => g.id !== id);
    writeIndex(filtered);
  } catch {
    // ignore
  }
}
