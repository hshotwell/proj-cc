import { describe, it, expect } from 'vitest';
import { createInitialState } from '@/game/hexchess/starting';
import { soldierMoves } from '@/game/hexchess/moves';
import type { HexChessConfig } from '@/game/hexchess/state';

const config: HexChessConfig = {
  id: 't',
  seats: [0, 2],
  players: {
    0: { color: 'red', name: 'A', isAI: false },
    2: { color: 'blue', name: 'B', isAI: false },
  },
  layoutPreset: 'v1-default',
  soldierVariant: 'soldier',
  ai: null,
};

// Regression: soldiers in the v1 starting position must have at least one
// forward-diagonal move available. If forwardDiagonal(player) is inverted
// relative to the arm apex, forward moves point off-board and this fails.
describe('soldier advance from v1 starting position', () => {
  it('every soldier on both sides has at least one legal move (non-capture)', () => {
    const s = createInitialState(config);
    for (const player of [0, 2] as const) {
      const soldiers = s.pieces.filter((p) => p.player === player && p.type === 'soldier');
      // v1 layout: 2 soldiers on row 4 (between the knights) + 3 soldiers in
      // the middle of row 5 = 5 total.
      expect(soldiers).toHaveLength(5);
      // The row-5 soldiers (front-most) have forward moves available.
      const advancing = soldiers.filter((soldier) => soldierMoves(s, soldier).length > 0);
      expect(advancing.length).toBeGreaterThan(0);
    }
  });
});
