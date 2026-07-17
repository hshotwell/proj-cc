import { describe, it, expect } from 'vitest';
import { evaluate } from '@/game/ai/hexchess/evaluate';
import { createInitialState } from '@/game/hexchess/starting';
import type { HexChessConfig, HexChessState, HexPiece } from '@/game/hexchess/state';
import { cubeCoord } from '@/game/coordinates';

const config: HexChessConfig = {
  id: 'test',
  seats: [0, 2],
  players: {
    0: { color: 'red', name: 'P1', isAI: false },
    2: { color: 'blue', name: 'P2', isAI: false },
  },
  layoutPreset: 'v1-default',
  soldierVariant: 'soldier',
  ai: null,
};

describe('evaluate', () => {
  it('initial position evaluates near zero (symmetric board)', () => {
    const state = createInitialState(config);
    const score = evaluate(state);
    // Tempo bonus of ±5 is the only asymmetry at the start (player 0 to move = +5)
    expect(Math.abs(score)).toBeLessThan(50);
  });

  // The default layout has no queen (it only appears via promotion), so these
  // tests add a symmetric pair of queens far from center (distance > 3, so
  // the PST bonus is 0 for both) and then remove one side's to isolate its
  // material value in the eval.
  function withSymmetricQueens(state: HexChessState): HexChessState {
    const q0: HexPiece = { id: 'test-q0', player: 0, type: 'queen', cell: cubeCoord(5, -5), hasMoved: true };
    const q1: HexPiece = { id: 'test-q1', player: 2, type: 'queen', cell: cubeCoord(-5, 5), hasMoved: true };
    return { ...state, pieces: [...state.pieces, q0, q1] };
  }

  it('removing player 1 queen evaluates to ~+900 for player 0', () => {
    const state = withSymmetricQueens(createInitialState(config));
    const stateNoQ1: HexChessState = {
      ...state,
      pieces: state.pieces.filter(p => p.id !== 'test-q1'),
    };
    const score = evaluate(stateNoQ1);
    expect(score).toBeGreaterThan(800);
    expect(score).toBeLessThan(1100);
  });

  it('removing player 0 queen evaluates to ~-900 for player 0', () => {
    const state = withSymmetricQueens(createInitialState(config));
    const stateNoQ0: HexChessState = {
      ...state,
      pieces: state.pieces.filter(p => p.id !== 'test-q0'),
    };
    const score = evaluate(stateNoQ0);
    expect(score).toBeLessThan(-800);
    expect(score).toBeGreaterThan(-1100);
  });

  it('checkmate with player 0 winning evaluates to +Infinity', () => {
    const state = createInitialState(config);
    const matedState: HexChessState = {
      ...state,
      result: { winner: 0, reason: 'checkmate' },
    };
    expect(evaluate(matedState)).toBe(Number.POSITIVE_INFINITY);
  });

  it('checkmate with player 1 winning evaluates to -Infinity', () => {
    const state = createInitialState(config);
    const matedState: HexChessState = {
      ...state,
      result: { winner: 1, reason: 'checkmate' },
    };
    expect(evaluate(matedState)).toBe(Number.NEGATIVE_INFINITY);
  });

  it('draw evaluates to exactly 0', () => {
    const state = createInitialState(config);
    const drawState: HexChessState = {
      ...state,
      result: { winner: 'draw', reason: 'stalemate' },
    };
    expect(evaluate(drawState)).toBe(0);
  });
});
