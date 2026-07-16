import type { CubeCoord } from '@/types/game';
import { cubeAdd, coordKey } from '@/game/coordinates';
import { EDGE_DIRECTIONS, DIAGONAL_DIRECTIONS, KNIGHT_LEAPS, forwardDiagonal, forwardEdges } from './directions';
import { isOnBoard, pieceAt } from './board';
import type { HexChessState, HexMove, HexPiece, HexPlayerIndex, HexPieceType } from './state';
import { isCheckmate, isStalemate, isThreefoldRepetition, isInsufficientMaterial } from './check';
import { hashState } from './zobrist';
import { promotionCellsForPlayer } from './starting';

export function slidingMoves(
  state: HexChessState,
  piece: HexPiece,
  dirs: CubeCoord[],
): CubeCoord[] {
  const targets: CubeCoord[] = [];
  for (const d of dirs) {
    let cell = cubeAdd(piece.cell, d);
    while (isOnBoard(cell)) {
      const occupant = pieceAt(state, cell);
      if (occupant === null) {
        targets.push(cell);
      } else if (occupant.player !== piece.player) {
        targets.push(cell);
        break;
      } else {
        break;
      }
      cell = cubeAdd(cell, d);
    }
  }
  return targets;
}

export function rookMoves(state: HexChessState, piece: HexPiece): CubeCoord[] {
  return slidingMoves(state, piece, EDGE_DIRECTIONS);
}

export function bishopMoves(state: HexChessState, piece: HexPiece): CubeCoord[] {
  return slidingMoves(state, piece, DIAGONAL_DIRECTIONS);
}

export function queenMoves(state: HexChessState, piece: HexPiece): CubeCoord[] {
  return [
    ...slidingMoves(state, piece, EDGE_DIRECTIONS),
    ...slidingMoves(state, piece, DIAGONAL_DIRECTIONS),
  ];
}

function stepMoves(state: HexChessState, piece: HexPiece, offsets: CubeCoord[]): CubeCoord[] {
  const targets: CubeCoord[] = [];
  for (const off of offsets) {
    const cell = cubeAdd(piece.cell, off);
    if (!isOnBoard(cell)) continue;
    const occ = pieceAt(state, cell);
    if (occ && occ.player === piece.player) continue;
    targets.push(cell);
  }
  return targets;
}

export function kingMoves(state: HexChessState, piece: HexPiece): CubeCoord[] {
  return stepMoves(state, piece, [...EDGE_DIRECTIONS, ...DIAGONAL_DIRECTIONS]);
}

export function knightMoves(state: HexChessState, piece: HexPiece): CubeCoord[] {
  return stepMoves(state, piece, KNIGHT_LEAPS);
}

export interface SoldierPseudoMove {
  to: CubeCoord;
  isCapture: boolean;
  isEnPassant?: boolean;
  epCapturedCell?: CubeCoord;
}

export function soldierMoves(state: HexChessState, piece: HexPiece): SoldierPseudoMove[] {
  const out: SoldierPseudoMove[] = [];
  const diag = forwardDiagonal(piece.player);
  const forwardDiagCell = cubeAdd(piece.cell, diag);
  if (isOnBoard(forwardDiagCell) && pieceAt(state, forwardDiagCell) === null) {
    out.push({ to: forwardDiagCell, isCapture: false });
  }
  for (const e of forwardEdges(piece.player)) {
    const cell = cubeAdd(piece.cell, e);
    if (!isOnBoard(cell)) continue;
    const occ = pieceAt(state, cell);
    if (occ && occ.player !== piece.player) {
      out.push({ to: cell, isCapture: true });
    }
  }
  // En passant: like a normal capture, EP uses the soldier's forward-EDGE
  // capture directions (not its forward-diagonal movement). If an active en
  // passant target cell sits on one of those edge cells and the cell is empty,
  // add an EP move landing there.
  const ep = state.enPassantTarget;
  if (ep && ep.availableUntilTurn === state.turnNumber) {
    const capturedPiece = state.pieces.find(p => p.id === ep.capturedPieceId);
    // No type check on the captured piece — a peon that has already promoted
    // to a queen/rook/bishop/knight can still be captured en passant if the
    // enemy soldier had already committed to the double-step response.
    if (capturedPiece && capturedPiece.player !== piece.player) {
      for (const e of forwardEdges(piece.player)) {
        const edgeCell = cubeAdd(piece.cell, e);
        if (!isOnBoard(edgeCell)) continue;
        // The EP landing cell must be empty — the passed-through cells of a
        // soldier's diagonal move can hold pieces (the soldier moves between
        // them). If an enemy sits there, the normal capture above covers it.
        if (pieceAt(state, edgeCell) !== null) continue;
        for (const targetCell of ep.targetCells) {
          if (edgeCell.q === targetCell.q && edgeCell.r === targetCell.r) {
            out.push({
              to: edgeCell,
              isCapture: true,
              isEnPassant: true,
              epCapturedCell: capturedPiece.cell,
            });
          }
        }
      }
    }
  }
  return out;
}

