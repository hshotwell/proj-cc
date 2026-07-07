import type { CubeCoord } from '@/types/game';
import { cubeAdd, coordKey } from '@/game/coordinates';
import { EDGE_DIRECTIONS, DIAGONAL_DIRECTIONS, KNIGHT_LEAPS, forwardDiagonal, forwardEdges } from './directions';
import { isOnBoard, pieceAt, kingOf, otherPlayer } from './board';
import type { HexChessState, HexMove, HexPiece, HexPlayerIndex } from './state';
import { applyMoveCore, pseudoMovesForPiece } from './moves';

/**
 * Compute all cells attacked (defended/threatened) by a sliding piece.
 * Rays extend in each direction until they leave the board or hit any piece
 * (the piece's own cell is included — the ray stops AT the occupant, including it).
 * This differs from slidingMoves() which stops BEFORE own pieces.
 */
function slidingAttackCells(
  state: HexChessState,
  piece: HexPiece,
  dirs: CubeCoord[],
): CubeCoord[] {
  const targets: CubeCoord[] = [];
  for (const d of dirs) {
    let cell = cubeAdd(piece.cell, d);
    while (isOnBoard(cell)) {
      targets.push(cell);
      if (pieceAt(state, cell) !== null) break; // stop AT the blocking piece (include it)
      cell = cubeAdd(cell, d);
    }
  }
  return targets;
}

/**
 * Returns the set of cells attacked by `piece`, for the purpose of check
 * detection. Own-piece cells are included (a piece "defends" own pieces).
 * Soldier and pawn use their CAPTURE cells only (not their move cells).
 */
function attackCellsForPiece(state: HexChessState, piece: HexPiece): CubeCoord[] {
  switch (piece.type) {
    case 'rook':
      return slidingAttackCells(state, piece, EDGE_DIRECTIONS);

    case 'bishop':
      return slidingAttackCells(state, piece, DIAGONAL_DIRECTIONS);

    case 'queen':
      return [
        ...slidingAttackCells(state, piece, EDGE_DIRECTIONS),
        ...slidingAttackCells(state, piece, DIAGONAL_DIRECTIONS),
      ];

    case 'knight':
      return KNIGHT_LEAPS
        .map(l => cubeAdd(piece.cell, l))
        .filter(isOnBoard);

    case 'king':
      return [...EDGE_DIRECTIONS, ...DIAGONAL_DIRECTIONS]
        .map(d => cubeAdd(piece.cell, d))
        .filter(isOnBoard);

    case 'soldier':
      // Soldier attacks its 2 forward-edge cells (NOT the forward-diagonal move cell)
      return forwardEdges(piece.player)
        .map(e => cubeAdd(piece.cell, e))
        .filter(isOnBoard);

    case 'pawn':
      // Pawn attacks its 1 forward-diagonal cell (NOT the forward-edge move cells)
      return [cubeAdd(piece.cell, forwardDiagonal(piece.player))].filter(isOnBoard);
  }
}

/**
 * Returns true if `cell` is attacked by any piece belonging to `byPlayer`.
 * For check purposes, "attacked" means: a piece of `byPlayer` could move
 * there (or could capture there in the case of soldier/pawn).
 */
export function isCellAttacked(
  state: HexChessState,
  cell: CubeCoord,
  byPlayer: HexPlayerIndex,
): boolean {
  const cellKey = coordKey(cell);
  for (const piece of state.pieces) {
    if (piece.player !== byPlayer) continue;
    const attacked = attackCellsForPiece(state, piece);
    if (attacked.some(c => coordKey(c) === cellKey)) return true;
  }
  return false;
}

/**
 * Returns true if `player`'s king is currently attacked by the other player.
 * Returns false if the king cannot be found (invalid/in-progress state).
 */
export function isInCheck(state: HexChessState, player: HexPlayerIndex): boolean {
  const king = kingOf(state, player);
  if (!king) return false;
  return isCellAttacked(state, king.cell, otherPlayer(player));
}

/**
 * Filters `pseudos` to only those moves that do NOT leave `state.currentPlayer`'s
 * king in check after the move is applied.
 */
export function filterLegal(state: HexChessState, pseudos: HexMove[]): HexMove[] {
  const mover = state.currentPlayer;
  return pseudos.filter(move => {
    // Use applyMoveCore (no result detection) to avoid infinite recursion:
    // applyMove → isCheckmate → legalMoves → filterLegal → applyMove → ...
    const next = applyMoveCore(state, move);
    // `next.currentPlayer` has flipped; `mover` is the player who just moved.
    // The move is legal only if it does not leave that player's king in check.
    return !isInCheck(next, mover);
  });
}

/**
 * Returns all fully legal moves for `state.currentPlayer`: generates pseudo-moves
 * for every piece belonging to that player, then filters through `filterLegal`.
 */
export function legalMoves(state: HexChessState): HexMove[] {
  const mover = state.currentPlayer;
  const result: HexMove[] = [];
  for (const piece of state.pieces) {
    if (piece.player !== mover) continue;
    const pseudos = pseudoMovesForPiece(state, piece);
    const legal = filterLegal(state, pseudos);
    result.push(...legal);
  }
  return result;
}

/**
 * Returns true if `state.currentPlayer` is in checkmate: they have no legal
 * moves AND their king is currently in check.
 * Called after `applyMove` has advanced the turn to the player who may be mated.
 */
export function isCheckmate(state: HexChessState): boolean {
  return legalMoves(state).length === 0 && isInCheck(state, state.currentPlayer);
}

/**
 * Returns true if `state.currentPlayer` is stalemated: they have no legal
 * moves AND their king is NOT currently in check.
 * Called after `applyMove` has advanced the turn to the player who may be stalemated.
 */
export function isStalemate(state: HexChessState): boolean {
  return legalMoves(state).length === 0 && !isInCheck(state, state.currentPlayer);
}
