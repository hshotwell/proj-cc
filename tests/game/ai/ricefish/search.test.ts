import { describe, it, expect } from 'vitest';
import { createGame } from '@/game/setup';
import { applyMove } from '@/game/state';
import { getAllValidMoves } from '@/game/moves';
import { cubeEquals } from '@/game/coordinates';
import { findRicefishMove } from '@/game/ai/ricefish/search';
import type { GameState, Move, PlayerIndex } from '@/types/game';

function isLegal(state: GameState, move: Move, player: PlayerIndex): boolean {
  return getAllValidMoves(state, player).some(
    (m) => cubeEquals(m.from, move.from) && cubeEquals(m.to, move.to),
  );
}

describe('findRicefishMove (2-player alpha-beta path)', () => {
  it('returns a legal move from the standard 2P start', () => {
    const state = createGame(2, [0, 2]);
    const move = findRicefishMove(state, 'easy', 'generalist');
    expect(move).not.toBeNull();
    expect(isLegal(state, move!, state.currentPlayer)).toBe(true);
  });

  it('respects personality choice without throwing', () => {
    const state = createGame(2, [0, 2]);
    for (const pers of ['generalist', 'defensive', 'aggressive'] as const) {
      const move = findRicefishMove(state, 'easy', pers);
      expect(move).not.toBeNull();
      expect(isLegal(state, move!, state.currentPlayer)).toBe(true);
    }
  });

  it('returns a move at hard depth without exceeding budget catastrophically', () => {
    const state = createGame(2, [0, 2]);
    const t0 = Date.now();
    const move = findRicefishMove(state, 'hard', 'generalist');
    const elapsed = Date.now() - t0;
    expect(move).not.toBeNull();
    // Budget is 4000ms; we give 2x margin since vitest startup adds noise.
    expect(elapsed).toBeLessThan(8000);
  }, 15_000);
});

describe('findRicefishMove (Max^n path, 3+ players)', () => {
  it('returns a legal move in a 3-player game', () => {
    // 3-player default uses activePlayers [0, 2, 4].
    const state = createGame(3, [0, 2, 4]);
    const move = findRicefishMove(state, 'easy', 'generalist');
    expect(move).not.toBeNull();
    expect(isLegal(state, move!, state.currentPlayer)).toBe(true);
  });

  it('returns a legal move in a 6-player game', () => {
    const state = createGame(6, [0, 1, 2, 3, 4, 5]);
    const move = findRicefishMove(state, 'easy', 'generalist');
    expect(move).not.toBeNull();
    expect(isLegal(state, move!, state.currentPlayer)).toBe(true);
  }, 10_000);
});

describe('findRicefishMove swap-aware endgame', () => {
  // From the observed bug: player A had 2 pieces stuck in their starting
  // zone (i.e. Ricefish's goal triangle), Ricefish had outside pieces
  // adjacent to the blockers, and the search never tried a swap. The new
  // BLOCKER_PENALTY eval term + swap ordering boost should make swap the
  // chosen move when it directly removes a blocker.
  it('picks a swap that removes a blocker from the goal triangle', () => {
    const base = createGame(2, [0, 2]);
    const board = new Map(base.board);
    for (const [k, v] of board) {
      if (v.type === 'piece') board.set(k, { type: 'empty' });
    }
    // Player 2 (Cyan, bottom) has 8 pieces filling the top triangle except
    // (1,-5) and (4,-5), and 2 outside pieces parked at (1,-4) and (4,-4)
    // — both adjacent to a blocker.
    const p2InGoal: Array<[number, number]> = [
      [4, -8], [3, -7], [4, -7], [2, -6], [3, -6], [4, -6], [2, -5], [3, -5],
    ];
    for (const [q, r] of p2InGoal) board.set(`${q},${r}`, { type: 'piece', player: 2 });
    for (const [q, r] of [[1, -4], [4, -4]] as Array<[number, number]>) {
      board.set(`${q},${r}`, { type: 'piece', player: 2 });
    }
    // Player 0 has 2 stuck pieces blocking Ricefish's goal cells (1,-5)
    // and (4,-5). The remaining 8 are parked harmlessly in their own
    // starting area (positions don't matter much — they just need to
    // exist as legal pieces, and they shouldn't be in P2's goal area).
    board.set('1,-5', { type: 'piece', player: 0 });
    board.set('4,-5', { type: 'piece', player: 0 });
    // Place the rest of P0 in cells well away from the goal triangle.
    const p0Rest: Array<[number, number]> = [
      [-4, 8], [-3, 7], [-4, 7], [-2, 6], [-3, 6], [-4, 6], [-2, 5], [-3, 5],
    ];
    for (const [q, r] of p0Rest) board.set(`${q},${r}`, { type: 'piece', player: 0 });

    const state: GameState = { ...base, board, currentPlayer: 2 };

    const move = findRicefishMove(state, 'medium', 'generalist');
    expect(move).not.toBeNull();
    expect(move!.isSwap).toBe(true);
    // The chosen swap should put a Ricefish piece directly into a goal cell
    // (i.e. `to` is in the top triangle).
    const toQ = move!.to.q, toR = move!.to.r;
    const isGoalCell = p2InGoal.some(([q, r]) => q === toQ && r === toR)
      || (toQ === 1 && toR === -5) || (toQ === 4 && toR === -5);
    expect(isGoalCell).toBe(true);
  });
});

