'use client';

import { create } from 'zustand';
import type { CubeCoord, PlayerIndex } from '@/types/game';
import type { HexChessConfig, HexChessState, HexMove, HexPiece, HexPieceType, HexPlayerIndex } from '@/game/hexchess';
import {
  createInitialState,
  applyMove,
  legalMoves,
  confirmPromotion as applyConfirmPromotion,
  isInCheck,
  geometryOf,
  uprightRotationDeg,
} from '@/game/hexchess';
import { applyResign } from '@/game/hexchess/onlineState';
import { cubeEquals, parseCoordKey, coordKey, cubeToPixel } from '@/game/coordinates';
import { ROTATION_FOR_PLAYER } from '@/game/constants';
import type { BoardView, BoardPiece, BoardHighlight } from '@/types/boardView';
import { kingOf, isEliminated, livingPlayers } from '@/game/hexchess/board';
import { saveHexChessGame, loadHexChessGame } from '@/game/hexchess/persistence';
import { playStep, playCapture, playCheck, playCheckmate } from '@/audio/soundEffects';

/** Duration (ms) the captured piece overlay persists for the fade-out animation. */
const CAPTURE_ANIM_DURATION_MS = 400;

/** Captured piece kept alive in the store for the fade-out window. */
export interface AnimatingCapture {
  piece: HexPiece;
  startedAt: number;
}

export interface QueuedHexPreMove {
  pieceId: string;
  to: CubeCoord;
  promotion: HexPieceType | null;
}

export const HEX_MAX_PRE_MOVES = 3;

interface HexChessStoreState {
  state: HexChessState | null;
  gameId: string | null;
  config: HexChessConfig | null;
  selectedPieceId: string | null;
  legalMoveTargets: HexMove[];
  lastMove: HexMove | null;
  animatingCapture: AnimatingCapture | null;
  captureTimeoutId: ReturnType<typeof setTimeout> | null;
  preMoves: QueuedHexPreMove[];
  preMoveSelectedPieceId: string | null;
  pendingPreMovePromotion: { pieceId: string; to: CubeCoord } | null;

  createGame: (config: HexChessConfig) => string;
  selectPiece: (pieceId: string | null) => void;
  attemptMove: (targetCell: CubeCoord) => boolean;
  confirmPromotion: (choice: HexPieceType) => void;
  resign: (seat?: HexPlayerIndex) => void;
  loadGame: (id: string, savedState: HexChessState, savedConfig: HexChessConfig) => void;
  clearGame: () => void;
  selectPreMovePiece: (pieceId: string | null) => void;
  queuePreMove: (to: CubeCoord) => void;
  confirmPreMovePromotion: (choice: HexPieceType) => void;
  cancelPreMovePromotion: () => void;
  cancelPreMoveAt: (index: number) => void;
  clearAllPreMoves: () => void;
  getVirtualPieces: () => HexPiece[];
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
  preMoves: [],
  preMoveSelectedPieceId: null,
  pendingPreMovePromotion: null,

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
      preMoves: [],
      preMoveSelectedPieceId: null,
      pendingPreMovePromotion: null,
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

