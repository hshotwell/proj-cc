/**
 * Tactical puzzle suite for the hexchess AI.
 *
 * Each puzzle is a hand-crafted position where exactly one best move exists and
 * the engine should find it at Medium search budget (2 s, maxDepth 4).
 *
 * Constraints:
 *  - Each side has exactly one king.
 *  - Kings are not adjacent to each other (cube-distance > 1).
 *  - Neither king is in check before the puzzle move (unless the puzzle IS a
 *    forced-reply-to-check, which none here are).
 *  - All piece coordinates are on the 121-cell star board.
 */

import { describe, it, expect } from 'vitest';
import { searchBestMove } from '@/game/ai/hexchess/search';
import { cubeCoord, cubeEquals } from '@/game/coordinates';
import type { HexChessState, HexPiece } from '@/game/hexchess/state';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(pieces: HexPiece[], currentPlayer: 0 | 1 = 0): HexChessState {
  return {
    mode: 'hexchess',
    pieces,
    currentPlayer,
    turnNumber: 10,
    enPassantTarget: null,
    pendingPromotion: null,
    moveHistory: [],
    positionHashes: {},
    result: null,
  };
}

/** Search options used for every puzzle: 2 s budget, depth 4. */
const OPTS = { budgetMs: 2000, maxDepth: 4 };

// ---------------------------------------------------------------------------
// Puzzle 1 — White bishop captures a hanging black rook (depth 1)
//
// Position:
//   Player 0 bishop at (1, 0, -1)  — can slide diagonally to (3, -1, -2)
//   Player 0 king   at (4, -8,  4) — safe in arm apex
//   Player 1 rook   at (3, -1, -2) — undefended, one diagonal step from bishop
//   Player 1 king   at (-4,  8, -4)— safe in arm apex
//
// Expected move: bishop (1,0,-1) → (3,-1,-2) capturing black rook.
// The bishop slides one diagonal step in direction (2,-1,-1).
// ---------------------------------------------------------------------------

describe('Puzzle 1 — bishop captures hanging rook (depth 1)', () => {
  it('finds the bishop capture of undefended rook', () => {
    const state = makeState([
      { id: 'wB', player: 0, type: 'bishop', cell: cubeCoord(1,  0), hasMoved: true },
      { id: 'wK', player: 0, type: 'king',   cell: cubeCoord(4, -8), hasMoved: true },
      { id: 'bR', player: 1, type: 'rook',   cell: cubeCoord(3, -1), hasMoved: true },
      { id: 'bK', player: 1, type: 'king',   cell: cubeCoord(-4, 8), hasMoved: true },
    ]);

    const result = searchBestMove(state, OPTS);

    expect(result.move).not.toBeNull();
    expect(result.move!.pieceId).toBe('wB');
    expect(cubeEquals(result.move!.to, cubeCoord(3, -1))).toBe(true);
    expect(result.move!.capture).not.toBeNull();
    expect(result.move!.capture!.pieceId).toBe('bR');
  });
});

// ---------------------------------------------------------------------------
// Puzzle 2 — Black rook captures a hanging white bishop (depth 1, player 1)
//
// Position:
//   Player 1 rook   at (0, 0,  0)  — can slide along r-axis to (0, 3, -3)
//   Player 1 king   at (-4, 8, -4) — safe in arm apex
//   Player 0 bishop at (0, 3, -3)  — undefended, three steps along rook's file
//   Player 0 king   at (4, -8, 4)  — safe in arm apex
//
// Expected move: rook (0,0,0) → (0,3,-3) capturing white bishop.
// Current player is 1 (minimiser).  The engine minimises material score →
// winning the bishop is the right choice.
// ---------------------------------------------------------------------------

describe('Puzzle 2 — black rook captures hanging white bishop (depth 1, player 1)', () => {
  it('finds the rook capture of undefended bishop', () => {
    const state = makeState(
      [
        { id: 'bR', player: 1, type: 'rook',   cell: cubeCoord( 0,  0), hasMoved: true },
        { id: 'bK', player: 1, type: 'king',   cell: cubeCoord(-4,  8), hasMoved: true },
        { id: 'wB', player: 0, type: 'bishop', cell: cubeCoord( 0,  3), hasMoved: true },
        { id: 'wK', player: 0, type: 'king',   cell: cubeCoord( 4, -8), hasMoved: true },
      ],
      1, // player 1 to move
    );

    const result = searchBestMove(state, OPTS);

    expect(result.move).not.toBeNull();
    expect(result.move!.pieceId).toBe('bR');
    expect(cubeEquals(result.move!.to, cubeCoord(0, 3))).toBe(true);
    expect(result.move!.capture).not.toBeNull();
    expect(result.move!.capture!.pieceId).toBe('wB');
  });
});

