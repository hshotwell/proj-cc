'use client';

import { getPlayerColorFromState, getPlayerDisplayName } from '@/game/colors';
import { useGameStore } from '@/store/gameStore';

export function MoveConfirmation() {
  const { gameState, pendingConfirmation, validMovesForSelected, confirmMove, undoLastMove } = useGameStore();

  if (!gameState || !pendingConfirmation) return null;

  // Hide during AI turns - AI auto-confirms
  if (gameState.aiPlayers?.[gameState.currentPlayer]) return null;

  const player = gameState.currentPlayer;
  const color = getPlayerColorFromState(player, gameState);
  const name = getPlayerDisplayName(player, gameState.activePlayers);
  const hasMoreMoves = validMovesForSelected.length > 0;

  return (
    <div className="fixed inset-0 flex items-end justify-center pb-8 pointer-events-none z-50">
      <div
        className="pointer-events-auto bg-white rounded-xl shadow-2xl border-2 p-4 flex flex-col gap-2"
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
            >
              Undo
            </button>
            <button
              onClick={confirmMove}
              className="px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors"
              style={{ backgroundColor: color }}
            >
              Confirm
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
