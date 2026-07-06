import type { CubeCoord } from '@/types/game';
import { cubeAdd } from '@/game/coordinates';
import { EDGE_DIRECTIONS, DIAGONAL_DIRECTIONS } from './directions';
import { isOnBoard, pieceAt } from './board';
import type { HexChessState, HexPiece } from './state';

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
