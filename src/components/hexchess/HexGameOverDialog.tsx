'use client';

import type { HexChessState, HexChessConfig } from '@/game/hexchess';
import { ColorSwatch } from '@/components/ui/SpecialSwatch';

interface HexGameOverDialogProps {
  state: HexChessState;
  config: HexChessConfig;
  onNewGame: () => void;
  onHome: () => void;
}

export function HexGameOverDialog({ state, config, onNewGame, onHome }: HexGameOverDialogProps) {
  if (!state.result) return null;

  const { winner, reason } = state.result;
  const isDraw = winner === 'draw';
  const winnerConfig = isDraw ? null : config.players[winner];

  return (
    <div
      className="fixed left-0 right-0 top-4 sm:top-8 z-50 flex justify-center pointer-events-none px-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative bg-white rounded-lg shadow-xl border border-gray-200 p-4 sm:p-5 max-w-sm w-full pointer-events-auto">
        <div className="flex items-start gap-3">
          {!isDraw && winnerConfig && (
            <ColorSwatch color={winnerConfig.color} className="w-8 h-8 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold leading-tight">
              {isDraw ? 'Draw' : `${winnerConfig!.name} wins`}
            </h2>
            <p className="text-sm text-gray-600">{reason}</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2 justify-end">
          <button
            type="button"
            className="px-3 py-1 text-sm rounded bg-gray-200 hover:bg-gray-300"
            onClick={onHome}
          >
            Home
          </button>
          <button
            type="button"
            className="px-3 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
            onClick={onNewGame}
          >
            New Game
          </button>
        </div>
      </div>
    </div>
  );
}
