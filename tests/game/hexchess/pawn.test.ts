import { describe, it, expect } from 'vitest';
import { pawnMoves } from '@/game/hexchess/moves';
import type { HexChessState, HexPiece } from '@/game/hexchess/state';
import { forwardDiagonal, forwardEdges } from '@/game/hexchess/directions';
import { cubeAdd, cubeCoord } from '@/game/coordinates';

function stateWith(pieces: HexPiece[]): HexChessState {
  return {
    mode: 'hexchess', pieces, currentPlayer: 0, turnNumber: 1,
    enPassantTarget: null, pendingPromotion: null, moveHistory: [],
    positionHashes: {}, result: null,
  };
}

describe('pawn moves', () => {
  it('has up to 2 non-capture moves: both forward edges when empty', () => {
    const p: HexPiece = { id: 'P', player: 0, type: 'pawn', cell: cubeCoord(0, 0), hasMoved: false };
    const st = stateWith([p]);
    const moves = pawnMoves(st, p).filter((m) => !m.isCapture);
    expect(moves).toHaveLength(2);
    const [e1, e2] = forwardEdges(0);
    expect(moves.some(m => m.to.q === e1.q && m.to.r === e1.r)).toBe(true);
    expect(moves.some(m => m.to.q === e2.q && m.to.r === e2.r)).toBe(true);
  });

  it('blocks forward-edge if occupied by any piece', () => {
    const [e1] = forwardEdges(0);
    const p: HexPiece = { id: 'P', player: 0, type: 'pawn', cell: cubeCoord(0, 0), hasMoved: false };
    const blocker: HexPiece = { id: 'B', player: 1, type: 'rook', cell: cubeAdd(cubeCoord(0, 0), e1), hasMoved: false };
    const st = stateWith([p, blocker]);
    const nonCaptures = pawnMoves(st, p).filter((m) => !m.isCapture);
    expect(nonCaptures).toHaveLength(1); // only the other forward edge available
  });

  it('captures via forward diagonal only when enemy sits there', () => {
    const p: HexPiece = { id: 'P', player: 0, type: 'pawn', cell: cubeCoord(0, 0), hasMoved: false };
    const enemyDiag: HexPiece = { id: 'E', player: 1, type: 'rook', cell: cubeAdd(cubeCoord(0, 0), forwardDiagonal(0)), hasMoved: false };
    const st = stateWith([p, enemyDiag]);
    const captures = pawnMoves(st, p).filter((m) => m.isCapture);
    expect(captures).toHaveLength(1);
    expect(captures[0].to).toEqual(enemyDiag.cell);
  });

  it('does not capture own piece on forward diagonal', () => {
    const p: HexPiece = { id: 'P', player: 0, type: 'pawn', cell: cubeCoord(0, 0), hasMoved: false };
    const own: HexPiece = { id: 'F', player: 0, type: 'rook', cell: cubeAdd(cubeCoord(0, 0), forwardDiagonal(0)), hasMoved: false };
    const st = stateWith([p, own]);
    expect(pawnMoves(st, p).filter((m) => m.isCapture)).toHaveLength(0);
  });
});
