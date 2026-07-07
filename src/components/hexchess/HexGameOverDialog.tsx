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
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-semibold mb-2">
          {isDraw ? 'Draw' : `${winnerConfig!.name} wins`}
        </h2>
        {!isDraw && winnerConfig && (
          <div className="flex items-center gap-2 mb-3">
            <ColorSwatch color={winnerConfig.color} className="w-6 h-6" />
            <span className="font-medium">{winnerConfig.name}</span>
          </div>
        )}
        <p className="text-gray-700 mb-4">Result: {reason}</p>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
            onClick={onHome}
          >
            Home
          </button>
          <button
            type="button"
            className="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
            onClick={onNewGame}
          >
            New Game
          </button>
        </div>
      </div>
    </div>
  );
}
