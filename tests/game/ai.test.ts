import { describe, it, expect } from 'vitest';
import { createGame, cloneGameState } from '@/game/setup';
import { cubeCoord, coordKey } from '@/game/coordinates';
import { getGoalPositions, getHomePositions } from '@/game/state';
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
  // Player 0 starts at top (pieces around (4,-8)), goal is player 2's home near (-3,6).

  it('returns a bonus (non-positive) for a move toward the goal', () => {
    const state = createGame(2);
    const player: PlayerIndex = 0;
    // Piece at (1,-5) moving to (0,-4) — closer to goal centroid
    const move = makeMove(1, -5, 0, -4);
    const penalty = computeRegressionPenalty(state, move, player);
    expect(penalty).toBeLessThanOrEqual(0);
  });

  it('returns positive penalty for a move away from the goal', () => {
    const state = createGame(2);
    const testState = cloneGameState(state);
    const player: PlayerIndex = 0;
    // Move piece forward first, then test backward move
    testState.board.set(coordKey(cubeCoord(0, -4)), { type: 'piece', player: 0 });
    testState.board.set(coordKey(cubeCoord(1, -5)), { type: 'empty' });
    // Backward: (0,-4) → (1,-5)
    const move = makeMove(0, -4, 1, -5);
    const penalty = computeRegressionPenalty(testState, move, player);
    expect(penalty).toBeGreaterThan(0);
  });

  it('penalizes backward moves more than forward moves', () => {
    const state = createGame(2);
    const testState = cloneGameState(state);
    const player: PlayerIndex = 0;
    // Set up piece at (0,-4)
    testState.board.set(coordKey(cubeCoord(0, -4)), { type: 'piece', player: 0 });
    testState.board.set(coordKey(cubeCoord(1, -5)), { type: 'empty' });
    // Forward: (0,-4) → (-1,-3)
    const forwardPenalty = computeRegressionPenalty(testState, makeMove(0, -4, -1, -3), player);
    // Backward: (0,-4) → (1,-5)
    const backwardPenalty = computeRegressionPenalty(testState, makeMove(0, -4, 1, -5), player);
    expect(backwardPenalty).toBeGreaterThan(forwardPenalty);
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
    // Any single reversal is now a hard veto
    expect(penalty).toBe(Infinity);
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
    // Returning to a previously visited position (visitCount === 1)
    expect(penalty).toBe(200);
  });

  it('respects lookback window', () => {
    const state = createGame(2); // 2 players -> lookback = 20 (numPlayers * 10)
    // Push enough filler moves to push the old move out of the window
    const filler = makeMove(1, 0, 2, 0);
    for (let i = 0; i < 21; i++) {
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
    const testState = cloneGameState(state);
    const player: PlayerIndex = 0;
    const goalPositions = getGoalPositions(player);
    const homePositions = getHomePositions(player);
    // Place player 0's piece at a goal position (replacing player 2's piece)
    testState.board.set(coordKey(homePositions[0]), { type: 'empty' });
    testState.board.set(coordKey(goalPositions[0]), { type: 'piece', player: 0 });
    testState.board.set(coordKey(goalPositions[1]), { type: 'empty' });
    // Move between two goal positions
    const move = makeMove(
      goalPositions[0].q, goalPositions[0].r,
      goalPositions[1].q, goalPositions[1].r
    );
    const penalty = computeRegressionPenalty(testState, move, player);
    // No goal-leaving penalty since destination is also a goal position
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
