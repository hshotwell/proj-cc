'use client';

import { useEffect } from 'react';
import { getPlayerColorFromState, getPlayerDisplayNameFromState } from '@/game/colors';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';

export function MoveConfirmation() {
  const { gameState, pendingConfirmation, validMovesForSelected, confirmMove, undoLastMove, undoConfirmedMove, canUndoConfirmedMove } = useGameStore();
  const { autoConfirm } = useSettingsStore();

  const canUndoConfirmed = canUndoConfirmedMove();

  // Keyboard shortcuts: 'u' for undo, 'c' for confirm
  useEffect(() => {
    // Check if we're in last-player undo mode (only for human players)
    const isLastPlayerAI = gameState?.aiPlayers?.[gameState.currentPlayer] != null;
    if (canUndoConfirmed && !pendingConfirmation && !isLastPlayerAI) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        if (e.key === 'u' || e.key === 'U') {
          e.preventDefault();
          undoConfirmedMove();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }

    // Normal pending confirmation keyboard shortcuts
    if (autoConfirm) return;
    if (!gameState || !pendingConfirmation) return;
    if (gameState.aiPlayers?.[gameState.currentPlayer]) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        undoLastMove();
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        confirmMove();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [autoConfirm, gameState, pendingConfirmation, confirmMove, undoLastMove, canUndoConfirmed, undoConfirmedMove]);

  // Show persistent undo button for last remaining player (bottom-left)
  // But only if the last player is human, not AI
  if (canUndoConfirmed && !pendingConfirmation && gameState) {
    const player = gameState.currentPlayer;
    const isAI = gameState.aiPlayers?.[player] != null;

    // Don't show undo button for AI players
    if (isAI) return null;

    const color = getPlayerColorFromState(player, gameState);

    return (
      <div className="flex justify-start mt-4">
        <button
          onClick={undoConfirmedMove}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors border-2"
          style={{ borderColor: color }}
          title="Press 'U' to undo"
        >
          Undo Move <span className="text-xs text-gray-400">(U)</span>
        </button>
      </div>
    );
  }

  // Don't show confirmation UI when auto-confirm is enabled
  if (autoConfirm) return null;

  if (!gameState || !pendingConfirmation) return null;

  // Hide during AI turns - AI auto-confirms
  if (gameState.aiPlayers?.[gameState.currentPlayer]) return null;

  const player = gameState.currentPlayer;
  const color = getPlayerColorFromState(player, gameState);
  const name = getPlayerDisplayNameFromState(player, gameState);
  const hasMoreMoves = validMovesForSelected.length > 0;

  return (
    <div className="flex justify-center mt-4">
      <div
        className="bg-white rounded-xl shadow-lg border-2 p-4 flex flex-col gap-2"
        style={{ borderColor: color }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-8 h-8 rounded-full border-2 border-white shadow"
            style={{ backgroundColor: color }}
          />
          <div className="text-sm">
            <span className="font-semibold" style={{ color }}>{name}</span>
            <span className="text-gray-600"> moved</span>
          </div>
          <div className="flex gap-2 ml-2">
            <button
              onClick={undoLastMove}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
              title="Press 'U' to undo"
            >
              Undo <span className="text-xs text-gray-400">(U)</span>
            </button>
            <button
              onClick={confirmMove}
              className="px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors"
              style={{ backgroundColor: color }}
              title="Press 'C' to confirm"
            >
              Confirm <span className="text-xs text-white/70">(C)</span>
            </button>
          </div>
        </div>
        {hasMoreMoves && (
          <div className="text-xs text-gray-500 text-center">
            Click a highlighted space to continue moving, or confirm to end turn
          </div>
        )}
      </div>
    </div>
  );
}
