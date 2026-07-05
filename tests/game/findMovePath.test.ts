import { describe, it, expect, beforeEach } from 'vitest';
import { findMovePath } from '@/game/pathfinding';
import { createGame, cloneGameState } from '@/game/setup';
import { cubeCoord, coordKey } from '@/game/coordinates';
import type { GameState } from '@/types/game';

// Build an empty-board state we can freely populate for path tests.
function isolatedState(): GameState {
  const state = cloneGameState(createGame(2));
  // Clear every cell to empty
  for (const key of state.board.keys()) {
    state.board.set(key, { type: 'empty' });
  }
  return state;
}

describe('findMovePath', () => {
  let state: GameState;

  beforeEach(() => {
    state = isolatedState();
  });

  it('returns null when from and to are the same cell', () => {
    const from = cubeCoord(0, 0);
    state.board.set(coordKey(from), { type: 'piece', player: 0 });
    const path = findMovePath(state, from, from, 0);
    expect(path).toBeNull();
  });

  it('returns a single step for adjacent empty destination', () => {
    const from = cubeCoord(0, 0);
    const to = cubeCoord(1, 0);
    state.board.set(coordKey(from), { type: 'piece', player: 0 });
    const path = findMovePath(state, from, to, 0);
    expect(path).not.toBeNull();
    expect(path!.length).toBe(1);
    expect(path![0].isJump).toBe(false);
    expect(path![0].from).toEqual(from);
    expect(path![0].to).toEqual(to);
  });

  it('returns a single jump over one piece', () => {
    const from = cubeCoord(0, 0);
    const over = cubeCoord(1, 0);
    const landing = cubeCoord(2, 0);
    state.board.set(coordKey(from), { type: 'piece', player: 0 });
    state.board.set(coordKey(over), { type: 'piece', player: 1 });
    const path = findMovePath(state, from, landing, 0);
    expect(path).not.toBeNull();
    expect(path!.length).toBe(1);
    expect(path![0].isJump).toBe(true);
    expect(path![0].to).toEqual(landing);
  });

  it('returns a chain of jumps for a multi-hop destination', () => {
    // Set up: piece at (0,0), obstacle at (1,0) -> land at (2,0),
    // obstacle at (3,0) -> land at (4,0)
    const from = cubeCoord(0, 0);
    state.board.set(coordKey(from), { type: 'piece', player: 0 });
    state.board.set(coordKey(cubeCoord(1, 0)), { type: 'piece', player: 1 });
    state.board.set(coordKey(cubeCoord(3, 0)), { type: 'piece', player: 1 });

    const target = cubeCoord(4, 0);
    const path = findMovePath(state, from, target, 0);
    expect(path).not.toBeNull();
    expect(path!.length).toBe(2);
    expect(path!.every((m) => m.isJump)).toBe(true);
    expect(path![0].to).toEqual(cubeCoord(2, 0));
    expect(path![1].from).toEqual(cubeCoord(2, 0));
    expect(path![1].to).toEqual(target);
  });

  it('returns null when target is unreachable', () => {
    const from = cubeCoord(0, 0);
    state.board.set(coordKey(from), { type: 'piece', player: 0 });
    const target = cubeCoord(4, 0); // 4 cells away, no jump-over pieces
    const path = findMovePath(state, from, target, 0);
    expect(path).toBeNull();
  });

  it('returns null when target is occupied by a piece', () => {
    const from = cubeCoord(0, 0);
    const blocked = cubeCoord(1, 0);
    state.board.set(coordKey(from), { type: 'piece', player: 0 });
    state.board.set(coordKey(blocked), { type: 'piece', player: 1 });
    const path = findMovePath(state, from, blocked, 0);
    expect(path).toBeNull();
  });

  it('returns null when there is no piece at from', () => {
    const from = cubeCoord(0, 0);
    const to = cubeCoord(1, 0);
    // no piece placed
    const path = findMovePath(state, from, to, 0);
    expect(path).toBeNull();
  });

  it('returns null when the piece at from belongs to a different player', () => {
    const from = cubeCoord(0, 0);
    const to = cubeCoord(1, 0);
    state.board.set(coordKey(from), { type: 'piece', player: 1 });
    const path = findMovePath(state, from, to, 0);
    expect(path).toBeNull();
  });
});
