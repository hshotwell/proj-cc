import { describe, it, expect } from 'vitest';
import { generateBoardPositions, getTrianglePositions, getTriangleForPosition } from '@/game/board';
import { coordKey, cubeCoord } from '@/game/coordinates';
import type { TriangleIndex } from '@/types/game';

describe('Board Generation', () => {
  it('generates exactly 121 board positions', () => {
    const positions = generateBoardPositions();
    expect(positions.length).toBe(121);
  });

  it('generates unique positions', () => {
    const positions = generateBoardPositions();
    const keys = positions.map(coordKey);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(121);
  });

  it('includes the origin (center) position', () => {
    const positions = generateBoardPositions();
    const hasOrigin = positions.some((p) => p.q === 0 && p.r === 0 && p.s === 0);
    expect(hasOrigin).toBe(true);
  });
});

describe('Triangle Positions', () => {
  it('generates exactly 10 positions per triangle', () => {
    for (let i = 0; i < 6; i++) {
      const positions = getTrianglePositions(i as TriangleIndex);
      expect(positions.length).toBe(10);
    }
  });

  it('generates unique positions within each triangle', () => {
    for (let i = 0; i < 6; i++) {
      const positions = getTrianglePositions(i as TriangleIndex);
      const keys = positions.map(coordKey);
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(10);
    }
  });

  it('triangles do not overlap', () => {
    const allTrianglePositions = new Set<string>();

    for (let i = 0; i < 6; i++) {
      const positions = getTrianglePositions(i as TriangleIndex);
      for (const pos of positions) {
        const key = coordKey(pos);
        expect(allTrianglePositions.has(key)).toBe(false);
        allTrianglePositions.add(key);
      }
    }

    // Total unique positions across all triangles should be 60
    expect(allTrianglePositions.size).toBe(60);
  });
});

describe('getTriangleForPosition', () => {
  it('returns correct triangle index for triangle positions', () => {
    for (let i = 0; i < 6; i++) {
      const positions = getTrianglePositions(i as TriangleIndex);
      for (const pos of positions) {
        expect(getTriangleForPosition(pos)).toBe(i);
      }
    }
  });

  it('returns null for center positions', () => {
    // Origin should be in center
    expect(getTriangleForPosition(cubeCoord(0, 0))).toBe(null);

    // Some other center positions
    expect(getTriangleForPosition(cubeCoord(1, 0))).toBe(null);
    expect(getTriangleForPosition(cubeCoord(-1, 1))).toBe(null);
  });
});
