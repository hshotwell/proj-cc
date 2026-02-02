import { describe, it, expect, beforeEach } from 'vitest';
import { createGame, cloneGameState, getPlayerPieces } from '@/game/setup';
import { getTrianglePositions } from '@/game/board';
import {
  applyMove,
  undoMove,
  checkWinner,
  hasPlayerWon,
  countPiecesInGoal,
} from '@/game/state';
import { cubeCoord, coordKey, cubeEquals } from '@/game/coordinates';
import { TRIANGLE_ASSIGNMENTS } from '@/game/constants';
import type { GameState, Move } from '@/types/game';

describe('createGame', () => {
  it('creates a game with correct number of active players', () => {
    expect(createGame(2).activePlayers.length).toBe(2);
    expect(createGame(3).activePlayers.length).toBe(3);
    expect(createGame(4).activePlayers.length).toBe(4);
    expect(createGame(6).activePlayers.length).toBe(6);
  });

  it('places 10 pieces per player', () => {
    const state = createGame(2);

    for (const player of state.activePlayers) {
      const pieces = getPlayerPieces(state, player);
      expect(pieces.length).toBe(10);
    }
  });

  it('places pieces in correct home triangles', () => {
    const state = createGame(2);

    for (const player of state.activePlayers) {
      const pieces = getPlayerPieces(state, player);
      const { home } = TRIANGLE_ASSIGNMENTS[player];
      const homePositions = getTrianglePositions(home);

      // All pieces should be in home triangle
      for (const piece of pieces) {
        const isInHome = homePositions.some((hp) => cubeEquals(piece, hp));
        expect(isInHome).toBe(true);
      }
    }
  });

  it('starts with first active player', () => {
    const state = createGame(2);
    expect(state.currentPlayer).toBe(state.activePlayers[0]);
  });

  it('starts with empty move history', () => {
    const state = createGame(2);
    expect(state.moveHistory.length).toBe(0);
  });

  it('starts with no winner', () => {
    const state = createGame(2);
    expect(state.winner).toBeNull();
  });
});

describe('applyMove', () => {
  let state: GameState;

  beforeEach(() => {
    state = createGame(2);
  });

  it('moves piece to new position', () => {
    // Find a valid move for the first piece
    const pieces = getPlayerPieces(state, state.currentPlayer);
    const from = pieces[0];
    const to = cubeCoord(from.q, from.r + 1); // Move one step

    // Make sure destination is valid
    const testState = cloneGameState(state);
    if (testState.board.has(coordKey(to))) {
      testState.board.set(coordKey(to), { type: 'empty' });
    }

    const move: Move = { from, to, isJump: false };
    const newState = applyMove(testState, move);

    // Origin should be empty
    expect(newState.board.get(coordKey(from))?.type).toBe('empty');

    // Destination should have the piece
    const destContent = newState.board.get(coordKey(to));
    expect(destContent?.type).toBe('piece');
    if (destContent?.type === 'piece') {
      expect(destContent.player).toBe(state.currentPlayer);
    }
  });

  it('advances to next player', () => {
    const testState = cloneGameState(state);
    const pieces = getPlayerPieces(testState, testState.currentPlayer);
    const from = pieces[0];
    const to = cubeCoord(from.q + 1, from.r);

    testState.board.set(coordKey(to), { type: 'empty' });

    const move: Move = { from, to, isJump: false };
    const newState = applyMove(testState, move);

    expect(newState.currentPlayer).not.toBe(state.currentPlayer);
    expect(newState.currentPlayer).toBe(state.activePlayers[1]);
  });

  it('records move in history', () => {
    const testState = cloneGameState(state);
    const pieces = getPlayerPieces(testState, testState.currentPlayer);
    const from = pieces[0];
    const to = cubeCoord(from.q + 1, from.r);

    testState.board.set(coordKey(to), { type: 'empty' });

    const move: Move = { from, to, isJump: false };
    const newState = applyMove(testState, move);

    expect(newState.moveHistory.length).toBe(1);
    expect(cubeEquals(newState.moveHistory[0].from, from)).toBe(true);
    expect(cubeEquals(newState.moveHistory[0].to, to)).toBe(true);
  });

  it('does not mutate original state', () => {
    const originalBoard = new Map(state.board);
    const originalPlayer = state.currentPlayer;

    const pieces = getPlayerPieces(state, state.currentPlayer);
    const from = pieces[0];
    const to = cubeCoord(from.q + 1, from.r);

    const testState = cloneGameState(state);
    testState.board.set(coordKey(to), { type: 'empty' });

    const move: Move = { from, to, isJump: false };
    applyMove(testState, move);

    expect(state.currentPlayer).toBe(originalPlayer);
    expect(state.board.size).toBe(originalBoard.size);
  });
});

