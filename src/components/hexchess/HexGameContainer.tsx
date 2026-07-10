'use client';

import Link from 'next/link';
import { useHexChessStore, selectHexChessBoardView } from '@/store/hexChessStore';
import { Board } from '@/components/board/Board';
import { SettingsButton } from '@/components/SettingsButton';
import { SettingsPopup } from '@/components/SettingsPopup';
import { PromotionPicker } from '@/components/hexchess/PromotionPicker';
import { HexTurnIndicator } from '@/components/hexchess/HexTurnIndicator';
import { HexMoveIndicator } from '@/components/hexchess/HexMoveIndicator';
import { HexGameOverDialog } from '@/components/hexchess/HexGameOverDialog';
import type { CubeCoord } from '@/types/game';
import { cubeEquals } from '@/game/coordinates';
import { useHexChessAITurn } from '@/hooks/useHexChessAITurn';

export function HexGameContainer() {
  useHexChessAITurn();
  const store = useHexChessStore();
  const view = selectHexChessBoardView(store);

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
            />
          )}
          {store.state.pendingPromotion && (
            <PromotionPicker
              pieceCell={store.state.pendingPromotion.targetCell}
              playerColor={currentColor}
              onChoose={handlePromote}
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
