import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createGame, getPlayerPieces } from '@/game/setup';
import { applyMove, movePiece, advanceTurn } from '@/game/state';
import { getValidMoves } from '@/game/moves';
import { cubeCoord, cubeEquals, coordKey } from '@/game/coordinates';
import { normalizeMoveHistory, reconstructGameStates, findLongestHop } from '@/game/replay';
import { saveCompletedGame, getSavedGamesList, loadSavedGame, deleteSavedGame } from '@/game/persistence';
import type { GameState, Move, PlayerIndex } from '@/types/game';

// ---- normalizeMoveHistory ----

describe('normalizeMoveHistory', () => {
  const activePlayers: PlayerIndex[] = [0, 2];

  it('returns empty array for empty input', () => {
    expect(normalizeMoveHistory([], activePlayers)).toEqual([]);
  });

  it('passes through single step moves unchanged', () => {
    const moves: Move[] = [
      { from: cubeCoord(0, -4), to: cubeCoord(1, -4), isJump: false },
      { from: cubeCoord(0, 4), to: cubeCoord(-1, 4), isJump: false },
    ];
    const result = normalizeMoveHistory(moves, activePlayers);
    expect(result.length).toBe(2);
    expect(cubeEquals(result[0].from, moves[0].from)).toBe(true);
    expect(cubeEquals(result[0].to, moves[0].to)).toBe(true);
    expect(result[0].isJump).toBe(false);
  });

  it('merges consecutive chain-jump hops into a single move', () => {
    const from = cubeCoord(0, -4);
    const mid = cubeCoord(0, -2);
    const to = cubeCoord(0, 0);
    const jumped1 = cubeCoord(0, -3);
    const jumped2 = cubeCoord(0, -1);

    const moves: Move[] = [
      { from, to: mid, isJump: true, jumpPath: [jumped1] },
      { from: mid, to, isJump: true, jumpPath: [jumped2] },
    ];

    const result = normalizeMoveHistory(moves, activePlayers);
    expect(result.length).toBe(1);
    expect(cubeEquals(result[0].from, from)).toBe(true);
    expect(cubeEquals(result[0].to, to)).toBe(true);
    expect(result[0].isJump).toBe(true);
    expect(result[0].jumpPath?.length).toBe(2);
  });

  it('does not merge when to/from do not match', () => {
    const moves: Move[] = [
      { from: cubeCoord(0, -4), to: cubeCoord(0, -2), isJump: true, jumpPath: [cubeCoord(0, -3)] },
      { from: cubeCoord(2, 2), to: cubeCoord(2, 0), isJump: true, jumpPath: [cubeCoord(2, 1)] },
    ];

    const result = normalizeMoveHistory(moves, activePlayers);
    expect(result.length).toBe(2);
  });

  it('does not merge when second move is not a jump', () => {
    const moves: Move[] = [
      { from: cubeCoord(0, -4), to: cubeCoord(0, -3), isJump: false },
      { from: cubeCoord(0, -3), to: cubeCoord(0, -2), isJump: false },
    ];

    const result = normalizeMoveHistory(moves, activePlayers);
    // Second move starts where first ends, but isJump is false, so no merge
    expect(result.length).toBe(2);
  });

  it('handles mixed steps and jumps', () => {
    const moves: Move[] = [
      // Player 0: step
      { from: cubeCoord(0, -4), to: cubeCoord(1, -4), isJump: false },
      // Player 2: step
      { from: cubeCoord(0, 4), to: cubeCoord(-1, 4), isJump: false },
      // Player 0: chain jump (2 hops)
      { from: cubeCoord(1, -4), to: cubeCoord(1, -2), isJump: true, jumpPath: [cubeCoord(1, -3)] },
      { from: cubeCoord(1, -2), to: cubeCoord(1, 0), isJump: true, jumpPath: [cubeCoord(1, -1)] },
    ];

    const result = normalizeMoveHistory(moves, activePlayers);
    expect(result.length).toBe(3); // step, step, merged chain
    expect(result[2].isJump).toBe(true);
    expect(result[2].jumpPath?.length).toBe(2);
  });
});

// ---- reconstructGameStates ----

describe('reconstructGameStates', () => {
  it('returns initial state when no moves', () => {
    const savedGame = {
      id: 'test',
      initialConfig: {
        playerCount: 2 as const,
        activePlayers: [0, 2] as PlayerIndex[],
      },
      moves: [],
      finishedPlayers: [],
      dateSaved: Date.now(),
    };

    const states = reconstructGameStates(savedGame);
    expect(states.length).toBe(1);
    expect(states[0].turnNumber).toBe(1);
    expect(states[0].activePlayers).toEqual([0, 2]);
  });

  it('produces correct number of states', () => {
    // Create a game and make some moves
    const initialState = createGame(2);
    const pieces0 = getPlayerPieces(initialState, 0 as PlayerIndex);
    const firstPiece = pieces0[0];
    const validMoves = getValidMoves(initialState, firstPiece);
    const stepMove = validMoves.find(m => !m.isJump);

    if (!stepMove) {
      // If somehow no step move available, skip
      return;
    }

    const stateAfterMove = applyMove(initialState, stepMove);

    const savedGame = {
      id: 'test',
      initialConfig: {
        playerCount: 2 as const,
        activePlayers: [0, 2] as PlayerIndex[],
      },
      moves: [stepMove],
      finishedPlayers: [],
      dateSaved: Date.now(),
    };

    const states = reconstructGameStates(savedGame);
    expect(states.length).toBe(2);
    // First state should be initial
    expect(states[0].turnNumber).toBe(1);
    expect(states[0].currentPlayer).toBe(0);
  });
});

