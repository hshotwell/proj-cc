import { describe, it, expect } from 'vitest';
import { isInsufficientMaterial, isThreefoldRepetition } from '@/game/hexchess/check';
import { applyMove } from '@/game/hexchess/moves';
import { hashState } from '@/game/hexchess/zobrist';
import type { HexChessState, HexPiece, HexMove } from '@/game/hexchess/state';
import { cubeCoord } from '@/game/coordinates';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function piece(
  id: string,
  player: 0 | 1 | 2,
  type: HexPiece['type'],
  q: number,
  r: number,
): HexPiece {
  return { id, player, type, cell: cubeCoord(q, r), hasMoved: true };
}

function stateFor(pieces: HexPiece[], currentPlayer: 0 | 1 | 2 = 0): HexChessState {
  return {
    mode: 'hexchess',
    pieces,
    currentPlayer,
    turnNumber: 10,
    activePlayers: [0, 2],
    eliminated: [],
    enPassantTarget: null,
    pendingPromotion: null,
    moveHistory: [],
    positionHashes: {},
    result: null,
  };
}

// ---------------------------------------------------------------------------
// isInsufficientMaterial
// ---------------------------------------------------------------------------

describe('isInsufficientMaterial', () => {
  it('Test 1 — K vs K is insufficient material', () => {
    const state = stateFor([
      piece('wK', 0, 'king', 0, 0),
      piece('bK', 2, 'king', 0, 2),
    ]);
    expect(isInsufficientMaterial(state)).toBe(true);
  });

  it('Test 2 — K+B vs K is insufficient material', () => {
    const state = stateFor([
      piece('wK', 0, 'king',   0, 0),
      piece('wB', 0, 'bishop', 1, 0),
      piece('bK', 2, 'king',   0, 2),
    ]);
    expect(isInsufficientMaterial(state)).toBe(true);
  });

  it('Test 3 — K+N vs K is insufficient material', () => {
    const state = stateFor([
      piece('wK', 0, 'king',   0, 0),
      piece('wN', 0, 'knight', 1, 0),
      piece('bK', 2, 'king',   0, 2),
    ]);
    expect(isInsufficientMaterial(state)).toBe(true);
  });

  it('Test 4 — K+B vs K+B on SAME hex color is insufficient material', () => {
    // Hex color = (q + 2*r) mod 3
    // Bishop 1 at (0,0): (0 + 0) mod 3 = 0
    // Bishop 2 at (0,3): (0 + 6) mod 3 = 0  — same color
    const state = stateFor([
      piece('wK', 0, 'king',   0, 0),
      piece('wB', 0, 'bishop', 0, 0), // hex color 0
      piece('bK', 2, 'king',   0, 2),
      piece('bB', 2, 'bishop', 0, 3), // hex color (0+6)%3 = 0
    ]);
    expect(isInsufficientMaterial(state)).toBe(true);
  });

  it('Test 5 — K+B vs K+B on DIFFERENT hex colors is NOT insufficient material', () => {
    // Bishop 1 at (0,0): (0 + 0) mod 3 = 0
    // Bishop 2 at (1,0): (1 + 0) mod 3 = 1  — different color
    const state = stateFor([
      piece('wK', 0, 'king',   0, 0),
      piece('wB', 0, 'bishop', 0, 0), // hex color 0
      piece('bK', 2, 'king',   0, 2),
      piece('bB', 2, 'bishop', 1, 0), // hex color (1+0)%3 = 1
    ]);
    expect(isInsufficientMaterial(state)).toBe(false);
  });

  it('Test 6 — K+R vs K is NOT insufficient material (rook can force mate)', () => {
    const state = stateFor([
      piece('wK', 0, 'king', 0, 0),
      piece('wR', 0, 'rook', 1, 0),
      piece('bK', 2, 'king', 0, 2),
    ]);
    expect(isInsufficientMaterial(state)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isThreefoldRepetition
// ---------------------------------------------------------------------------

describe('isThreefoldRepetition', () => {
  it('Test 7 — state with current hash appearing 3+ times in positionHashes is repetition', () => {
    const baseState = stateFor([
      piece('wK', 0, 'king', 0, 0),
      piece('bK', 2, 'king', 0, 2),
    ]);
    const hash = hashState(baseState);
    const stateWithRepetition: HexChessState = {
      ...baseState,
      positionHashes: { [hash]: 3 },
    };
    expect(isThreefoldRepetition(stateWithRepetition)).toBe(true);
  });

  it('Test 7b — state with current hash appearing fewer than 3 times is NOT repetition', () => {
    const baseState = stateFor([
      piece('wK', 0, 'king', 0, 0),
      piece('bK', 2, 'king', 0, 2),
    ]);
    const hash = hashState(baseState);
    const stateWith2: HexChessState = {
      ...baseState,
      positionHashes: { [hash]: 2 },
    };
    expect(isThreefoldRepetition(stateWith2)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyMove draw integration
// ---------------------------------------------------------------------------

describe('applyMove draw detection', () => {
  it('Test 8 — applyMove that causes threefold repetition sets result to { winner: draw, reason: repetition }', () => {
    // Player 0 has king at (0,0), player 1 has king at (0,2).
    // We pre-populate positionHashes so that after player 0 moves, the resulting
    // state's hash has already appeared 2 times — this move makes it 3.
    const wK = piece('wK', 0, 'king', 0, -1);
    const bK = piece('bK', 2, 'king', 0, 2);

    // The state after the move will be: wK at (0,0), bK at (0,2), currentPlayer=1
    // Compute what that hash will be
    const postMoveBase = stateFor([
      piece('wK', 0, 'king', 0, 0),
      piece('bK', 2, 'king', 0, 2),
    ], 2);
    const targetHash = hashState(postMoveBase);

    const state: HexChessState = {
      mode: 'hexchess',
      pieces: [wK, bK],
      currentPlayer: 0,
      turnNumber: 10,
    activePlayers: [0, 2],
    eliminated: [],
      enPassantTarget: null,
      pendingPromotion: null,
      moveHistory: [],
      // Already seen the target position twice before
      positionHashes: { [targetHash]: 2 },
      result: null,
    };

    const move: HexMove = {
      pieceId: 'wK',
      from: cubeCoord(0, -1),
      to: cubeCoord(0, 0),
      capture: null,
      promotion: null,
      isEnPassant: false,
      isDoubleStep: false,
      player: 0,
      turnNumber: 10,
    };

    const next = applyMove(state, move);
    expect(next.result).not.toBeNull();
    expect(next.result?.winner).toBe('draw');
    expect(next.result?.reason).toBe('repetition');
  });

  it('Test 9 — applyMove leading to K vs K sets result to insufficient-material draw', () => {
    // Player 0 king at (0,0), player 1 king at (0,2), player 0 rook at (1,1).
    // Player 0 captures the ... wait, player 0 can't capture player 1's king directly.
    // Instead: player 1 has a rook which player 0 captures, leaving K vs K.
    const wK = piece('wK', 0, 'king',  0, 0);
    const bK = piece('bK', 2, 'king',  0, 4);
    const bR = piece('bR', 2, 'rook',  0, 1); // white king can capture this

    const state = stateFor([wK, bK, bR], 0);

    // White king captures black rook at (0,1)
    const move: HexMove = {
      pieceId: 'wK',
      from: cubeCoord(0, 0),
      to: cubeCoord(0, 1),
      capture: { pieceId: 'bR', cell: cubeCoord(0, 1) },
      promotion: null,
      isEnPassant: false,
      isDoubleStep: false,
      player: 0,
      turnNumber: 10,
    };

    const next = applyMove(state, move);
    expect(next.result).not.toBeNull();
    expect(next.result?.winner).toBe('draw');
    expect(next.result?.reason).toBe('insufficient-material');
  });
});
