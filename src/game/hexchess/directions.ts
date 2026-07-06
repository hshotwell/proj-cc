import type { CubeCoord } from '@/types/game';
import { cubeCoord, cubeAdd, cubeEquals } from '@/game/coordinates';
import type { HexPlayerIndex } from './state';

export const EDGE_DIRECTIONS: CubeCoord[] = [
  cubeCoord(1, -1),
  cubeCoord(1, 0),
  cubeCoord(0, 1),
  cubeCoord(-1, 1),
  cubeCoord(-1, 0),
  cubeCoord(0, -1),
];

export const DIAGONAL_DIRECTIONS: CubeCoord[] = [
  cubeCoord(2, -1),
  cubeCoord(1, 1),
  cubeCoord(-1, 2),
  cubeCoord(-2, 1),
  cubeCoord(-1, -1),
  cubeCoord(1, -2),
];

// Knight leaps: the 12 cells within cube-distance 3 that lie off all queen lines.
// These are NOT reachable by any queen step (edge × k or diagonal × k for k >= 1).
// Derived programmatically: all {q,r,s} with max(|q|,|r|,|s|) <= 3, excluding origin
// and every cell on the 12 queen rays.
export const KNIGHT_LEAPS: CubeCoord[] = [
  cubeCoord(1, -3), cubeCoord(2, -3), cubeCoord(3, -2), cubeCoord(3, -1),
  cubeCoord(2,  1), cubeCoord(1,  2), cubeCoord(-1, 3), cubeCoord(-2, 3),
  cubeCoord(-3, 2), cubeCoord(-3, 1), cubeCoord(-2, -1), cubeCoord(-1, -2),
];

// Player 0 starts at the "south" apex and moves north (toward decreasing r).
// Player 1 starts at the "north" apex and moves south (toward increasing r).
// The forward diagonal is the diagonal direction pointing toward the opponent's half.
const DIAG_NORTH: CubeCoord = cubeCoord(1, -2);
const DIAG_SOUTH: CubeCoord = cubeCoord(-1, 2);

export function forwardDiagonal(player: HexPlayerIndex): CubeCoord {
  return player === 0 ? DIAG_NORTH : DIAG_SOUTH;
}

// Returns the two edge-direction vectors that sum to forwardDiagonal(player).
export function forwardEdges(player: HexPlayerIndex): [CubeCoord, CubeCoord] {
  const d = forwardDiagonal(player);
  for (let i = 0; i < EDGE_DIRECTIONS.length; i++) {
    for (let j = i + 1; j < EDGE_DIRECTIONS.length; j++) {
      if (cubeEquals(cubeAdd(EDGE_DIRECTIONS[i], EDGE_DIRECTIONS[j]), d)) {
        return [EDGE_DIRECTIONS[i], EDGE_DIRECTIONS[j]];
      }
    }
  }
  throw new Error('no edge pair sums to forwardDiagonal — directions invariant violated');
}
