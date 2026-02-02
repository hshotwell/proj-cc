import type { CubeCoord } from '@/types/game';
import { DIRECTIONS, HEX_SIZE } from './constants';

// Create a coordinate key string for Map lookups
export function coordKey(coord: CubeCoord): string {
  return `${coord.q},${coord.r}`;
}

// Parse a coordinate key back to CubeCoord
export function parseCoordKey(key: string): CubeCoord {
  const [q, r] = key.split(',').map(Number);
  return { q, r, s: -q - r };
}

// Create a new CubeCoord (ensures s = -q - r)
export function cubeCoord(q: number, r: number): CubeCoord {
  return { q, r, s: -q - r };
}

// Add two cube coordinates
export function cubeAdd(a: CubeCoord, b: CubeCoord): CubeCoord {
  return {
    q: a.q + b.q,
    r: a.r + b.r,
    s: a.s + b.s,
  };
}

// Subtract cube coordinates (a - b)
export function cubeSubtract(a: CubeCoord, b: CubeCoord): CubeCoord {
  return {
    q: a.q - b.q,
    r: a.r - b.r,
    s: a.s - b.s,
  };
}

// Scale a cube coordinate
export function cubeScale(coord: CubeCoord, factor: number): CubeCoord {
  return {
    q: coord.q * factor,
    r: coord.r * factor,
    s: coord.s * factor,
  };
}

// Check if two coordinates are equal
export function cubeEquals(a: CubeCoord, b: CubeCoord): boolean {
  return a.q === b.q && a.r === b.r && a.s === b.s;
}

// Calculate distance between two cube coordinates
// In cube coords, distance = max(|dq|, |dr|, |ds|)
export function cubeDistance(a: CubeCoord, b: CubeCoord): number {
  return Math.max(
    Math.abs(a.q - b.q),
    Math.abs(a.r - b.r),
    Math.abs(a.s - b.s)
  );
}

// Get all 6 neighboring positions
export function getNeighbors(coord: CubeCoord): CubeCoord[] {
  return DIRECTIONS.map((dir) => cubeAdd(coord, dir));
}

// Get the neighbor in a specific direction (0-5)
export function getNeighborInDirection(coord: CubeCoord, directionIndex: number): CubeCoord {
  return cubeAdd(coord, DIRECTIONS[directionIndex]);
}

// Rotate a cube coordinate 60 degrees clockwise around origin
// Rotation formula: (q, r, s) -> (-r, -s, -q)
export function rotateCube60(coord: CubeCoord): CubeCoord {
  return {
    q: -coord.r,
    r: -coord.s,
    s: -coord.q,
  };
}

// Rotate a cube coordinate by n * 60 degrees clockwise
export function rotateCube(coord: CubeCoord, steps: number): CubeCoord {
  // Normalize steps to 0-5
  const normalizedSteps = ((steps % 6) + 6) % 6;
  let result = coord;
  for (let i = 0; i < normalizedSteps; i++) {
    result = rotateCube60(result);
  }
  return result;
}

// Convert cube coordinates to pixel coordinates for SVG rendering
// Uses pointy-top hexagon orientation
export function cubeToPixel(coord: CubeCoord, size: number = HEX_SIZE): { x: number; y: number } {
  // Pointy-top hex: x = size * sqrt(3) * (q + r/2), y = size * 3/2 * r
  const x = size * Math.sqrt(3) * (coord.q + coord.r / 2);
  const y = size * (3 / 2) * coord.r;
  return { x, y };
}

// Get the position that would result from jumping over 'over' from 'from'
// Returns the landing position after a jump
export function getJumpDestination(from: CubeCoord, over: CubeCoord): CubeCoord {
  // The jump destination is on the opposite side of 'over' from 'from'
  // It's at the same distance from 'over' as 'from' is
  const diff = cubeSubtract(over, from);
  return cubeAdd(over, diff);
}

// Check if three points are collinear (on the same line)
export function areCollinear(a: CubeCoord, b: CubeCoord, c: CubeCoord): boolean {
  // In cube coordinates, three points are collinear if the vectors from a to b
  // and from a to c are parallel (one is a scalar multiple of the other)
  const ab = cubeSubtract(b, a);
  const ac = cubeSubtract(c, a);

  // Cross product components should all be zero for parallel vectors
  return (
    ab.q * ac.r === ab.r * ac.q &&
    ab.r * ac.s === ab.s * ac.r &&
    ab.s * ac.q === ab.q * ac.s
  );
}

// Get direction index (0-5) from one coord to an adjacent coord
// Returns -1 if not adjacent
export function getDirectionIndex(from: CubeCoord, to: CubeCoord): number {
  const diff = cubeSubtract(to, from);
  for (let i = 0; i < DIRECTIONS.length; i++) {
    if (cubeEquals(diff, DIRECTIONS[i])) {
      return i;
    }
  }
  return -1;
}

// Calculate the full animation path for a move
// Returns array of positions including start and end
// For step moves: [from, to]
// For jump moves: [from, landing1, landing2, ..., to]
// Calculate the centroid (average position) of a set of coordinates
export function centroid(positions: CubeCoord[]): CubeCoord {
  if (positions.length === 0) return { q: 0, r: 0, s: 0 };
  const sum = positions.reduce(
    (acc, p) => ({ q: acc.q + p.q, r: acc.r + p.r, s: acc.s + p.s }),
    { q: 0, r: 0, s: 0 }
  );
  return {
    q: sum.q / positions.length,
    r: sum.r / positions.length,
    s: sum.s / positions.length,
  };
}

export function getMovePath(from: CubeCoord, to: CubeCoord, jumpPath?: CubeCoord[]): CubeCoord[] {
  if (!jumpPath || jumpPath.length === 0) {
    // Step move or single hop without path tracking
    return [from, to];
  }

  // Reconstruct landing positions from pieces jumped over
  const path: CubeCoord[] = [from];
  let current = from;

  for (const jumpedPiece of jumpPath) {
    const landing = getJumpDestination(current, jumpedPiece);
    path.push(landing);
    current = landing;
  }

  return path;
}