// ---------------------------------------------------------------------------
// Puzzle 3 — Checkmate in 1 with a queen (player 0)
//
// Position:
//   Player 0 queen at (0,  1, -1) — can slide to (-3, 7, -4) in one move
//   Player 0 rook  at (-3, 2, -1) — defends the queen after it moves to (-3, 7)
//   Player 0 king  at (4, -8,  4) — safe in arm apex
//   Player 1 king  at (-4, 8, -4) — at arm apex, only two on-board neighbours
//
// After queen to (-3, 7, -4):
//   • Queen gives check via edge direction (-1, +1): attacks (-4, 8).
//   • Escape (-4, 7, -3): covered by queen via edge direction (-1, 0).
//   • Escape (-3, 7, -4): occupied by queen itself.
//   • Diagonal escape (-3, 6, -3): covered by queen via edge direction (0, -1).
//   • All other neighbours of (-4, 8) are off the board.
//   • Black king cannot take the queen because the white rook at (-3, 2) defends it
//     along the q=-3 file (rook slides 0,+1 through (-3,3)…(-3,7)).
//
// Queen slides along diagonal direction (-1, +2, -1):
//   (0,1) → (-1,3) → (-2,5) → (-3,7).  Path is clear.
// ---------------------------------------------------------------------------

describe('Puzzle 3 — checkmate in 1 with queen (player 0)', () => {
  it('finds a forced checkmate with the queen and reports an infinite eval', () => {
    // White queen + rook vs lone black king trapped at arm apex (-4, 8, -4).
    // The black king has only two on-board escape squares: (-4,7) and (-3,7).
    // The queen can reach multiple mating squares in one move; the rook defends
    // the queen after it steps into the arm corridor.  The engine should detect
    // the forced checkmate regardless of which exact mating square it chooses.
    const state = makeState([
      { id: 'wQ', player: 0, type: 'queen', cell: cubeCoord( 0,  1), hasMoved: true },
      { id: 'wR', player: 0, type: 'rook',  cell: cubeCoord(-3,  2), hasMoved: true },
      { id: 'wK', player: 0, type: 'king',  cell: cubeCoord( 4, -8), hasMoved: true },
      { id: 'bK', player: 1, type: 'king',  cell: cubeCoord(-4,  8), hasMoved: true },
    ]);

    const result = searchBestMove(state, OPTS);

    expect(result.move).not.toBeNull();
    // The engine must choose the queen (the only piece that can deliver mate).
    expect(result.move!.pieceId).toBe('wQ');
    // The search should report a forced win (Infinity score from evaluate()).
    expect(result.evalCp).toBe(Number.POSITIVE_INFINITY);
  });
});

// ---------------------------------------------------------------------------
// Puzzle 4 — Knight fork of king and queen (depth 2, player 0)
//
// Position:
//   Player 0 knight at ( 1, -1,  0) — moves to (2, 1, -3) via leap (+1, +2)
//   Player 0 king   at ( 4, -8,  4) — safe in arm apex
//   Player 1 king   at ( 3, -2, -1) — on a cell attacked by knight AFTER fork move
//   Player 1 queen  at ( 0,  4, -4) — on a cell attacked by knight AFTER fork move
//
// After Nf3 (knight to (2, 1, -3)):
//   • Knight attacks (3, -2, -1) via leap (+1, -3) → black king in check.
//   • Knight attacks (0,  4, -4) via leap (-2, +3) → black queen forked.
//   • Black must move the king; on the next turn white captures the queen.
//
// Verification that knight at (1,-1) does NOT give check before the fork:
//   (3,-2) − (1,-1) = (2,-1) which is NOT a knight leap → initial position legal.
// Verification that queen at (0,4) does NOT check white king at (4,-8):
//   No queen ray from (0,4) reaches (4,-8) in one unobstructed line.
// ---------------------------------------------------------------------------

describe('Puzzle 4 — knight fork of king and queen (depth 2, player 0)', () => {
  it('finds the knight move that forks the black king and queen', () => {
    const state = makeState([
      { id: 'wN', player: 0, type: 'knight', cell: cubeCoord( 1, -1), hasMoved: true },
      { id: 'wK', player: 0, type: 'king',   cell: cubeCoord( 4, -8), hasMoved: true },
      { id: 'bK', player: 1, type: 'king',   cell: cubeCoord( 3, -2), hasMoved: true },
      { id: 'bQ', player: 1, type: 'queen',  cell: cubeCoord( 0,  4), hasMoved: true },
    ]);

    const result = searchBestMove(state, OPTS);

    expect(result.move).not.toBeNull();
    // The engine must move the knight to the forking square (2, 1, -3).
    expect(result.move!.pieceId).toBe('wN');
    expect(cubeEquals(result.move!.to, cubeCoord(2, 1))).toBe(true);
  });
});
