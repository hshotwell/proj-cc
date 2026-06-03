import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeTablebaseKey, lookupTablebase, saveTablebase, clearTablebaseCache } from '@/game/ai/tablebase';
import type { TablebaseEntry } from '@/game/ai/tablebase';

// Mock localStorage
const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
});

beforeEach(() => {
  Object.keys(store).forEach(k => delete store[k]);
  clearTablebaseCache();
});

describe('makeTablebaseKey', () => {
  it('is order-independent for outside pieces', () => {
    const a = makeTablebaseKey(
      [{ q: 1, r: 2, s: -3 }, { q: 3, r: -1, s: -2 }],
      [{ q: 4, r: -8, s: 4 }]
    );
    const b = makeTablebaseKey(
      [{ q: 3, r: -1, s: -2 }, { q: 1, r: 2, s: -3 }],
      [{ q: 4, r: -8, s: 4 }]
    );
    expect(a).toBe(b);
  });

  it('is order-independent for empty goals', () => {
    const a = makeTablebaseKey(
      [{ q: 1, r: 2, s: -3 }],
      [{ q: 4, r: -8, s: 4 }, { q: 3, r: -7, s: 4 }]
    );
    const b = makeTablebaseKey(
      [{ q: 1, r: 2, s: -3 }],
      [{ q: 3, r: -7, s: 4 }, { q: 4, r: -8, s: 4 }]
    );
    expect(a).toBe(b);
  });

  it('differs when outside pieces differ', () => {
    const a = makeTablebaseKey([{ q: 1, r: 2, s: -3 }], [{ q: 4, r: -8, s: 4 }]);
    const b = makeTablebaseKey([{ q: 2, r: 2, s: -4 }], [{ q: 4, r: -8, s: 4 }]);
    expect(a).not.toBe(b);
  });
});

describe('lookupTablebase', () => {
  it('returns null when table is empty', () => {
    const result = lookupTablebase(
      [{ q: 1, r: 2, s: -3 }],
      [{ q: 4, r: -8, s: 4 }]
    );
    expect(result).toBeNull();
  });

  it('returns the stored entry after saveTablebase', () => {
    const entry: TablebaseEntry = { from: { q: 1, r: 2 }, to: { q: 3, r: -7 }, solvedIn: 2 };
    const key = makeTablebaseKey(
      [{ q: 1, r: 2, s: -3 }],
      [{ q: 4, r: -8, s: 4 }]
    );
    saveTablebase({ [key]: entry });

    const result = lookupTablebase(
      [{ q: 1, r: 2, s: -3 }],
      [{ q: 4, r: -8, s: 4 }]
    );
    expect(result).toEqual(entry);
  });

  it('returns null for 3+ outside pieces', () => {
    const result = lookupTablebase(
      [{ q: 0, r: 0, s: 0 }, { q: 1, r: 0, s: -1 }, { q: 2, r: 0, s: -2 }],
      [{ q: 4, r: -8, s: 4 }]
    );
    expect(result).toBeNull();
  });
});
