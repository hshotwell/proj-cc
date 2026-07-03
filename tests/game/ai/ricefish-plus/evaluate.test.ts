import { describe, it, expect } from 'vitest';
import { createGame } from '@/game/setup';
import { getGoalPositionsForState } from '@/game/state';
import type { GameState, PlayerIndex } from '@/types/game';
import {
  computePhaseAlpha,
  createHybridScore,
  DEFAULT_NORM,
  RICEFISH_NORM,
  ALPHA_ENDGAME_THRESHOLD,
} from '@/game/ai/ricefish-plus/evaluate';
import { ricefishScore, MATE } from '@/game/ai/ricefish/evaluate';
import { evaluatePosition } from '@/game/ai/evaluate';

function freshGame(activePlayers: PlayerIndex[] = [0, 2]): GameState {
  return createGame(2, activePlayers);
}

/** Fill exactly `count` of `player`'s goal cells with `player`'s pieces,
 *  clearing whatever else was there. Leaves the rest of the board untouched.
 *  Returns a new state. */
function withGoalFill(state: GameState, player: PlayerIndex, count: number): GameState {
  const board = new Map(state.board);
  const goals = getGoalPositionsForState(state, player);
  // Clear all pieces of this player anywhere on the board first.
  for (const [k, v] of board) {
    if (v.type === 'piece' && v.player === player) board.set(k, { type: 'empty' });
  }
  for (let i = 0; i < count && i < goals.length; i++) {
    const g = goals[i];
    board.set(`${g.q},${g.r}`, { type: 'piece', player });
  }
  return { ...state, board };
}

describe('computePhaseAlpha', () => {
  it('is 0 at the starting position (nobody home)', () => {
    const state = freshGame();
    expect(computePhaseAlpha(state)).toBe(0);
  });

  it('reaches 1 when the leading player has filled the threshold fraction of goals', () => {
    const state = freshGame();
    const goalCount = getGoalPositionsForState(state, 0).length;
    const needed = Math.ceil(ALPHA_ENDGAME_THRESHOLD * goalCount);
    const filled = withGoalFill(state, 0, needed);
    expect(computePhaseAlpha(filled)).toBe(1);
  });

  it('is between 0 and 1 in the midgame', () => {
    const state = freshGame();
    const goalCount = getGoalPositionsForState(state, 0).length;
    const half = Math.floor(goalCount / 2);
    const filled = withGoalFill(state, 0, half);
    const alpha = computePhaseAlpha(filled);
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(1);
  });

  it('takes the max across active players', () => {
    const state = freshGame();
    const goalCount = getGoalPositionsForState(state, 0).length;
    // Fill player 2's goals to threshold; player 0 has zero. Alpha should
    // still be 1 because we take max across players.
    const needed = Math.ceil(ALPHA_ENDGAME_THRESHOLD * goalCount);
    const filled = withGoalFill(state, 2, needed);
    expect(computePhaseAlpha(filled)).toBe(1);
  });
});

describe('createHybridScore', () => {
  it('returns +MATE when the player has won', () => {
    const state = freshGame();
    const goalCount = getGoalPositionsForState(state, 0).length;
    const won = withGoalFill(state, 0, goalCount);
    const score = createHybridScore('hard');
    expect(score(won, 0, 'generalist')).toBe(MATE);
  });

  it('equals normalized default-AI eval when alpha = 0', () => {
    const state = freshGame();
    // Starting position: alpha = 0. Hybrid should equal defaultTerm.
    const score = createHybridScore('hard');
    const expected = evaluatePosition(state, 0, 'generalist', 'hard') / DEFAULT_NORM;
    expect(score(state, 0, 'generalist')).toBeCloseTo(expected, 6);
  });

  it('equals normalized Ricefish eval when alpha = 1', () => {
    const state = freshGame();
    const goalCount = getGoalPositionsForState(state, 0).length;
    const needed = Math.ceil(ALPHA_ENDGAME_THRESHOLD * goalCount);
    const filled = withGoalFill(state, 0, needed);
    // alpha = 1 → hybrid should equal ricefishTerm alone. But player 0 has
    // won some pieces in that setup — need to pick a player who hasn't won.
    // Player 2 hasn't advanced, so evaluate from player 2's POV.
    const score = createHybridScore('hard');
    const expected = ricefishScore(filled, 2, 'generalist') / RICEFISH_NORM;
    expect(score(filled, 2, 'generalist')).toBeCloseTo(expected, 6);
  });

  it('is a valid number (not NaN) at every phase for both players', () => {
    const state = freshGame();
    const score = createHybridScore('hard');
    for (let fill = 0; fill <= 6; fill++) {
      const s = withGoalFill(state, 0, fill);
      const v0 = score(s, 0, 'generalist');
      const v2 = score(s, 2, 'generalist');
      expect(Number.isFinite(v0)).toBe(true);
      expect(Number.isFinite(v2)).toBe(true);
    }
  });
});
