import { describe, it, expect } from 'vitest';
import { createGame } from '@/game/setup';
import { computeSearchParams } from '@/game/ai/search';

describe('computeSearchParams', () => {
  it('returns depth 2 and large limit for midgame (0 pieces in goal)', () => {
    const state = createGame(2);
    const params = computeSearchParams(state, state.currentPlayer, 'hard');
    expect(params.depth).toBe(2);
    expect(params.moveLimit).toBe(20);
  });

  it('hard difficulty: returns depth <= 3 for midgame', () => {
    const state = createGame(2);
    const base = computeSearchParams(state, state.currentPlayer, 'hard');
    expect(base.depth).toBeLessThanOrEqual(3);
  });

  it('medium depth is always <= hard depth', () => {
    const state = createGame(2);
    const hard = computeSearchParams(state, state.currentPlayer, 'hard');
    const medium = computeSearchParams(state, state.currentPlayer, 'medium');
    expect(medium.depth).toBeLessThanOrEqual(hard.depth);
  });

  it('easy depth is always <= medium depth', () => {
    const state = createGame(2);
    const medium = computeSearchParams(state, state.currentPlayer, 'medium');
    const easy = computeSearchParams(state, state.currentPlayer, 'easy');
    expect(easy.depth).toBeLessThanOrEqual(medium.depth);
  });

  it('move limit decreases as difficulty decreases', () => {
    const state = createGame(2);
    const hard = computeSearchParams(state, state.currentPlayer, 'hard');
    const easy = computeSearchParams(state, state.currentPlayer, 'easy');
    expect(easy.moveLimit).toBeLessThan(hard.moveLimit);
  });
});
