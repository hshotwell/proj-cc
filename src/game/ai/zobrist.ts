/**
 * Zobrist-style hashing for the default (sternhalma) AI search's
 * transposition table. Mirrors `src/game/hexchess/zobrist.ts` but is
 * simpler: a single piece type, 6 possible players.
 *
 * Board topology (which cells exist) differs between the standard board
 * and custom layouts, so the table is rebuilt once per top-level
 * `findBestMove` call rather than assuming a fixed universe of cells —
 * cheap (one O(cells) pass) relative to the thousands of node hashes it
 * then makes O(pieces) instead of O(cells·log(cells)).
 */

import type { GameState } from '@/types/game';

const NUM_PLAYERS = 6;

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

export interface ZobristTable {
  /** pieceKey[playerIdx][cellIdx] */
  pieceKey: bigint[][];
  /** sideKey[playerIdx] — XOR'd for whose turn it is */
  sideKey: bigint[];
  /** Maps board coord-key string ("q,r") → stable cell index */
  cellIndex: Map<string, number>;
}

/** Fixed seed: deterministic table for a given cell set, so hashes stay
 *  stable and comparable across the many findBestMove calls in one game
 *  (needed for the transposition table to be useful at all). */
const SEED = 0x5be9c0de;

export function buildZobristTable(state: GameState): ZobristTable {
  const next = mulberry32(SEED);
  const sortedKeys = [...state.board.keys()].sort();
  const cellIndex = new Map<string, number>();
  sortedKeys.forEach((k, i) => cellIndex.set(k, i));
  const numCells = sortedKeys.length;

  const pieceKey: bigint[][] = Array.from({ length: NUM_PLAYERS }, () =>
    Array.from({ length: numCells }, () => rand64(next))
  );
  const sideKey: bigint[] = Array.from({ length: NUM_PLAYERS }, () => rand64(next));

  return { pieceKey, sideKey, cellIndex };
}

/** Full recompute from scratch — O(pieces) XORs, no board sort/join. */
export function hashWithTable(state: GameState, table: ZobristTable): string {
  let h = BigInt(0);
  for (const [key, content] of state.board) {
    if (content.type === 'piece') {
      const idx = table.cellIndex.get(key);
      if (idx !== undefined) h ^= table.pieceKey[content.player][idx];
    }
  }
  h ^= table.sideKey[state.currentPlayer];
  return h.toString(16).padStart(16, '0');
}
