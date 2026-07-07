import { describe, it, expect } from 'vitest';
import { soldierMoves } from '@/game/hexchess/moves';
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

describe('soldier moves', () => {
  it('has exactly one non-capture move: 1 forward diagonal', () => {
    const s: HexPiece = { id: 'S', player: 0, type: 'soldier', cell: cubeCoord(0, 0), hasMoved: false };
    const st = stateWith([s]);
    const moves = soldierMoves(st, s).filter((m) => !m.isCapture);
    expect(moves).toHaveLength(1);
    expect(moves[0].to).toEqual(cubeAdd(cubeCoord(0, 0), forwardDiagonal(0)));
  });

  it('blocks forward diagonal if occupied', () => {
    const s: HexPiece = { id: 'S', player: 0, type: 'soldier', cell: cubeCoord(0, 0), hasMoved: false };
    const b: HexPiece = { id: 'B', player: 1, type: 'rook', cell: cubeAdd(cubeCoord(0, 0), forwardDiagonal(0)), hasMoved: false };
    const st = stateWith([s, b]);
    expect(soldierMoves(st, s).filter((m) => !m.isCapture)).toHaveLength(0);
  });

  it('captures via either forward edge only when enemy sits there', () => {
    const [e1, e2] = forwardEdges(0);
    const s: HexPiece = { id: 'S', player: 0, type: 'soldier', cell: cubeCoord(0, 0), hasMoved: false };
    const enemyLeft: HexPiece = { id: 'EL', player: 1, type: 'rook', cell: cubeAdd(cubeCoord(0, 0), e1), hasMoved: false };
    // No enemy on e2; only e1 capture should appear.
    const st = stateWith([s, enemyLeft]);
    const captures = soldierMoves(st, s).filter((m) => m.isCapture);
    expect(captures).toHaveLength(1);
    expect(captures[0].to).toEqual(enemyLeft.cell);
  });
});
