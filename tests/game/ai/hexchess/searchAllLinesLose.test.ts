import { describe, it, expect } from 'vitest';
import { searchBestMove } from '@/game/ai/hexchess/search';
import { MATE_CP } from '@/game/ai/hexchess/evaluate';
import { legalMoves, applyMove } from '@/game/hexchess';
import { isInCheck, isCheckmate } from '@/game/hexchess/check';
import type { HexChessState, HexPiece } from '@/game/hexchess/state';
import { cubeCoord } from '@/game/coordinates';

// ---------------------------------------------------------------------------
// Regression: the AI stalled when in check with a legal move but a forced
// loss on the horizon. Checkmate used to evaluate to ±Infinity, so every
// doomed line compared equal (Infinity < Infinity is false), minimax never
// selected a move, and iterative deepening clobbered the shallow-depth move
// with null — the game froze even though a legal move existed.
//
// Position: black king trapped at the arm apex (-4, 8), in check from a
// white queen, with exactly ONE legal move — after which white mates in 1.
// ---------------------------------------------------------------------------

function piece(
  id: string,
  player: 0 | 2,
  type: HexPiece['type'],
  q: number,
  r: number,
): HexPiece {
  return { id, player, type, cell: cubeCoord(q, r), hasMoved: true };
}

function doomedState(): HexChessState {
  return {
    mode: 'hexchess',
    pieces: [
      piece('bK', 2, 'king', -4, 8),
      piece('wK', 0, 'king', 0, 4),
      piece('wQ1', 0, 'queen', -4, 4),
      piece('wQ2', 0, 'queen', -1, 4),
    ],
    currentPlayer: 2,
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

describe('searchBestMove when every line loses', () => {
  it('the position is check, not mate, with one legal move that allows mate-in-1', () => {
    const state = doomedState();
    expect(isInCheck(state, 2)).toBe(true);
    expect(isCheckmate(state)).toBe(false);

    const blackMoves = legalMoves(state);
    expect(blackMoves.length).toBe(1);

    const afterEscape = applyMove(state, blackMoves[0]);
    expect(afterEscape.result).toBeNull();
    const whiteMates = legalMoves(afterEscape).some(w => {
      const n = applyMove(afterEscape, w);
      return n.result?.reason === 'checkmate' && n.result.winner === 0;
    });
    expect(whiteMates).toBe(true);
  });

  it('still returns the legal move instead of stalling (depth 3)', () => {
    const state = doomedState();
    const result = searchBestMove(state, { budgetMs: 60_000, maxDepth: 3 });

    expect(result.move).not.toBeNull();
    expect(result.move!.pieceId).toBe('bK');
    // The eval reports the forced loss (white wins) but stays finite.
    expect(result.evalCp).toBeGreaterThanOrEqual(MATE_CP);
    expect(Number.isFinite(result.evalCp)).toBe(true);
  });

  // Depth-5 full-width search on a forced-loss line is CPU-heavy (multiple
  // seconds); give it headroom above vitest's 5000ms default so it doesn't
  // flake under parallel test-suite load.
  it('still returns the legal move at depth 5 (hard difficulty)', () => {
    const state = doomedState();
    const result = searchBestMove(state, { budgetMs: 60_000, maxDepth: 5 });
    expect(result.move).not.toBeNull();
  }, 20_000);
});
