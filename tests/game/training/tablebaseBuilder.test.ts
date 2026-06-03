import { describe, it, expect, vi } from 'vitest';
import { enumerateEndgamePositions, buildEndgameTablebase } from '@/game/training/tablebaseBuilder';
import { DEFAULT_GENOME } from '@/game/training/evaluate';
import { clearTablebaseCache } from '@/game/ai/tablebase';

const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
});

describe('enumerateEndgamePositions', () => {
  it('returns positions for 1 piece', () => {
    const positions = enumerateEndgamePositions(1);
    expect(positions.length).toBeGreaterThan(0);
    for (const p of positions) {
      expect(p.outsidePieces).toHaveLength(1);
      expect(p.emptyGoals).toHaveLength(1);
    }
  });

  it('returns positions for 2 pieces', () => {
    const positions = enumerateEndgamePositions(2);
    expect(positions.length).toBeGreaterThan(0);
    for (const p of positions) {
      expect(p.outsidePieces).toHaveLength(2);
      expect(p.emptyGoals).toHaveLength(2);
    }
  });

  it('outside pieces are never in goal positions', () => {
    const positions = enumerateEndgamePositions(1);
    for (const p of positions.slice(0, 5)) {
      for (const op of p.outsidePieces) {
        const isInGoal = p.emptyGoals.some(g => g.q === op.q && g.r === op.r);
        expect(isInGoal).toBe(false);
      }
    }
  });
});

import { makeTablebaseKey } from '@/game/ai/tablebase';

describe('buildEndgameTablebase', () => {
  it('saves entries to localStorage and calls onProgress', async () => {
    clearTablebaseCache();
    Object.keys(store).forEach(k => delete store[k]);

    // Use a tiny subset: 1-piece positions only, shallow depth, so test is fast.
    // We only need enough to verify the pipeline works end-to-end.
    let progressCalled = false;
    let lastSolved = 0;
    await buildEndgameTablebase(DEFAULT_GENOME, (solved, total, _bytes) => {
      progressCalled = true;
      lastSolved = solved;
      expect(solved).toBeLessThanOrEqual(total);
      expect(total).toBeGreaterThan(0);
    }, { maxPiecesOutside: 1, solveDepth1: 1, maxPositions: 20 });

    expect(progressCalled).toBe(true);
    expect(lastSolved).toBeLessThanOrEqual(20);
    const saved = store['chinese-checkers-endgame-table'];
    expect(saved).toBeDefined();
    const parsed = JSON.parse(saved);
    expect(typeof parsed.entries).toBe('object');
  }, 30000);
});
