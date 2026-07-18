/**
 * Zobrist hashing for HexChessState.
 *
 * All 64-bit keys are represented as BigInt internally and converted to
 * 16-character lowercase hex strings at the public boundary.
 *
 * Key space:
 *   - pieceKey[type][player][cellIndex]  — one key per (type, player, cell)
 *   - sideKey[player]                     — XOR'd for the seat to move
 *   - eliminatedKey[player]               — XOR'd per eliminated seat
 *   - epKey[cellIndex]                    — XOR'd for enPassantTarget
 */

import { coordKey } from '@/game/coordinates';
import type { HexChessState, HexPieceType } from './state';

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

const MASK32 = BigInt(0xffffffff);
const SHIFT32 = BigInt(32);

function rand64(next: () => number): bigint {
  const lo = BigInt(next()) & MASK32;
  const hi = BigInt(next()) & MASK32;
  return (hi << SHIFT32) | lo;
}

// ---------------------------------------------------------------------------
// Piece types and their indices
// ---------------------------------------------------------------------------

const PIECE_TYPES: HexPieceType[] = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn', 'soldier'];
const PIECE_TYPE_INDEX: Record<HexPieceType, number> = {
  king: 0, queen: 1, rook: 2, bishop: 3, knight: 4, pawn: 5, soldier: 6,
};
const NUM_TYPES = PIECE_TYPES.length; // 7
const NUM_PLAYERS = 6; // seats 0-5 (Chinese Checkers corner indices)

// ---------------------------------------------------------------------------
// Lazy-initialised table
// ---------------------------------------------------------------------------

interface ZobristTable {
  /** pieceKey[typeIdx][playerIdx][cellIdx] */
  pieceKey: bigint[][][];
  /** sideKey[playerIdx] — XOR'd for the seat to move */
  sideKey: bigint[];
  /** eliminatedKey[playerIdx] — XOR'd for each eliminated seat */
  eliminatedKey: bigint[];
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

  // Build a stable cell list over the radius-10 hex grid — the editor's full
  // canvas — so custom boards (whose cells can lie outside the 121-star) hash
  // correctly. 331 cells. Old saves' stored positionHashes predate this
  // universe and go stale; repetition counts simply restart (accepted).
  const ZOBRIST_RADIUS = 10;
  const allKeys: string[] = [];
  for (let q = -ZOBRIST_RADIUS; q <= ZOBRIST_RADIUS; q++) {
    for (let r = -ZOBRIST_RADIUS; r <= ZOBRIST_RADIUS; r++) {
      if (Math.abs(-q - r) <= ZOBRIST_RADIUS) allKeys.push(`${q},${r}`);
    }
  }
  const sortedKeys = allKeys.sort();
  const cellIndexMap = new Map<string, number>();
  sortedKeys.forEach((k, i) => cellIndexMap.set(k, i));
  const numCells = sortedKeys.length;

  // Allocate and fill pieceKey[type][player][cell]
  const pieceKey: bigint[][][] = Array.from({ length: NUM_TYPES }, () =>
    Array.from({ length: NUM_PLAYERS }, () =>
      Array.from({ length: numCells }, () => rand64(next))
    )
  );

  const sideKey: bigint[] = Array.from({ length: NUM_PLAYERS }, () => rand64(next));
  const eliminatedKey: bigint[] = Array.from({ length: NUM_PLAYERS }, () => rand64(next));

  const epKey: bigint[] = Array.from({ length: numCells }, () => rand64(next));

  _table = { pieceKey, sideKey, eliminatedKey, epKey, cellIndexMap };
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
  let h = BigInt(0);

  for (const piece of state.pieces) {
    const typeIdx = PIECE_TYPE_INDEX[piece.type];
    const playerIdx = piece.player as number;
    const ck = coordKey(piece.cell);
    const cellIdx = tbl.cellIndexMap.get(ck);
    if (cellIdx === undefined) continue; // off-board piece (shouldn't happen)
    h ^= tbl.pieceKey[typeIdx][playerIdx][cellIdx];
  }

  h ^= tbl.sideKey[state.currentPlayer];

  for (const seat of state.eliminated) {
    h ^= tbl.eliminatedKey[seat];
  }

  if (state.enPassantTarget !== null && state.enPassantTarget.targetCells.length > 0) {
    const ck = coordKey(state.enPassantTarget.targetCells[0]);
    const cellIdx = tbl.cellIndexMap.get(ck);
    if (cellIdx !== undefined) {
      h ^= tbl.epKey[cellIdx];
    }
  }

  // Mask to 64 bits and format (BigInt() constructor avoids ES2020 literal requirement)
  const MASK64 = (BigInt(0xffffffff) << BigInt(32)) | BigInt(0xffffffff);
  h = h & MASK64;
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
