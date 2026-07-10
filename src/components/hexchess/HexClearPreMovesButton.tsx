'use client';

import { useHexChessStore } from '@/store/hexChessStore';
import { getCSSColor } from '@/game/constants';
import type { HexPlayerIndex } from '@/game/hexchess/state';

interface HexClearPreMovesButtonProps {
  localPlayer: HexPlayerIndex | undefined;
}

export function HexClearPreMovesButton({ localPlayer }: HexClearPreMovesButtonProps) {
  const preMoves = useHexChessStore((s) => s.preMoves);
  const config = useHexChessStore((s) => s.config);
  const clearAllPreMoves = useHexChessStore((s) => s.clearAllPreMoves);

  if (preMoves.length === 0 || localPlayer === undefined || !config) return null;

  const color = getCSSColor(config.players[localPlayer].color);
  const label = preMoves.length === 1 ? 'Clear pre-move' : `Clear ${preMoves.length} pre-moves`;

  return (
    <div className="flex justify-center mt-2 sm:mt-3">
      <button
        onClick={clearAllPreMoves}
        className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors border-2"
        style={{ borderColor: color }}
      >
        {label}
      </button>
    </div>
  );
}
