import { describe, it, expect } from 'vitest';
import { cubeCoord, coordKey, cubeEquals } from '@/game/coordinates';
import {
  deriveForward, buildGeometry, standardGeometry, isOpenCell,
  type HexLayoutSnapshot,
} from '@/game/hexchess/geometry';
import { forwardDiagonal, forwardEdges } from '@/game/hexchess/directions';
import { promotionCellsForPlayer, startingCellsForPlayer } from '@/game/hexchess/starting';
import type { HexPlayerIndex } from '@/game/hexchess/state';

function snap(partial: Partial<HexLayoutSnapshot>): HexLayoutSnapshot {
  return {
    layoutId: 'test', layoutName: 'Test',
    cells: [], walls: [], pieces: {},
    promotionPositions: {}, promotionOptions: ['knight', 'bishop', 'rook', 'queen'],
    ...partial,
  };
}

describe('deriveForward', () => {
  it('snaps an exactly-vertical vector to the straight-up diagonal (point)', () => {
    // (2,-2) - (0,2) = (2,-4) = 2 x (1,-2): exactly along the straight-up
    // diagonal in pixel space — a point forward. (Note: (0,-3)-(0,3) would be
    // the EDGE (0,-1), not a diagonal — cube axes are not pixel-vertical.)
    const fwd = deriveForward([cubeCoord(0, 2)], [cubeCoord(2, -2)]);
    expect(fwd).not.toBeNull();
    expect(fwd!.kind).toBe('point');
    // Straight up in pixel space is the diagonal (1,-2)
    expect(cubeEquals(fwd!.dir, cubeCoord(1, -2))).toBe(true);
    // capture dirs are the two edges summing to the diagonal
    const [a, b] = fwd!.captureDirs;
    expect(cubeEquals(cubeCoord(a.q + b.q, a.r + b.r), fwd!.dir)).toBe(true);
  });

  it('snaps a horizontal vector to the right edge', () => {
    const fwd = deriveForward([cubeCoord(-3, 0)], [cubeCoord(3, 0)]);
    expect(fwd!.kind).toBe('edge');
    expect(cubeEquals(fwd!.dir, cubeCoord(1, 0))).toBe(true);
    // flanking edges at +-60 degrees: (1,-1) and (0,1)
    const keys = fwd!.captureDirs.map(coordKey).sort();
    expect(keys).toEqual(['0,1', '1,-1']);
  });

  it('prefers the point (diagonal) on an exact tie', () => {
    // A vector exactly along a diagonal must stay a point even though two
    // edges flank it symmetrically at 30 degrees each.
    const fwd = deriveForward([cubeCoord(0, 0)], [cubeCoord(2, -1)]);
    expect(fwd!.kind).toBe('point');
  });

  it('returns null when either centroid set is empty', () => {
    expect(deriveForward([], [cubeCoord(0, 0)])).toBeNull();
    expect(deriveForward([cubeCoord(0, 0)], [])).toBeNull();
  });
});

describe('standardGeometry', () => {
  it('reproduces the hardcoded star helpers for every seat', () => {
    const geom = standardGeometry();
    const seats: HexPlayerIndex[] = [0, 1, 2, 3, 4, 5];
    for (const seat of seats) {
      const fwd = geom.forward[seat]!;
      expect(fwd.kind).toBe('point');
      expect(cubeEquals(fwd.dir, forwardDiagonal(seat))).toBe(true);
      const expectEdges = forwardEdges(seat).map(coordKey).sort();
      expect(fwd.captureDirs.map(coordKey).sort()).toEqual(expectEdges);
      expect(geom.promotionCells[seat]).toEqual(promotionCellsForPlayer(seat));
    }
    // 121-cell star, no walls
    expect(geom.cells.size).toBe(121);
    expect(geom.walls.size).toBe(0);
    // every standard starting cell is open
    for (const c of startingCellsForPlayer(0)) {
      expect(isOpenCell(geom, c)).toBe(true);
    }
  });
});

describe('buildGeometry', () => {
  it('builds cells/walls/forward/pawn-start sets from a snapshot', () => {
    const cells: string[] = [];
    for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) {
      if (Math.abs(-q - r) <= 3) cells.push(`${q},${r}`);
    }
    const s = snap({
      cells,
      walls: ['0,0'],
      pieces: {
        '-3,0': { player: 0, type: 'king' },
        '-2,0': { player: 0, type: 'pawn' },
        '3,0': { player: 2, type: 'king' },
        '2,0': { player: 2, type: 'pawn' },
      },
      promotionPositions: { 0: ['3,-1', '3,0'], 2: ['-3,0', '-3,1'] },
      promotionOptions: ['queen'],
    });
    const geom = buildGeometry(s);
    expect(geom.cells.has('0,0')).toBe(true);
    expect(geom.walls.has('0,0')).toBe(true);
    expect(isOpenCell(geom, cubeCoord(0, 0))).toBe(false);
    expect(isOpenCell(geom, cubeCoord(1, 0))).toBe(true);
    expect(isOpenCell(geom, cubeCoord(9, 9))).toBe(false); // off board
    // player 0 faces right (edge), player 2 faces left (edge)
    expect(geom.forward[0]!.kind).toBe('edge');
    expect(cubeEquals(geom.forward[0]!.dir, cubeCoord(1, 0))).toBe(true);
    expect(cubeEquals(geom.forward[2]!.dir, cubeCoord(-1, 0))).toBe(true);
    // pawn start cells recorded per army
    expect(geom.pawnStartCells[0]!.has('-2,0')).toBe(true);
    expect(geom.pawnStartCells[2]!.has('2,0')).toBe(true);
    expect(geom.promotionOptions).toEqual(['queen']);
    expect(geom.promotionCells[0]!.has('3,0')).toBe(true);
  });
});
