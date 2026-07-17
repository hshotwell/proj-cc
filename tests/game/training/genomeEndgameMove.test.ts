import { describe, it, expect } from 'vitest';
import { findGenomeEndgameMove } from '@/game/training/endgameRunner';
import { DEFAULT_GENOME } from '@/game/training/evaluate';
import { createGame } from '@/game/setup';
import { applyMove } from '@/game/state';
import { getAllValidMoves } from '@/game/moves';
import { getGoalPositionsForState } from '@/game/state';
import { coordKey, cubeDistance, centroid } from '@/game/coordinates';
import type { GameState, PlayerIndex } from '@/types/game';

/**
 * Build a 2-player state where player 0 is deep in the endgame: 8 pieces
 * already in the goal, 2 just outside. Opponent pieces stay in their start
 * triangle (out of interaction range).
 */
function lateEndgameState(): GameState {
  const state = createGame(2);
  const player: PlayerIndex = 0;
  const goals = getGoalPositionsForState(state, player);

  // Teleport 8 of player 0's pieces into the deepest goal cells and the
  // remaining 2 to cells just outside the goal.
  const pieces = [...state.board.entries()]
    .filter(([, c]) => c.type === 'piece' && c.player === player)
    .map(([k]) => k);
  const goalKeys = goals.map(coordKey);

  const board = new Map(state.board);
  for (const k of pieces) board.set(k, { type: 'empty' });
  for (let i = 0; i < 8; i++) board.set(goalKeys[i], { type: 'piece', player });
  // Two cells near the goal edge: pick empty non-goal cells closest to goal centroid.
  const goalCenter = centroid(goals);
  const nearCells = [...board.entries()]
    .filter(([k, c]) => c.type === 'empty' && !goalKeys.includes(k))
    .map(([k]) => k)
    .sort((a, b) => {
      const pa = a.split(',').map(Number);
      const pb = b.split(',').map(Number);
      const ca = { q: pa[0], r: pa[1], s: -pa[0] - pa[1] };
      const cb = { q: pb[0], r: pb[1], s: -pb[0] - pb[1] };
      return cubeDistance(ca, goalCenter) - cubeDistance(cb, goalCenter);
    });
  board.set(nearCells[0], { type: 'piece', player });
  board.set(nearCells[1], { type: 'piece', player });

  return { ...state, board, currentPlayer: player };
}

describe('findGenomeEndgameMove (real-game bridge)', () => {
  it('returns a valid move for the player in a late-endgame position', () => {
    const state = lateEndgameState();
    const move = findGenomeEndgameMove(state, 0, DEFAULT_GENOME);
    expect(move).not.toBeNull();
    const valid = getAllValidMoves(state, 0);
    expect(valid.some(m =>
      coordKey(m.from) === coordKey(move!.from) && coordKey(m.to) === coordKey(move!.to)
    )).toBe(true);
    // The chosen move must belong to player 0's pieces.
    expect(state.board.get(coordKey(move!.from))).toEqual({ type: 'piece', player: 0 });
  });

  it('finishes the race: repeated genome moves fill the goal', () => {
    let state = lateEndgameState();
    const goals = new Set(getGoalPositionsForState(state, 0).map(coordKey));
    for (let turn = 0; turn < 12; turn++) {
      const inGoal = [...state.board.entries()]
        .filter(([k, c]) => c.type === 'piece' && c.player === 0 && goals.has(k)).length;
      if (inGoal === 10) break;
      const move = findGenomeEndgameMove(state, 0, DEFAULT_GENOME);
      expect(move).not.toBeNull();
      state = { ...applyMove(state, move!), currentPlayer: 0 };
    }
    const finalInGoal = [...state.board.entries()]
      .filter(([k, c]) => c.type === 'piece' && c.player === 0 && goals.has(k)).length;
    expect(finalInGoal).toBe(10);
  });
});
