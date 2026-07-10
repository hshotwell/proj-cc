/**
 * persistence.test.ts — hexchess save/load
 *
 * Uses a simple in-memory localStorage mock because the project's Vitest
 * config uses the 'node' environment (jsdom is not installed).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// localStorage mock — must be set up BEFORE the module under test is imported
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

import {
  saveHexChessGame,
  loadHexChessGame,
  listSavedHexChessGames,
  deleteHexChessGame,
} from '@/game/hexchess/persistence';
import type { HexChessConfig, HexChessState } from '@/game/hexchess/state';
import { createInitialState } from '@/game/hexchess/starting';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeConfig(id: string): HexChessConfig {
  return {
    id,
    players: [
      { color: '#ff0000', name: 'Alice', isAI: false },
      { color: '#0000ff', name: 'Bob', isAI: true },
    ],
    layoutPreset: 'v1-default',
    soldierVariant: 'soldier',
    ai: { 1: 'medium' },
  };
}

function makeState(config: HexChessConfig): HexChessState {
  return createInitialState(config);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('hexchess persistence', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('Test 1: saveHexChessGame + loadHexChessGame round-trips', () => {
    const config = makeConfig('game-001');
    const state = makeState(config);

    saveHexChessGame(config, state);

    const loaded = loadHexChessGame('game-001');
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe('game-001');
    expect(loaded!.mode).toBe('hexchess');
    expect(loaded!.schemaVersion).toBe(1);
    expect(loaded!.config).toEqual(config);
    expect(loaded!.state.mode).toBe('hexchess');
    expect(loaded!.state.pieces.length).toBe(state.pieces.length);
    expect(loaded!.moveHistory).toEqual([]);
    expect(loaded!.result).toBeNull();
    expect(typeof loaded!.createdAt).toBe('number');
    expect(typeof loaded!.updatedAt).toBe('number');
  });

  it('Test 2: save updates existing game — createdAt preserved, updatedAt changes', async () => {
    const config = makeConfig('game-002');
    const state = makeState(config);

    saveHexChessGame(config, state);
    const first = loadHexChessGame('game-002')!;

    // Small delay to ensure Date.now() differs
    await new Promise(r => setTimeout(r, 5));

    saveHexChessGame(config, state);
    const second = loadHexChessGame('game-002')!;

    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt).toBeGreaterThanOrEqual(first.updatedAt);
  });

  it('Test 3: index is updated after save', () => {
    const config = makeConfig('game-003');
    const state = makeState(config);

    expect(listSavedHexChessGames()).toHaveLength(0);

    saveHexChessGame(config, state);

    const list = listSavedHexChessGames();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('game-003');
    expect(list[0].mode).toBe('hexchess');
    expect(list[0].players[0].name).toBe('Alice');
    expect(list[0].players[1].name).toBe('Bob');
  });

  it('Test 4: 20-cap eviction removes oldest by updatedAt', async () => {
    // Save 21 games with distinct timestamps
    for (let i = 0; i < 21; i++) {
      const id = `evict-game-${String(i).padStart(3, '0')}`;
      const config = makeConfig(id);
      const state = makeState(config);
      saveHexChessGame(config, state);
      await new Promise(r => setTimeout(r, 2));
    }

    const list = listSavedHexChessGames();
    expect(list).toHaveLength(20);

    // The oldest (evict-game-000) should have been evicted
    const ids = list.map(g => g.id);
    expect(ids).not.toContain('evict-game-000');

    // The full record for the evicted game should also be gone
    expect(loadHexChessGame('evict-game-000')).toBeNull();

    // The most recent game (evict-game-020) should be present
    expect(ids).toContain('evict-game-020');
  });

  it('Test 5: deleteHexChessGame removes game and index entry', () => {
    const configA = makeConfig('game-del-a');
    const configB = makeConfig('game-del-b');
    saveHexChessGame(configA, makeState(configA));
    saveHexChessGame(configB, makeState(configB));

    expect(listSavedHexChessGames()).toHaveLength(2);

    deleteHexChessGame('game-del-a');

    const list = listSavedHexChessGames();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('game-del-b');
    expect(loadHexChessGame('game-del-a')).toBeNull();
  });

  it('Test 6: listSavedHexChessGames returns entries sorted by updatedAt desc', async () => {
    const configs = ['game-sort-1', 'game-sort-2', 'game-sort-3'].map(makeConfig);
    for (const config of configs) {
      saveHexChessGame(config, makeState(config));
      await new Promise(r => setTimeout(r, 2));
    }

    const list = listSavedHexChessGames();
    // Most recently updated first
    expect(list[0].id).toBe('game-sort-3');
    expect(list[2].id).toBe('game-sort-1');
  });
});
