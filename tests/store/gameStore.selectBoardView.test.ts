import { describe, it, expect } from 'vitest';
import { selectBoardView } from '@/store/gameStore';
import { createGame } from '@/game/setup';

describe('selectBoardView (Sternhalma)', () => {
  it('produces a BoardView with all starting marbles as pieces', () => {
    const state = createGame(2);
    const view = selectBoardView(state);
    // 2 players × 10 marbles each = 20 pieces at start
    expect(view.pieces).toHaveLength(20);
    for (const piece of view.pieces) {
      expect(piece.pieceType ?? 'marble').toBe('marble');
    }
    expect(view.homeZones.size).toBeGreaterThan(0);
    expect(view.activePlayerIndex).toBe(state.currentPlayer);
  });
});
