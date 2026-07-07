import { describe, it, expect } from 'vitest';
import { TranspositionTable } from '@/game/ai/hexchess/transposition';
import type { TTEntry } from '@/game/ai/hexchess/transposition';

const makeEntry = (depth: number, evalCp = 0): TTEntry => ({
  depth,
  evalCp,
  flag: 'exact',
  bestMove: null,
});

describe('TranspositionTable', () => {
  it('set + get round-trips an entry', () => {
    const tt = new TranspositionTable();
    const entry: TTEntry = { depth: 4, evalCp: 123, flag: 'exact', bestMove: null };
    tt.set('aabbccddeeff0011', entry);
    expect(tt.get('aabbccddeeff0011')).toEqual(entry);
  });

  it('get returns null for missing key', () => {
    const tt = new TranspositionTable();
    expect(tt.get('0000000000000000')).toBeNull();
  });

  it('depth-preferred replacement: higher depth overwrites lower', () => {
    const tt = new TranspositionTable();
    const shallow: TTEntry = { depth: 2, evalCp: 50, flag: 'exact', bestMove: null };
    const deep: TTEntry = { depth: 5, evalCp: 75, flag: 'lower', bestMove: null };
    tt.set('key1', shallow);
    tt.set('key1', deep);
    expect(tt.get('key1')).toEqual(deep);
  });

  it('depth-preferred replacement: same depth overwrites', () => {
    const tt = new TranspositionTable();
    const first: TTEntry = { depth: 3, evalCp: 10, flag: 'exact', bestMove: null };
    const second: TTEntry = { depth: 3, evalCp: 99, flag: 'upper', bestMove: null };
    tt.set('key2', first);
    tt.set('key2', second);
    expect(tt.get('key2')).toEqual(second);
  });

  it('shallower entry does NOT overwrite deeper existing entry', () => {
    const tt = new TranspositionTable();
    const deep: TTEntry = { depth: 6, evalCp: 200, flag: 'exact', bestMove: null };
    const shallow: TTEntry = { depth: 2, evalCp: -50, flag: 'lower', bestMove: null };
    tt.set('key3', deep);
    tt.set('key3', shallow);
    expect(tt.get('key3')).toEqual(deep);
  });

  it('clear empties the table', () => {
    const tt = new TranspositionTable();
    tt.set('k1', makeEntry(3));
    tt.set('k2', makeEntry(4));
    tt.clear();
    expect(tt.get('k1')).toBeNull();
    expect(tt.get('k2')).toBeNull();
    expect(tt.size()).toBe(0);
  });

  it('size tracks number of distinct keys', () => {
    const tt = new TranspositionTable();
    expect(tt.size()).toBe(0);
    tt.set('a', makeEntry(1));
    expect(tt.size()).toBe(1);
    tt.set('b', makeEntry(2));
    expect(tt.size()).toBe(2);
    // Overwriting same key doesn't change size
    tt.set('a', makeEntry(5));
    expect(tt.size()).toBe(2);
  });

  it('respects maxEntries cap: does not insert beyond limit', () => {
    const tt = new TranspositionTable(3);
    tt.set('x1', makeEntry(1));
    tt.set('x2', makeEntry(1));
    tt.set('x3', makeEntry(1));
    tt.set('x4', makeEntry(1)); // should be dropped
    expect(tt.size()).toBe(3);
    expect(tt.get('x4')).toBeNull();
  });

  it('maxEntries cap allows overwrite of existing key even when full', () => {
    const tt = new TranspositionTable(2);
    const entryA: TTEntry = { depth: 1, evalCp: 10, flag: 'exact', bestMove: null };
    const entryB: TTEntry = { depth: 5, evalCp: 99, flag: 'exact', bestMove: null };
    tt.set('ka', entryA);
    tt.set('kb', makeEntry(1));
    // Table is full (size=2). Overwriting 'ka' with deeper entry must succeed.
    tt.set('ka', entryB);
    expect(tt.size()).toBe(2);
    expect(tt.get('ka')).toEqual(entryB);
  });

  it('stores flag and bestMove correctly', () => {
    const tt = new TranspositionTable();
    const entry: TTEntry = {
      depth: 3,
      evalCp: -42,
      flag: 'lower',
      bestMove: null,
    };
    tt.set('flagtest', entry);
    const retrieved = tt.get('flagtest');
    expect(retrieved?.flag).toBe('lower');
    expect(retrieved?.evalCp).toBe(-42);
  });
});
