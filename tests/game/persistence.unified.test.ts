/**
 * persistence.unified.test.ts — listAllSavedGames merges Sternhalma + hex chess
 *
 * Uses an in-memory localStorage mock (jsdom not installed in this project).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// localStorage mock — must be set up BEFORE any module under test is imported
// ---------------------------------------------------------------------------

const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); },
};

vi.stubGlobal('localStorage', localStorageMock);
vi.stubGlobal('window', { localStorage: localStorageMock });

// ---------------------------------------------------------------------------
// Module imports (after mock is set up)
// ---------------------------------------------------------------------------

import { listAllSavedGames, type UnifiedSavedGameSummary } from '@/game/persistence';
import { saveHexChessGame } from '@/game/hexchess/persistence';
import type { HexChessConfig, HexChessState } from '@/game/hexchess/state';
import { createInitialState } from '@/game/hexchess/starting';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeHexConfig(id: string): HexChessConfig {
  return {
    id,
    players: [
      { color: '#ff0000', name: 'Alice', isAI: false },
      { color: '#0000ff', name: 'Bob', isAI: true },
    ],
    layoutPreset: 'v1-default',
    soldierVariant: 'soldier',
    ai: { forPlayer: 1, difficulty: 'medium' },
  };
}

/**
 * Seed a Sternhalma game summary directly into the localStorage index
 * (mirrors how getSavedGamesList / saveCompletedGame writes it).
 */
function seedSternhalmaGame(id: string, dateSaved: number): void {
  const GAMES_INDEX_KEY = 'chinese-checkers-saved-games';
  const existing = localStorageMock.getItem(GAMES_INDEX_KEY);
  const index = existing ? JSON.parse(existing) : [];
  index.unshift({
    id,
    dateSaved,
    playerCount: 2,
    activePlayers: [0, 2],
    winner: 0,
    totalMoves: 40,
    totalTurns: 20,
    longestHop: 12,
    playerColors: { 0: '#ff0000', 2: '#0000ff' },
  });
  localStorageMock.setItem(GAMES_INDEX_KEY, JSON.stringify(index));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('listAllSavedGames', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('Test 1: returns empty array when no games are saved', () => {
    const result = listAllSavedGames();
    expect(result).toEqual([]);
  });

  it('Test 2: merges Sternhalma and hex chess games with correct mode tags', async () => {
    // Seed a Sternhalma game (older)
    seedSternhalmaGame('stern-001', 1000);

    // Seed a hex chess game (newer)
    await new Promise(r => setTimeout(r, 5));
    const config = makeHexConfig('hex-001');
    saveHexChessGame(config, createInitialState(config));

    const result = listAllSavedGames();

    expect(result).toHaveLength(2);

    const hexEntry = result.find(g => g.id === 'hex-001');
    const sternEntry = result.find(g => g.id === 'stern-001');

    expect(hexEntry).toBeDefined();
    expect(hexEntry!.mode).toBe('hexchess');

    expect(sternEntry).toBeDefined();
    expect(sternEntry!.mode).toBe('sternhalma');
  });

  it('Test 3: result is sorted by updatedAt descending', async () => {
    // Sternhalma game saved first (lower timestamp)
    seedSternhalmaGame('stern-old', 1000);

    // Hex chess game saved later (higher timestamp)
    await new Promise(r => setTimeout(r, 5));
    const config = makeHexConfig('hex-new');
    saveHexChessGame(config, createInitialState(config));

    const result = listAllSavedGames();
    expect(result).toHaveLength(2);
    // hex-new should come first (more recent updatedAt)
    expect(result[0].id).toBe('hex-new');
    expect(result[1].id).toBe('stern-old');
  });

  it('Test 4: each entry has required UnifiedSavedGameSummary fields', async () => {
    seedSternhalmaGame('stern-fields', Date.now() - 1000);

    const config = makeHexConfig('hex-fields');
    saveHexChessGame(config, createInitialState(config));

    const result = listAllSavedGames();
    expect(result).toHaveLength(2);

    for (const entry of result) {
      expect(typeof entry.id).toBe('string');
      expect(entry.mode === 'sternhalma' || entry.mode === 'hexchess').toBe(true);
      expect(typeof entry.createdAt).toBe('number');
      expect(typeof entry.updatedAt).toBe('number');
      expect(Array.isArray(entry.players)).toBe(true);
      // result field must exist (null or object)
      expect('result' in entry).toBe(true);
    }
  });

  it('Test 5: malformed Sternhalma index entries are excluded gracefully', () => {
    // Write a corrupted index
    localStorageMock.setItem('chinese-checkers-saved-games', 'not-valid-json{{{');

    const result = listAllSavedGames();
    expect(result).toEqual([]);
  });

  it('Test 6: only Sternhalma games present', () => {
    seedSternhalmaGame('stern-only', Date.now());
    const result = listAllSavedGames();
    expect(result).toHaveLength(1);
    expect(result[0].mode).toBe('sternhalma');
    expect(result[0].id).toBe('stern-only');
  });

  it('Test 7: only hex chess games present', () => {
    const config = makeHexConfig('hex-only');
    saveHexChessGame(config, createInitialState(config));
    const result = listAllSavedGames();
    expect(result).toHaveLength(1);
    expect(result[0].mode).toBe('hexchess');
    expect(result[0].id).toBe('hex-only');
  });
});
