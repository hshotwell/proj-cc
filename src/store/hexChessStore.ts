'use client';

import { create } from 'zustand';
import type { CubeCoord, PlayerIndex } from '@/types/game';
import type { HexChessConfig, HexChessState, HexMove, HexPieceType } from '@/game/hexchess';
import {
  createInitialState,
  applyMove,
  legalMoves,
  confirmPromotion as applyConfirmPromotion,
  armCellsForPlayer,
  isInCheck,
} from '@/game/hexchess';
import { cubeEquals, parseCoordKey } from '@/game/coordinates';
import { getDefaultBoardCells } from '@/game/defaultLayout';
import type { BoardView, BoardPiece, BoardHighlight } from '@/types/boardView';
import { kingOf, otherPlayer } from '@/game/hexchess/board';

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

/**
 * Selector that transforms HexChessStoreState into a BoardView consumable by Board.tsx.
 * Returns null when no game is active (state is null).
 */
export function selectHexChessBoardView(store: HexChessStoreState): BoardView | null {
  const { state, config, selectedPieceId, legalMoveTargets, lastMove } = store;

  if (!state || !config) return null;

  // Build all 121 board cells
  const defaultCells = getDefaultBoardCells();
  const cells: CubeCoord[] = Array.from(defaultCells).map(parseCoordKey);

  // Build homeZones: each player's homeZone is the OPPONENT's arm cells (promotion zone)
  const homeZones = new Map<PlayerIndex, CubeCoord[]>();
  for (const player of [0, 1] as const) {
    homeZones.set(player as PlayerIndex, armCellsForPlayer(otherPlayer(player)));
  }

  // Build pieces list from active pieces in state
  const pieces: BoardPiece[] = state.pieces.map(piece => ({
    id: piece.id,
    cell: piece.cell,
    color: config.players[piece.player].color,
    pieceType: piece.type,
    faded: false,
  }));

  // Build highlights
  const highlights: BoardHighlight[] = [];

  // Selection highlight
  if (selectedPieceId !== null) {
    const selectedPiece = state.pieces.find(p => p.id === selectedPieceId);
    if (selectedPiece) {
      highlights.push({ kind: 'selection', cell: selectedPiece.cell });
    }
  }

  // Legal move highlights
  for (const target of legalMoveTargets) {
    const kind = target.capture !== null ? 'legalMoveCapture' : 'legalMoveEmpty';
    highlights.push({ kind, cell: target.to });
  }

  // Last move highlights
  if (lastMove !== null) {
    highlights.push({ kind: 'lastMoveFrom', cell: lastMove.from });
    highlights.push({ kind: 'lastMoveTo', cell: lastMove.to });
  }

  // Check highlight on king if current player is in check
  if (isInCheck(state, state.currentPlayer)) {
    const king = kingOf(state, state.currentPlayer);
    if (king) {
      highlights.push({ kind: 'check', cell: king.cell });
    }
  }

  return {
    cells,
    homeZones,
    pieces,
    highlights,
    animatingMove: null,
    rotation: 0,
    activePlayerIndex: state.currentPlayer as PlayerIndex,
  };
}
