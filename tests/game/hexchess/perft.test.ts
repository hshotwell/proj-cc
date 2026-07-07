import { describe, it, expect } from 'vitest';
import {
  createInitialState, legalMoves, applyMove, confirmPromotion,
} from '@/game/hexchess';
import type { HexChessConfig, HexChessState } from '@/game/hexchess';

const config: HexChessConfig = {
  id: 'perft',
  players: [
    { color: 'red', name: 'A', isAI: false },
    { color: 'blue', name: 'B', isAI: false },
  ],
  layoutPreset: 'v1-default',
  soldierVariant: 'soldier',
  ai: null,
};

function perft(state: HexChessState, depth: number): number {
  if (depth === 0) return 1;
  if (state.result) return 1;
  let count = 0;
  for (const m of legalMoves(state)) {
    const next = applyMove(state, m);
    if (next.pendingPromotion) {
      for (const c of next.pendingPromotion.options) {
        count += perft(confirmPromotion(next, c), depth - 1);
      }
      continue;
    }
    count += perft(next, depth - 1);
  }
  return count;
}

describe('perft — starting position', () => {
  it('depth 1', () => {
    const s = createInitialState(config);
    const count = perft(s, 1);
    console.log('perft depth 1:', count);
    expect(count).toBe(22);
  });

  it('depth 2', () => {
    const s = createInitialState(config);
    const count = perft(s, 2);
    console.log('perft depth 2:', count);
    expect(count).toBe(416);
  });

  it('depth 3', () => {
    const s = createInitialState(config);
    const count = perft(s, 3);
    console.log('perft depth 3:', count);
    expect(count).toBe(10067);
  }, 30000);
});
