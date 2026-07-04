import { describe, it, expect } from 'vitest';
import { shouldPromote, PROMOTION_THRESHOLD } from '@/game/training-v2/promote';

describe('shouldPromote', () => {
  it('promotes when candidate wins meet the threshold', () => {
    expect(shouldPromote({ candidateWins: PROMOTION_THRESHOLD, gamesPlayed: 20 })).toBe(true);
  });
  it('promotes when candidate wins exceed the threshold', () => {
    expect(shouldPromote({ candidateWins: PROMOTION_THRESHOLD + 5, gamesPlayed: 20 })).toBe(true);
  });
  it('rejects when candidate wins below threshold', () => {
    expect(shouldPromote({ candidateWins: PROMOTION_THRESHOLD - 1, gamesPlayed: 20 })).toBe(false);
  });
  it('rejects when candidate ties at threshold-1', () => {
    expect(shouldPromote({ candidateWins: 10, gamesPlayed: 20 })).toBe(false);
  });
});
