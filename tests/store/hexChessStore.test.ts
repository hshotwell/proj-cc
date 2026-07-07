import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// localStorage mock — must be set up BEFORE any module that touches persistence
// ---------------------------------------------------------------------------

const _lsStore: Record<string, string> = {};
const _localStorageMock = {
  getItem: (key: string) => _lsStore[key] ?? null,
  setItem: (key: string, value: string) => { _lsStore[key] = value; },
  removeItem: (key: string) => { delete _lsStore[key]; },
  clear: () => { Object.keys(_lsStore).forEach(k => delete _lsStore[k]); },
};
vi.stubGlobal('localStorage', _localStorageMock);
vi.stubGlobal('window', { localStorage: _localStorageMock });

// ---------------------------------------------------------------------------
// Module imports (after mock)
// ---------------------------------------------------------------------------

import { useHexChessStore } from '@/store/hexChessStore';
import {
  createInitialState,
  legalMoves,
} from '@/game/hexchess';
import type { HexChessConfig, HexChessState } from '@/game/hexchess';
import { loadHexChessGame } from '@/game/hexchess/persistence';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(id = 'test-game'): HexChessConfig {
  return {
    id,
    players: [
      { color: '#ff0000', name: 'Alice', isAI: false },
      { color: '#0000ff', name: 'Bob', isAI: false },
    ],
    layoutPreset: 'v1-default',
    soldierVariant: 'soldier',
    ai: null,
  };
}

