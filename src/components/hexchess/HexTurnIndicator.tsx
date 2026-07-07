'use client';

import type { HexChessState, HexChessConfig } from '@/game/hexchess';
import { isInCheck } from '@/game/hexchess';
import { getCSSColor } from '@/game/constants';
import { ColorSwatch } from '@/components/ui/SpecialSwatch';

interface HexTurnIndicatorProps {
  state: HexChessState;
  config: HexChessConfig;
}

export function HexTurnIndicator({ state, config }: HexTurnIndicatorProps) {
  if (state.result) {
    if (state.result.winner === 'draw') {
      return (
        <div className="p-3 rounded bg-gray-100 text-center">
          Draw: {state.result.reason}
        </div>
      );
    }
    const winnerConfig = config.players[state.result.winner];
    const winnerColor = winnerConfig.color;
    const winnerName = winnerConfig.name;
    return (
      <div className="p-3 rounded bg-green-100 text-center flex items-center justify-center gap-2">
        <ColorSwatch color={winnerColor} className="w-6 h-6" />
        <span className="font-medium">
          {winnerName} wins ({state.result.reason})
        </span>
      </div>
    );
  }

  const currentConfig = config.players[state.currentPlayer];
  const currentColor = currentConfig.color;
  const currentName = currentConfig.name;
  const inCheck = isInCheck(state, state.currentPlayer);

  return (
    <div
      className="p-2 rounded bg-white shadow flex items-center gap-2"
      style={{ borderLeft: `4px solid ${getCSSColor(currentColor)}` }}
    >
      <ColorSwatch color={currentColor} className="w-6 h-6" />
      <span>{currentName}&apos;s turn</span>
      {inCheck && (
        <span className="text-red-600 font-medium ml-1">in check</span>
      )}
    </div>
  );
}