export interface PawnPseudoMove {
  to: CubeCoord;
  isCapture: boolean;
  isDoubleStep?: boolean;
  isEnPassant?: boolean;
  epCapturedCell?: CubeCoord;
}

export interface PawnMovesOptions {
  pawnStartingCells?: Set<string>;
}

export function pawnMoves(
  state: HexChessState,
  piece: HexPiece,
  options?: PawnMovesOptions,
): PawnPseudoMove[] {
  const startingCells = options?.pawnStartingCells ?? new Set<string>();
  const onStart = startingCells.has(coordKey(piece.cell));
  const out: PawnPseudoMove[] = [];
  // Move: forward edges (2), only if empty. If on starting cell and next-next also empty, add double-step.
  for (const e of forwardEdges(piece.player)) {
    const cell1 = cubeAdd(piece.cell, e);
    if (!isOnBoard(cell1)) continue;
    if (pieceAt(state, cell1) !== null) continue;
    out.push({ to: cell1, isCapture: false });
    if (onStart) {
      const cell2 = cubeAdd(cell1, e);
      if (isOnBoard(cell2) && pieceAt(state, cell2) === null) {
        out.push({ to: cell2, isCapture: false, isDoubleStep: true });
      }
    }
  }
  // Capture: forward diagonal (1), only if enemy
  const diagCell = cubeAdd(piece.cell, forwardDiagonal(piece.player));
  if (isOnBoard(diagCell)) {
    const occ = pieceAt(state, diagCell);
    if (occ && occ.player !== piece.player) out.push({ to: diagCell, isCapture: true });
  }
  // En passant capture: if the diagonal cell is an enPassantTarget AND empty,
  // add an en passant move. A soldier-created target cell can hold a piece
  // (the soldier passes between its two target cells); landing there would
  // stack two pieces on one cell. An enemy occupant is handled by the normal
  // diagonal capture above.
  const ep = state.enPassantTarget;
  if (ep && ep.availableUntilTurn === state.turnNumber && isOnBoard(diagCell) && pieceAt(state, diagCell) === null) {
    for (const targetCell of ep.targetCells) {
      if (diagCell.q === targetCell.q && diagCell.r === targetCell.r) {
        // No type check — a pawn that has since promoted is still an eligible
        // en passant target (its identity, not its current type, is what matters).
        const capturedPiece = state.pieces.find(p => p.id === ep.capturedPieceId);
        if (capturedPiece && capturedPiece.player !== piece.player) {
          out.push({
            to: diagCell,
            isCapture: true,
            isEnPassant: true,
            epCapturedCell: capturedPiece.cell,
          });
        }
      }
    }
  }
  return out;
}

/**
 * Core move application: clones state, moves piece, advances turn.
 * Does NOT detect checkmate/stalemate — used internally by check.ts (filterLegal)
 * to avoid infinite recursion (filterLegal calls applyMove to probe legality).
 */
export function applyMoveCore(state: HexChessState, move: HexMove): HexChessState {
  // Clone pieces array: drop the captured piece (if any), update the moving piece
  const nextPieces = state.pieces
    .filter(p => move.capture === null || p.id !== move.capture!.pieceId)
    .map(p => p.id === move.pieceId ? { ...p, cell: move.to, hasMoved: true } : p);

  // Shared reference: the piece that is moving (pre-move state).
  const movingPiece = state.pieces.find(p => p.id === move.pieceId);

  // Detect promotion: soldier or pawn arriving on the opposing arm.
  const isPromotingType =
    movingPiece?.type === 'soldier' || movingPiece?.type === 'pawn';
  const isPromotionCell =
    isPromotingType &&
    movingPiece !== undefined &&
    promotionCellsForPlayer(movingPiece.player).has(coordKey(move.to));
  const pendingPromotion = isPromotionCell && movingPiece !== undefined
    ? {
        pieceId: move.pieceId,
        targetCell: move.to,
        options: ['queen', 'rook', 'bishop', 'knight'] as HexPieceType[],
      }
    : null;

  // Set enPassantTarget when a pawn does a double-step, or a soldier does a forward-diagonal non-capture move.
  let enPassantTarget: HexChessState['enPassantTarget'] = null;
  // turnNumber hasn't advanced yet — the next state will have turnNumber+1,
  // so availableUntilTurn must equal the NEXT turnNumber.
  const nextTurnNumber = state.turnNumber + 1;
  if (move.isDoubleStep && movingPiece?.type === 'pawn') {
    const passedThrough = {
      q: (move.from.q + move.to.q) / 2,
      r: (move.from.r + move.to.r) / 2,
      s: (move.from.s + move.to.s) / 2,
    };
    enPassantTarget = {
      capturedPieceId: move.pieceId,
      targetCells: [passedThrough],
      availableUntilTurn: nextTurnNumber,
    };
  } else if (movingPiece?.type === 'soldier' && move.capture === null && !move.isEnPassant) {
    // Soldier forward-diagonal non-capture: the passed-through cells are
    // the two edge-neighbors shared by move.from and move.to.
    // Since to = from + (e1 + e2), the two cells are from + e1 and from + e2.
    // The vacated departure cell is also a target: the only enemy peons whose
    // capture reaches it are the ones standing ON a passed-through cell — the
    // mover slid right past them, and they may take it on the cell it left.
    const [e1, e2] = forwardEdges(movingPiece.player);
    const passedCell1 = cubeAdd(move.from, e1);
    const passedCell2 = cubeAdd(move.from, e2);
    enPassantTarget = {
      capturedPieceId: move.pieceId,
      targetCells: [passedCell1, passedCell2, move.from],
      availableUntilTurn: nextTurnNumber,
    };
  }

  const advanceTurn = pendingPromotion === null;

  return {
    ...state,
    pieces: nextPieces,
    moveHistory: [...state.moveHistory, move],
    enPassantTarget,
    pendingPromotion,
    currentPlayer: advanceTurn ? ((1 - state.currentPlayer) as 0 | 1) : state.currentPlayer,
    turnNumber: advanceTurn ? state.turnNumber + 1 : state.turnNumber,
  };
}

