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
    seats: [0, 2],
  players: {
    0: { color: '#ff0000', name: 'Alice', isAI: false },
    2: { color: '#0000ff', name: 'Bob', isAI: true },
  },
    layoutPreset: 'v1-default',
    soldierVariant: 'soldier',
    ai: { 2: 'medium' },
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
    expect(loaded!.schemaVersion).toBe(3);
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

// ---------------------------------------------------------------------------
// v1 → v2 migration
// ---------------------------------------------------------------------------

import { applyMove } from '@/game/hexchess/moves';
import { legalMoves } from '@/game/hexchess/check';
import type { HexMove, HexPiece } from '@/game/hexchess/state';

// The row-reversal permutation used to translate v1 piece indices; it is an
// involution, so it also de-migrates v2 ids back to v1 for fixture building.
const PERM: Record<number, number> = {
  0: 0, 1: 2, 2: 1, 3: 5, 4: 4, 5: 3,
  6: 9, 7: 8, 8: 7, 9: 6, 10: 14, 11: 13, 12: 12, 13: 11, 14: 10,
};

function demigrateId(id: string): string {
  if (!id.startsWith('2-')) return id;
  const parts = id.split('-');
  parts[0] = '1';
  parts[parts.length - 1] = String(PERM[Number(parts[parts.length - 1])]);
  return parts.join('-');
}

function demigrateSeat(p: number): number {
  return p === 2 ? 1 : p;
}

describe('v1 record migration', () => {
  it('loads a v1 record with seats [0,2], remapped players and ids, and replayable history', () => {
    // Build a real v2 game with two moves played...
    const config = makeConfig('mig-001');
    let state = makeState(config);
    const move1 = legalMoves(state).find(m => m.pieceId.includes('soldier'))!;
    state = applyMove(state, move1);
    const move2 = legalMoves(state).find(m => m.pieceId.includes('soldier'))!;
    state = applyMove(state, move2);

    // ...then hand-craft the equivalent v1 record (old ids, players 0/1).
    const v1Record = {
      schemaVersion: 1,
      mode: 'hexchess',
      id: 'mig-001',
      createdAt: 111,
      updatedAt: 222,
      config: {
        id: 'mig-001',
        players: [config.players[0], config.players[2]],
        layoutPreset: 'v1-default',
        soldierVariant: 'soldier',
        ai: { 1: 'medium' },
      },
      state: {
        ...state,
        activePlayers: undefined,
        eliminated: undefined,
        pieces: state.pieces.map((p: HexPiece) => ({
          ...p,
          id: demigrateId(p.id),
          player: demigrateSeat(p.player),
        })),
        currentPlayer: demigrateSeat(state.currentPlayer),
        moveHistory: state.moveHistory.map((m: HexMove) => ({
          ...m,
          pieceId: demigrateId(m.pieceId),
          player: demigrateSeat(m.player),
          capture: m.capture
            ? { ...m.capture, pieceId: demigrateId(m.capture.pieceId) }
            : null,
        })),
      },
      moveHistory: [],
      result: null,
    };
    localStorage.setItem('hexchess-game-mig-001', JSON.stringify(v1Record));

    const loaded = loadHexChessGame('mig-001')!;
    expect(loaded).not.toBeNull();
    expect(loaded.schemaVersion).toBe(3);
    expect(loaded.config.seats).toEqual([0, 2]);
    expect(loaded.config.players[2]!.name).toBe('Bob');
    expect(loaded.config.ai).toEqual({ 2: 'medium' });
    expect(loaded.state.activePlayers).toEqual([0, 2]);
    expect(loaded.state.eliminated).toEqual([]);

    // Every migrated piece matches the original v2 game exactly (id + cell).
    const byId = new Map(state.pieces.map(p => [p.id, p]));
    expect(loaded.state.pieces).toHaveLength(state.pieces.length);
    for (const p of loaded.state.pieces) {
      const original = byId.get(p.id)!;
      expect(original).toBeDefined();
      expect(p.cell).toEqual(original.cell);
      expect(p.player).toBe(original.player);
    }

    // Replaying the migrated history from a fresh initial state reproduces
    // the saved position (this is what the replay viewer does).
    let replayed = createInitialState(loaded.config);
    for (const m of loaded.state.moveHistory) {
      replayed = applyMove(replayed, m);
    }
    const replayedCells = new Map(replayed.pieces.map(p => [p.id, `${p.cell.q},${p.cell.r}`]));
    for (const p of state.pieces) {
      expect(replayedCells.get(p.id)).toBe(`${p.cell.q},${p.cell.r}`);
    }
  });
});

describe('schemaVersion 3', () => {
  it('writes schemaVersion 3 and loads v2 records as standard-board games', () => {
    const config = makeConfig('v3-check');
    const state = makeState(config);
    saveHexChessGame(config, state);
    const raw = JSON.parse(localStorage.getItem('hexchess-game-v3-check')!);
    expect(raw.schemaVersion).toBe(3);

    // Hand-craft a v2 record: same shape, schemaVersion 2, no layout fields.
    raw.schemaVersion = 2;
    delete raw.state.layout;
    delete raw.config.layout;
    localStorage.setItem('hexchess-game-v3-check', JSON.stringify(raw));
    const loaded = loadHexChessGame('v3-check');
    expect(loaded).not.toBeNull();
    expect(loaded!.schemaVersion).toBe(3);
    expect(loaded!.state.layout).toBeUndefined();
  });
});