    // Sound effects. Order matters: base move sound first, then check/mate escalations
    // if the mover just delivered them.
    if (move.capture !== null) {
      playCapture(currentConfig?.players[move.player]?.color);
    } else {
      playStep();
    }
    const capturedAKing =
      nextState.eliminated.length > state.eliminated.length;
    if (nextState.result?.reason === 'checkmate' || capturedAKing) {
      // Checkmate in 2p, or a king actually captured in multiplayer — the
      // elimination fanfare.
      playCheckmate();
    } else if (
      nextState.result === null &&
      livingPlayers(nextState).some(seat => isInCheck(nextState, seat))
    ) {
      playCheck();
    }
    return true;
  },

  confirmPromotion(choice) {
    const { state, config } = get();
    if (!state || !state.pendingPromotion) return;

    const nextState = applyConfirmPromotion(state, choice);
    set({ state: nextState });
    if (config) saveHexChessGame(config, nextState);
  },

  resign(seat) {
    const { state, config } = get();
    if (!state || state.result !== null) return;

    const resigningSeat = seat ?? state.currentPlayer;
    const nextState = applyResign(state, resigningSeat);
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
      preMoves: [],
      preMoveSelectedPieceId: null,
      pendingPreMovePromotion: null,
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
      preMoves: [],
      preMoveSelectedPieceId: null,
      pendingPreMovePromotion: null,
    });
  },

  // ---- Pre-moves ----

  selectPreMovePiece(pieceId) {
    const { preMoveSelectedPieceId } = get();
    if (pieceId === null || preMoveSelectedPieceId === pieceId) {
      set({ preMoveSelectedPieceId: null });
      return;
    }
    set({ preMoveSelectedPieceId: pieceId });
  },

  queuePreMove(to) {
    const { state, preMoveSelectedPieceId, preMoves } = get();
    if (!state || preMoveSelectedPieceId === null) return;
    if (preMoves.length >= HEX_MAX_PRE_MOVES) return;

    const piece = state.pieces.find(p => p.id === preMoveSelectedPieceId);
    if (!piece) {
      set({ preMoveSelectedPieceId: null });
      return;
    }

    const isPromotable = piece.type === 'soldier' || piece.type === 'pawn';
    if (isPromotable && (geometryOf(state).promotionCells[piece.player]?.has(coordKey(to)) ?? false)) {
      set({
        pendingPreMovePromotion: { pieceId: piece.id, to },
        preMoveSelectedPieceId: null,
      });
      return;
    }

    set({
      preMoves: [...preMoves, { pieceId: piece.id, to, promotion: null }],
      preMoveSelectedPieceId: null,
    });
  },

  confirmPreMovePromotion(choice) {
    const { pendingPreMovePromotion, preMoves } = get();
    if (!pendingPreMovePromotion) return;
    set({
      preMoves: [...preMoves, {
        pieceId: pendingPreMovePromotion.pieceId,
        to: pendingPreMovePromotion.to,
        promotion: choice,
      }],
      pendingPreMovePromotion: null,
    });
  },

  cancelPreMovePromotion() {
    const { pendingPreMovePromotion } = get();
    if (!pendingPreMovePromotion) return;
    set({
      preMoveSelectedPieceId: pendingPreMovePromotion.pieceId,
      pendingPreMovePromotion: null,
    });
  },

  cancelPreMoveAt(index) {
    const { preMoves } = get();
    if (index < 0 || index >= preMoves.length) return;
    set({ preMoves: preMoves.slice(0, index) });
  },

  clearAllPreMoves() {
    set({ preMoves: [], preMoveSelectedPieceId: null, pendingPreMovePromotion: null });
  },

  getVirtualPieces() {
    const { state, preMoves } = get();
    if (!state) return [];
    let pieces = state.pieces.map(p => ({ ...p }));
    for (const pm of preMoves) {
      pieces = pieces
        .filter(p => !(cubeEquals(p.cell, pm.to) && p.id !== pm.pieceId))
        .map(p => (p.id === pm.pieceId ? { ...p, cell: pm.to } : p));
    }
    return pieces;
  },
}));

/**
 * Selector that transforms HexChessStoreState into a BoardView consumable by Board.tsx.
 * Returns null when no game is active (state is null).
 */