/**
 * Full move application: calls applyMoveCore, then:
 *  1. Updates positionHashes with the new state's Zobrist hash.
 *  2. Detects checkmate/stalemate.
 *  3. Detects draw by threefold repetition or insufficient material.
 */
export function applyMove(state: HexChessState, move: HexMove): HexChessState {
  const mover = state.currentPlayer;
  let next = applyMoveCore(state, move);

  // Step 1: update positionHashes with this position's Zobrist hash.
  const hash = hashState(next);
  const prevCount = next.positionHashes[hash] ?? 0;
  next = {
    ...next,
    positionHashes: { ...next.positionHashes, [hash]: prevCount + 1 },
  };

  // TODO(Task 23): when pendingPromotion !== null, turn is not yet advanced —
  // skip result detection until the promotion is resolved.
  if (next.pendingPromotion === null) {
    if (isCheckmate(next)) {
      next = { ...next, result: { winner: mover, reason: 'checkmate' } };
    } else if (isStalemate(next)) {
      next = { ...next, result: { winner: 'draw', reason: 'stalemate' } };
    } else if (isThreefoldRepetition(next)) {
      next = { ...next, result: { winner: 'draw', reason: 'repetition' } };
    } else if (isInsufficientMaterial(next)) {
      next = { ...next, result: { winner: 'draw', reason: 'insufficient-material' } };
    }
  }

  return next;
}

export function pseudoMovesForPiece(state: HexChessState, piece: HexPiece): HexMove[] {
  let rawTargets: { to: CubeCoord; isCapture?: boolean; isDoubleStep?: boolean; isEnPassant?: boolean; epCapturedCell?: CubeCoord }[] = [];
  switch (piece.type) {
    case 'king':    rawTargets = kingMoves(state, piece).map(to => ({ to })); break;
    case 'queen':   rawTargets = queenMoves(state, piece).map(to => ({ to })); break;
    case 'rook':    rawTargets = rookMoves(state, piece).map(to => ({ to })); break;
    case 'bishop':  rawTargets = bishopMoves(state, piece).map(to => ({ to })); break;
    case 'knight':  rawTargets = knightMoves(state, piece).map(to => ({ to })); break;
    case 'soldier': rawTargets = soldierMoves(state, piece); break;
    case 'pawn':    rawTargets = pawnMoves(state, piece); break;
  }
  return rawTargets.map(({ to, isCapture, isDoubleStep, isEnPassant, epCapturedCell }) => {
    let capture: HexMove['capture'] = null;
    if (isEnPassant && epCapturedCell) {
      // En passant: the captured piece is NOT at `to` — find it by id from enPassantTarget
      const ep = state.enPassantTarget;
      if (ep) {
        const capturedPiece = state.pieces.find(p => p.id === ep.capturedPieceId);
        if (capturedPiece) capture = { pieceId: capturedPiece.id, cell: capturedPiece.cell };
      }
    } else if (isCapture || (isCapture === undefined && pieceAt(state, to)?.player !== piece.player && pieceAt(state, to) !== null)) {
      const enemy = pieceAt(state, to);
      if (enemy) capture = { pieceId: enemy.id, cell: enemy.cell };
    }
    return {
      pieceId: piece.id,
      from: piece.cell,
      to,
      capture,
      promotion: null,
      isEnPassant: isEnPassant ?? false,
      isDoubleStep: isDoubleStep ?? false,
      player: piece.player,
      turnNumber: state.turnNumber,
    };
  });
}
