import { describe, it, expect, beforeEach } from 'vitest';
import { getValidMoves, getAllValidMoves } from '@/game/moves';
import { createGame, cloneGameState } from '@/game/setup';
import { cubeCoord, coordKey, cubeEquals, cubeDistance } from '@/game/coordinates';
import type { GameState } from '@/types/game';

describe('Step Moves', () => {
  let state: GameState;

  beforeEach(() => {
    state = createGame(2);
  });

  it('allows moving to adjacent empty cells', () => {
    // Find a piece and check it can move to adjacent empty cells
    const pieceCoord = cubeCoord(0, -8); // Top of top triangle

    // Place a single piece in an isolated position for cleaner testing
    const testState = cloneGameState(state);
    testState.board.set(coordKey(cubeCoord(0, 0)), { type: 'piece', player: 0 });
    testState.board.set(coordKey(pieceCoord), { type: 'empty' });

    const moves = getValidMoves(testState, cubeCoord(0, 0));
    const stepMoves = moves.filter((m) => !m.isJump);

    // Should have step moves to empty adjacent cells
    expect(stepMoves.length).toBeGreaterThan(0);

    // All step moves should be to adjacent cells
    for (const move of stepMoves) {
      expect(cubeDistance(move.from, move.to)).toBe(1);
    }
  });

  it('does not allow moving to occupied cells', () => {
    // Set up two adjacent pieces
    const testState = cloneGameState(state);
    const center = cubeCoord(0, 0);
    const adjacent = cubeCoord(1, 0);

    testState.board.set(coordKey(center), { type: 'piece', player: 0 });
    testState.board.set(coordKey(adjacent), { type: 'piece', player: 0 });

    const moves = getValidMoves(testState, center);

    // Should not be able to move to the occupied adjacent cell
    const movesToOccupied = moves.filter((m) => cubeEquals(m.to, adjacent));
    expect(movesToOccupied.length).toBe(0);
  });
});

describe('Jump Moves', () => {
  it('allows jumping over a single piece', () => {
    const state = createGame(2);
    const testState = cloneGameState(state);

    // Set up: piece at origin, piece to jump over at (1,0), empty at (2,0)
    const from = cubeCoord(0, 0);
    const over = cubeCoord(1, 0);
    const landing = cubeCoord(2, 0);

    testState.board.set(coordKey(from), { type: 'piece', player: 0 });
    testState.board.set(coordKey(over), { type: 'piece', player: 1 });
    testState.board.set(coordKey(landing), { type: 'empty' });

    const moves = getValidMoves(testState, from);
    const jumpMoves = moves.filter((m) => m.isJump);

    // Should have at least one jump move
    expect(jumpMoves.length).toBeGreaterThan(0);

    // Should be able to jump to landing position
    const jumpToLanding = jumpMoves.find((m) => cubeEquals(m.to, landing));
    expect(jumpToLanding).toBeDefined();
    expect(jumpToLanding?.isJump).toBe(true);
  });

  it('can jump over own pieces', () => {
    const state = createGame(2);
    const testState = cloneGameState(state);

    const from = cubeCoord(0, 0);
    const over = cubeCoord(1, 0);
    const landing = cubeCoord(2, 0);

    testState.board.set(coordKey(from), { type: 'piece', player: 0 });
    testState.board.set(coordKey(over), { type: 'piece', player: 0 }); // Own piece
    testState.board.set(coordKey(landing), { type: 'empty' });

    const moves = getValidMoves(testState, from);
    const jumpToLanding = moves.find((m) => cubeEquals(m.to, landing));

    expect(jumpToLanding).toBeDefined();
  });

  it('cannot jump when landing spot is occupied', () => {
    const state = createGame(2);
    const testState = cloneGameState(state);

    const from = cubeCoord(0, 0);
    const over = cubeCoord(1, 0);
    const landing = cubeCoord(2, 0);

    testState.board.set(coordKey(from), { type: 'piece', player: 0 });
    testState.board.set(coordKey(over), { type: 'piece', player: 1 });
    testState.board.set(coordKey(landing), { type: 'piece', player: 1 }); // Occupied

    const moves = getValidMoves(testState, from);
    const jumpToLanding = moves.find((m) => cubeEquals(m.to, landing));

    expect(jumpToLanding).toBeUndefined();
  });
});

