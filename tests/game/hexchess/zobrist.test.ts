import { describe, it, expect } from 'vitest';
import { hashState, updateHash } from '@/game/hexchess/zobrist';
import { createInitialState } from '@/game/hexchess/starting';
import { applyMove, pseudoMovesForPiece } from '@/game/hexchess/moves';
import type { HexChessState, HexChessConfig } from '@/game/hexchess/state';

const defaultConfig: HexChessConfig = {
  id: 'test',
  seats: [0, 2],
  players: {
    0: { color: '#ff0000', name: 'P0', isAI: false },
    2: { color: '#0000ff', name: 'P1', isAI: false },
  },
  layoutPreset: 'v1-default',
  soldierVariant: 'soldier',
  ai: null,
};

describe('Zobrist hashing', () => {
  it('same position produces same hash', () => {
    const state = createInitialState(defaultConfig);
    const h1 = hashState(state);
    const h2 = hashState(state);
    expect(h1).toBe(h2);
  });

  it('initial state hashed twice returns identical string', () => {
    const state = createInitialState(defaultConfig);
    const h1 = hashState(state);
    const h2 = hashState(state);
    expect(typeof h1).toBe('string');
    expect(h1).toHaveLength(16);
    expect(h1).toBe(h2);
  });

  it('hash is 16-character lowercase hex string', () => {
    const state = createInitialState(defaultConfig);
    const h = hashState(state);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it('different currentPlayer produces different hash', () => {
    const state0 = createInitialState(defaultConfig);
    const state1: HexChessState = { ...state0, currentPlayer: 2 };
    expect(hashState(state0)).not.toBe(hashState(state1));
  });

  it('different piece position produces different hash', () => {
    const state = createInitialState(defaultConfig);
    // Move the first piece to a different cell
    const modified: HexChessState = {
      ...state,
      pieces: state.pieces.map((p, i) =>
        i === 0 ? { ...p, cell: { q: 0, r: 0, s: 0 } } : p
      ),
    };
    expect(hashState(state)).not.toBe(hashState(modified));
  });

  it('different enPassantTarget produces different hash', () => {
    const state = createInitialState(defaultConfig);
    const withEP: HexChessState = {
      ...state,
      enPassantTarget: {
        capturedPieceId: 'fake',
        targetCells: [{ q: 1, r: -1, s: 0 }],
        availableUntilTurn: 2,
      },
    };
    expect(hashState(state)).not.toBe(hashState(withEP));
  });

  it('after applyMove, hash differs from pre-move state', () => {
    const state = createInitialState(defaultConfig);
    // Find any legal move for player 0
    const piece = state.pieces.find((p) => p.player === 0 && p.type === 'soldier')!;
    const moves = pseudoMovesForPiece(state, piece);
    expect(moves.length).toBeGreaterThan(0);
    const nextState = applyMove(state, moves[0]);
    expect(hashState(state)).not.toBe(hashState(nextState));
  });

  it('updateHash returns same result as full hashState on resulting state', () => {
    const state = createInitialState(defaultConfig);
    const piece = state.pieces.find((p) => p.player === 0 && p.type === 'soldier')!;
    const moves = pseudoMovesForPiece(state, piece);
    const nextState = applyMove(state, moves[0]);
    // updateHash may be incremental or delegate to full recompute — result must match
    const fullHash = hashState(nextState);
    const incrementalHash = updateHash(hashState(state), nextState);
    expect(incrementalHash).toBe(fullHash);
  });
});

// ---------------------------------------------------------------------------
// Multiplayer hashing
// ---------------------------------------------------------------------------

describe('multiplayer zobrist', () => {
  it('hashes differ by side-to-move seat', () => {
    const base = createInitialState(defaultConfig);
    const asSeat0 = { ...base, currentPlayer: 0 as const, activePlayers: [0, 3, 1] as (0|1|2|3|4|5)[] };
    const asSeat3 = { ...asSeat0, currentPlayer: 3 as const };
    const asSeat1 = { ...asSeat0, currentPlayer: 1 as const };
    const h0 = hashState(asSeat0);
    expect(hashState(asSeat3)).not.toBe(h0);
    expect(hashState(asSeat1)).not.toBe(h0);
    expect(hashState(asSeat1)).not.toBe(hashState(asSeat3));
  });

  it('hashes differ by eliminated set', () => {
    const base = { ...createInitialState(defaultConfig), activePlayers: [0, 3, 1] as (0|1|2|3|4|5)[] };
    const alive = { ...base, eliminated: [] as (0|1|2|3|4|5)[] };
    const dead3 = { ...base, eliminated: [3 as const] };
    expect(hashState(dead3)).not.toBe(hashState(alive));
  });
});

describe('zobrist on custom boards', () => {
  const bareState = (pieces: HexChessState['pieces']): HexChessState => ({
    mode: 'hexchess', pieces, currentPlayer: 0, turnNumber: 1,
    activePlayers: [0, 2], eliminated: [], enPassantTarget: null,
    pendingPromotion: null, moveHistory: [], positionHashes: {}, result: null,
  });

  it('hashes pieces on cells outside the 121-star without collapsing', () => {
    // (9,0) is outside the star but inside the radius-10 editor grid.
    const st = bareState([
      { id: '0-king-0', player: 0, type: 'king', cell: { q: 9, r: 0, s: -9 }, hasMoved: false },
      { id: '2-king-0', player: 2, type: 'king', cell: { q: -9, r: 0, s: 9 }, hasMoved: false },
    ]);
    const h1 = hashState(st);
    expect(h1).toMatch(/^[0-9a-f]{16}$/);
    const moved = bareState([
      { id: '0-king-0', player: 0, type: 'king', cell: { q: 9, r: -1, s: -8 }, hasMoved: true },
      st.pieces[1],
    ]);
    expect(hashState(moved)).not.toBe(h1);
  });
});
