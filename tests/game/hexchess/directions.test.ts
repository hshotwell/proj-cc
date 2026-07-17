import { describe, it, expect } from 'vitest';
import {
  EDGE_DIRECTIONS,
  DIAGONAL_DIRECTIONS,
  KNIGHT_LEAPS,
  forwardDiagonal,
  forwardEdges,
} from '@/game/hexchess/directions';
import { cubeAdd, cubeEquals } from '@/game/coordinates';

describe('hex directions', () => {
  it('EDGE_DIRECTIONS has 6 unit vectors summing to zero', () => {
    expect(EDGE_DIRECTIONS).toHaveLength(6);
    const sum = EDGE_DIRECTIONS.reduce((a, b) => cubeAdd(a, b), { q: 0, r: 0, s: 0 });
    expect(cubeEquals(sum, { q: 0, r: 0, s: 0 })).toBe(true);
    for (const d of EDGE_DIRECTIONS) {
      expect(Math.max(Math.abs(d.q), Math.abs(d.r), Math.abs(d.s))).toBe(1);
    }
  });

  it('DIAGONAL_DIRECTIONS has 6 corner vectors of magnitude 2', () => {
    expect(DIAGONAL_DIRECTIONS).toHaveLength(6);
    for (const d of DIAGONAL_DIRECTIONS) {
      expect(Math.max(Math.abs(d.q), Math.abs(d.r), Math.abs(d.s))).toBe(2);
    }
  });

  it('KNIGHT_LEAPS has 12 unique cells that are NOT reachable by a queen in one step', () => {
    expect(KNIGHT_LEAPS).toHaveLength(12);
    const queenStep = new Set(
      [...EDGE_DIRECTIONS, ...DIAGONAL_DIRECTIONS].flatMap((d) => {
        const cells: string[] = [];
        for (let k = 1; k <= 10; k++) cells.push(`${d.q * k},${d.r * k}`);
        return cells;
      })
    );
    for (const l of KNIGHT_LEAPS) {
      expect(queenStep.has(`${l.q},${l.r}`)).toBe(false);
    }
  });

  it('forwardDiagonal(0) and forwardDiagonal(2) are opposite', () => {
    const a = forwardDiagonal(0);
    const b = forwardDiagonal(2);
    expect(cubeEquals(a, { q: -b.q, r: -b.r, s: -b.s })).toBe(true);
  });

  it('forwardEdges(0) returns the two edge directions flanking forwardDiagonal(0)', () => {
    const diag = forwardDiagonal(0);
    const edges = forwardEdges(0);
    expect(edges).toHaveLength(2);
    // Each forward edge is one of the two components of the diagonal
    for (const e of edges) {
      const other = { q: diag.q - e.q, r: diag.r - e.r, s: diag.s - e.s };
      expect(EDGE_DIRECTIONS.some((d) => cubeEquals(d, other))).toBe(true);
    }
  });
});