function reset() {
  useHexChessStore.getState().clearGame();
  _localStorageMock.clear();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('hexChessStore', () => {
  beforeEach(reset);

  // 1. Initial state after clearGame
  it('starts with all fields null/empty after clearGame', () => {
    const s = useHexChessStore.getState();
    expect(s.state).toBeNull();
    expect(s.gameId).toBeNull();
    expect(s.config).toBeNull();
    expect(s.selectedPieceId).toBeNull();
    expect(s.legalMoveTargets).toHaveLength(0);
    expect(s.lastMove).toBeNull();
  });

  // 2. createGame initialises state
  it('createGame sets state, gameId, and config', () => {
    const config = makeConfig('game-1');
    const id = useHexChessStore.getState().createGame(config);
    const s = useHexChessStore.getState();

    expect(id).toBe('game-1');
    expect(s.gameId).toBe('game-1');
    expect(s.config).toEqual(config);
    expect(s.state).not.toBeNull();
    expect(s.state!.mode).toBe('hexchess');
    expect(s.selectedPieceId).toBeNull();
    expect(s.legalMoveTargets).toHaveLength(0);
  });

  // 3. selectPiece — valid current-player piece
  it('selectPiece sets selectedPieceId and legalMoveTargets for a current-player piece', () => {
    const config = makeConfig();
    useHexChessStore.getState().createGame(config);
    const state = useHexChessStore.getState().state!;

    // Find a soldier belonging to player 0 (current player) that has legal moves.
    const legal = legalMoves(state);
    expect(legal.length).toBeGreaterThan(0);
    const movablePieceId = legal[0].pieceId;

    useHexChessStore.getState().selectPiece(movablePieceId);
    const s = useHexChessStore.getState();

    expect(s.selectedPieceId).toBe(movablePieceId);
    expect(s.legalMoveTargets.length).toBeGreaterThan(0);
    // All returned targets should belong to that piece.
    for (const m of s.legalMoveTargets) {
      expect(m.pieceId).toBe(movablePieceId);
    }
  });

  // 4. selectPiece — opponent piece is rejected
  it('selectPiece ignores opponent pieces and clears selection', () => {
    const config = makeConfig();
    useHexChessStore.getState().createGame(config);
    const state = useHexChessStore.getState().state!;

    // First make a valid selection so we have something to clear.
    const legal = legalMoves(state);
    useHexChessStore.getState().selectPiece(legal[0].pieceId);

    // Now attempt to select a player-1 piece.
    const opponentPiece = state.pieces.find(p => p.player === 1);
    expect(opponentPiece).toBeDefined();
    useHexChessStore.getState().selectPiece(opponentPiece!.id);

    const s = useHexChessStore.getState();
    expect(s.selectedPieceId).toBeNull();
    expect(s.legalMoveTargets).toHaveLength(0);
  });

  // 5. selectPiece(null) clears selection
  it('selectPiece(null) clears selection and legalMoveTargets', () => {
    const config = makeConfig();
    useHexChessStore.getState().createGame(config);
    const state = useHexChessStore.getState().state!;
    const legal = legalMoves(state);

    useHexChessStore.getState().selectPiece(legal[0].pieceId);
    expect(useHexChessStore.getState().selectedPieceId).not.toBeNull();

    useHexChessStore.getState().selectPiece(null);
    const s = useHexChessStore.getState();
    expect(s.selectedPieceId).toBeNull();
    expect(s.legalMoveTargets).toHaveLength(0);
  });

  // 6. attemptMove — legal move succeeds, advances turn
  it('attemptMove with a legal target returns true and advances the turn', () => {
    const config = makeConfig();
    useHexChessStore.getState().createGame(config);
    const state = useHexChessStore.getState().state!;

    const legal = legalMoves(state);
    const move = legal[0];
    useHexChessStore.getState().selectPiece(move.pieceId);

    const result = useHexChessStore.getState().attemptMove(move.to);
    expect(result).toBe(true);

    const s = useHexChessStore.getState();
    // Turn should have advanced to player 1.
    expect(s.state!.currentPlayer).toBe(1);
    // Selection should be cleared.
    expect(s.selectedPieceId).toBeNull();
    expect(s.legalMoveTargets).toHaveLength(0);
    // lastMove should be recorded.
    expect(s.lastMove).not.toBeNull();
    expect(s.lastMove!.pieceId).toBe(move.pieceId);
  });

  // 7. attemptMove — illegal (non-target) cell is rejected
  it('attemptMove with a non-target cell returns false and leaves state unchanged', () => {
    const config = makeConfig();
    useHexChessStore.getState().createGame(config);
    const state = useHexChessStore.getState().state!;

    const legal = legalMoves(state);
    useHexChessStore.getState().selectPiece(legal[0].pieceId);
    const stateBefore = useHexChessStore.getState().state!;

    // Use the piece's current cell as an invalid target (can't move to own cell).
    const invalidTarget = stateBefore.pieces.find(p => p.id === legal[0].pieceId)!.cell;
    const result = useHexChessStore.getState().attemptMove(invalidTarget);

    expect(result).toBe(false);
    // State, selection, turn unchanged.
    const s = useHexChessStore.getState();
    expect(s.state!.currentPlayer).toBe(0);
    expect(s.selectedPieceId).toBe(legal[0].pieceId);
  });

  // 8. resign sets result with winner = other player
  it('resign sets result.winner to the other player', () => {
    const config = makeConfig();
    useHexChessStore.getState().createGame(config);

    // Player 0 resigns (currentPlayer === 0).
    useHexChessStore.getState().resign();
    const s = useHexChessStore.getState();

    expect(s.state!.result).not.toBeNull();
    expect(s.state!.result!.winner).toBe(1);
    expect(s.state!.result!.reason).toBe('resignation');
  });

  // Persistence tests

  // P1. createGame persists to localStorage
  it('createGame writes the game to localStorage', () => {
    const config = makeConfig('persist-create');
    useHexChessStore.getState().createGame(config);
    const saved = loadHexChessGame('persist-create');
    expect(saved).not.toBeNull();
    expect(saved!.id).toBe('persist-create');
    expect(saved!.mode).toBe('hexchess');
  });

  // P2. attemptMove persists updated state
  it('attemptMove persists the updated state to localStorage', () => {
    const config = makeConfig('persist-move');
    useHexChessStore.getState().createGame(config);
    const state = useHexChessStore.getState().state!;
    const legal = legalMoves(state);
    const move = legal[0];
    useHexChessStore.getState().selectPiece(move.pieceId);
    useHexChessStore.getState().attemptMove(move.to);

    const saved = loadHexChessGame('persist-move');
    expect(saved).not.toBeNull();
    // After the move, the saved state's currentPlayer should be 1 (turn advanced).
    expect(saved!.state.currentPlayer).toBe(1);
    // Move history should contain one entry.
    expect(saved!.moveHistory).toHaveLength(1);
  });

  // P3. resign persists the result
  it('resign persists the result to localStorage', () => {
    const config = makeConfig('persist-resign');
    useHexChessStore.getState().createGame(config);
    useHexChessStore.getState().resign();

    const saved = loadHexChessGame('persist-resign');
    expect(saved).not.toBeNull();
    expect(saved!.result).not.toBeNull();
    expect(saved!.result!.winner).toBe(1);
    expect(saved!.result!.reason).toBe('resignation');
  });

  // 9. loadGame and clearGame round-trip
  it('loadGame loads external state and clearGame resets everything', () => {
    const config = makeConfig('loaded-game');
    const savedState: HexChessState = createInitialState(config);

    useHexChessStore.getState().loadGame('loaded-game', savedState, config);
    let s = useHexChessStore.getState();
    expect(s.gameId).toBe('loaded-game');
    expect(s.state).toEqual(savedState);
    expect(s.config).toEqual(config);

    useHexChessStore.getState().clearGame();
    s = useHexChessStore.getState();
    expect(s.state).toBeNull();
    expect(s.gameId).toBeNull();
    expect(s.config).toBeNull();
    expect(s.selectedPieceId).toBeNull();
    expect(s.legalMoveTargets).toHaveLength(0);
    expect(s.lastMove).toBeNull();
  });
});
