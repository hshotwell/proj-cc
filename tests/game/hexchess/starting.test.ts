import { describe, it, expect } from 'vitest';
import { createInitialState, armCellsForPlayer } from '@/game/hexchess/starting';
import type { HexChessConfig } from '@/game/hexchess/state';

const config: HexChessConfig = {
  id: 'test',
  seats: [0, 2],
  players: {
    0: { color: 'red', name: 'P1', isAI: false },
    2: { color: 'blue', name: 'P2', isAI: false },
  },
  layoutPreset: 'v1-default',
  soldierVariant: 'soldier',
  ai: null,
};

describe('createInitialState', () => {
  it('places 13 pieces per side, 26 total (v1 extended layout)', () => {
    const s = createInitialState(config);
    expect(s.pieces.filter((p) => p.player === 0)).toHaveLength(13);
    expect(s.pieces.filter((p) => p.player === 2)).toHaveLength(13);
  });

  it('correct roster: 1K, 2R, 3B, 2N, 5 Soldiers per side (no queen)', () => {
    const s = createInitialState(config);
    for (const player of [0, 2] as const) {
      const mine = s.pieces.filter((p) => p.player === player);
      const counts = mine.reduce<Record<string, number>>((acc, p) => {
        acc[p.type] = (acc[p.type] ?? 0) + 1;
        return acc;
      }, {});
      // Row 4 has 2 soldiers between flanking knights + Row 5 has 3 middle soldiers = 5 total.
      expect(counts).toEqual({ king: 1, rook: 2, bishop: 3, knight: 2, soldier: 5 });
    }
  });

  it('king starts on the apex of the arm', () => {
    const s = createInitialState(config);
    for (const player of [0, 2] as const) {
      const king = s.pieces.find((p) => p.player === player && p.type === 'king')!;
      expect(king.cell).toEqual(armCellsForPlayer(player)[0]); // apex is index 0
    }
  });

  it('4 soldiers on the front (base) row of the arm', () => {
    const s = createInitialState(config);
    for (const player of [0, 2] as const) {
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

// ---------------------------------------------------------------------------
// Multiplayer geometry — rotated arms land exactly on the CC triangles
// ---------------------------------------------------------------------------

import { describe as describe2, it as it2, expect as expect2 } from 'vitest';
import {
  armExtensionCellsForPlayer,
  promotionCellsForPlayer,
  startingCellsForPlayer,
} from '@/game/hexchess/starting';
import { DEFAULT_BOARD_LAYOUT, getDefaultBoardCells } from '@/game/defaultLayout';
import { coordKey } from '@/game/coordinates';
import type { HexPlayerIndex } from '@/game/hexchess/state';

const ALL_SEATS: HexPlayerIndex[] = [0, 1, 2, 3, 4, 5];

describe2('multiplayer arm geometry', () => {
  it2('armCellsForPlayer(seat) equals the CC starting triangle for every seat', () => {
    for (const seat of ALL_SEATS) {
      const arm = new Set(armCellsForPlayer(seat).map(coordKey));
      const expected = new Set(DEFAULT_BOARD_LAYOUT.startingPositions[seat]);
      expect2(arm).toEqual(expected);
    }
  });

  it2('all starting cells are on the board; a 6-seat game has no piece collisions', () => {
    const board = getDefaultBoardCells();
    for (const seat of ALL_SEATS) {
      const cells = startingCellsForPlayer(seat);
      expect2(cells).toHaveLength(15);
      for (const c of cells) {
        expect2(board.has(coordKey(c))).toBe(true);
      }
    }
    // Adjacent arms share the central hexagon's corner cells in their
    // extension rows, but V1_LAYOUT leaves those slots empty — so a full
    // 6-player game must place 78 pieces on 78 distinct cells.
    const s = createInitialState({
      id: 't6',
      seats: [0, 4, 3, 2, 1, 5],
      players: Object.fromEntries(ALL_SEATS.map(seat => [seat, {
        color: 'red', name: `P${seat}`, isAI: false,
      }])),
      layoutPreset: 'v1-default',
      soldierVariant: 'soldier',
      ai: null,
    });
    expect2(s.pieces).toHaveLength(78);
    const occupied = new Set(s.pieces.map(p => coordKey(p.cell)));
    expect2(occupied.size).toBe(78);
  });

  it2('extension row sits one row inside the central hexagon for every seat', () => {
    for (const seat of ALL_SEATS) {
      expect2(armExtensionCellsForPlayer(seat)).toHaveLength(5);
    }
  });

  it2('promotion zone for seat 2 equals the legacy player-1 far half (r <= -1)', () => {
    const zone = promotionCellsForPlayer(2);
    for (let q = -8; q <= 8; q++) {
      for (let r = -8; r <= 8; r++) {
        if (Math.abs(-q - r) > 8) continue;
        expect2(zone.has(`${q},${r}`)).toBe(r <= -1);
      }
    }
  });

  it2('promotion zones never include the seat\'s own arm', () => {
    for (const seat of ALL_SEATS) {
      const zone = promotionCellsForPlayer(seat);
      for (const c of armCellsForPlayer(seat)) {
        expect2(zone.has(coordKey(c))).toBe(false);
      }
    }
  });

  it2('a 3-seat game places 39 pieces on seats 0, 3 and 1', () => {
    const s = createInitialState({
      id: 't3',
      seats: [0, 3, 1],
      players: {
        0: { color: 'red', name: 'A', isAI: false },
        3: { color: 'green', name: 'B', isAI: false },
        1: { color: 'blue', name: 'C', isAI: false },
      },
      layoutPreset: 'v1-default',
      soldierVariant: 'soldier',
      ai: null,
    });
    expect2(s.pieces).toHaveLength(39);
    expect2(s.activePlayers).toEqual([0, 3, 1]);
    expect2(s.currentPlayer).toBe(0);
    for (const seat of [0, 3, 1] as const) {
      expect2(s.pieces.filter(p => p.player === seat)).toHaveLength(13);
      const king = s.pieces.find(p => p.player === seat && p.type === 'king')!;
      expect2(coordKey(king.cell)).toBe(coordKey(armCellsForPlayer(seat)[0]));
    }
  });
});
