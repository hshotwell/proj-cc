// tests/game/ai/patterns.test.ts
import { describe, test, expect } from 'vitest';
import { scoreEphemeralOpponentJump } from '@/game/ai/strategy';
import { createGame } from '@/game/setup';
import type { GameState, Move } from '@/types/game';

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
