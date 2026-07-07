import { describe, it, expect } from 'vitest';
import { soldierMoves, applyMoveCore, pseudoMovesForPiece } from '@/game/hexchess/moves';
import type { HexChessState, HexPiece, HexMove } from '@/game/hexchess/state';
import { forwardDiagonal, forwardEdges } from '@/game/hexchess/directions';
import { cubeAdd, cubeCoord } from '@/game/coordinates';
import { pieceAt } from '@/game/hexchess/board';

function stateWith(pieces: HexPiece[], overrides?: Partial<HexChessState>): HexChessState {
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
    ...overrides,
  };
}

/**
 * Build a non-capture forward-diagonal HexMove for a soldier.
 */
function soldierForwardMove(soldier: HexPiece): HexMove {
  const to = cubeAdd(soldier.cell, forwardDiagonal(soldier.player));
  return {
    pieceId: soldier.id,
    from: soldier.cell,
    to,
    capture: null,
    promotion: null,
    isEnPassant: false,
    isDoubleStep: false,
    player: soldier.player,
    turnNumber: 1,
  };
}

describe('soldier en passant', () => {
  /**
   * Test 1: soldier A does a forward-diagonal move.
   * enPassantTarget.targetCells should contain the 2 edge-neighbors shared
   * by move.from and move.to (the two cells edge-adjacent to BOTH from and to).
   */
  it('sets enPassantTarget.targetCells to both passed-through cells after soldier forward-diagonal move', () => {
    const [e1, e2] = forwardEdges(0);
    const diag = forwardDiagonal(0);

    const soldierStart = cubeCoord(0, 0);
    const soldierDest = cubeAdd(soldierStart, diag);

    // Passed-through cells: from + e1 and from + e2 (which equal to - e2 and to - e1)
    const passedCell1 = cubeAdd(soldierStart, e1);
    const passedCell2 = cubeAdd(soldierStart, e2);

    const soldierA: HexPiece = {
      id: 'SA',
      player: 0,
      type: 'soldier',
      cell: soldierStart,
      hasMoved: false,
    };

    const st = stateWith([soldierA]);
    const move = soldierForwardMove(soldierA);
    const next = applyMoveCore(st, move);

    expect(next.enPassantTarget).not.toBeNull();
    expect(next.enPassantTarget!.capturedPieceId).toBe('SA');
    expect(next.enPassantTarget!.targetCells).toHaveLength(2);
    expect(next.enPassantTarget!.availableUntilTurn).toBe(next.turnNumber);

    const cellKeys = next.enPassantTarget!.targetCells.map(c => `${c.q},${c.r}`);
    expect(cellKeys).toContain(`${passedCell1.q},${passedCell1.r}`);
    expect(cellKeys).toContain(`${passedCell2.q},${passedCell2.r}`);
  });

  /**
   * Test 2: enemy soldier B positioned such that its forward-diagonal lands on
   * one of the passed-through cells. An en passant move should be available.
   */
  it('enemy soldier can perform en passant when its forward-diagonal lands on a passed-through cell', () => {
    const [e1] = forwardEdges(0);
    const diag0 = forwardDiagonal(0);

    const soldierAStart = cubeCoord(0, 0);
    const soldierADest = cubeAdd(soldierAStart, diag0);
    // passedCell1 = soldierAStart + e1
    const passedCell1 = cubeAdd(soldierAStart, e1);

    // Player 1 soldier B needs to be positioned so that its forward diagonal = forwardDiagonal(1) lands on passedCell1.
    // B.cell + forwardDiagonal(1) = passedCell1
    // B.cell = passedCell1 - forwardDiagonal(1)
    const diag1 = forwardDiagonal(1);
    const soldierBCell = {
      q: passedCell1.q - diag1.q,
      r: passedCell1.r - diag1.r,
      s: passedCell1.s - diag1.s,
    };

    const soldierA: HexPiece = {
      id: 'SA',
      player: 0,
      type: 'soldier',
      cell: soldierADest,
      hasMoved: true,
    };
    const soldierB: HexPiece = {
      id: 'SB',
      player: 1,
      type: 'soldier',
      cell: soldierBCell,
      hasMoved: true,
    };

    const st = stateWith([soldierA, soldierB], {
      currentPlayer: 1,
      turnNumber: 2,
      enPassantTarget: {
        capturedPieceId: 'SA',
        targetCells: [passedCell1],
        availableUntilTurn: 2,
      },
    });

    const moves = soldierMoves(st, soldierB);
    const epMoves = moves.filter(m => m.isEnPassant);

    expect(epMoves).toHaveLength(1);
    expect(epMoves[0].to.q).toBe(passedCell1.q);
    expect(epMoves[0].to.r).toBe(passedCell1.r);
    expect(epMoves[0].isCapture).toBe(true);
  });

  /**
   * Test 3: enemy soldier NOT positioned such that its forward diagonal
   * lands on a passed-through cell. No EP move available.
   */
  it('enemy soldier has no en passant when its forward diagonal does not land on a passed-through cell', () => {
    const [e1] = forwardEdges(0);
    const diag0 = forwardDiagonal(0);

    const soldierAStart = cubeCoord(0, 0);
    const soldierADest = cubeAdd(soldierAStart, diag0);
    const passedCell1 = cubeAdd(soldierAStart, e1);

    // Place soldierB far away so it cannot en passant
    const soldierA: HexPiece = {
      id: 'SA',
      player: 0,
      type: 'soldier',
      cell: soldierADest,
      hasMoved: true,
    };
    const soldierB: HexPiece = {
      id: 'SB',
      player: 1,
      type: 'soldier',
      cell: cubeCoord(4, -4), // far from the en passant zone
      hasMoved: true,
    };

    const st = stateWith([soldierA, soldierB], {
      currentPlayer: 1,
      turnNumber: 2,
      enPassantTarget: {
        capturedPieceId: 'SA',
        targetCells: [passedCell1],
        availableUntilTurn: 2,
      },
    });

    const moves = soldierMoves(st, soldierB);
    expect(moves.filter(m => m.isEnPassant)).toHaveLength(0);
  });

  /**
   * Test 4: applying an en passant move removes soldier A from the board.
   */
  it('applying en passant move removes the captured soldier', () => {
    const [e1] = forwardEdges(0);
    const diag0 = forwardDiagonal(0);
    const diag1 = forwardDiagonal(1);

    const soldierAStart = cubeCoord(0, 0);
    const soldierADest = cubeAdd(soldierAStart, diag0);
    const passedCell1 = cubeAdd(soldierAStart, e1);

    const soldierBCell = {
      q: passedCell1.q - diag1.q,
      r: passedCell1.r - diag1.r,
      s: passedCell1.s - diag1.s,
    };

    const soldierA: HexPiece = {
      id: 'SA',
      player: 0,
      type: 'soldier',
      cell: soldierADest,
      hasMoved: true,
    };
    const soldierB: HexPiece = {
      id: 'SB',
      player: 1,
      type: 'soldier',
      cell: soldierBCell,
      hasMoved: true,
    };

    const st = stateWith([soldierA, soldierB], {
      currentPlayer: 1,
      turnNumber: 2,
      enPassantTarget: {
        capturedPieceId: 'SA',
        targetCells: [passedCell1],
        availableUntilTurn: 2,
      },
    });

    // Build the en passant HexMove for soldierB
    const epMove: HexMove = {
      pieceId: 'SB',
      from: soldierBCell,
      to: passedCell1,
      capture: { pieceId: 'SA', cell: soldierADest },
      promotion: null,
      isEnPassant: true,
      isDoubleStep: false,
      player: 1,
      turnNumber: 2,
    };

    const next = applyMoveCore(st, epMove);

    // Soldier B moved to the passed-through cell
    const movedB = next.pieces.find(p => p.id === 'SB');
    expect(movedB).toBeDefined();
    expect(movedB!.cell.q).toBe(passedCell1.q);
    expect(movedB!.cell.r).toBe(passedCell1.r);

    // Soldier A is removed
    expect(next.pieces.find(p => p.id === 'SA')).toBeUndefined();
  });

  /**
   * Test 5: enPassantTarget clears after a non-soldier-forward-diagonal move.
   */
  it('enPassantTarget clears after any subsequent non-soldier-forward-diagonal move', () => {
    const [e1p0] = forwardEdges(0);

    const rookCell = cubeCoord(2, -4);
    const rookDest = cubeAdd(rookCell, e1p0);

    const rook: HexPiece = {
      id: 'R',
      player: 1,
      type: 'rook',
      cell: rookCell,
      hasMoved: false,
    };

    const st = stateWith([rook], {
      currentPlayer: 1,
      turnNumber: 2,
      enPassantTarget: {
        capturedPieceId: 'SA',
        targetCells: [cubeCoord(99, -99)],
        availableUntilTurn: 2,
      },
    });

    // Non-soldier-forward-diagonal move (rook slide)
    const regularMove: HexMove = {
      pieceId: 'R',
      from: rookCell,
      to: rookDest,
      capture: null,
      promotion: null,
      isEnPassant: false,
      isDoubleStep: false,
      player: 1,
      turnNumber: 2,
    };

    const next = applyMoveCore(st, regularMove);
    expect(next.enPassantTarget).toBeNull();
  });
});
