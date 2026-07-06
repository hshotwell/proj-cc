import { describe, it, expect } from 'vitest';
import { rookMoves, bishopMoves, queenMoves } from '@/game/hexchess/moves';
import type { HexChessState, HexPiece } from '@/game/hexchess/state';
import { cubeCoord } from '@/game/coordinates';

function stateWith(pieces: HexPiece[]): HexChessState {
  return {
    mode: 'hexchess', pieces, currentPlayer: 0, turnNumber: 1,
    enPassantTarget: null, pendingPromotion: null, moveHistory: [],
    positionHashes: {}, result: null,
  };
}

const rook: HexPiece = {
  id: 'R', player: 0, type: 'rook', cell: cubeCoord(0, 0), hasMoved: false,
};

describe('rook moves', () => {
  it('reaches board edges in all 6 edge directions when unblocked', () => {
    const s = stateWith([rook]);
    const targets = rookMoves(s, rook);
    // On a standard 121-cell star the center hex has 6 rook rays; each ray has at
    // least 4 cells (the central hexagon radius). So >= 24 total targets.
    expect(targets.length).toBeGreaterThanOrEqual(24);
  });

  it('stops before own piece, and stops ON enemy piece', () => {
    const friend: HexPiece = { id: 'F', player: 0, type: 'soldier', cell: cubeCoord(2, 0), hasMoved: false };
    const enemy: HexPiece = { id: 'E', player: 1, type: 'soldier', cell: cubeCoord(-3, 0), hasMoved: false };
    const s = stateWith([rook, friend, enemy]);
    const targets = rookMoves(s, rook);
    // Along +q edge direction, (1,0) is empty; (2,0) is friend → stop before it.
    expect(targets).toContainEqual(cubeCoord(1, 0));
    expect(targets).not.toContainEqual(cubeCoord(2, 0));
    // Along -q edge direction, (-1,0), (-2,0) are empty; (-3,0) is enemy → include it, stop.
    expect(targets).toContainEqual(cubeCoord(-3, 0));
  });
});

describe('bishop moves', () => {
  it('moves on diagonal (corner) 2-hex steps, no in-between cells', () => {
    const bishop: HexPiece = { id: 'B', player: 0, type: 'bishop', cell: cubeCoord(0, 0), hasMoved: false };
    const s = stateWith([bishop]);
    const targets = bishopMoves(s, bishop);
    // Each diagonal step is length 2; from (0,0) first-step diagonals are 6 cells.
    // All targets should have cube-distance divisible by 2 from origin.
    for (const t of targets) {
      const d = Math.max(Math.abs(t.q), Math.abs(t.r), Math.abs(-t.q - t.r));
      expect(d % 2).toBe(0);
    }
  });
});

describe('queen moves', () => {
  it('is the union of rook and bishop from same square', () => {
    const q: HexPiece = { id: 'Q', player: 0, type: 'queen', cell: cubeCoord(0, 0), hasMoved: false };
    const s = stateWith([q]);
    const asRook = q; const asBishop = q;
    const qm = queenMoves(s, q);
    const rm = rookMoves(s, { ...asRook, type: 'rook' });
    const bm = bishopMoves(s, { ...asBishop, type: 'bishop' });
    expect(qm.length).toBe(rm.length + bm.length);
  });
});
