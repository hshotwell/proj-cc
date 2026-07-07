/**
 * Zobrist hashing for HexChessState.
 *
 * All 64-bit keys are represented as BigInt internally and converted to
 * 16-character lowercase hex strings at the public boundary.
 *
 * Key space:
 *   - pieceKey[type][player][cellIndex]  — one key per (type, player, cell)
 *   - sideToMoveKey                       — XOR'd when currentPlayer === 1
 *   - epKey[cellIndex]                    — XOR'd for enPassantTarget
 */

import { getDefaultBoardCells } from '@/game/defaultLayout';
import { coordKey } from '@/game/coordinates';
import type { HexChessState, HexPieceType, HexPlayerIndex } from './state';

// ---------------------------------------------------------------------------
// Deterministic 32-bit PRNG (mulberry32) → produces 64-bit keys by pairing
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1) >>> 0;
    z = (z ^ (z + Math.imul(z ^ (z >>> 7), z | 61))) >>> 0;
    return (z ^ (z >>> 14)) >>> 0;
  };
}

function rand64(next: () => number): bigint {
  const lo = BigInt(next()) & 0xffffffffn;
  const hi = BigInt(next()) & 0xffffffffn;
  return (hi << 32n) | lo;
}

// ---------------------------------------------------------------------------
// Piece types and their indices
// ---------------------------------------------------------------------------

const PIECE_TYPES: HexPieceType[] = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn', 'soldier'];
const PIECE_TYPE_INDEX: Record<HexPieceType, number> = {
  king: 0, queen: 1, rook: 2, bishop: 3, knight: 4, pawn: 5, soldier: 6,
};
const NUM_TYPES = PIECE_TYPES.length; // 7
const NUM_PLAYERS = 2;

// ---------------------------------------------------------------------------
// Lazy-initialised table
// ---------------------------------------------------------------------------

interface ZobristTable {
  /** pieceKey[typeIdx][playerIdx][cellIdx] */
  pieceKey: bigint[][][];
  sideToMoveKey: bigint;
  /** epKey[cellIdx] */
  epKey: bigint[];
  /** Maps coordKey string → stable cell index */
  cellIndexMap: Map<string, number>;
}

let _table: ZobristTable | null = null;

export function initZobristTable(): void {
  if (_table !== null) return;

  const SEED = 0xdeadbeef;
  const next = mulberry32(SEED);

  // Build stable cell list from the canonical board
  const boardKeySet = getDefaultBoardCells();
  const sortedKeys = Array.from(boardKeySet).sort();
  const cellIndexMap = new Map<string, number>();
  sortedKeys.forEach((k, i) => cellIndexMap.set(k, i));
  const numCells = sortedKeys.length;

  // Allocate and fill pieceKey[type][player][cell]
  const pieceKey: bigint[][][] = Array.from({ length: NUM_TYPES }, () =>
    Array.from({ length: NUM_PLAYERS }, () =>
      Array.from({ length: numCells }, () => rand64(next))
    )
  );

  const sideToMoveKey = rand64(next);

  const epKey: bigint[] = Array.from({ length: numCells }, () => rand64(next));

  _table = { pieceKey, sideToMoveKey, epKey, cellIndexMap };
}

function getTable(): ZobristTable {
  if (_table === null) initZobristTable();
  return _table!;
}

// ---------------------------------------------------------------------------
// HashDelta — describes a minimal incremental change (for future AI use)
// ---------------------------------------------------------------------------

export interface HashDelta {
  /** The resulting state after the move, used for full recompute in v1. */
  nextState: HexChessState;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute the full Zobrist hash of `state` from scratch.
 * Returns a 16-character lowercase hex string.
 */
export function hashState(state: HexChessState): string {
  const tbl = getTable();
  let h = 0n;

  for (const piece of state.pieces) {
    const typeIdx = PIECE_TYPE_INDEX[piece.type];
    const playerIdx = piece.player as number;
    const ck = coordKey(piece.cell);
    const cellIdx = tbl.cellIndexMap.get(ck);
    if (cellIdx === undefined) continue; // off-board piece (shouldn't happen)
    h ^= tbl.pieceKey[typeIdx][playerIdx][cellIdx];
  }

  if (state.currentPlayer === 1) {
    h ^= tbl.sideToMoveKey;
  }

  if (state.enPassantTarget !== null && state.enPassantTarget.targetCells.length > 0) {
    const ck = coordKey(state.enPassantTarget.targetCells[0]);
    const cellIdx = tbl.cellIndexMap.get(ck);
    if (cellIdx !== undefined) {
      h ^= tbl.epKey[cellIdx];
    }
  }

  // Mask to 64 bits and format
  h = h & 0xffffffffffffffffn;
  return h.toString(16).padStart(16, '0');
}

/**
 * Incremental update — v1 delegates to a full recompute of `delta.nextState`.
 * The API is defined here so the AI can call it without source changes in v2.
 */
export function updateHash(oldHash: string, nextStateOrDelta: HexChessState | HashDelta): string {
  // Detect which overload: HexChessState has a `mode` property; HashDelta has `nextState`.
  if ('mode' in nextStateOrDelta) {
    return hashState(nextStateOrDelta as HexChessState);
  }
  return hashState((nextStateOrDelta as HashDelta).nextState);
}