export function selectHexChessBoardView(store: HexChessStoreState): BoardView | null {
  const { state, config, selectedPieceId, legalMoveTargets, lastMove } = store;
  // animatingCapture / pre-move fields may be absent in legacy test snapshots (passed via `as never`)
  const animatingCapture: AnimatingCapture | null = store.animatingCapture ?? null;
  const preMoves: QueuedHexPreMove[] = store.preMoves ?? [];
  const preMoveSelectedPieceId: string | null = store.preMoveSelectedPieceId ?? null;

  if (!state || !config) return null;

  // Board cells from geometry: the 121-star for standard games, the custom
  // layout's cells (minus nothing — walls render separately) otherwise.
  const geom = geometryOf(state);
  const cells: CubeCoord[] = Array.from(geom.cells).map(parseCoordKey);

  // No home-zone tinting on the star points — the 3-shade beige/brown board
  // pattern already indicates position clearly, and the arms are visually
  // distinct via their star shape.
  const homeZones = new Map<PlayerIndex, CubeCoord[]>();

  // Eliminated players' frozen armies keep their owner's color but render as
  // faded ghosts (grayscale + opacity in Board.tsx) — so a living grey army
  // stays distinguishable from the dead.
  const colorForSeat = (seat: HexPlayerIndex): string => config.players[seat]!.color;

  // Build pieces list from active pieces in state
  const pieces: BoardPiece[] = state.pieces.map(piece => ({
    id: piece.id,
    cell: piece.cell,
    color: colorForSeat(piece.player),
    pieceType: piece.type,
    faded: false,
    eliminated: isEliminated(state, piece.player),
  }));

  // If a capture animation is in progress, overlay the captured piece as faded
  // so Board.tsx can render it fading out. applyMove already removed it from
  // state.pieces, so we append it here for the duration of the animation window.
  if (animatingCapture !== null) {
    const cp = animatingCapture.piece;
    pieces.push({
      id: cp.id,
      cell: cp.cell,
      color: colorForSeat(cp.player),
      pieceType: cp.type,
      faded: true,
      eliminated: isEliminated(state, cp.player),
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
    if (target.capture !== null && !cubeEquals(target.capture.cell, target.to)) {
      // En passant: the captured piece is not on the destination cell. The
      // destination gets an arrowhead pointing at the doomed piece, which is
      // ringed as a capture target too.
      highlights.push({ kind: 'legalMoveCapture', cell: target.to, toward: target.capture.cell });
      highlights.push({ kind: 'legalMoveCapture', cell: target.capture.cell });
    } else {
      const kind = target.capture !== null ? 'legalMoveCapture' : 'legalMoveEmpty';
      highlights.push({ kind, cell: target.to });
    }
  }

  // Last move highlights
  if (lastMove !== null) {
    highlights.push({ kind: 'lastMoveFrom', cell: lastMove.from });
    highlights.push({ kind: 'lastMoveTo', cell: lastMove.to });
  }

  // Check highlight on every living king currently attacked (with 3+ players
  // several kings can be in check at once).
  for (const seat of livingPlayers(state)) {
    if (isInCheck(state, seat)) {
      const king = kingOf(state, seat);
      if (king) {
        highlights.push({ kind: 'check', cell: king.cell });
      }
    }
  }

  // Pre-move highlights: walk the queue in order, tracking each pre-moved
  // piece's virtual cell so multi-hop plans for the same piece chain correctly.
  if (preMoves.length > 0 || preMoveSelectedPieceId !== null) {
    const virtualCellByPieceId = new Map<string, CubeCoord>(
      state.pieces.map(p => [p.id, p.cell] as const)
    );
    for (const pm of preMoves) {
      const fromCell = virtualCellByPieceId.get(pm.pieceId);
      if (fromCell) highlights.push({ kind: 'preMoveFrom', cell: fromCell });
      highlights.push({ kind: 'preMoveTo', cell: pm.to });
      virtualCellByPieceId.set(pm.pieceId, pm.to);
    }
    if (preMoveSelectedPieceId !== null) {
      const cell = virtualCellByPieceId.get(preMoveSelectedPieceId);
      if (cell) highlights.push({ kind: 'preMoveFrom', cell });
    }
  }

  // Hex chess rotation: orient the board so a seat's army sits at the BOTTOM
  // with its forward direction pointing up — derived from geometry, so it
  // works on custom boards wherever the armies are placed. (On the standard
  // star this reproduces the old per-corner ROTATION_FOR_PLAYER angles.)
  // The rotated30 display offset is applied on top by Board.tsx, so the base
  // rotation compensates for it.
  const rotationOffset = state.layout?.rotated30 ? 30 : 0;
  const rotationForSeat = (p: HexPlayerIndex): number => {
    const fwd = geom.forward[p];
    if (fwd) return uprightRotationDeg(fwd.dir) - rotationOffset;
    if (state.layout) {
      // Army without a derived forward (no pawns/promotion tiles): point its
      // starting centroid toward the bottom of the screen instead.
      const own = Object.entries(state.layout.pieces)
        .filter(([, pc]) => pc.player === p)
        .map(([k]) => parseCoordKey(k));
      if (own.length > 0) {
        const centroid = (cells: CubeCoord[]) => {
          let x = 0, y = 0;
          for (const c of cells) { const px = cubeToPixel(c, 1); x += px.x; y += px.y; }
          return { x: x / cells.length, y: y / cells.length };
        };
        const board = centroid(Array.from(geom.cells).map(parseCoordKey));
        const army = centroid(own);
        const angle = (Math.atan2(army.y - board.y, army.x - board.x) * 180) / Math.PI;
        let rot = 90 - angle - rotationOffset;
        while (rot <= -180) rot += 360;
        while (rot > 180) rot -= 360;
        return Math.round(rot * 1000) / 1000;
      }
      return 0;
    }
    return ROTATION_FOR_PLAYER[p as PlayerIndex];
  };
  const firstHumanSeat = config.seats.find(s => !config.ai || !config.ai[s]);
  const initialFocusPlayer: HexPlayerIndex = firstHumanSeat ?? config.seats[0];
  const activeRotation = rotationForSeat(state.currentPlayer);
  const initialRotation = rotationForSeat(initialFocusPlayer);

  // Expose the currently-fading captured piece as a burst signal for particles.
  const captureBurst = animatingCapture
    ? {
        cell: animatingCapture.piece.cell,
        color: colorForSeat(animatingCapture.piece.player),
        // key is stable per capture (piece id + timestamp) so Board can dedupe
        key: `${animatingCapture.piece.id}-${animatingCapture.startedAt}`,
      }
    : null;

  return {
    cells,
    homeZones,
    pieces,
    highlights,
    animatingMove: null,
    rotation: 0,
    activePlayerIndex: state.currentPlayer as PlayerIndex,
    activePlayerColor: config.players[state.currentPlayer]?.color,
    activePlayerIsAI: !!(config.ai && config.ai[state.currentPlayer]),
    initialRotation,
    activeRotation,
    captureBurst,
    playerColors: Object.fromEntries(
      config.seats.map(s => [s, colorForSeat(s)])
    ) as Record<number, string>,
    gameId: config.id,
    walls: Array.from(geom.walls).map(parseCoordKey),
    rotationOffset,
  };
}
