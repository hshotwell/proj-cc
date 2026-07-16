import { describe, it, expect } from 'vitest';
import { pawnMoves, applyMoveCore, pseudoMovesForPiece } from '@/game/hexchess/moves';
import type { HexChessState, HexPiece, HexMove } from '@/game/hexchess/state';
import { forwardEdges, forwardDiagonal } from '@/game/hexchess/directions';
import { cubeAdd, cubeCoord, coordKey } from '@/game/coordinates';
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
 * Build a HexMove for a pawn double-step from `from` to `to`.
 */
function doubleStepMove(pawn: HexPiece, to: ReturnType<typeof cubeCoord>): HexMove {
  return {
    pieceId: pawn.id,
    from: pawn.cell,
    to,
    capture: null,
    promotion: null,
    isEnPassant: false,
    isDoubleStep: true,
    player: pawn.player,
    turnNumber: 1,
  };
}

describe('pawn en passant', () => {
  /**
   * Classical en passant scenario:
   *   Player 1 (black) pawn does a double-step from its start position.
   *   Player 0 (white) pawn is positioned edge-adjacent to the black pawn's destination,
   *   such that the passed-through cell is on the white pawn's forward-diagonal.
   *
   *   After the double-step, the white pawn's pawnMoves should include an en passant move
   *   landing on the passed-through cell.
   */
  it('sets enPassantTarget after pawn double-step', () => {
    const [e1] = forwardEdges(1); // player 1's forward edge

    // Black pawn at a cell deep enough on its own side that a double-step
    // doesn't cross the midline (which would trigger promotion instead of EP).
    const blackPawnStart = cubeCoord(-2, 6);
    const blackPawnMid = cubeAdd(blackPawnStart, e1);     // passed-through cell
    const blackPawnDest = cubeAdd(blackPawnMid, e1);      // destination after double-step

    const blackPawn: HexPiece = {
      id: 'BP',
      player: 1,
      type: 'pawn',
      cell: blackPawnStart,
      hasMoved: false,
    };

    const st = stateWith([blackPawn], { currentPlayer: 1 });
    const move = doubleStepMove(blackPawn, blackPawnDest);
    const next = applyMoveCore(st, move);

    expect(next.enPassantTarget).not.toBeNull();
    expect(next.enPassantTarget!.capturedPieceId).toBe('BP');
    expect(next.enPassantTarget!.targetCells).toHaveLength(1);
    expect(next.enPassantTarget!.targetCells[0]).toEqual(blackPawnMid);
    expect(next.enPassantTarget!.availableUntilTurn).toBe(next.turnNumber);
  });

  it('white pawn can capture en passant after black double-step', () => {
    const [e1] = forwardEdges(1); // player 1's forward edge

    const blackPawnStart = cubeCoord(0, 0);
    const blackPawnMid = cubeAdd(blackPawnStart, e1);   // passed-through (en passant target cell)
    const blackPawnDest = cubeAdd(blackPawnMid, e1);    // destination

    // White pawn needs to be positioned so that blackPawnMid is on its forward-diagonal.
    // Player 0's forward diagonal = forwardDiagonal(0).
    // For white pawn at cell C: cubeAdd(C, forwardDiagonal(0)) === blackPawnMid
    // So white pawn cell = blackPawnMid - forwardDiagonal(0)
    const diagP0 = forwardDiagonal(0);
    const whitePawnCell = {
      q: blackPawnMid.q - diagP0.q,
      r: blackPawnMid.r - diagP0.r,
      s: blackPawnMid.s - diagP0.s,
    };

    const whitePawn: HexPiece = {
      id: 'WP',
      player: 0,
      type: 'pawn',
      cell: whitePawnCell,
      hasMoved: true,
    };
    const blackPawn: HexPiece = {
      id: 'BP',
      player: 1,
      type: 'pawn',
      cell: blackPawnDest,
      hasMoved: true,
    };

    // State after black double-step: enPassantTarget is set
    const st = stateWith([whitePawn, blackPawn], {
      currentPlayer: 0,
      turnNumber: 2,
      enPassantTarget: {
        capturedPieceId: 'BP',
        targetCells: [blackPawnMid],
        availableUntilTurn: 2,
      },
    });

    const moves = pawnMoves(st, whitePawn);
    const epMoves = moves.filter(m => m.isEnPassant);

    expect(epMoves).toHaveLength(1);
    expect(epMoves[0].to).toEqual(blackPawnMid);
    expect(epMoves[0].isCapture).toBe(true);
    expect(epMoves[0].epCapturedCell).toEqual(blackPawnDest);
  });

  it('does not offer en passant onto an occupied target cell', () => {
    // A soldier's forward-diagonal move sets EP targetCells on the two cells it
    // passed between — those cells may hold pieces. A pawn must not be offered
    // an EP capture landing on an occupied cell.
    const [e1] = forwardEdges(1);

    const blackPawnStart = cubeCoord(0, 0);
    const blackPawnMid = cubeAdd(blackPawnStart, e1);
    const blackPawnDest = cubeAdd(blackPawnMid, e1);

    const diagP0 = forwardDiagonal(0);
    const whitePawnCell = {
      q: blackPawnMid.q - diagP0.q,
      r: blackPawnMid.r - diagP0.r,
      s: blackPawnMid.s - diagP0.s,
    };

    const whitePawn: HexPiece = {
      id: 'WP',
      player: 0,
      type: 'pawn',
      cell: whitePawnCell,
      hasMoved: true,
    };
    const blackPawn: HexPiece = {
      id: 'BP',
      player: 1,
      type: 'pawn',
      cell: blackPawnDest,
      hasMoved: true,
    };
    // Friendly piece already sits on the EP target cell.
    const blocker: HexPiece = {
      id: 'BLK',
      player: 0,
      type: 'rook',
      cell: blackPawnMid,
      hasMoved: true,
    };

    const st = stateWith([whitePawn, blackPawn, blocker], {
      currentPlayer: 0,
      turnNumber: 2,
      enPassantTarget: {
        capturedPieceId: 'BP',
        targetCells: [blackPawnMid],
        availableUntilTurn: 2,
      },
    });

    const moves = pawnMoves(st, whitePawn);
    expect(moves.filter(m => m.isEnPassant)).toHaveLength(0);
    expect(moves.filter(m => m.to.q === blackPawnMid.q && m.to.r === blackPawnMid.r)).toHaveLength(0);
  });

  it('pseudoMovesForPiece includes en passant move with correct capture', () => {
    const [e1] = forwardEdges(1);

    const blackPawnStart = cubeCoord(0, 0);
    const blackPawnMid = cubeAdd(blackPawnStart, e1);
    const blackPawnDest = cubeAdd(blackPawnMid, e1);

    const diagP0 = forwardDiagonal(0);
    const whitePawnCell = {
      q: blackPawnMid.q - diagP0.q,
      r: blackPawnMid.r - diagP0.r,
      s: blackPawnMid.s - diagP0.s,
    };

    const whitePawn: HexPiece = {
      id: 'WP',
      player: 0,
      type: 'pawn',
      cell: whitePawnCell,
      hasMoved: true,
    };
    const blackPawn: HexPiece = {
      id: 'BP',
      player: 1,
      type: 'pawn',
      cell: blackPawnDest,
      hasMoved: true,
    };

    const st = stateWith([whitePawn, blackPawn], {
      currentPlayer: 0,
      turnNumber: 2,
      enPassantTarget: {
        capturedPieceId: 'BP',
        targetCells: [blackPawnMid],
        availableUntilTurn: 2,
      },
    });

    const hexMoves = pseudoMovesForPiece(st, whitePawn);
    const epHexMoves = hexMoves.filter(m => m.isEnPassant);

    expect(epHexMoves).toHaveLength(1);
    const ep = epHexMoves[0];
    expect(ep.to).toEqual(blackPawnMid);
    expect(ep.capture).not.toBeNull();
    expect(ep.capture!.pieceId).toBe('BP');
    expect(ep.capture!.cell).toEqual(blackPawnDest);
  });

  it('applying en passant move removes the captured pawn', () => {
    const [e1] = forwardEdges(1);

    const blackPawnStart = cubeCoord(0, 0);
    const blackPawnMid = cubeAdd(blackPawnStart, e1);
    const blackPawnDest = cubeAdd(blackPawnMid, e1);

    const diagP0 = forwardDiagonal(0);
    const whitePawnCell = {
      q: blackPawnMid.q - diagP0.q,
      r: blackPawnMid.r - diagP0.r,
      s: blackPawnMid.s - diagP0.s,
    };

    const whitePawn: HexPiece = {
      id: 'WP',
      player: 0,
      type: 'pawn',
      cell: whitePawnCell,
      hasMoved: true,
    };
    const blackPawn: HexPiece = {
      id: 'BP',
      player: 1,
      type: 'pawn',
      cell: blackPawnDest,
      hasMoved: true,
    };

    const st = stateWith([whitePawn, blackPawn], {
      currentPlayer: 0,
      turnNumber: 2,
      enPassantTarget: {
        capturedPieceId: 'BP',
        targetCells: [blackPawnMid],
        availableUntilTurn: 2,
      },
    });

    // Build the en passant move
    const epMove: HexMove = {
      pieceId: 'WP',
      from: whitePawnCell,
      to: blackPawnMid,
      capture: { pieceId: 'BP', cell: blackPawnDest },
      promotion: null,
      isEnPassant: true,
      isDoubleStep: false,
      player: 0,
      turnNumber: 2,
    };

    const next = applyMoveCore(st, epMove);

    // White pawn moved to the passed-through cell
    const movedWhite = next.pieces.find(p => p.id === 'WP');
    expect(movedWhite).toBeDefined();
    expect(movedWhite!.cell).toEqual(blackPawnMid);

    // Black pawn is removed
    expect(next.pieces.find(p => p.id === 'BP')).toBeUndefined();
  });

  it('enPassantTarget clears after any subsequent move', () => {
    // After white makes any move (not en passant), enPassantTarget should be null
    const [e1p0] = forwardEdges(0);

    const whitePawnCell = cubeCoord(2, -2);
    const whitePawnDest = cubeAdd(whitePawnCell, e1p0);

    const whitePawn: HexPiece = {
      id: 'WP',
      player: 0,
      type: 'pawn',
      cell: whitePawnCell,
      hasMoved: false,
    };

    // State where an en passant opportunity exists
    const st = stateWith([whitePawn], {
      currentPlayer: 0,
      turnNumber: 2,
      enPassantTarget: {
        capturedPieceId: 'BP',
        targetCells: [cubeCoord(99, -99)],
        availableUntilTurn: 2,
      },
    });

    // White makes a non-en-passant move (regular step)
    const regularMove: HexMove = {
      pieceId: 'WP',
      from: whitePawnCell,
      to: whitePawnDest,
      capture: null,
      promotion: null,
      isEnPassant: false,
      isDoubleStep: false,
      player: 0,
      turnNumber: 2,
    };

    const next = applyMoveCore(st, regularMove);
    expect(next.enPassantTarget).toBeNull();
  });

  it('only a pawn double-step sets enPassantTarget — a non-pawn double-step does not', () => {
    const [e1] = forwardEdges(0);
    const rookStart = cubeCoord(0, 0);
    const rookDest = cubeAdd(cubeAdd(rookStart, e1), e1);

    const rook: HexPiece = {
      id: 'R',
      player: 0,
      type: 'rook',
      cell: rookStart,
      hasMoved: false,
    };

    const st = stateWith([rook]);
    // A move flagged as double-step but by a non-pawn piece
    const move: HexMove = {
      pieceId: 'R',
      from: rookStart,
      to: rookDest,
      capture: null,
      promotion: null,
      isEnPassant: false,
      isDoubleStep: true,
      player: 0,
      turnNumber: 1,
    };

    const next = applyMoveCore(st, move);
    expect(next.enPassantTarget).toBeNull();
  });
});