describe('undoMove', () => {
  it('restores previous state', () => {
    const state = createGame(2);
    const testState = cloneGameState(state);

    const pieces = getPlayerPieces(testState, testState.currentPlayer);
    const from = pieces[0];
    const to = cubeCoord(from.q + 1, from.r);

    testState.board.set(coordKey(to), { type: 'empty' });

    const move: Move = { from, to, isJump: false };
    const afterMove = applyMove(testState, move);
    const afterUndo = undoMove(afterMove);

    expect(afterUndo).not.toBeNull();
    expect(afterUndo!.board.get(coordKey(from))?.type).toBe('piece');
    expect(afterUndo!.board.get(coordKey(to))?.type).toBe('empty');
    expect(afterUndo!.currentPlayer).toBe(testState.currentPlayer);
  });

  it('returns null when no moves to undo', () => {
    const state = createGame(2);
    const result = undoMove(state);
    expect(result).toBeNull();
  });

  it('removes move from history', () => {
    const state = createGame(2);
    const testState = cloneGameState(state);

    const pieces = getPlayerPieces(testState, testState.currentPlayer);
    const from = pieces[0];
    const to = cubeCoord(from.q + 1, from.r);

    testState.board.set(coordKey(to), { type: 'empty' });

    const move: Move = { from, to, isJump: false };
    const afterMove = applyMove(testState, move);
    const afterUndo = undoMove(afterMove);

    expect(afterUndo!.moveHistory.length).toBe(0);
  });
});

describe('Win Detection', () => {
  it('detects no winner at game start', () => {
    const state = createGame(2);
    expect(checkWinner(state)).toBeNull();
  });

  it('detects winner when all pieces in goal', () => {
    const state = createGame(2);
    const testState = cloneGameState(state);

    // Clear the board
    for (const [key] of testState.board) {
      testState.board.set(key, { type: 'empty' });
    }

    // Place all player 0's pieces in their goal triangle
    const player = 0;
    const { goal } = TRIANGLE_ASSIGNMENTS[player];
    const goalPositions = getTrianglePositions(goal);

    for (const pos of goalPositions) {
      testState.board.set(coordKey(pos), { type: 'piece', player });
    }

    expect(hasPlayerWon(testState, player)).toBe(true);
    expect(checkWinner(testState)).toBe(player);
  });

  it('does not detect winner with pieces outside goal', () => {
    const state = createGame(2);
    const testState = cloneGameState(state);

    // Clear the board
    for (const [key] of testState.board) {
      testState.board.set(key, { type: 'empty' });
    }

    // Place 9 pieces in goal, 1 outside
    const player = 0;
    const { goal } = TRIANGLE_ASSIGNMENTS[player];
    const goalPositions = getTrianglePositions(goal);

    for (let i = 0; i < 9; i++) {
      testState.board.set(coordKey(goalPositions[i]), { type: 'piece', player });
    }
    // Place 10th piece at origin (outside goal)
    testState.board.set(coordKey(cubeCoord(0, 0)), { type: 'piece', player });

    expect(hasPlayerWon(testState, player)).toBe(false);
    expect(checkWinner(testState)).toBeNull();
  });
});

describe('countPiecesInGoal', () => {
  it('counts zero at game start', () => {
    const state = createGame(2);
    expect(countPiecesInGoal(state, 0)).toBe(0);
    expect(countPiecesInGoal(state, 1)).toBe(0);
  });

  it('counts pieces correctly', () => {
    const state = createGame(2);
    const testState = cloneGameState(state);

    // Clear and place some pieces in goal
    for (const [key] of testState.board) {
      testState.board.set(key, { type: 'empty' });
    }

    const player = 0;
    const { goal } = TRIANGLE_ASSIGNMENTS[player];
    const goalPositions = getTrianglePositions(goal);

    // Place 5 pieces in goal
    for (let i = 0; i < 5; i++) {
      testState.board.set(coordKey(goalPositions[i]), { type: 'piece', player });
    }

    expect(countPiecesInGoal(testState, player)).toBe(5);
  });

  it('does not count opponent pieces in your goal', () => {
    const state = createGame(2);
    const testState = cloneGameState(state);

    // Clear and place opponent's pieces in player 0's goal
    for (const [key] of testState.board) {
      testState.board.set(key, { type: 'empty' });
    }

    const { goal } = TRIANGLE_ASSIGNMENTS[0];
    const goalPositions = getTrianglePositions(goal);

    // Place player 1's pieces in player 0's goal
    for (const pos of goalPositions) {
      testState.board.set(coordKey(pos), { type: 'piece', player: 1 });
    }

    expect(countPiecesInGoal(testState, 0)).toBe(0);
  });
});
