import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  extractMoveFeatures,
  makePatternKey,
  accumulatePattern,
  getSerializedPatternCache,
  flushPatternCache,
  resetPatternCacheForTesting,
} from '@/game/training/patternCache';
import { createGame } from '@/game/setup';
import { getAllValidMoves } from '@/game/moves';

const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
});

beforeEach(() => {
  Object.keys(store).forEach(k => delete store[k]);
  resetPatternCacheForTesting();
});

describe('extractMoveFeatures', () => {
  it('returns null for positions with < 3 pieces in goal', () => {
    const state = createGame(2);
    const moves = getAllValidMoves(state, state.currentPlayer);
    if (moves.length === 0) return;
    const result = extractMoveFeatures(state, moves[0], state.currentPlayer);
    expect(result).toBeNull(); // 0 pieces in goal at game start
  });
});

describe('makePatternKey', () => {
  it('produces a non-empty string', () => {
    const key = makePatternKey({
      piecesInGoalBucket: '6-7',
      isChainJump: true,
      chainLengthBucket: '2',
      isDirectGoalEntry: false,
      distBucket: 'near',
    });
    expect(key.length).toBeGreaterThan(0);
    expect(key).toContain('6-7');
    expect(key).toContain('cj');
  });

  it('two different features produce different keys', () => {
    const k1 = makePatternKey({
      piecesInGoalBucket: '3-5',
      isChainJump: false,
      chainLengthBucket: '1',
      isDirectGoalEntry: true,
      distBucket: 'near',
    });
    const k2 = makePatternKey({
      piecesInGoalBucket: '8',
      isChainJump: false,
      chainLengthBucket: '1',
      isDirectGoalEntry: false,
      distBucket: 'far',
    });
    expect(k1).not.toBe(k2);
  });
});

describe('accumulatePattern + getSerializedPatternCache', () => {
  it('accumulates wins and produces positive scoreDelta for a win-heavy feature', () => {
    const features = {
      piecesInGoalBucket: '6-7' as const,
      isChainJump: true,
      chainLengthBucket: '3+' as const,
      isDirectGoalEntry: false,
      distBucket: 'mid' as const,
    };
    // 8 wins, 2 losses
    for (let i = 0; i < 8; i++) accumulatePattern(features, true);
    for (let i = 0; i < 2; i++) accumulatePattern(features, false);

    const cache = getSerializedPatternCache();
    const key = makePatternKey(features);
    expect(cache[key]).toBeGreaterThan(0); // 80% win rate → positive delta
  });

  it('produces zero delta when win rate is exactly 50%', () => {
    const features = {
      piecesInGoalBucket: '8' as const,
      isChainJump: false,
      chainLengthBucket: '1' as const,
      isDirectGoalEntry: false,
      distBucket: 'far' as const,
    };
    for (let i = 0; i < 5; i++) accumulatePattern(features, true);
    for (let i = 0; i < 5; i++) accumulatePattern(features, false);

    const cache = getSerializedPatternCache();
    const key = makePatternKey(features);
    expect(Math.abs(cache[key] ?? 0)).toBeLessThan(0.001);
  });

  it('flushPatternCache writes to localStorage', () => {
    const features = {
      piecesInGoalBucket: '3-5' as const,
      isChainJump: false,
      chainLengthBucket: '1' as const,
      isDirectGoalEntry: true,
      distBucket: 'near' as const,
    };
    accumulatePattern(features, true);
    flushPatternCache();
    expect(store['chinese-checkers-pattern-cache']).toBeDefined();
  });
});
