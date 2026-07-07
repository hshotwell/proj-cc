import type { CubeCoord } from '@/types/game';
import { cubeAdd } from '@/game/coordinates';
import { EDGE_DIRECTIONS, DIAGONAL_DIRECTIONS, KNIGHT_LEAPS, forwardDiagonal, forwardEdges } from './directions';
import { isOnBoard, pieceAt } from './board';
import type { HexChessState, HexPiece, HexPlayerIndex } from './state';

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
  return out;
}

export interface PawnPseudoMove {
  to: CubeCoord;
  isCapture: boolean;
}

export function pawnMoves(state: HexChessState, piece: HexPiece): PawnPseudoMove[] {
  const out: PawnPseudoMove[] = [];
  // Move: forward edges (2), only if empty
  for (const e of forwardEdges(piece.player)) {
    const cell = cubeAdd(piece.cell, e);
    if (!isOnBoard(cell)) continue;
    if (pieceAt(state, cell) === null) out.push({ to: cell, isCapture: false });
  }
  // Capture: forward diagonal (1), only if enemy
  const diagCell = cubeAdd(piece.cell, forwardDiagonal(piece.player));
  if (isOnBoard(diagCell)) {
    const occ = pieceAt(state, diagCell);
    if (occ && occ.player !== piece.player) out.push({ to: diagCell, isCapture: true });
  }
  return out;
}
