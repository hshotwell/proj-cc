'use client';

import { getPlayerColorFromState } from '@/game/colors';
import { getCSSColor } from '@/game/constants';
import { useGameStore } from '@/store/gameStore';
import type { PlayerIndex } from '@/types/game';

interface ClearPreMovesButtonProps {
  localPlayer: PlayerIndex | undefined;
}

export function ClearPreMovesButton({ localPlayer }: ClearPreMovesButtonProps) {
  const preMoves = useGameStore((s) => s.preMoves);
  const gameState = useGameStore((s) => s.gameState);
  const clearAllPreMoves = useGameStore((s) => s.clearAllPreMoves);

  if (preMoves.length === 0 || localPlayer === undefined || !gameState) return null;

  const color = getPlayerColorFromState(localPlayer, gameState);
  const label = preMoves.length === 1 ? 'Clear pre-move' : `Clear ${preMoves.length} pre-moves`;

  return (
    <div className="flex justify-center mt-4">
      <button
        onClick={clearAllPreMoves}
        className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors border-2"
        style={{ borderColor: getCSSColor(color) }}
      >
        {label}
      </button>
    </div>
  );
}
