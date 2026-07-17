import { describe, it, expect } from 'vitest';
import { isCheckmate, isStalemate } from '@/game/hexchess/check';
import { applyMove, pseudoMovesForPiece } from '@/game/hexchess/moves';
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

function stateFor(pieces: HexPiece[], currentPlayer: 0 | 1 | 2 = 2): HexChessState {
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
// Hand-crafted mate position
//
// Black king at {-4, 8} (player 1's arm apex — only 3 on-board neighbors).
// On-board neighbors: {-3, 7} (edge), {-4, 7} (edge), {-3, 6} (diagonal).
//
// White (player 0) queen at {-3, 6}:
//   - Attacks king at {-4, 8} via diagonal ray (-1, 2): {-3, 6} → {-4, 8}  ✓ check
//   - Covers escape {-3, 7} via edge ray (0, 1): {-3, 6} → {-3, 7}
//   - Covers escape {-4, 7} via edge ray (-1, 1): {-3, 6} → {-4, 7}
//   - Is defended by white king (cannot be captured safely)
//
// White (player 0) king at {-3, 5}:
//   - Defends queen at {-3, 6} via edge (0, 1): {-3, 5} → {-3, 6}
//   - Also covers escape {-4, 7} via diagonal (-1, 2): {-3, 5} → {-4, 7}
//   - Not adjacent to black king (safe position).
// ---------------------------------------------------------------------------

describe('isCheckmate', () => {
  it('Test 1 — returns true for a minimal 3-piece mate: king cornered, queen delivers mate, white king defends', () => {
    const blackKing  = piece('bK', 2, 'king',  -4,  8);  // cornered at arm apex
    const whiteQueen = piece('wQ', 0, 'queen', -3,  6);  // delivers check, covers 2 escapes
    const whiteKing  = piece('wK', 0, 'king',  -3,  5);  // defends queen, covers diagonal escape

    // currentPlayer: 2 (black — the player to move who is checkmated)
    const state = stateFor([blackKing, whiteQueen, whiteKing], 2);
    expect(isCheckmate(state)).toBe(true);
  });

  it('Test 2 — returns false when the king has a legal escape', () => {
    // Same position but white king is removed: black king can capture the queen
    // at {-3, 6} via the diagonal (1, -2) from {-4, 8}.
    const blackKing  = piece('bK', 2, 'king',  -4,  8);
    const whiteQueen = piece('wQ', 0, 'queen', -3,  6);  // undefended — king can capture
    // No white king to defend the queen

    const state = stateFor([blackKing, whiteQueen], 2);
    expect(isCheckmate(state)).toBe(false);
  });

  it('Test 4 — returns false when in check but king has a legal escape', () => {
    // Black king at (0, 0), white rook at (3, 0) — in check along edge.
    // Black king can step to many cells; this is check but not mate.
    const blackKing = piece('bK', 2, 'king', 0, 0);
    const whiteRook = piece('wR', 0, 'rook', 3, 0);
    const whiteKing = piece('wK', 0, 'king', -4, 4); // far away

    const state = stateFor([blackKing, whiteRook, whiteKing], 2);
    expect(isCheckmate(state)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Stalemate position
//
// Black king at {-4, 8} (arm apex, 3 on-board neighbors), NOT in check.
// All 3 escape squares covered:
//   - White king at {-2, 6}: covers {-3, 7} (edge) and {-4, 7} (diagonal)
//   - White rook at {-3, 0}: covers {-3, 6} along edge ray (0, 1)
// Black king's cell {-4, 8} is NOT attacked by any white piece.
// ---------------------------------------------------------------------------

describe('isStalemate', () => {
  it('Test 3 — returns true for stalemate: king not in check but has no legal moves', () => {
    const blackKing  = piece('bK', 2, 'king',  -4,  8);  // arm apex
    const whiteKing  = piece('wK', 0, 'king',  -2,  6);  // covers {-3,7} and {-4,7}
    const whiteRook  = piece('wR', 0, 'rook',  -3,  0);  // covers {-3,6} via file

    const state = stateFor([blackKing, whiteKing, whiteRook], 2);
    expect(isStalemate(state)).toBe(true);
  });

  it('Test 4b — isStalemate returns false when in check (even with no moves)', () => {
    // Reuse the checkmate position — it should return false from isStalemate.
    const blackKing  = piece('bK', 2, 'king',  -4,  8);
    const whiteQueen = piece('wQ', 0, 'queen', -3,  6);
    const whiteKing  = piece('wK', 0, 'king',  -3,  5);

    const state = stateFor([blackKing, whiteQueen, whiteKing], 2);
    expect(isStalemate(state)).toBe(false);
  });

  it('Test 4c — isCheckmate returns false when not in check', () => {
    // The stalemate position — isCheckmate should be false.
    const blackKing  = piece('bK', 2, 'king',  -4,  8);
    const whiteKing  = piece('wK', 0, 'king',  -2,  6);
    const whiteRook  = piece('wR', 0, 'rook',  -3,  0);

    const state = stateFor([blackKing, whiteKing, whiteRook], 2);
    expect(isCheckmate(state)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyMove result population
// ---------------------------------------------------------------------------

describe('applyMove result', () => {
  it('Test 5 — populates result with winner=0 and reason=checkmate after delivering checkmate', () => {
    // Set up a position where player 0 can deliver checkmate in one move.
    // Black king at {-4, 8}, white king at {-3, 5}.
    // White queen at {-3, 7}: not yet delivering check.
    // Player 0 moves queen from {-3, 7} to {-3, 6}: now delivers checkmate.
    const blackKing   = piece('bK', 2, 'king',  -4,  8);
    const whiteKing   = piece('wK', 0, 'king',  -3,  5);
    const whiteQueen  = piece('wQ', 0, 'queen', -3,  7);

    // currentPlayer: 0 (white to move)
    const state = stateFor([blackKing, whiteKing, whiteQueen], 0);

    // Move queen from {-3, 7} to {-3, 6}
    const move: HexMove = {
      pieceId: 'wQ',
      from:    cubeCoord(-3, 7),
      to:      cubeCoord(-3, 6),
      capture: null,
      promotion: null,
      isEnPassant: false,
      isDoubleStep: false,
      player: 0,
      turnNumber: 10,
    };

    const next = applyMove(state, move);

    expect(next.result).not.toBeNull();
    expect(next.result?.winner).toBe(0);
    expect(next.result?.reason).toBe('checkmate');
  });
});
