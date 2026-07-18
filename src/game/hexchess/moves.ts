import type { CubeCoord } from '@/types/game';
import { cubeAdd, coordKey } from '@/game/coordinates';
import { EDGE_DIRECTIONS, DIAGONAL_DIRECTIONS, KNIGHT_LEAPS } from './directions';
import { pieceAt, isEliminated, livingPlayers, nextLivingPlayer } from './board';
import { geometryOf, isOpenCell } from './geometry';
import type { HexChessState, HexMove, HexPiece, HexPlayerIndex, HexPieceType } from './state';
import { rulesModeOf } from './state';
import { isCheckmate, isStalemate, isThreefoldRepetition, isInsufficientMaterial } from './check';
import { hashState } from './zobrist';

export function slidingMoves(
  state: HexChessState,
  piece: HexPiece,
  dirs: CubeCoord[],
): CubeCoord[] {
  const geom = geometryOf(state);
  const targets: CubeCoord[] = [];
  for (const d of dirs) {
    let cell = cubeAdd(piece.cell, d);
    while (isOpenCell(geom, cell)) {
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
  const geom = geometryOf(state);
  const targets: CubeCoord[] = [];
  for (const off of offsets) {
    const cell = cubeAdd(piece.cell, off);
    if (!isOpenCell(geom, cell)) continue;
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
  const geom = geometryOf(state);
  const fwd = geom.forward[piece.player];
  if (!fwd) return [];
  const out: SoldierPseudoMove[] = [];
  const forwardDiagCell = cubeAdd(piece.cell, fwd.dir);
  if (isOpenCell(geom, forwardDiagCell) && pieceAt(state, forwardDiagCell) === null) {
    out.push({ to: forwardDiagCell, isCapture: false });
  }
  for (const e of fwd.captureDirs) {
    const cell = cubeAdd(piece.cell, e);
    if (!isOpenCell(geom, cell)) continue;
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
      for (const e of fwd.captureDirs) {
        const edgeCell = cubeAdd(piece.cell, e);
        if (!isOpenCell(geom, edgeCell)) continue;
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

export function pawnMoves(state: HexChessState, piece: HexPiece): PawnPseudoMove[] {
  const geom = geometryOf(state);
  const fwd = geom.forward[piece.player];
  if (!fwd) return [];
  const onStart = geom.pawnStartCells[piece.player]?.has(coordKey(piece.cell)) ?? false;
  const out: PawnPseudoMove[] = [];
  // Move: 1 step along the forward direction; double-step from a start cell.
  const c1 = cubeAdd(piece.cell, fwd.dir);
  if (isOpenCell(geom, c1) && pieceAt(state, c1) === null) {
    out.push({ to: c1, isCapture: false });
    if (onStart) {
      const c2 = cubeAdd(c1, fwd.dir);
      if (isOpenCell(geom, c2) && pieceAt(state, c2) === null) {
        out.push({ to: c2, isCapture: false, isDoubleStep: true });
      }
    }
  }
  // Capture: the two adjacent flanking cells only.
  for (const d of fwd.captureDirs) {
    const cell = cubeAdd(piece.cell, d);
    if (!isOpenCell(geom, cell)) continue;
    const occ = pieceAt(state, cell);
    if (occ && occ.player !== piece.player) out.push({ to: cell, isCapture: true });
  }
  // En passant: a flanking cell that is empty AND an active EP target.
  const ep = state.enPassantTarget;
  if (ep && ep.availableUntilTurn === state.turnNumber) {
    // No type check — a pawn that has since promoted is still an eligible
    // en passant target (its identity, not its current type, is what matters).
    const capturedPiece = state.pieces.find(p => p.id === ep.capturedPieceId);
    if (capturedPiece && capturedPiece.player !== piece.player) {
      for (const d of fwd.captureDirs) {
        const cell = cubeAdd(piece.cell, d);
        if (!isOpenCell(geom, cell)) continue;
        if (pieceAt(state, cell) !== null) continue;
        for (const targetCell of ep.targetCells) {
          if (cell.q === targetCell.q && cell.r === targetCell.r) {
            out.push({
              to: cell,
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

  // Detect promotion: soldier or pawn arriving on a promotion cell.
  const geom = geometryOf(state);
  const isPromotingType =
    movingPiece?.type === 'soldier' || movingPiece?.type === 'pawn';
  const isPromotionCell =
    isPromotingType &&
    movingPiece !== undefined &&
    (geom.promotionCells[movingPiece.player]?.has(coordKey(move.to)) ?? false);
  const pendingPromotion = isPromotionCell && movingPiece !== undefined && geom.promotionOptions.length > 0
    ? {
        pieceId: move.pieceId,
        targetCell: move.to,
        options: [...geom.promotionOptions] as HexPieceType[],
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
    const fwd = geom.forward[movingPiece.player];
    if (fwd) {
      const [e1, e2] = fwd.captureDirs;
      const passedCell1 = cubeAdd(move.from, e1);
      const passedCell2 = cubeAdd(move.from, e2);
      enPassantTarget = {
        capturedPieceId: move.pieceId,
        targetCells: [passedCell1, passedCell2, move.from],
        availableUntilTurn: nextTurnNumber,
      };
    }
  }

  // Elimination (king-capture mode): capturing a king removes its owner from
  // play immediately. Their remaining pieces stay on the board as frozen
  // obstacles; turn order skips them from now on.
  let eliminated = state.eliminated;
  if (rulesModeOf(state) === 'king-capture' && move.capture !== null) {
    const victim = state.pieces.find(p => p.id === move.capture!.pieceId);
    if (victim && victim.type === 'king' && !eliminated.includes(victim.player)) {
      eliminated = [...eliminated, victim.player];
    }
  }

  const advanceTurn = pendingPromotion === null;
  const withElimination: HexChessState = { ...state, eliminated };

  return {
    ...withElimination,
    pieces: nextPieces,
    moveHistory: [...state.moveHistory, move],
    enPassantTarget,
    pendingPromotion,
    currentPlayer: advanceTurn
      ? nextLivingPlayer(withElimination, state.currentPlayer)
      : state.currentPlayer,
    turnNumber: advanceTurn ? state.turnNumber + 1 : state.turnNumber,
  };
}

/**
 * Removes `seat` from play outside of a king capture (resignation).
 * Their pieces freeze in place exactly as if their king had been captured.
 * If it was their turn, play passes to the next living seat; if only one
 * seat remains alive, that seat wins as the last player standing.
 */
export function eliminatePlayer(state: HexChessState, seat: HexPlayerIndex): HexChessState {
  if (state.eliminated.includes(seat) || state.result !== null) return state;
  let next: HexChessState = { ...state, eliminated: [...state.eliminated, seat] };
  const living = livingPlayers(next);
  if (living.length === 1) {
    next = { ...next, result: { winner: living[0], reason: 'king-capture' } };
  }
  if (next.currentPlayer === seat && living.length >= 1) {
    next = { ...next, currentPlayer: nextLivingPlayer(next, seat) };
  }
  return next;
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

  // When pendingPromotion !== null, turn is not yet advanced —
  // skip result detection until the promotion is resolved.
  if (next.pendingPromotion === null) {
    if (rulesModeOf(next) === 'king-capture') {
      // Multiplayer: only last-standing wins and repetition draws. Check is
      // advisory, so checkmate/stalemate/insufficient-material don't apply.
      const living = livingPlayers(next);
      if (living.length === 1) {
        next = { ...next, result: { winner: living[0], reason: 'king-capture' } };
      } else if (isThreefoldRepetition(next)) {
        next = { ...next, result: { winner: 'draw', reason: 'repetition' } };
      }
    } else if (isCheckmate(next)) {
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
  // Eliminated players' pieces are frozen obstacles — they never move.
  if (isEliminated(state, piece.player)) return [];
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
