import { describe, it, expect } from 'vitest';
import { pawnMoves } from '@/game/hexchess/moves';
import type { HexChessState, HexPiece } from '@/game/hexchess/state';
import { forwardEdges, forwardDiagonal } from '@/game/hexchess/directions';
import { cubeAdd, cubeCoord, coordKey } from '@/game/coordinates';

function stateWith(pieces: HexPiece[]): HexChessState {
  return {
    mode: 'hexchess',
    pieces,
    currentPlayer: 0,
    turnNumber: 1,
    enPassantTarget: null,
    pendingPromotion: null,
    moveHistory: [],
    positionHashes: {},
    result: null,
  };
}

describe('pawn double-step', () => {
  it('pawn on a starting cell gets 2 non-capture single-step + 2 double-step moves when all cells empty', () => {
    const p: HexPiece = { id: 'P', player: 0, type: 'pawn', cell: cubeCoord(0, 0), hasMoved: false };
    const startingCells = new Set([coordKey(cubeCoord(0, 0))]);
    const st = stateWith([p]);
    const moves = pawnMoves(st, p, { pawnStartingCells: startingCells });
    const nonCaptures = moves.filter(m => !m.isCapture);
    const doubleSteps = moves.filter(m => m.isDoubleStep);
    expect(nonCaptures.length).toBe(4);
    expect(doubleSteps.length).toBe(2);
    // Verify doubleSteps are at the 2*edge distance
    const [e1, e2] = forwardEdges(0);
    const expectedDouble1 = cubeAdd(cubeAdd(cubeCoord(0, 0), e1), e1);
    const expectedDouble2 = cubeAdd(cubeAdd(cubeCoord(0, 0), e2), e2);
    expect(doubleSteps.some(m => m.to.q === expectedDouble1.q && m.to.r === expectedDouble1.r)).toBe(true);
    expect(doubleSteps.some(m => m.to.q === expectedDouble2.q && m.to.r === expectedDouble2.r)).toBe(true);
  });

  it('pawn NOT on a starting cell has no double-step moves', () => {
    const p: HexPiece = { id: 'P', player: 0, type: 'pawn', cell: cubeCoord(0, 0), hasMoved: false };
    const startingCells = new Set(['999,999']); // some cell that is not the pawn's cell
    const st = stateWith([p]);
    const moves = pawnMoves(st, p, { pawnStartingCells: startingCells });
    expect(moves.filter(m => m.isDoubleStep).length).toBe(0);
  });

  it('pawn on starting cell with occupied intermediate does not get that double-step', () => {
    const p: HexPiece = { id: 'P', player: 0, type: 'pawn', cell: cubeCoord(0, 0), hasMoved: false };
    const [e1] = forwardEdges(0);
    const blocker: HexPiece = {
      id: 'B',
      player: 1,
      type: 'rook',
      cell: cubeAdd(cubeCoord(0, 0), e1),
      hasMoved: false,
    };
    const startingCells = new Set([coordKey(cubeCoord(0, 0))]);
    const st = stateWith([p, blocker]);
    const moves = pawnMoves(st, p, { pawnStartingCells: startingCells });
    // e1 direction: no single step (blocked) and no double step
    expect(
      moves.filter(m => !m.isCapture && !m.isDoubleStep).some(m => m.to.q === cubeAdd(cubeCoord(0, 0), e1).q),
    ).toBe(false);
    // Only the OTHER edge should have double-step (at most 1)
    expect(moves.filter(m => m.isDoubleStep).length).toBeLessThanOrEqual(1);
  });

  it('default (no options): no double-step moves regardless of position', () => {
    const p: HexPiece = { id: 'P', player: 0, type: 'pawn', cell: cubeCoord(0, 0), hasMoved: false };
    const st = stateWith([p]);
    const moves = pawnMoves(st, p);
    expect(moves.filter(m => m.isDoubleStep).length).toBe(0);
  });
});
