import { describe, it, expect } from 'vitest';
import { orderMoves, ricefishOrderingScore } from '@/game/ai/ricefish/ordering';
import type { Move } from '@/types/game';

function step(fq: number, fr: number, tq: number, tr: number): Move {
  return {
    from: { q: fq, r: fr, s: -fq - fr },
    to: { q: tq, r: tr, s: -tq - tr },
    isJump: false,
  };
}
function jump(fq: number, fr: number, tq: number, tr: number): Move {
  return {
    from: { q: fq, r: fr, s: -fq - fr },
    to: { q: tq, r: tr, s: -tq - tr },
    isJump: true,
  };
}

describe('ricefishOrderingScore', () => {
  it('scores longer moves higher', () => {
    expect(ricefishOrderingScore(step(0, 0, 0, 1), 'generalist'))
      .toBeLessThan(ricefishOrderingScore(step(0, 0, 0, 4), 'generalist'));
  });

  it('prefers a jump over a step of equal distance', () => {
    expect(ricefishOrderingScore(jump(0, 0, 0, 2), 'generalist'))
      .toBeGreaterThan(ricefishOrderingScore(step(0, 0, 0, 2), 'generalist'));
  });

  it('aggressive personality amplifies long-distance bonus', () => {
    const short = step(0, 0, 0, 1);
    const long = step(0, 0, 0, 4);
    const gapGeneralist =
      ricefishOrderingScore(long, 'generalist') - ricefishOrderingScore(short, 'generalist');
    const gapAggressive =
      ricefishOrderingScore(long, 'aggressive') - ricefishOrderingScore(short, 'aggressive');
    expect(gapAggressive).toBeGreaterThan(gapGeneralist);
  });
});

describe('orderMoves', () => {
  it('returns moves in descending score order', () => {
    const moves: Move[] = [
      step(0, 0, 0, 1),
      jump(0, 0, 0, 4),
      step(0, 0, 0, 3),
    ];
    const ordered = orderMoves(moves, 'generalist');
    expect(ordered[0]).toBe(moves[1]); // longest jump first
    expect(ordered[1]).toBe(moves[2]); // 3-step second
    expect(ordered[2]).toBe(moves[0]); // 1-step last
  });

  it('is stable for equal scores', () => {
    const a = step(0, 0, 0, 1);
    const b = step(0, 0, 0, 1);
    const c = step(0, 0, 0, 1);
    const ordered = orderMoves([a, b, c], 'generalist');
    expect(ordered).toEqual([a, b, c]);
  });
});
