import { describe, it, expect } from 'vitest';
import { pieceAt, isEmpty, isEnemy, kingOf, nextLivingPlayer } from '@/game/hexchess/board';
import { standardGeometry, isOpenCell } from '@/game/hexchess/geometry';
import { createInitialState } from '@/game/hexchess/starting';
import { cubeCoord } from '@/game/coordinates';
import type { HexChessConfig } from '@/game/hexchess/state';

const config: HexChessConfig = {
  id: 't',
  seats: [0, 2],
  players: {
    0: { color: 'red', name: 'A', isAI: false },
    2: { color: 'blue', name: 'B', isAI: false },
  },
  layoutPreset: 'v1-default', soldierVariant: 'soldier', ai: null,
};

describe('board helpers', () => {
  it('nextLivingPlayer swaps the two seats of a 2-player game', () => {
    const s = createInitialState(config);
    expect(nextLivingPlayer(s, 0)).toBe(2);
    expect(nextLivingPlayer(s, 2)).toBe(0);
  });

  it('nextLivingPlayer skips eliminated seats', () => {
    const s = createInitialState({
      ...config,
      seats: [0, 3, 1],
      players: {
        0: { color: 'red', name: 'A', isAI: false },
        3: { color: 'green', name: 'B', isAI: false },
        1: { color: 'blue', name: 'C', isAI: false },
      },
    });
    const withElim = { ...s, eliminated: [3 as const] };
    expect(nextLivingPlayer(withElim, 0)).toBe(1);
    expect(nextLivingPlayer(withElim, 1)).toBe(0);
  });

  it('kingOf finds each king', () => {
    const s = createInitialState(config);
    expect(kingOf(s, 0)?.type).toBe('king');
    expect(kingOf(s, 2)?.type).toBe('king');
    expect(kingOf(s, 0)?.player).toBe(0);
  });

  it('standard geometry rejects cells far outside the 121-cell star', () => {
    expect(isOpenCell(standardGeometry(), cubeCoord(0, 0))).toBe(true);
    expect(isOpenCell(standardGeometry(), cubeCoord(20, 20))).toBe(false);
  });

  it('pieceAt returns piece at occupied cell, null otherwise', () => {
    const s = createInitialState(config);
    const king = kingOf(s, 0)!;
    expect(pieceAt(s, king.cell)?.id).toBe(king.id);
    expect(pieceAt(s, cubeCoord(0, 0))).toBeNull();
  });

  it('isEmpty and isEnemy are complementary at enemy king', () => {
    const s = createInitialState(config);
    const enemyKing = kingOf(s, 2)!;
    expect(isEmpty(s, enemyKing.cell)).toBe(false);
    expect(isEnemy(s, enemyKing.cell, 0)).toBe(true);
    expect(isEnemy(s, enemyKing.cell, 2)).toBe(false);
  });
});
