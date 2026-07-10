'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useHexChessStore, selectHexChessBoardView } from '@/store/hexChessStore';
import { useSettingsStore } from '@/store/settingsStore';
import { Board } from '@/components/board/Board';
import { SettingsButton } from '@/components/SettingsButton';
import { SettingsPopup } from '@/components/SettingsPopup';
import { PromotionPicker } from '@/components/hexchess/PromotionPicker';
import { HexTurnIndicator } from '@/components/hexchess/HexTurnIndicator';
import { HexMoveIndicator } from '@/components/hexchess/HexMoveIndicator';
import { HexGameOverDialog } from '@/components/hexchess/HexGameOverDialog';
import { HexClearPreMovesButton } from '@/components/hexchess/HexClearPreMovesButton';
import type { CubeCoord } from '@/types/game';
import type { HexPlayerIndex } from '@/game/hexchess/state';
import { cubeEquals } from '@/game/coordinates';
import { useHexChessAITurn } from '@/hooks/useHexChessAITurn';
import { useHexChessPreMoveFiring } from '@/hooks/useHexChessPreMoveFiring';

export function HexGameContainer() {
  useHexChessAITurn();
  const store = useHexChessStore();
  const view = selectHexChessBoardView(store);
  const preMovesSetting = useSettingsStore((s) => s.preMoves);

  const humanPlayers = store.config
    ? ([0, 1] as const).filter((p) => !store.config!.ai?.[p])
    : [];
  const localPlayer: HexPlayerIndex | undefined =
    humanPlayers.length === 1 ? (humanPlayers[0] as HexPlayerIndex) : undefined;
  const preMovesAllowed = !!(
    preMovesSetting &&
    localPlayer !== undefined &&
    store.state &&
    store.state.result === null &&
    store.state.currentPlayer !== localPlayer &&
    store.state.pendingPromotion === null
  );

  useHexChessPreMoveFiring(localPlayer, preMovesSetting && localPlayer !== undefined);

  // Drop any queued pre-moves if the setting is turned off mid-game, or the
  // game ends — stale queued highlights shouldn't linger over the game-over UI.
  useEffect(() => {
    if (!preMovesSetting) useHexChessStore.getState().clearAllPreMoves();
  }, [preMovesSetting]);
  useEffect(() => {
    if (store.state?.result) useHexChessStore.getState().clearAllPreMoves();
  }, [store.state?.result]);

  /**
   * Route board cell clicks to the hex chess store:
   * 1. If a legal move targets this cell -> attemptMove.
   * 2. If the cell holds a current-player piece -> selectPiece.
   * 3. Otherwise clear selection.
   */
  const handleCellClick = (cell: CubeCoord) => {
    // Always read the freshest store snapshot — the outer `store` closure captured
    // at render time can be stale between rapid clicks in the same frame.
    const s = useHexChessStore.getState();
    const state = s.state;
    if (!state) return;

    // Pre-move mode: divert clicks away from the normal move flow entirely,
    // including the AI-turn guard below (pre-moves are queued precisely
    // because it's the AI's turn).
    if (preMovesAllowed) {
      const virtualPieces = s.getVirtualPieces();
      const hit = virtualPieces.find((p) => cubeEquals(p.cell, cell));
      if (hit && localPlayer !== undefined && hit.player === localPlayer) {
        s.selectPreMovePiece(hit.id);
      } else if (s.preMoveSelectedPieceId !== null) {
        s.queuePreMove(cell);
      }
      return;
    }

    // Never let the human move on an AI player's turn. Prevents both accidental
    // input during the AI's think time and any lingering ability to nudge AI
    // pieces if the worker times out.
    if (s.config?.ai && s.config.ai[state.currentPlayer]) {
      return;
    }

    // Legal move destination takes priority over re-selection.
    const isLegal = s.legalMoveTargets.some((m) => cubeEquals(m.to, cell));
    if (isLegal) {
      s.attemptMove(cell);
      return;
    }

    // Check if a piece belonging to the current player is on this cell.
    const piece = state.pieces.find(
      (p) => p.player === state.currentPlayer && cubeEquals(p.cell, cell),
    );
    if (piece) {
      // Clicking the already-selected piece deselects it (matches Chinese Checkers).
      if (s.selectedPieceId === piece.id) {
        s.selectPiece(null);
      } else {
        s.selectPiece(piece.id);
      }
      return;
    }

    // Nothing actionable — clear selection.
    s.selectPiece(null);
  };

  const handleCellRightClick = (cell: CubeCoord) => {
    if (!preMovesAllowed) return;
    const s = useHexChessStore.getState();

    const idx = s.preMoves.findIndex((pm) => cubeEquals(pm.to, cell));
    if (idx >= 0) {
      s.cancelPreMoveAt(idx);
      return;
    }

    if (s.preMoveSelectedPieceId !== null) {
      const virtualPieces = s.getVirtualPieces();
      const selected = virtualPieces.find((p) => p.id === s.preMoveSelectedPieceId);
      if (selected && cubeEquals(selected.cell, cell)) {
        s.selectPreMovePiece(null);
      }
    }
  };

  const handlePromote = (choice: Parameters<typeof store.confirmPromotion>[0]) => {
    store.confirmPromotion(choice);
  };

  const handleResign = () => {
    if (window.confirm('Really resign?')) {
      store.resign();
    }
  };

  const handleNewGame = () => {
    store.clearGame();
    window.location.href = '/play';
  };

  const handleHome = () => {
    window.location.href = '/home';
  };

  if (!store.state || !store.config) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-600 mb-3">Game not found or not yet loaded.</div>
          <Link href="/play" className="text-blue-600 hover:underline">
            Return to Play
          </Link>
        </div>
      </div>
    );
  }

  const currentColor = store.config.players[store.state.currentPlayer].color;

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <div className="w-full max-w-2xl mx-auto px-2 sm:px-4 py-2 sm:py-4">
        <Link
          href="/home"
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-2 transition-colors"
        >
          &larr; Home
        </Link>

        {/* Board card */}
        <div className="relative w-full bg-white rounded-lg shadow-lg p-2 sm:p-4">
          <SettingsButton />
          {view && (
            <Board
              view={view}
              onCellClick={handleCellClick}
              onCellRightClick={handleCellRightClick}
            />
          )}
          {store.state.pendingPromotion && (
            <PromotionPicker
              pieceCell={store.state.pendingPromotion.targetCell}
              playerColor={currentColor}
              onChoose={handlePromote}
            />
          )}
          {!store.state.pendingPromotion && store.pendingPreMovePromotion && localPlayer !== undefined && (
            <PromotionPicker
              pieceCell={store.pendingPreMovePromotion.to}
              playerColor={store.config.players[localPlayer].color}
              onChoose={(choice) => store.confirmPreMovePromotion(choice)}
              onCancel={() => store.cancelPreMovePromotion()}
            />
          )}
        </div>

        {/* Last-move summary + resign */}
        <div className="mt-2 sm:mt-3">
          <HexMoveIndicator
            lastMove={store.lastMove}
            canResign={store.state.result === null}
            onResign={handleResign}
          />
        </div>

        {preMovesAllowed && <HexClearPreMovesButton localPlayer={localPlayer} />}

        {/* Turn indicator */}
        <div className="mt-2 sm:mt-3">
          <HexTurnIndicator state={store.state} config={store.config} />
        </div>
      </div>

      {/* Game-over dialog (fixed overlay) */}
      <HexGameOverDialog
        state={store.state}
        config={store.config}
        onNewGame={handleNewGame}
        onHome={handleHome}
      />

      {/* Settings popup — renders only when settingsMenuOpen */}
      <SettingsPopup mode="hexchess" />
    </div>
  );
}
