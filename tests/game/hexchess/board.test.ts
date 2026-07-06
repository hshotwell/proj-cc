import { describe, it, expect } from 'vitest';
import { pieceAt, isOnBoard, isEmpty, isEnemy, kingOf, otherPlayer } from '@/game/hexchess/board';
import { createInitialState } from '@/game/hexchess/starting';
import { cubeCoord } from '@/game/coordinates';

const config = {
  id: 't', players: [
    { color: 'red', name: 'A', isAI: false },
    { color: 'blue', name: 'B', isAI: false },
  ] as const, layoutPreset: 'v1-default' as const, soldierVariant: 'soldier' as const, ai: null,
};

describe('board helpers', () => {
  it('otherPlayer swaps 0 and 1', () => {
    expect(otherPlayer(0)).toBe(1);
    expect(otherPlayer(1)).toBe(0);
  });

  it('kingOf finds each king', () => {
    const s = createInitialState(config);
    expect(kingOf(s, 0)?.type).toBe('king');
    expect(kingOf(s, 1)?.type).toBe('king');
    expect(kingOf(s, 0)?.player).toBe(0);
  });

  it('isOnBoard rejects cells far outside the 121-cell star', () => {
    expect(isOnBoard(cubeCoord(0, 0))).toBe(true);
    expect(isOnBoard(cubeCoord(20, 20))).toBe(false);
  });

  it('pieceAt returns piece at occupied cell, null otherwise', () => {
    const s = createInitialState(config);
    const king = kingOf(s, 0)!;
    expect(pieceAt(s, king.cell)?.id).toBe(king.id);
    expect(pieceAt(s, cubeCoord(0, 0))).toBeNull();
  });

  it('isEmpty and isEnemy are complementary at enemy king', () => {
    const s = createInitialState(config);
    const enemyKing = kingOf(s, 1)!;
    expect(isEmpty(s, enemyKing.cell)).toBe(false);
    expect(isEnemy(s, enemyKing.cell, 0)).toBe(true);
    expect(isEnemy(s, enemyKing.cell, 1)).toBe(false);
  });
});
