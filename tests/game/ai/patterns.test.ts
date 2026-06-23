// tests/game/ai/patterns.test.ts
import { describe, test, expect } from 'vitest';
import { scoreEphemeralOpponentJump, scoreResidualTrajectory } from '@/game/ai/strategy';
import { createGame } from '@/game/setup';
import type { GameState, Move } from '@/types/game';
import { centroid } from '@/game/coordinates';
import { getGoalPositionsForState } from '@/game/state';

function makeGame(): GameState {
  return createGame(2);
}

describe('scoreEphemeralOpponentJump', () => {
  test('returns 0 for a step move (no jump path)', () => {
    const state = makeGame();
    const stepMove: Move = {
      from: { q: 4, r: -8, s: 4 },
      to: { q: 3, r: -7, s: 4 },
      isJump: false,
    };
    expect(scoreEphemeralOpponentJump(state, stepMove, 0)).toBe(0);
  });

  test('returns 0 for a jump with no jumpPath array', () => {
    const state = makeGame();
    const jumpMove: Move = {
      from: { q: 4, r: -7, s: 3 },
      to: { q: 2, r: -5, s: 3 },
      isJump: true,
    };
    expect(scoreEphemeralOpponentJump(state, jumpMove, 0)).toBe(0);
  });

  test('returns 0 for jump over own piece (not opponent)', () => {
    const state = makeGame();
    // (4,-7) jumping over (3,-6)[own P0 piece] to (2,-5)
    const jumpWithPath: Move = {
      from: { q: 4, r: -7, s: 3 },
      to: { q: 2, r: -5, s: 3 },
      isJump: true,
      jumpPath: [{ q: 2, r: -5, s: 3 }],
    };
    // Middle position (3,-6) is P0's own piece → urgency = 0
    const result = scoreEphemeralOpponentJump(state, jumpWithPath, 0);
    expect(result).toBe(0);
  });
});

describe('scoreResidualTrajectory', () => {
  test('returns 0 for a jump move', () => {
    const state = makeGame();
    const jumpMove: Move = {
      from: { q: 4, r: -7, s: 3 },
      to: { q: 2, r: -5, s: 3 },
      isJump: true,
      jumpPath: [{ q: 2, r: -5, s: 3 }],
    };
    const goalPositions = getGoalPositionsForState(state, 0);
    const gc = centroid(goalPositions);
    expect(scoreResidualTrajectory(state, jumpMove, 0, gc)).toBe(0);
  });

  test('returns 0 or positive for a step move', () => {
    const state = makeGame();
    const stepMove: Move = {
      from: { q: 4, r: -7, s: 3 },
      to: { q: 3, r: -7, s: 4 },
      isJump: false,
    };
    const goalPositions = getGoalPositionsForState(state, 0);
    const gc = centroid(goalPositions);
    const result = scoreResidualTrajectory(state, stepMove, 0, gc);
    expect(result).toBeGreaterThanOrEqual(0);
  });
});

describe('convoy formation concept', () => {
  test('three collinear pieces at spacing-2 form a valid train', () => {
    // Verify the distance property: each pair in A, A+dir*2, A+dir*4 is exactly 2 apart.
    const A = { q: 0, r: 0, s: 0 };
    const dir = { q: -1, r: 1, s: 0 };
    const B = { q: A.q + dir.q * 2, r: A.r + dir.r * 2, s: A.s + dir.s * 2 };
    const C = { q: A.q + dir.q * 4, r: A.r + dir.r * 4, s: A.s + dir.s * 4 };

    const distAB = (Math.abs(A.q-B.q) + Math.abs(A.r-B.r) + Math.abs(A.s-B.s)) / 2;
    const distBC = (Math.abs(B.q-C.q) + Math.abs(B.r-C.r) + Math.abs(B.s-C.s)) / 2;
    expect(distAB).toBe(2);
    expect(distBC).toBe(2);
  });
});
