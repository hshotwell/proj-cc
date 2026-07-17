import type { CubeCoord } from '@/types/game';
import { cubeCoord, cubeAdd, cubeEquals, rotateCube } from '@/game/coordinates';
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

// Seat indices equal Chinese Checkers home-triangle indices. Rotating the
// canonical seat-0 geometry clockwise by ROTATION_STEPS[seat] * 60 degrees
// (rotateCube: (q,r,s) -> (-r,-s,-q) per step) maps triangle 0 onto the
// seat's own triangle. Clockwise triangle order: 0, 4, 3, 2, 1, 5.
export const ROTATION_STEPS: Record<HexPlayerIndex, number> = {
  0: 0, 4: 1, 3: 2, 2: 3, 1: 4, 5: 5,
};

// Seat 0's arm apex is at (4,-8); its forward diagonal points from the apex
// toward the board center (and beyond). Every other seat's forward diagonal
// is the canonical one rotated to that seat's triangle.
const CANONICAL_FORWARD: CubeCoord = cubeCoord(-1, 2);

export function forwardDiagonal(player: HexPlayerIndex): CubeCoord {
  return rotateCube(CANONICAL_FORWARD, ROTATION_STEPS[player]);
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
