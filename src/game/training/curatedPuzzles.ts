import type { StoredPuzzle } from './endgameRunner';

/**
 * Hand-crafted endgame puzzles for training.
 * Each is a single-player position solvable in ≤ 3 moves (par = 3).
 * Goal triangle is the standard player-0 goal (top of board).
 */
export const CURATED_PUZZLES: StoredPuzzle[] = [
  {
    // Puzzle 0: one straggler at 4,-3 needs to reach goal
    positions: ['3,-7', '4,-7', '2,-6', '3,-6', '4,-6', '1,-5', '2,-5', '3,-5', '4,-5', '4,-3'],
    goalPositions: ['1,-5', '2,-5', '3,-5', '4,-5', '4,-6', '3,-6', '2,-6', '3,-7', '4,-7', '4,-8'],
    par: 3,
  },
  {
    // Puzzle 1: 4,-4 is the straggler, goal missing 1,-5
    positions: ['3,-7', '4,-7', '2,-6', '3,-6', '4,-6', '4,-5', '4,-8', '3,-5', '4,-4', '2,-5'],
    goalPositions: ['1,-5', '2,-5', '3,-5', '4,-5', '4,-6', '3,-6', '2,-6', '3,-7', '4,-7', '4,-8'],
    par: 3,
  },
  {
    // Puzzle 2: straggler at 3,-3 (farther out), goal missing 4,-7
    positions: ['3,-7', '2,-6', '3,-6', '4,-6', '4,-5', '4,-8', '3,-5', '2,-5', '1,-5', '3,-3'],
    goalPositions: ['2,-5', '3,-5', '4,-5', '4,-6', '3,-6', '2,-6', '3,-7', '4,-7', '4,-8', '1,-5'],
    par: 3,
  },
  {
    // Puzzle 3: straggler at 4,-3, goal missing 3,-6
    positions: ['3,-7', '2,-6', '4,-6', '4,-5', '4,-8', '3,-5', '2,-5', '1,-5', '4,-7', '4,-3'],
    goalPositions: ['2,-5', '3,-5', '4,-5', '4,-6', '3,-6', '2,-6', '3,-7', '4,-7', '4,-8', '1,-5'],
    par: 3,
  },
  {
    // Puzzle 4: straggler at 1,-2 (furthest from goal), goal missing 3,-5
    positions: ['3,-7', '2,-6', '4,-6', '4,-5', '4,-8', '2,-5', '1,-5', '4,-7', '3,-6', '1,-2'],
    goalPositions: ['2,-5', '3,-5', '4,-5', '4,-6', '3,-6', '2,-6', '3,-7', '4,-7', '4,-8', '1,-5'],
    par: 3,
  },
];
