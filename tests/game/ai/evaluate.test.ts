import { describe, it, expect } from 'vitest';
import { createGame } from '@/game/setup';
import { evaluatePosition } from '@/game/ai/evaluate';
import type { CellContent, GameState } from '@/types/game';

describe('evaluatePosition late-endgame obstruction', () => {
  const P0_HOME: Array<[number, number]> = [
    [4, -8], [3, -7], [4, -7], [2, -6], [3, -6], [4, -6],
    [1, -5], [2, -5], [3, -5], [4, -5],
  ];

  function clearAllP0AndP2(board: Map<string, CellContent>) {
    for (const [k, v] of board) {
      if (v.type === 'piece' && (v.player === 0 || v.player === 2)) {
        board.set(k, { type: 'empty' });
      }
    }
  }

  it('penalizes an opponent piece sitting on an unfilled goal cell at inGoal=9', () => {
    const base = createGame(2, [0, 2]);
    const board = new Map(base.board);
    clearAllP0AndP2(board);
    // 9 P2 in goal (skip (4,-5)); 1 outside P2 adjacent to (4,-5).
    for (const [q, r] of P0_HOME) {
      if (q === 4 && r === -5) continue;
      board.set(`${q},${r}`, { type: 'piece', player: 2 });
    }
    board.set('4,-4', { type: 'piece', player: 2 });
    const noBlocker: GameState = { ...base, board: new Map(board) };

    const obsBoard = new Map(board);
    obsBoard.set('4,-5', { type: 'piece', player: 0 });
    const withBlocker: GameState = { ...base, board: obsBoard };

    const scoreEmpty = evaluatePosition(noBlocker, 2, 'generalist', 'hard');
    const scoreObstructed = evaluatePosition(withBlocker, 2, 'generalist', 'hard');
    expect(scoreObstructed).toBeLessThan(scoreEmpty);
  });
});
