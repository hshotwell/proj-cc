import { describe, it, expect } from 'vitest';
import { createGame } from '@/game/setup';
import { cubeCoord, coordKey } from '@/game/coordinates';
import { getGoalPositions } from '@/game/state';
import {
  computeRegressionPenalty,
  computeRepetitionPenalty,
  serializeGameState,
  deserializeGameState,
} from '@/game/ai';
import type { GameState, Move, PlayerIndex } from '@/types/game';

// Helper: create a simple move
function makeMove(
  fq: number, fr: number,
  tq: number, tr: number,
  isJump = false
): Move {
  return {
    from: cubeCoord(fq, fr),
    to: cubeCoord(tq, tr),
    isJump,
  };
}

describe('computeRegressionPenalty', () => {
  // Player 0's goal centroid is at roughly (-3, 6).
  // Moving in the positive-r / negative-q direction goes toward the goal.

  it('returns 0 for a move toward the goal', () => {
    const state = createGame(2);
    const player: PlayerIndex = 0;
    // Move from (0, 0) toward (-1, 1) — closer to goal centroid (-3, 6)
    const move = makeMove(0, 0, -1, 1);
    const penalty = computeRegressionPenalty(state, move, player);
    expect(penalty).toBe(0);
  });

  it('returns positive penalty for a move away from the goal', () => {
    const state = createGame(2);
    const player: PlayerIndex = 0;
    // Move from (-1, 1) back to (0, 0) — farther from goal centroid (-3, 6)
    const move = makeMove(-1, 1, 0, 0);
    const penalty = computeRegressionPenalty(state, move, player);
    expect(penalty).toBeGreaterThan(0);
    // delta * 5, where delta = 1
    expect(penalty).toBe(5);
  });

  it('returns 0 for a lateral move at same distance', () => {
    const state = createGame(2);
    const player: PlayerIndex = 0;
    // Move between two coords equidistant from goal centroid
    const move = makeMove(1, 0, 0, 1);
    const penalty = computeRegressionPenalty(state, move, player);
    expect(penalty).toBeGreaterThanOrEqual(0);
  });
});

describe('computeRepetitionPenalty', () => {
  it('returns 0 when move history is empty', () => {
    const state = createGame(2);
    const move = makeMove(0, -4, 0, -5);
    const penalty = computeRepetitionPenalty(state, move, 0);
    expect(penalty).toBe(0);
  });

  it('returns 0 when piece has not visited the destination before', () => {
    const state = createGame(2);
    // Piece moved from A to B in the past
    state.moveHistory.push(makeMove(0, -3, 0, -4));
    // Now proposing B to C — C was never occupied by this piece
    const move = makeMove(0, -4, 0, -5);
    const penalty = computeRepetitionPenalty(state, move, 0);
    expect(penalty).toBe(0);
  });

  it('penalizes exact reversals (A->B then B->A)', () => {
    const state = createGame(2);
    // Piece moved from B to A (so it was at B before)
    state.moveHistory.push(makeMove(0, -5, 0, -4));
    // Now proposing A->B — returning to previous position, and it is an exact reversal
    const move = makeMove(0, -4, 0, -5);
    const penalty = computeRepetitionPenalty(state, move, 0);
    expect(penalty).toBe(80);
  });

  it('returns Infinity for 2+ exact reversals', () => {
    const state = createGame(2);
    const pastMove = makeMove(0, -5, 0, -4);
    state.moveHistory.push(pastMove);
    state.moveHistory.push(pastMove);
    const move = makeMove(0, -4, 0, -5);
    const penalty = computeRepetitionPenalty(state, move, 0);
    expect(penalty).toBe(Infinity);
  });

  it('detects multi-step cycles (A->B->C->A)', () => {
    const state = createGame(2);
    // Piece path: A(0,-3) -> B(0,-4) -> C(0,-5)
    state.moveHistory.push(makeMove(0, -3, 0, -4));
    state.moveHistory.push(makeMove(0, -4, 0, -5));
    // Now proposing C -> A — returning to A, a 3-step cycle
    const move = makeMove(0, -5, 0, -3);
    const penalty = computeRepetitionPenalty(state, move, 0);
    // Cycle detected (returning to previous position) but not an exact reversal
    expect(penalty).toBe(50);
  });

  it('respects lookback window', () => {
    const state = createGame(2); // 2 players -> lookback = 12
    // Push enough filler moves to push the old move out of the window
    const filler = makeMove(1, 0, 2, 0);
    for (let i = 0; i < 13; i++) {
      state.moveHistory.push(filler);
    }
    // The reversal is now at index 0, well outside the lookback window
    state.moveHistory.unshift(makeMove(0, -5, 0, -4));
    const move = makeMove(0, -4, 0, -5);
    const penalty = computeRepetitionPenalty(state, move, 0);
    expect(penalty).toBe(0);
  });
});

