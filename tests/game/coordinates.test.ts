import { describe, it, expect } from 'vitest';
import {
  cubeCoord,
  coordKey,
  parseCoordKey,
  cubeAdd,
  cubeSubtract,
  cubeEquals,
  cubeDistance,
  getNeighbors,
  rotateCube,
  getJumpDestination,
} from '@/game/coordinates';

describe('cubeCoord', () => {
  it('creates valid cube coordinates where q + r + s = 0', () => {
    const coord = cubeCoord(1, 2);
    expect(coord.q).toBe(1);
    expect(coord.r).toBe(2);
    expect(coord.s).toBe(-3);
    expect(coord.q + coord.r + coord.s).toBe(0);
  });
});

describe('coordKey and parseCoordKey', () => {
  it('creates a string key from coordinates', () => {
    const coord = cubeCoord(1, -2);
    expect(coordKey(coord)).toBe('1,-2');
  });

  it('parses a key back to coordinates', () => {
    const parsed = parseCoordKey('3,-1');
    expect(parsed.q).toBe(3);
    expect(parsed.r).toBe(-1);
    expect(parsed.s).toBe(-2);
  });

  it('round-trips correctly', () => {
    const original = cubeCoord(5, -3);
    const key = coordKey(original);
    const parsed = parseCoordKey(key);
    expect(cubeEquals(original, parsed)).toBe(true);
  });
});

describe('cubeAdd and cubeSubtract', () => {
  it('adds coordinates correctly', () => {
    const a = cubeCoord(1, 2);
    const b = cubeCoord(3, -1);
    const result = cubeAdd(a, b);
    expect(result.q).toBe(4);
    expect(result.r).toBe(1);
    expect(result.s).toBe(-5);
  });

  it('subtracts coordinates correctly', () => {
    const a = cubeCoord(5, 2);
    const b = cubeCoord(3, 1);
    const result = cubeSubtract(a, b);
    expect(result.q).toBe(2);
    expect(result.r).toBe(1);
    expect(result.s).toBe(-3);
  });
});

describe('cubeEquals', () => {
  it('returns true for equal coordinates', () => {
    const a = cubeCoord(1, 2);
    const b = cubeCoord(1, 2);
    expect(cubeEquals(a, b)).toBe(true);
  });

  it('returns false for different coordinates', () => {
    const a = cubeCoord(1, 2);
    const b = cubeCoord(1, 3);
    expect(cubeEquals(a, b)).toBe(false);
  });
});

describe('cubeDistance', () => {
  it('returns 0 for same position', () => {
    const a = cubeCoord(1, 2);
    expect(cubeDistance(a, a)).toBe(0);
  });

  it('returns 1 for adjacent positions', () => {
    const a = cubeCoord(0, 0);
    const neighbors = getNeighbors(a);
    for (const neighbor of neighbors) {
      expect(cubeDistance(a, neighbor)).toBe(1);
    }
  });

  it('calculates distance correctly', () => {
    const a = cubeCoord(0, 0);
    const b = cubeCoord(3, -2);
    expect(cubeDistance(a, b)).toBe(3);
  });
});

describe('getNeighbors', () => {
  it('returns exactly 6 neighbors', () => {
    const neighbors = getNeighbors(cubeCoord(0, 0));
    expect(neighbors.length).toBe(6);
  });

  it('all neighbors are distance 1 away', () => {
    const center = cubeCoord(0, 0);
    const neighbors = getNeighbors(center);
    for (const neighbor of neighbors) {
      expect(cubeDistance(center, neighbor)).toBe(1);
    }
  });

  it('neighbors are all unique', () => {
    const neighbors = getNeighbors(cubeCoord(0, 0));
    const keys = neighbors.map(coordKey);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(6);
  });
});

describe('rotateCube', () => {
  it('rotation by 0 returns same coordinate', () => {
    const coord = cubeCoord(1, 2);
    const rotated = rotateCube(coord, 0);
    expect(cubeEquals(coord, rotated)).toBe(true);
  });

  it('rotation by 6 returns same coordinate (full circle)', () => {
    const coord = cubeCoord(1, 2);
    const rotated = rotateCube(coord, 6);
    expect(cubeEquals(coord, rotated)).toBe(true);
  });

  it('preserves distance from origin', () => {
    const origin = cubeCoord(0, 0);
    const coord = cubeCoord(3, -1);
    const distance = cubeDistance(origin, coord);

    for (let steps = 0; steps < 6; steps++) {
      const rotated = rotateCube(coord, steps);
      expect(cubeDistance(origin, rotated)).toBe(distance);
    }
  });
});

describe('getJumpDestination', () => {
  it('calculates jump landing position correctly', () => {
    const from = cubeCoord(0, 0);
    const over = cubeCoord(1, 0);
    const landing = getJumpDestination(from, over);

    // Should land 2 steps away from origin in same direction
    expect(landing.q).toBe(2);
    expect(landing.r).toBe(0);
    expect(cubeDistance(from, landing)).toBe(2);
  });

  it('works in all directions', () => {
    const from = cubeCoord(0, 0);
    const neighbors = getNeighbors(from);

    for (const over of neighbors) {
      const landing = getJumpDestination(from, over);
      // Landing should be 2 away from origin
      expect(cubeDistance(from, landing)).toBe(2);
      // Over should be exactly between from and landing
      expect(cubeDistance(from, over)).toBe(1);
      expect(cubeDistance(over, landing)).toBe(1);
    }
  });
});
