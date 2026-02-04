import type { CubeCoord, PlayerIndex, PlayerCount, TriangleIndex } from '@/types/game';

// The 6 directions in cube coordinates for hexagonal movement
// Each direction moves to an adjacent hex
export const DIRECTIONS: readonly CubeCoord[] = [
  { q: 1, r: -1, s: 0 },  // East
  { q: 1, r: 0, s: -1 },  // Southeast
  { q: 0, r: 1, s: -1 },  // Southwest
  { q: -1, r: 1, s: 0 },  // West
  { q: -1, r: 0, s: 1 },  // Northwest
  { q: 0, r: -1, s: 1 },  // Northeast
] as const;

// Player colors - vibrant and distinguishable
export const PLAYER_COLORS: Record<PlayerIndex, string> = {
  0: '#ef4444', // Red (top)
  1: '#22c55e', // Green (bottom)
  2: '#3b82f6', // Blue (top-right)
  3: '#f97316', // Orange (bottom-left)
  4: '#a855f7', // Purple (bottom-right)
  5: '#facc15', // Yellow (top-left) - brighter yellow
};

// Light background colors for triangles
export const TRIANGLE_COLORS: Record<TriangleIndex, string> = {
  0: '#fecaca', // Light red
  1: '#bbf7d0', // Light green
  2: '#bfdbfe', // Light blue
  3: '#fed7aa', // Light orange
  4: '#e9d5ff', // Light purple
  5: '#fef9c3', // Light yellow (brighter)
};

// Default player names
export const DEFAULT_PLAYER_NAMES: Record<PlayerIndex, string> = {
  0: 'Red',
  1: 'Green',
  2: 'Blue',
  3: 'Orange',
  4: 'Purple',
  5: 'Yellow',
};

// Triangle assignments: home (start) and goal (destination) triangles
// Triangles are numbered 0-5 going clockwise, with 0 at top-right
// Each player starts in their home triangle and must move all pieces to goal triangle (opposite)
export const TRIANGLE_ASSIGNMENTS: Record<PlayerIndex, { home: TriangleIndex; goal: TriangleIndex }> = {
  0: { home: 0, goal: 3 }, // Red: top-right -> bottom-left
  1: { home: 3, goal: 0 }, // Green: bottom-left -> top-right
  2: { home: 1, goal: 4 }, // Blue: right -> left
  3: { home: 4, goal: 1 }, // Orange: left -> right
  4: { home: 2, goal: 5 }, // Purple: bottom-right -> top-left
  5: { home: 5, goal: 2 }, // Yellow: top-left -> bottom-right
};

// Maps a goal triangle to the player who is trying to reach it
export const GOAL_TRIANGLE_TO_PLAYER = Object.entries(
  TRIANGLE_ASSIGNMENTS
).reduce((acc, [player, assignment]) => {
  acc[assignment.goal] = parseInt(player, 10) as PlayerIndex;
  return acc;
}, {} as Record<TriangleIndex, PlayerIndex>);

// Maps triangle/sector index to the player who uses it as home
// Now identity mapping since getTriangleForPosition returns player index directly
export const TRIANGLE_TO_PLAYER: Record<TriangleIndex, PlayerIndex> = {
  0: 0, // Red's home (top-right, tip at 4,-8)
  1: 1, // Green's home (left, tip at -8,4)
  2: 2, // Blue's home (bottom-left, tip at -4,8)
  3: 3, // Orange's home (bottom-right, tip at 4,4)
  4: 4, // Purple's home (right, tip at 8,-4)
  5: 5, // Yellow's home (top-left, tip at -4,-4)
};

// Which players are active based on player count
// Turn order follows clockwise position on the board
// Clockwise triangle order: 0 -> 2 -> 4 -> 1 -> 3 -> 5
// Player home triangles: 0=tri0, 1=tri3, 2=tri1, 3=tri4, 4=tri2, 5=tri5
export const ACTIVE_PLAYERS: Record<PlayerCount, PlayerIndex[]> = {
  2: [0, 2],              // Red (tri 0) -> Blue (tri 1) - clockwise
  3: [0, 3, 1],           // Red (tri 0) -> Orange (tri 4) -> Green (tri 3) - clockwise
  4: [4, 3, 1, 5],        // Purple (tri 2) -> Orange (tri 4) -> Green (tri 3) -> Yellow (tri 5) - clockwise
  6: [0, 4, 3, 2, 1, 5],  // Red -> Purple -> Orange -> Blue -> Green -> Yellow - clockwise
};

// Board dimensions
export const CENTER_RADIUS = 4; // Center hexagon extends 4 from origin
export const TRIANGLE_SIZE = 4; // Each triangle has 4 rows (10 pieces total: 4+3+2+1)

// SVG rendering constants
export const HEX_SIZE = 18; // Radius of each hex cell in pixels
export const BOARD_PADDING = 40; // Padding around the board

// Animation durations (ms)
export const MOVE_ANIMATION_DURATION = 200;
export const HIGHLIGHT_PULSE_DURATION = 1000;
export const BOARD_ROTATION_DURATION = 600;

// Rotation angle (degrees) to bring each player's home triangle to the bottom of the board.
// Triangle clockwise positions: 0=top, 4=top-right, 3=bottom-right, 2=bottom, 1=bottom-left, 5=top-left
export const ROTATION_FOR_PLAYER: Record<PlayerIndex, number> = {
  0: 180,   // top -> bottom
  1: -60,   // bottom-left -> bottom
  2: 0,     // bottom -> bottom (no rotation)
  3: 60,    // bottom-right -> bottom
  4: 120,   // top-right -> bottom
  5: -120,  // top-left -> bottom
};