describe('Chain Jumps', () => {
  it('allows chain jumps across multiple pieces', () => {
    const state = createGame(2);
    const testState = cloneGameState(state);

    // Clear the board first
    for (const [key] of testState.board) {
      testState.board.set(key, { type: 'empty' });
    }

    // Set up a chain: piece at (0,0), can jump over (1,0) to (2,0),
    // then over (3,0) to (4,0)
    testState.board.set(coordKey(cubeCoord(0, 0)), { type: 'piece', player: 0 });
    testState.board.set(coordKey(cubeCoord(1, 0)), { type: 'piece', player: 1 });
    testState.board.set(coordKey(cubeCoord(2, 0)), { type: 'empty' });
    testState.board.set(coordKey(cubeCoord(3, 0)), { type: 'piece', player: 1 });
    testState.board.set(coordKey(cubeCoord(4, 0)), { type: 'empty' });

    const moves = getValidMoves(testState, cubeCoord(0, 0));

    // Should be able to jump to (2,0)
    const firstJump = moves.find((m) => cubeEquals(m.to, cubeCoord(2, 0)));
    expect(firstJump).toBeDefined();

    // Should be able to chain jump to (4,0)
    const chainJump = moves.find((m) => cubeEquals(m.to, cubeCoord(4, 0)));
    expect(chainJump).toBeDefined();
    expect(chainJump?.isJump).toBe(true);
  });

  it('tracks jump path in chain jumps', () => {
    const state = createGame(2);
    const testState = cloneGameState(state);

    // Clear and set up chain
    for (const [key] of testState.board) {
      testState.board.set(key, { type: 'empty' });
    }

    testState.board.set(coordKey(cubeCoord(0, 0)), { type: 'piece', player: 0 });
    testState.board.set(coordKey(cubeCoord(1, 0)), { type: 'piece', player: 1 });
    testState.board.set(coordKey(cubeCoord(2, 0)), { type: 'empty' });
    testState.board.set(coordKey(cubeCoord(3, 0)), { type: 'piece', player: 1 });
    testState.board.set(coordKey(cubeCoord(4, 0)), { type: 'empty' });

    const moves = getValidMoves(testState, cubeCoord(0, 0));
    const chainJump = moves.find((m) => cubeEquals(m.to, cubeCoord(4, 0)));

    expect(chainJump?.jumpPath).toBeDefined();
    expect(chainJump?.jumpPath?.length).toBe(2); // Jumped over 2 pieces
  });

  it('cannot revisit positions during chain jump', () => {
    const state = createGame(2);
    const testState = cloneGameState(state);

    // Clear and set up a potential loop
    for (const [key] of testState.board) {
      testState.board.set(key, { type: 'empty' });
    }

    // Triangle of pieces that could create a loop
    testState.board.set(coordKey(cubeCoord(0, 0)), { type: 'piece', player: 0 });
    testState.board.set(coordKey(cubeCoord(1, 0)), { type: 'piece', player: 1 });
    testState.board.set(coordKey(cubeCoord(2, 0)), { type: 'empty' });

    const moves = getValidMoves(testState, cubeCoord(0, 0));

    // Should not have duplicate destinations
    const destinations = moves.map((m) => coordKey(m.to));
    const uniqueDestinations = new Set(destinations);
    expect(uniqueDestinations.size).toBe(destinations.length);
  });
});

describe('getAllValidMoves', () => {
  it('returns moves for all pieces of a player', () => {
    const state = createGame(2);

    // Player 0 starts with 10 pieces
    const allMoves = getAllValidMoves(state, 0);

    // Should have moves from multiple pieces
    const uniqueFromPositions = new Set(allMoves.map((m) => coordKey(m.from)));
    expect(uniqueFromPositions.size).toBeGreaterThan(0);
  });

  it('returns no moves for invalid player', () => {
    const state = createGame(2);

    // Player 2 is not active in a 2-player game
    const allMoves = getAllValidMoves(state, 2);
    expect(allMoves.length).toBe(0);
  });
});
