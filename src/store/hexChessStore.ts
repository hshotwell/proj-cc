'use client';

import { create } from 'zustand';
import type { CubeCoord } from '@/types/game';
import type { HexChessConfig, HexChessState, HexMove, HexPieceType } from '@/game/hexchess';
import {
  createInitialState,
  applyMove,
  legalMoves,
  confirmPromotion as applyConfirmPromotion,
} from '@/game/hexchess';
import { cubeEquals } from '@/game/coordinates';

interface HexChessStoreState {
  state: HexChessState | null;
  gameId: string | null;
  config: HexChessConfig | null;
  selectedPieceId: string | null;
  legalMoveTargets: HexMove[];
  lastMove: HexMove | null;

  createGame: (config: HexChessConfig) => string;
  selectPiece: (pieceId: string | null) => void;
  attemptMove: (targetCell: CubeCoord) => boolean;
  confirmPromotion: (choice: HexPieceType) => void;
  resign: () => void;
  loadGame: (id: string, savedState: HexChessState, savedConfig: HexChessConfig) => void;
  clearGame: () => void;
}

export const useHexChessStore = create<HexChessStoreState>((set, get) => ({
  state: null,
  gameId: null,
  config: null,
  selectedPieceId: null,
  legalMoveTargets: [],
  lastMove: null,

  createGame(config) {
    const state = createInitialState(config);
    set({
      state,
      gameId: config.id,
      config,
      selectedPieceId: null,
      legalMoveTargets: [],
      lastMove: null,
    });
    return config.id;
  },

  selectPiece(pieceId) {
    const { state } = get();

    // Clear selection when null or no game active.
    if (pieceId === null || !state) {
      set({ selectedPieceId: null, legalMoveTargets: [] });
      return;
    }

    // Reject if game is over or a promotion is pending.
    if (state.result !== null || state.pendingPromotion !== null) {
      set({ selectedPieceId: null, legalMoveTargets: [] });
      return;
    }

    // Find the piece.
    const piece = state.pieces.find(p => p.id === pieceId);
    if (!piece || piece.player !== state.currentPlayer) {
      // Invalid piece or belongs to opponent — clear selection.
      set({ selectedPieceId: null, legalMoveTargets: [] });
      return;
    }

    // Compute legal move targets for this piece.
    const allLegal = legalMoves(state);
    const targets = allLegal.filter(m => m.pieceId === pieceId);

    set({ selectedPieceId: pieceId, legalMoveTargets: targets });
  },

  attemptMove(targetCell) {
    const { state, selectedPieceId, legalMoveTargets } = get();

    if (!state || selectedPieceId === null) return false;

    const move = legalMoveTargets.find(m => cubeEquals(m.to, targetCell));
    if (!move) return false;

    const nextState = applyMove(state, move);
    set({
      state: nextState,
      lastMove: move,
      selectedPieceId: null,
      legalMoveTargets: [],
    });
    return true;
  },

  confirmPromotion(choice) {
    const { state } = get();
    if (!state || !state.pendingPromotion) return;

    const nextState = applyConfirmPromotion(state, choice);
    set({ state: nextState });
  },

  resign() {
    const { state } = get();
    if (!state || state.result !== null) return;

    const winner: 0 | 1 = state.currentPlayer === 0 ? 1 : 0;
    const nextState: HexChessState = {
      ...state,
      result: { winner, reason: 'resignation' },
    };
    set({ state: nextState });
  },

  loadGame(id, savedState, savedConfig) {
    set({
      gameId: id,
      state: savedState,
      config: savedConfig,
      selectedPieceId: null,
      legalMoveTargets: [],
      lastMove: null,
    });
  },

  clearGame() {
    set({
      state: null,
      gameId: null,
      config: null,
      selectedPieceId: null,
      legalMoveTargets: [],
      lastMove: null,
    });
  },
}));
