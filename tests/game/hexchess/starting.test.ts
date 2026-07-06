import { describe, it, expect } from 'vitest';
import { createInitialState, armCellsForPlayer } from '@/game/hexchess/starting';
import type { HexChessConfig } from '@/game/hexchess/state';

const config: HexChessConfig = {
  id: 'test',
  players: [
    { color: 'red', name: 'P1', isAI: false },
    { color: 'blue', name: 'P2', isAI: false },
  ],
  layoutPreset: 'v1-default',
  soldierVariant: 'soldier',
  ai: null,
};

describe('createInitialState', () => {
  it('places 10 pieces per side, 20 total', () => {
    const s = createInitialState(config);
    expect(s.pieces.filter((p) => p.player === 0)).toHaveLength(10);
    expect(s.pieces.filter((p) => p.player === 1)).toHaveLength(10);
  });

  it('correct roster: 1K, 1Q, 2R, 2B, 4 Soldiers per side', () => {
    const s = createInitialState(config);
    for (const player of [0, 1] as const) {
      const mine = s.pieces.filter((p) => p.player === player);
      const counts = mine.reduce<Record<string, number>>((acc, p) => {
        acc[p.type] = (acc[p.type] ?? 0) + 1;
        return acc;
      }, {});
      expect(counts).toEqual({ king: 1, queen: 1, rook: 2, bishop: 2, soldier: 4 });
    }
  });

  it('king starts on the apex of the arm', () => {
    const s = createInitialState(config);
    for (const player of [0, 1] as const) {
      const king = s.pieces.find((p) => p.player === player && p.type === 'king')!;
      expect(king.cell).toEqual(armCellsForPlayer(player)[0]); // apex is index 0
    }
  });

  it('4 soldiers on the front (base) row of the arm', () => {
    const s = createInitialState(config);
    for (const player of [0, 1] as const) {
      const soldiers = s.pieces.filter((p) => p.player === player && p.type === 'soldier');
      const baseRow = armCellsForPlayer(player).slice(6, 10); // last 4 cells = base row
      expect(soldiers.map((p) => p.cell).sort(cellCompare)).toEqual(baseRow.sort(cellCompare));
    }
  });

  it('starts with player 0, turn 1, no pending promotion, no ep target', () => {
    const s = createInitialState(config);
    expect(s.currentPlayer).toBe(0);
    expect(s.turnNumber).toBe(1);
    expect(s.enPassantTarget).toBeNull();
    expect(s.pendingPromotion).toBeNull();
    expect(s.result).toBeNull();
    expect(s.moveHistory).toEqual([]);
  });
});

function cellCompare(a: { q: number; r: number }, b: { q: number; r: number }) {
  return a.q - b.q || a.r - b.r;
}
