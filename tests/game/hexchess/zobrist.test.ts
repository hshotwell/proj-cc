import { describe, it, expect } from 'vitest';
import { hashState, updateHash } from '@/game/hexchess/zobrist';
import { createInitialState } from '@/game/hexchess/starting';
import { applyMove } from '@/game/hexchess/moves';
import { pseudoMovesForPiece } from '@/game/hexchess/moves';
import type { HexChessState } from '@/game/hexchess/state';

const defaultConfig = {
  id: 'test',
  players: [
    { color: '#ff0000' as const, name: 'P0', isAI: false },
    { color: '#0000ff' as const, name: 'P1', isAI: false },
  ] as [typeof import('@/game/hexchess/state').HexChessPlayerConfig, typeof import('@/game/hexchess/state').HexChessPlayerConfig],
  layoutPreset: 'v1-default' as const,
  soldierVariant: 'soldier' as const,
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
    const state1: HexChessState = { ...state0, currentPlayer: 1 };
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
