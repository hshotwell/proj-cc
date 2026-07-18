import { describe, it, expect } from 'vitest';
import { createInitialState } from '@/game/hexchess/starting';
import type { HexChessConfig } from '@/game/hexchess/state';
import type { HexLayoutSnapshot } from '@/game/hexchess/geometry';

function makeConfig(layout: HexLayoutSnapshot, seats: HexChessConfig['seats']): HexChessConfig {
  return {
    id: 'g1', seats,
    players: Object.fromEntries(
      seats.map((s, i) => [s, { color: i === 0 ? '#ffffff' : '#1a1a1a', name: `P${i}`, isAI: false }]),
    ),
    layoutPreset: 'custom', ai: null, layout,
  };
}

const cells: string[] = [];
for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) {
  if (Math.abs(-q - r) <= 4) cells.push(`${q},${r}`);
}

describe('createInitialState from custom layout', () => {
  it('assigns engine type soldier for point-forward and pawn for edge-forward armies', () => {
    const layout: HexLayoutSnapshot = {
      layoutId: 'L', layoutName: 'L', cells, walls: [],
      pieces: {
        // Army 0: promotes to the RIGHT (edge forward) -> pawns
        '-3,0': { player: 0, type: 'king' },
        '-2,0': { player: 0, type: 'pawn' },
        // Army 2: centroid (1,2) -> promo centroid (3,-2): delta (2,-4) is
        // EXACTLY 2 x diagonal (1,-2) -> point forward -> soldiers.
        '0,2': { player: 2, type: 'king' },
        '2,2': { player: 2, type: 'pawn' },
      },
      promotionPositions: { 0: ['4,-2', '4,0'], 2: ['2,-2', '4,-2'] },
      promotionOptions: ['queen', 'rook'],
    };
    const st = createInitialState(makeConfig(layout, [0, 2]));
    const p0 = st.pieces.find(p => p.player === 0 && p.type !== 'king')!;
    const p2 = st.pieces.find(p => p.player === 2 && p.type !== 'king')!;
    expect(p0.type).toBe('pawn');
    expect(p2.type).toBe('soldier');
    expect(st.layout).toBe(layout);
    expect(st.activePlayers).toEqual([0, 2]);
    expect(st.currentPlayer).toBe(0);
  });

  it('produces deterministic piece ids (per-seat, per-type counters over sorted cell keys)', () => {
    const layout: HexLayoutSnapshot = {
      layoutId: 'L', layoutName: 'L', cells, walls: [],
      pieces: {
        '0,3': { player: 0, type: 'king' },
        '1,2': { player: 0, type: 'rook' },
        '-1,3': { player: 0, type: 'rook' },
        '0,-3': { player: 2, type: 'king' },
      },
      promotionPositions: {}, promotionOptions: ['queen'],
    };
    const a = createInitialState(makeConfig(layout, [0, 2]));
    const b = createInitialState(makeConfig(layout, [0, 2]));
    expect(a.pieces.map(p => p.id).sort()).toEqual(b.pieces.map(p => p.id).sort());
    expect(a.pieces.filter(p => p.type === 'rook').map(p => p.id).sort()).toEqual(['0-rook-0', '0-rook-1']);
  });

  it('standard config (no layout) is unchanged', () => {
    const cfg: HexChessConfig = {
      id: 'g2', seats: [0, 2],
      players: { 0: { color: '#fff', name: 'a', isAI: false }, 2: { color: '#000', name: 'b', isAI: false } },
      layoutPreset: 'v1-default', ai: null,
    };
    const st = createInitialState(cfg);
    expect(st.pieces).toHaveLength(26); // 13 per seat in v1
    expect(st.layout).toBeUndefined();
  });
});
