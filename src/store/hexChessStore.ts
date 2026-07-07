'use client';

import { create } from 'zustand';
import type { CubeCoord, PlayerIndex } from '@/types/game';
import type { HexChessConfig, HexChessState, HexMove, HexPiece, HexPieceType } from '@/game/hexchess';
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
import { saveHexChessGame, loadHexChessGame } from '@/game/hexchess/persistence';

/** Duration (ms) the captured piece overlay persists for the fade-out animation. */
const CAPTURE_ANIM_DURATION_MS = 400;

/** Captured piece kept alive in the store for the fade-out window. */
export interface AnimatingCapture {
  piece: HexPiece;
  startedAt: number;
}

interface HexChessStoreState {
  state: HexChessState | null;
  gameId: string | null;
  config: HexChessConfig | null;
  selectedPieceId: string | null;
  legalMoveTargets: HexMove[];
  lastMove: HexMove | null;
  animatingCapture: AnimatingCapture | null;
  captureTimeoutId: ReturnType<typeof setTimeout> | null;

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
  animatingCapture: null,
  captureTimeoutId: null,

  createGame(config) {
    const { captureTimeoutId } = get();
    if (captureTimeoutId !== null) clearTimeout(captureTimeoutId);
    const state = createInitialState(config);
    set({
      state,
      gameId: config.id,
      config,
      selectedPieceId: null,
      legalMoveTargets: [],
      lastMove: null,
      animatingCapture: null,
      captureTimeoutId: null,
    });
    saveHexChessGame(config, state);
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

    // Cancel any pending capture-animation timeout from a prior move, so a rapid
    // second capture is not cleared by the first move's stale timer.
    const { captureTimeoutId: existingTimeout } = get();
    if (existingTimeout !== null) clearTimeout(existingTimeout);

    // If this move captures a piece, snapshot the captured piece BEFORE applyMove
    // removes it from state.pieces, so we can animate its fade-out.
    let animatingCapture: AnimatingCapture | null = null;
    let captureTimeoutId: ReturnType<typeof setTimeout> | null = null;
    if (move.capture !== null) {
      const capturedPiece = state.pieces.find(p => p.id === move.capture!.pieceId);
      if (capturedPiece) {
        animatingCapture = { piece: capturedPiece, startedAt: Date.now() };
        // Schedule automatic cleanup after the animation window.
        captureTimeoutId = setTimeout(() => {
          set({ animatingCapture: null, captureTimeoutId: null });
        }, CAPTURE_ANIM_DURATION_MS);
      }
    }

    const nextState = applyMove(state, move);
    set({
      state: nextState,
      lastMove: move,
      selectedPieceId: null,
      legalMoveTargets: [],
      animatingCapture,
      captureTimeoutId,
    });
    const { config: currentConfig } = get();
    if (currentConfig) saveHexChessGame(currentConfig, nextState);
    return true;
  },

  confirmPromotion(choice) {
    const { state, config } = get();
    if (!state || !state.pendingPromotion) return;

    const nextState = applyConfirmPromotion(state, choice);
    set({ state: nextState });
    if (config) saveHexChessGame(config, nextState);
  },

  resign() {
    const { state, config } = get();
    if (!state || state.result !== null) return;

    const winner: 0 | 1 = state.currentPlayer === 0 ? 1 : 0;
    const nextState: HexChessState = {
      ...state,
      result: { winner, reason: 'resignation' },
    };
    set({ state: nextState });
    if (config) saveHexChessGame(config, nextState);
  },

  loadGame(id, savedState, savedConfig) {
    const { captureTimeoutId } = get();
    if (captureTimeoutId !== null) clearTimeout(captureTimeoutId);
    set({
      gameId: id,
      state: savedState,
      config: savedConfig,
      selectedPieceId: null,
      legalMoveTargets: [],
      lastMove: null,
      animatingCapture: null,
      captureTimeoutId: null,
    });
    // Only persist if this game isn't already in localStorage — avoid bumping
    // updatedAt (and reordering the replay list) on every page mount.
    if (loadHexChessGame(id) === null) {
      saveHexChessGame(savedConfig, savedState);
    }
  },

  clearGame() {
    const { captureTimeoutId } = get();
    if (captureTimeoutId !== null) clearTimeout(captureTimeoutId);
    set({
      state: null,
      gameId: null,
      config: null,
      selectedPieceId: null,
      legalMoveTargets: [],
      lastMove: null,
      animatingCapture: null,
      captureTimeoutId: null,
    });
  },
}));

/**
 * Selector that transforms HexChessStoreState into a BoardView consumable by Board.tsx.
 * Returns null when no game is active (state is null).
 */
export function selectHexChessBoardView(store: HexChessStoreState): BoardView | null {
  const { state, config, selectedPieceId, legalMoveTargets, lastMove } = store;
  // animatingCapture may be absent in legacy test snapshots (passed via `as never`)
  const animatingCapture: AnimatingCapture | null = store.animatingCapture ?? null;

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

  // If a capture animation is in progress, overlay the captured piece as faded
  // so Board.tsx can render it fading out. applyMove already removed it from
  // state.pieces, so we append it here for the duration of the animation window.
  if (animatingCapture !== null) {
    const cp = animatingCapture.piece;
    pieces.push({
      id: cp.id,
      cell: cp.cell,
      color: config.players[cp.player].color,
      pieceType: cp.type,
      faded: true,
    });
  }

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
