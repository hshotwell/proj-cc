import { describe, it, expect } from 'vitest';
import { createGame } from '@/game/setup';
import { findRicefishPlusMove } from '@/game/ai/ricefish-plus/search';
import { getAllValidMoves } from '@/game/moves';
import type { PlayerIndex } from '@/types/game';

describe('findRicefishPlusMove', () => {
  it('returns a legal move for the starting position (2-player)', () => {
    const state = createGame(2, [0, 2] as PlayerIndex[]);
    const move = findRicefishPlusMove(state, 'easy', 'generalist');
    expect(move).not.toBeNull();
    const legal = getAllValidMoves(state, state.currentPlayer);
    expect(legal.some((m) =>
      m.from.q === move!.from.q && m.from.r === move!.from.r &&
      m.to.q === move!.to.q && m.to.r === move!.to.r
    )).toBe(true);
  });

  it('returns a legal move for a 3-player game (Max^n path)', () => {
    const state = createGame(3, [0, 1, 2] as PlayerIndex[]);
    const move = findRicefishPlusMove(state, 'easy', 'generalist');
    expect(move).not.toBeNull();
    const legal = getAllValidMoves(state, state.currentPlayer);
    expect(legal.some((m) =>
      m.from.q === move!.from.q && m.from.r === move!.from.r &&
      m.to.q === move!.to.q && m.to.r === move!.to.r
    )).toBe(true);
  });

  it('returns a forward-progressing move at easy depth from opening', () => {
    const state = createGame(2, [0, 2] as PlayerIndex[]);
    const move = findRicefishPlusMove(state, 'easy', 'aggressive');
    expect(move).not.toBeNull();
    // Player 0's back is at negative r; forward is r increasing toward 0.
    // Any sensible move from opening should not reduce r (i.e., go further
    // from goal). This is a weak sanity check that eval is doing SOMETHING.
    expect(move!.to.r).toBeGreaterThanOrEqual(move!.from.r);
  });
});