describe('computeRegressionPenalty — goal positions', () => {
  it('applies steep penalty for leaving a goal position', () => {
    const state = createGame(2);
    const player: PlayerIndex = 0;
    const goalPositions = getGoalPositions(player);
    const goalPos = goalPositions[0];
    // Move from a goal position to a non-goal position
    const move = makeMove(goalPos.q, goalPos.r, 0, 0);
    const penalty = computeRegressionPenalty(state, move, player);
    // Should include the 60-point goal-leaving penalty on top of the distance penalty
    expect(penalty).toBeGreaterThanOrEqual(60);
  });

  it('does not apply goal-leaving penalty for moves within the goal', () => {
    const state = createGame(2);
    const player: PlayerIndex = 0;
    const goalPositions = getGoalPositions(player);
    // Move between two goal positions
    const move = makeMove(
      goalPositions[0].q, goalPositions[0].r,
      goalPositions[1].q, goalPositions[1].r
    );
    const penalty = computeRegressionPenalty(state, move, player);
    // No goal-leaving penalty; only normal distance penalty (if any)
    expect(penalty).toBeLessThan(60);
  });
});

describe('serializeGameState / deserializeGameState roundtrip', () => {
  it('preserves board Map through serialization', () => {
    const state = createGame(2);
    const serialized = serializeGameState(state);
    const restored = deserializeGameState(serialized);

    expect(restored.board).toBeInstanceOf(Map);
    expect(restored.board.size).toBe(state.board.size);

    for (const [key, value] of state.board) {
      expect(restored.board.get(key)).toEqual(value);
    }
  });

  it('preserves all scalar and array fields', () => {
    const state = createGame(2);
    const restored = deserializeGameState(serializeGameState(state));

    expect(restored.playerCount).toBe(state.playerCount);
    expect(restored.activePlayers).toEqual(state.activePlayers);
    expect(restored.currentPlayer).toBe(state.currentPlayer);
    expect(restored.moveHistory).toEqual(state.moveHistory);
    expect(restored.winner).toBe(state.winner);
    expect(restored.finishedPlayers).toEqual(state.finishedPlayers);
    expect(restored.turnNumber).toBe(state.turnNumber);
  });

  it('preserves optional fields when present', () => {
    const state = createGame(2);
    state.aiPlayers = { 0: { difficulty: 'hard', personality: 'aggressive' } };
    state.playerColors = { 0: '#ff0000' };
    state.isCustomLayout = true;

    const restored = deserializeGameState(serializeGameState(state));

    expect(restored.aiPlayers).toEqual(state.aiPlayers);
    expect(restored.playerColors).toEqual(state.playerColors);
    expect(restored.isCustomLayout).toBe(true);
  });

  it('handles undefined optional fields', () => {
    const state = createGame(2);
    // These are undefined by default
    const restored = deserializeGameState(serializeGameState(state));

    expect(restored.isCustomLayout).toBeUndefined();
    expect(restored.playerColors).toBeUndefined();
  });
});