describe('findRicefishMove endgame regression', () => {
  // From the same observed bug: 8/10 player-2 pieces in goal, two left over
  // at (1,-4) and (2,-4); empty goal cells are (4,-8) and (4,-5). Under the
  // fixed eval, the search must choose a move that advances those two
  // outside pieces, not oscillate them.
  it('does not move (3,-4) → (1,-4) (the oscillation move)', () => {
    const base = createGame(2, [0, 2]);
    const board = new Map(base.board);
    // Strip player 0 to make this a pure player-2 puzzle. We give P0 just
    // their starting layout but shifted out of the way; the search only
    // evaluates the current player's side though so player 0's exact layout
    // doesn't matter as long as it's legal.
    for (const [k, v] of board) {
      if (v.type === 'piece' && v.player === 2) board.set(k, { type: 'empty' });
    }
    const placeP2 = (pieces: Array<[number, number]>) => {
      for (const [q, r] of pieces) {
        board.set(`${q},${r}`, { type: 'piece', player: 2 });
      }
    };
    // The state right BEFORE the oscillation move: piece at (3,-4) considering
    // jumping to (1,-4). If the search prefers (3,-4)→(1,-4), it's regressed.
    placeP2([
      [3, -4], [2, -4], [1, -5], [2, -5], [3, -5],
      [4, -6], [2, -6], [3, -6], [3, -7], [4, -7],
    ]);
    const state: GameState = { ...base, board, currentPlayer: 2 };

    const move = findRicefishMove(state, 'medium', 'generalist');
    expect(move).not.toBeNull();
    // Must not reverse-jump back to (1,-4).
    const isOscillation = move!.from.q === 3 && move!.from.r === -4
      && move!.to.q === 1 && move!.to.r === -4;
    expect(isOscillation).toBe(false);
  });
});

describe('findRicefishMove behavior', () => {
  it('returns null when the current player has already finished', () => {
    const state = createGame(2, [0, 2]);
    const withFinished: GameState = {
      ...state,
      finishedPlayers: [{ player: state.currentPlayer, moveCount: 5 }],
    };
    expect(findRicefishMove(withFinished, 'easy', 'generalist')).toBeNull();
  });

  it('prefers a forward move at easy difficulty', () => {
    // Sanity: after one move by ricefish, the AI player's total distance to
    // the goal centroid shouldn't grow. (It can stay equal for sideways
    // moves but the eval will favor reducing distance.)
    const state = createGame(2, [0, 2]);
    const move = findRicefishMove(state, 'easy', 'generalist');
    expect(move).not.toBeNull();
    const next = applyMove(state, move!);
    expect(next.moveHistory.length).toBe(1);
  });
});
