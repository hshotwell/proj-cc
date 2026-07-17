import { describe, it, expect } from 'vitest';
import { filterLegal, legalMoves } from '@/game/hexchess/check';
import { pseudoMovesForPiece } from '@/game/hexchess/moves';
import { createInitialState } from '@/game/hexchess/starting';
import type { HexChessConfig, HexChessState, HexPiece } from '@/game/hexchess/state';
import { cubeCoord, coordKey } from '@/game/coordinates';

// ─── helpers ─────────────────────────────────────────────────────────────────

function stateWith(pieces: HexPiece[], currentPlayer: 0 | 1 | 2 = 0): HexChessState {
  return {
    mode: 'hexchess', pieces, currentPlayer, turnNumber: 1,
    activePlayers: [0, 2],
    eliminated: [],
    enPassantTarget: null, pendingPromotion: null, moveHistory: [],
    positionHashes: {}, result: null,
  };
}

function piece(
  id: string,
  player: 0 | 1 | 2,
  type: HexPiece['type'],
  q: number,
  r: number,
): HexPiece {
  return { id, player, type, cell: cubeCoord(q, r), hasMoved: true };
}

const config: HexChessConfig = {
  id: 't',
  seats: [0, 2],
  players: {
    0: { color: 'red', name: 'A', isAI: false },
    2: { color: 'blue', name: 'B', isAI: false },
  },
  layoutPreset: 'v1-default',
  soldierVariant: 'soldier',
  ai: null,
};

// ─── Test 1: pinned piece cannot move off the pin line ────────────────────────

describe('filterLegal — pinned piece', () => {
  it('pinned rook can only move along the pin line (or capture the pinner)', () => {
    // White king at (0,0), white rook at (2,0), enemy queen at (4,0).
    // All three are on the r=0 axis.
    // The rook is pinned along the edge direction (+1,0) / (-1,0).
    // It may slide to (1,0), (3,0), or capture at (4,0),
    // but NOT to any off-pin-line cell.
    const king   = piece('k0', 0, 'king',  0, 0);
    const rook   = piece('r0', 0, 'rook',  2, 0);
    const queen  = piece('q1', 2, 'queen', 4, 0);

    const state = stateWith([king, rook, queen]);
    const pseudos = pseudoMovesForPiece(state, rook);
    const legal = filterLegal(state, pseudos);

    // All legal moves must stay on the q-axis (r === 0, s === 0 or equivalently r=0)
    for (const move of legal) {
      expect(move.to.r).toBe(0);
    }

    // At least the capture of the queen must be legal
    const capturesQueen = legal.some(m => m.capture?.pieceId === 'q1');
    expect(capturesQueen).toBe(true);

    // No off-pin-line moves (e.g. moving along a different direction like (0,1))
    // A rook at (2,0) can normally reach (2,1), (2,-1) etc via edge directions —
    // those must all be filtered out because they expose the king.
    const offPinLine = legal.some(m => m.to.r !== 0);
    expect(offPinLine).toBe(false);
  });
});

// ─── Test 2: king cannot move into an attacked cell ───────────────────────────

describe('filterLegal — king cannot step into check', () => {
  it('king step to rook-attacked cell is filtered out', () => {
    // White king at (0,0), enemy rook at (0,3).
    // Edge direction (0,1): cell (0,1) is attacked by the enemy rook.
    // King's step to (0,1) must be illegal.
    const king   = piece('k0', 0, 'king', 0, 0);
    const rook   = piece('r1', 2, 'rook', 0, 3);
    const state  = stateWith([king, rook]);

    const pseudos = pseudoMovesForPiece(state, king);
    const legal   = filterLegal(state, pseudos);

    const key01 = coordKey(cubeCoord(0, 1));
    const movesToAttacked = legal.some(m => coordKey(m.to) === key01);
    expect(movesToAttacked).toBe(false);
  });

  it('king can still step to non-attacked cells', () => {
    const king  = piece('k0', 0, 'king', 0, 0);
    const rook  = piece('r1', 2, 'rook', 0, 5);
    const state = stateWith([king, rook]);

    const pseudos = pseudoMovesForPiece(state, king);
    const legal   = filterLegal(state, pseudos);

    // Rook covers the (0,1) direction. Cells on other edges / diagonals are unattacked.
    // There should be at least some legal moves remaining.
    expect(legal.length).toBeGreaterThan(0);
  });
});

// ─── Test 3: in check — only escapes are legal ────────────────────────────────

describe('legalMoves — in check, only escape moves are legal', () => {
  it('only king escapes, captures, and blocks remain when in check', () => {
    // White king at (0,0), enemy rook at (4,0) giving check along (+1,0) ray.
    // White has a rook at (2,-2) that can block by moving to (3,0) or (2,0),
    // or capture the enemy rook at (4,0).
    // White also has a bishop at (3,3) which CANNOT help (moving it doesn't address check).
    const king         = piece('k0', 0, 'king',   0,  0);
    const friendRook   = piece('fr', 0, 'rook',   2, -2);
    const enemyRook    = piece('er', 2, 'rook',   4,  0);
    const friendBishop = piece('fb', 0, 'bishop', 3,  3);
    // Player 1 also needs a king (so no crash)
    const enemyKing    = piece('ek', 2, 'king',  -4,  4);

    const state = stateWith([king, friendRook, enemyRook, friendBishop, enemyKing]);
    const legal = legalMoves(state);

    // All legal moves must either:
    //   (a) be by the king (king escapes)
    //   (b) capture the attacking rook (capture)
    //   (c) be a blocking move (piece interposes between king (0,0) and rook (4,0))
    for (const move of legal) {
      const isKingMove       = move.pieceId === 'k0';
      const capturesAttacker = move.capture?.pieceId === 'er';
      // Blocking: a piece moves to (1,0), (2,0), or (3,0) — cells on the check ray
      const checkRayCells = new Set([
        coordKey(cubeCoord(1, 0)),
        coordKey(cubeCoord(2, 0)),
        coordKey(cubeCoord(3, 0)),
      ]);
      const isBlock = checkRayCells.has(coordKey(move.to));
      expect(isKingMove || capturesAttacker || isBlock).toBe(true);
    }

    // The friend bishop's moves (which can't stop check) are all filtered out.
    const bishopMoves = legal.filter(m => m.pieceId === 'fb');
    expect(bishopMoves).toHaveLength(0);

    // There must be at least one legal response (king can always step away if escape exists)
    expect(legal.length).toBeGreaterThan(0);
  });
});

// ─── Test 4: smoke test on initial position ──────────────────────────────────

describe('legalMoves — smoke test on v1 starting position', () => {
  it('returns a non-empty move list for player 0 at start', () => {
    const s0 = createInitialState(config);
    const moves = legalMoves(s0);
    expect(moves.length).toBeGreaterThan(0);
  });

  it('returns a non-empty move list for player 1 at start', () => {
    const s0 = createInitialState(config);
    // Flip currentPlayer to 1 for this check
    const s1: HexChessState = { ...s0, currentPlayer: 2 };
    const moves = legalMoves(s1);
    expect(moves.length).toBeGreaterThan(0);
  });
});
