import type { CubeCoord, TriangleIndex } from '@/types/game';
import { CENTER_RADIUS } from './constants';
import { cubeCoord, coordKey, cubeDistance, parseCoordKey } from './coordinates';
import { DEFAULT_BOARD_LAYOUT } from './defaultLayout';

// Get positions for a specific triangle (0-5)
// Triangles are the 6 arms of the star, identified by sector
export function getTrianglePositions(triangleIndex: TriangleIndex): CubeCoord[] {
  // Filter default board positions to get only those in the specified triangle
  const allPositions = DEFAULT_BOARD_LAYOUT.cells.map(parseCoordKey);
  return allPositions.filter(pos => getTriangleForPosition(pos) === triangleIndex);
}

// Generate all board positions from the default layout
export function generateBoardPositions(): CubeCoord[] {
  return DEFAULT_BOARD_LAYOUT.cells.map(parseCoordKey);
}

// Check if a position is on the board
export function isValidPosition(
  coord: CubeCoord,
  boardPositions: Set<string>
): boolean {
  return boardPositions.has(coordKey(coord));
}

// Determine which player's home triangle a position belongs to (if any)
// Returns the player index (0-5) or null if in the center hexagon
// Based on dominant coordinate direction matching the 6 player starting areas
export function getTriangleForPosition(coord: CubeCoord): TriangleIndex | null {
  // Check if position is in the center hexagon (distance <= 4 from origin)
  const dist = cubeDistance(coord, cubeCoord(0, 0));
  if (dist <= CENTER_RADIUS) {
    return null;
  }

  // For positions outside center, determine which triangle sector they're in
  // Using the dominant coordinate to match player starting positions:
  // Player 0 (tip 4,-8): r is most negative
  // Player 1 (tip -8,4): q is most negative
  // Player 2 (tip -4,8): r is most positive
  // Player 3 (tip 4,4): s is most negative
  // Player 4 (tip 8,-4): q is most positive
  // Player 5 (tip -4,-4): s is most positive

  const { q, r, s } = coord;
  const absQ = Math.abs(q);
  const absR = Math.abs(r);
  const absS = Math.abs(s);

  // Find which coordinate has the largest absolute value
  if (absR >= absQ && absR >= absS) {
    // r is dominant
    return r < 0 ? 0 : 2; // Player 0 (r negative) or Player 2 (r positive)
  } else if (absQ >= absR && absQ >= absS) {
    // q is dominant
    return q < 0 ? 1 : 4; // Player 1 (q negative) or Player 4 (q positive)
  } else {
    // s is dominant
    return s < 0 ? 3 : 5; // Player 3 (s negative) or Player 5 (s positive)
  }
}

// Create a Set of all valid board position keys for fast lookup
export function createBoardPositionSet(): Set<string> {
  const positions = generateBoardPositions();
  return new Set(positions.map(coordKey));
}

// Get the bounds of the board for SVG viewBox calculation
export function getBoardBounds(): {
  minQ: number;
  maxQ: number;
  minR: number;
  maxR: number;
} {
  const positions = generateBoardPositions();

  let minQ = Infinity,
    maxQ = -Infinity;
  let minR = Infinity,
    maxR = -Infinity;

  for (const pos of positions) {
    minQ = Math.min(minQ, pos.q);
    maxQ = Math.max(maxQ, pos.q);
    minR = Math.min(minR, pos.r);
    maxR = Math.max(maxR, pos.r);
  }

  return { minQ, maxQ, minR, maxR };
}
