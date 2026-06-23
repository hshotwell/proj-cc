// tests/game/ai/corridors.test.ts
import { describe, test, expect, beforeEach } from 'vitest';
import { getApproachLaneMap, clearApproachLaneCache } from '@/game/ai/corridors';
import { getGoalPositions } from '@/game/state';

describe('getApproachLaneMap', () => {
  beforeEach(() => clearApproachLaneCache());

  test('caches result: second call returns same reference', () => {
    const goals = getGoalPositions(0);
    const a = getApproachLaneMap(0, goals);
    const b = getApproachLaneMap(0, goals);
    expect(a).toBe(b);
  });

  test('clearApproachLaneCache forces recomputation', () => {
    const goals = getGoalPositions(0);
    const a = getApproachLaneMap(0, goals);
    clearApproachLaneCache();
    const b = getApproachLaneMap(0, goals);
    expect(a).not.toBe(b);
  });

  test('P0: (0,4) is on-lane at 1 hop', () => {
    // P0 goal includes '-2,6'. From (0,4) in direction (-1,1,0)×2 = (-2,6)[goal].
    // So (0,4) is at hops=1 from goal (-2,6).
    const goals = getGoalPositions(0);
    const laneMap = getApproachLaneMap(0, goals);
    expect(laneMap.get('0,4')).toBe(1);
  });

  test('P0: (2,2) is on-lane at ≤2 hops', () => {
    const goals = getGoalPositions(0);
    const laneMap = getApproachLaneMap(0, goals);
    const hops = laneMap.get('2,2');
    expect(hops).toBeDefined();
    expect(hops!).toBeLessThanOrEqual(2);
  });

  test('lane map is non-empty and reasonably sized', () => {
    const goals = getGoalPositions(0);
    const laneMap = getApproachLaneMap(0, goals);
    expect(laneMap.size).toBeGreaterThan(20);
    expect(laneMap.size).toBeLessThan(300);
  });

  test('P0 and P2 produce different lane maps', () => {
    const g0 = getGoalPositions(0);
    const g2 = getGoalPositions(2);
    const map0 = getApproachLaneMap(0, g0);
    const map2 = getApproachLaneMap(2, g2);
    expect(map0).not.toStrictEqual(map2);
  });
});
