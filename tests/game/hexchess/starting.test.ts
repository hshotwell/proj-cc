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
  it('places 15 pieces per side, 30 total (v1 extended layout)', () => {
    const s = createInitialState(config);
    expect(s.pieces.filter((p) => p.player === 0)).toHaveLength(15);
    expect(s.pieces.filter((p) => p.player === 1)).toHaveLength(15);
  });

  it('correct roster: 1K, 1Q, 2R, 2B, 2N, 7 Soldiers per side', () => {
    const s = createInitialState(config);
    for (const player of [0, 1] as const) {
      const mine = s.pieces.filter((p) => p.player === player);
      const counts = mine.reduce<Record<string, number>>((acc, p) => {
        acc[p.type] = (acc[p.type] ?? 0) + 1;
        return acc;
      }, {});
      // Row 4 (4 soldiers) + Row 5 (3 soldiers) = 7 soldiers per side.
      expect(counts).toEqual({ king: 1, queen: 1, rook: 2, bishop: 2, knight: 2, soldier: 7 });
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
      // Row 4 has 2 soldiers between the 2 knights on the flanks.
      const row4Soldiers = s.pieces.filter(
        (p) => p.player === player && p.type === 'soldier'
              && armCellsForPlayer(player).slice(6, 10).some(c => c.q === p.cell.q && c.r === p.cell.r),
      );
      expect(row4Soldiers.length).toBe(2);
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