// ---- findLongestHop ----

describe('findLongestHop', () => {
  it('returns null for no jumps', () => {
    const moves: Move[] = [
      { from: cubeCoord(0, -4), to: cubeCoord(1, -4), isJump: false },
      { from: cubeCoord(0, 4), to: cubeCoord(-1, 4), isJump: false },
    ];
    expect(findLongestHop(moves)).toBeNull();
  });

  it('finds single jump', () => {
    const moves: Move[] = [
      { from: cubeCoord(0, -4), to: cubeCoord(1, -4), isJump: false },
      { from: cubeCoord(0, 4), to: cubeCoord(0, 2), isJump: true, jumpPath: [cubeCoord(0, 3)] },
    ];
    const result = findLongestHop(moves);
    expect(result).toEqual({ moveIndex: 1, jumpLength: 1 });
  });

  it('finds longest among multiple jumps', () => {
    const moves: Move[] = [
      { from: cubeCoord(0, -4), to: cubeCoord(0, -2), isJump: true, jumpPath: [cubeCoord(0, -3)] },
      { from: cubeCoord(0, 4), to: cubeCoord(0, 0), isJump: true, jumpPath: [cubeCoord(0, 3), cubeCoord(0, 1)] },
      { from: cubeCoord(1, -3), to: cubeCoord(1, -1), isJump: true, jumpPath: [cubeCoord(1, -2)] },
    ];
    const result = findLongestHop(moves);
    expect(result).toEqual({ moveIndex: 1, jumpLength: 2 });
  });

  it('returns first occurrence on tie', () => {
    const moves: Move[] = [
      { from: cubeCoord(0, -4), to: cubeCoord(0, -2), isJump: true, jumpPath: [cubeCoord(0, -3)] },
      { from: cubeCoord(0, 4), to: cubeCoord(0, 2), isJump: true, jumpPath: [cubeCoord(0, 3)] },
    ];
    const result = findLongestHop(moves);
    expect(result).toEqual({ moveIndex: 0, jumpLength: 1 });
  });
});

// ---- Persistence ----

describe('persistence', () => {
  // Mock localStorage for Node test environment
  let storage: Record<string, string> = {};
  const localStorageMock = {
    getItem: (key: string) => storage[key] ?? null,
    setItem: (key: string, value: string) => { storage[key] = value; },
    removeItem: (key: string) => { delete storage[key]; },
    clear: () => { storage = {}; },
    get length() { return Object.keys(storage).length; },
    key: (index: number) => Object.keys(storage)[index] ?? null,
  };

  beforeEach(() => {
    storage = {};
    Object.defineProperty(globalThis, 'localStorage', {
      value: localStorageMock,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saves and loads a game roundtrip', () => {
    // Create a minimal completed game state
    const state = createGame(2);

    // Make a simple move for some history
    const pieces = getPlayerPieces(state, 0 as PlayerIndex);
    const moves = getValidMoves(state, pieces[0]);
    const stepMove = moves.find(m => !m.isJump);
    if (!stepMove) return;

    const stateAfterMove = applyMove(state, stepMove);
    // Fake game completion
    const fakeFinished: GameState = {
      ...stateAfterMove,
      winner: 0 as PlayerIndex,
      finishedPlayers: [
        { player: 0 as PlayerIndex, moveCount: 1 },
        { player: 2 as PlayerIndex, moveCount: 2 },
      ],
    };

    const summary = saveCompletedGame('test-id', fakeFinished);
    expect(summary.id).toBe('test-id');
    expect(summary.winner).toBe(0);
    expect(summary.totalMoves).toBeGreaterThan(0);

    // Check index
    const list = getSavedGamesList();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe('test-id');

    // Load full data
    const loaded = loadSavedGame('test-id');
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe('test-id');
    expect(loaded!.moves.length).toBeGreaterThan(0);
    // Verify s coordinates are restored
    const firstMove = loaded!.moves[0];
    expect(firstMove.from.s).toBe(-firstMove.from.q - firstMove.from.r);
  });

  it('returns empty list when no games saved', () => {
    expect(getSavedGamesList()).toEqual([]);
  });

  it('returns null for non-existent game', () => {
    expect(loadSavedGame('nonexistent')).toBeNull();
  });

  it('deletes a game', () => {
    const state = createGame(2);
    const fakeFinished: GameState = {
      ...state,
      winner: 0 as PlayerIndex,
      finishedPlayers: [
        { player: 0 as PlayerIndex, moveCount: 1 },
        { player: 2 as PlayerIndex, moveCount: 2 },
      ],
    };

    saveCompletedGame('del-test', fakeFinished);
    expect(getSavedGamesList().length).toBe(1);

    deleteSavedGame('del-test');
    expect(getSavedGamesList().length).toBe(0);
    expect(loadSavedGame('del-test')).toBeNull();
  });
});
