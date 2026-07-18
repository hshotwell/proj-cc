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
  schemaVersion: 3;
  mode: 'hexchess';
  id: string;
  createdAt: number;
  updatedAt: number;
  config: HexChessConfig;
  state: HexChessState;
  moveHistory: HexMove[];
  result: null | { winner: HexPlayerIndex | 'draw'; reason: HexEndReason };
}

// ---------------------------------------------------------------------------
// v1 → v2 migration
//
// v1 records predate multiplayer: seats were 0/1 with player 1 on triangle 2.
// v2 unifies seat indices with Chinese Checkers corners, so a 2-player game
// uses seats [0, 2]. Migration remaps every player-1 reference (including
// the `1-` piece-id prefix, so replays reconstruct from createInitialState)
// to seat 2 and adds the new state fields.
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
function migrateSeat(p: any): HexPlayerIndex {
  return p === 1 ? 2 : p;
}

// Old player-1 ids were `1-{type}-{index}` with indices enumerated by the
// legacy arm formula. Seat 2's rotated enumeration reverses the order within
// each row (rows: [0], [1,2], [3,5], [6,9], [10,14]), so the index must map
// through the row-reversal permutation for replays to reconstruct correctly
// from createInitialState. The v1 layout is symmetric within every row, so
// the piece type at a permuted index always matches.
const V1_INDEX_PERMUTATION: Record<number, number> = {
  0: 0,
  1: 2, 2: 1,
  3: 5, 4: 4, 5: 3,
  6: 9, 7: 8, 8: 7, 9: 6,
  10: 14, 11: 13, 12: 12, 13: 11, 14: 10,
};

function migratePieceId(id: unknown): string {
  if (typeof id !== 'string' || !id.startsWith('1-')) return id as string;
  const parts = id.split('-');
  const index = Number(parts[parts.length - 1]);
  const permuted = V1_INDEX_PERMUTATION[index];
  if (permuted !== undefined && Number.isInteger(index)) {
    parts[parts.length - 1] = String(permuted);
  }
  parts[0] = '2';
  return parts.join('-');
}

function migrateV1(record: any): SavedHexChessGame {
  const oldConfig = record.config ?? {};
  const oldPlayers: any[] = Array.isArray(oldConfig.players) ? oldConfig.players : [];
  const oldAi = oldConfig.ai ?? null;

  const config: HexChessConfig = {
    id: oldConfig.id,
    seats: [0, 2],
    players: { 0: oldPlayers[0], 2: oldPlayers[1] },
    layoutPreset: oldConfig.layoutPreset ?? 'v1-default',
    soldierVariant: oldConfig.soldierVariant ?? 'soldier',
    ai: oldAi === null ? null : {
      ...(oldAi[0] !== undefined ? { 0: oldAi[0] } : {}),
      ...(oldAi[1] !== undefined ? { 2: oldAi[1] } : {}),
    },
  };

  const migrateMove = (m: any): HexMove => ({
    ...m,
    pieceId: migratePieceId(m.pieceId),
    capture: m.capture ? { ...m.capture, pieceId: migratePieceId(m.capture.pieceId) } : null,
    player: migrateSeat(m.player),
  });

  const oldState = record.state ?? {};
  const state: HexChessState = {
    ...oldState,
    pieces: (oldState.pieces ?? []).map((p: any) => ({
      ...p,
      id: migratePieceId(p.id),
      player: migrateSeat(p.player),
    })),
    currentPlayer: migrateSeat(oldState.currentPlayer),
    activePlayers: [0, 2],
    eliminated: [],
    enPassantTarget: oldState.enPassantTarget
      ? {
          ...oldState.enPassantTarget,
          capturedPieceId: migratePieceId(oldState.enPassantTarget.capturedPieceId),
        }
      : null,
    pendingPromotion: oldState.pendingPromotion
      ? {
          ...oldState.pendingPromotion,
          pieceId: migratePieceId(oldState.pendingPromotion.pieceId),
        }
      : null,
    moveHistory: (oldState.moveHistory ?? []).map(migrateMove),
    result: oldState.result && oldState.result.winner !== 'draw'
      ? { ...oldState.result, winner: migrateSeat(oldState.result.winner) }
      : oldState.result ?? null,
  };

  return {
    schemaVersion: 3,
    mode: 'hexchess',
    id: record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    config,
    state,
    moveHistory: state.moveHistory,
    result: state.result,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

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
    schemaVersion: 3,
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
    players: config.seats.map(s => {
      const p = config.players[s]!;
      return { color: p.color, name: p.name, isAI: p.isAI };
    }),
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
    const version = (parsed as { schemaVersion: number }).schemaVersion;
    if (version === 3) return parsed;
    // v2 records are shape-compatible: no layout fields = standard board.
    if (version === 2) return { ...parsed, schemaVersion: 3 };
    return migrateV1(parsed);
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
