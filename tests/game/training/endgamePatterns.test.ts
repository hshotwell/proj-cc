import { describe, it, expect } from 'vitest';
import type { CubeCoord } from '@/types/game';
import {
  computeChainDepth,
  computePathClearance,
  computeFormationSpread,
  computeVanguardBonus,
} from '@/game/training/evaluate';

function makeBoard(
  pieces: Array<{ q: number; r: number; player: number }>,
  emptyCells: Array<{ q: number; r: number }> = []
) {
  const board = new Map<string, { type: string; player?: number }>();
  for (const p of pieces) {
    board.set(`${p.q},${p.r}`, { type: 'piece', player: p.player });
  }
  for (const e of emptyCells) {
    const key = `${e.q},${e.r}`;
    if (!board.has(key)) {
      board.set(key, { type: 'empty' });
    }
  }
  return board;
}

const coord = (q: number, r: number): CubeCoord => ({ q, r, s: -q - r });

describe('computeChainDepth', () => {
  it('returns 0 when no jumps are available', () => {
    const board = makeBoard([{ q: 0, r: 0, player: 0 }]);
    const pieces = [coord(0, 0)];
    expect(computeChainDepth(pieces, board)).toBe(0);
  });

  it('returns >= 1 when a single jump is available', () => {
    // Piece at (0,0), neighbor at (1,0), empty landing at (2,0)
    const board = makeBoard(
      [{ q: 0, r: 0, player: 0 }, { q: 1, r: 0, player: 1 }],
      [{ q: 2, r: 0 }]
    );
    const pieces = [coord(0, 0)];
    expect(computeChainDepth(pieces, board)).toBeGreaterThanOrEqual(1);
  });

  it('returns > 1 when a chain jump is possible', () => {
    // Piece at (0,0), hop over (1,0) to (2,0), then hop over (3,0) to (4,0)
    const board = makeBoard(
      [{ q: 0, r: 0, player: 0 }, { q: 1, r: 0, player: 1 }, { q: 3, r: 0, player: 1 }],
      [{ q: 2, r: 0 }, { q: 4, r: 0 }]
    );
    const pieces = [coord(0, 0)];
    expect(computeChainDepth(pieces, board)).toBeGreaterThanOrEqual(2);
  });
});

describe('computeFormationSpread', () => {
  it('returns 0 for a single piece', () => {
    expect(computeFormationSpread([coord(0, 0)])).toBe(0);
  });

  it('returns higher value for spread-out pieces than clustered ones', () => {
    const clustered = [coord(0, 0), coord(1, 0), coord(0, 1)];
    const spread = [coord(0, 0), coord(4, 0), coord(0, 4)];
    expect(computeFormationSpread(spread)).toBeGreaterThan(computeFormationSpread(clustered));
  });
});

describe('computeVanguardBonus', () => {
  const goalCenter = coord(3, 3);

  it('returns a non-negative value', () => {
    const pieces = [coord(0, 0), coord(0, 1), coord(1, 0)];
    expect(computeVanguardBonus(pieces, goalCenter)).toBeGreaterThanOrEqual(0);
  });

  it('returns higher bonus when leader is 2-4 ahead of group than when too far ahead', () => {
    // Good vanguard: leader ~3 units ahead of pack
    const goodVanguard = [
      coord(2, 2), // leader, closer to goal (3,3)
      coord(0, 0), coord(0, 1), coord(1, 0), // pack further away
    ];
    // Too far: leader right at goal, pack way behind
    const tooFarVanguard = [
      coord(3, 3), // leader at goal
      coord(-2, -1), coord(-1, -2), coord(-2, -2), // pack very far
    ];
    expect(computeVanguardBonus(goodVanguard, goalCenter)).toBeGreaterThan(
      computeVanguardBonus(tooFarVanguard, goalCenter)
    );
  });
});

describe('computePathClearance', () => {
  it('returns >= 0', () => {
    const goalCenter = coord(3, 3);
    const goalSet = new Set(['3,3', '4,3', '3,4']);
    const piece = coord(0, 0);
    const board = makeBoard([{ q: 0, r: 0, player: 0 }]);
    expect(computePathClearance([piece], goalCenter, goalSet, board)).toBeGreaterThanOrEqual(0);
  });

  it('returns higher value when path to goal is clear vs blocked', () => {
    const goalCenter = coord(3, 3);
    const goalSet = new Set(['3,3', '4,3', '3,4']);
    const piece = coord(0, 0);

    const clearBoard = makeBoard([{ q: 0, r: 0, player: 0 }]);
    const blockedBoard = makeBoard([
      { q: 0, r: 0, player: 0 },
      { q: 1, r: 1, player: 1 },
      { q: 2, r: 2, player: 1 },
    ]);

    expect(computePathClearance([piece], goalCenter, goalSet, clearBoard))
      .toBeGreaterThanOrEqual(computePathClearance([piece], goalCenter, goalSet, blockedBoard));
  });
});

import { scorePuzzleResult } from '@/game/training/endgameRunner';

describe('scorePuzzleResult', () => {
  it('returns 0 for unsolved', () => {
    expect(scorePuzzleResult(false, 99, 10)).toBe(0);
  });

  it('returns 100 for exactly hitting par', () => {
    expect(scorePuzzleResult(true, 10, 10)).toBe(100);
  });

  it('returns 200 for finishing in half par time', () => {
    expect(scorePuzzleResult(true, 5, 10)).toBe(200);
  });

  it('returns > 100 for beating par', () => {
    expect(scorePuzzleResult(true, 8, 10)).toBeGreaterThan(100);
  });

  it('returns < 100 for finishing over par', () => {
    expect(scorePuzzleResult(true, 12, 10)).toBeLessThan(100);
  });

  it('returns 0 when far over par (20 turns on par 10)', () => {
    expect(scorePuzzleResult(true, 20, 10)).toBe(0);
  });
});
