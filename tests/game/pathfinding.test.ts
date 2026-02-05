import { describe, it, expect } from 'vitest';
import type { GameState, CubeCoord, BoardContent } from '@/types/game';
import { coordKey } from '@/game/coordinates';
import {
  computeMoveDistances,
  computeTheoreticalDistance,
  computeOptimalAssignment,
} from '@/game/pathfinding';

// Helper to create a minimal game state with a custom board
function createTestState(cells: CubeCoord[], pieces: Array<{ pos: CubeCoord; player: 0 | 1 }>): GameState {
  const board = new Map<string, BoardContent>();
  for (const cell of cells) {
    board.set(coordKey(cell), { type: 'empty' });
  }
  for (const { pos, player } of pieces) {
    board.set(coordKey(pos), { type: 'piece', player });
  }
  return {
    board,
    currentPlayer: 0,
    activePlayers: [0, 1],
    winner: null,
    moveHistory: [],
    finishedPlayers: [],
    isCustomLayout: true,
  };
}

describe('computeTheoreticalDistance', () => {
  it('returns 0 for same position', () => {
    const cells = [
      { q: 0, r: 0, s: 0 },
      { q: 1, r: 0, s: -1 },
    ];
    const state = createTestState(cells, []);
    const from = { q: 0, r: 0, s: 0 };

    expect(computeTheoreticalDistance(state, from, from)).toBe(0);
  });

  it('returns 1 for adjacent positions', () => {
    const cells = [
      { q: 0, r: 0, s: 0 },
      { q: 1, r: 0, s: -1 },
    ];
    const state = createTestState(cells, []);
    const from = { q: 0, r: 0, s: 0 };
    const to = { q: 1, r: 0, s: -1 };

    expect(computeTheoreticalDistance(state, from, to)).toBe(1);
  });

  it('returns correct distance through winding path', () => {
    // Create an L-shaped board where direct path is blocked
    // Shape:
    //   A - B
    //       |
    //       C - D
    const cells = [
      { q: 0, r: 0, s: 0 },  // A
      { q: 1, r: 0, s: -1 }, // B
      { q: 1, r: 1, s: -2 }, // C
      { q: 2, r: 1, s: -3 }, // D
    ];
    const state = createTestState(cells, []);
    const from = { q: 0, r: 0, s: 0 }; // A
    const to = { q: 2, r: 1, s: -3 };  // D

    // Path must go A->B->C->D = 3 steps
    expect(computeTheoreticalDistance(state, from, to)).toBe(3);
  });
});

describe('computeMoveDistances', () => {
  it('returns distance map with correct values', () => {
    // Linear board: A - B - C
    const cells = [
      { q: 0, r: 0, s: 0 },  // A
      { q: 1, r: 0, s: -1 }, // B
      { q: 2, r: 0, s: -2 }, // C
    ];
    const state = createTestState(cells, []);
    const from = { q: 0, r: 0, s: 0 };

    const distances = computeMoveDistances(state, from, true); // ignoreOccupancy

    expect(distances.get('0,0')).toBe(0);
    expect(distances.get('1,0')).toBe(1);
    expect(distances.get('2,0')).toBe(2);
  });
});

describe('computeOptimalAssignment', () => {
  it('assigns pieces to closest goals', () => {
    // Linear board with 2 pieces and 2 goals at opposite ends
    const cells = [
      { q: 0, r: 0, s: 0 },
      { q: 1, r: 0, s: -1 },
      { q: 2, r: 0, s: -2 },
      { q: 3, r: 0, s: -3 },
    ];
    const state = createTestState(cells, []);

    // Pieces at positions 0 and 3, goals at positions 1 and 2
    const pieces = [
      { q: 0, r: 0, s: 0 },
      { q: 3, r: 0, s: -3 },
    ];
    const goals = [
      { q: 1, r: 0, s: -1 },
      { q: 2, r: 0, s: -2 },
    ];

    const { totalCost, assignments } = computeOptimalAssignment(state, pieces, goals, false);

    // Optimal: piece at 0 -> goal at 1 (cost 1), piece at 3 -> goal at 2 (cost 1)
    // Total: 2
    expect(totalCost).toBe(2);
    expect(assignments.length).toBe(2);
  });

  it('handles more pieces than goals', () => {
    const cells = [
      { q: 0, r: 0, s: 0 },
      { q: 1, r: 0, s: -1 },
      { q: 2, r: 0, s: -2 },
    ];
    const state = createTestState(cells, []);

    const pieces = [
      { q: 0, r: 0, s: 0 },
      { q: 1, r: 0, s: -1 },
      { q: 2, r: 0, s: -2 },
    ];
    const goals = [
      { q: 1, r: 0, s: -1 },
    ];

    const { assignments } = computeOptimalAssignment(state, pieces, goals, false);

    // Only 1 assignment should be made (closest piece gets the goal)
    expect(assignments.length).toBe(1);
    // The piece already at the goal position should be assigned (cost 0)
    expect(assignments[0].cost).toBe(0);
  });
});
