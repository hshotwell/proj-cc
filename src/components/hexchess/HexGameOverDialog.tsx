'use client';

import Link from 'next/link';
import type { HexChessState, HexChessConfig } from '@/game/hexchess';
import { ColorSwatch } from '@/components/ui/SpecialSwatch';

interface HexGameOverDialogProps {
  state: HexChessState;
  config: HexChessConfig;
  onNewGame: () => void;
  onHome: () => void;
  onPlayAgain?: () => void;
  replayHref?: string;
  reviewHref?: string;
}

function reasonLabel(reason: string): string {
  return reason === 'king-capture' ? 'last player standing' : reason;
}

export function HexGameOverDialog({ state, config, onNewGame, onHome, onPlayAgain, replayHref, reviewHref }: HexGameOverDialogProps) {
  if (!state.result) return null;

  const { winner, reason } = state.result;
  const isDraw = winner === 'draw';
  const winnerConfig = isDraw ? null : config.players[winner];

  // Multiplayer finish order: winner first, then eliminated seats latest-out
  // first (2nd place = last one eliminated).
  const isMultiplayer = state.activePlayers.length > 2;
  const finishOrder = isMultiplayer && !isDraw
    ? [winner as number, ...[...state.eliminated].reverse()]
    : null;

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
            <p className="text-sm text-gray-600">{reasonLabel(reason)}</p>
          </div>
        </div>
        {finishOrder && (
          <ol className="mt-3 space-y-1">
            {finishOrder.map((seat, i) => {
              const seatConfig = config.players[seat as 0 | 1 | 2 | 3 | 4 | 5]!;
              return (
                <li key={seat} className="flex items-center gap-2 text-sm">
                  <span className="w-8 text-gray-500">{i + 1}.</span>
                  <ColorSwatch color={seatConfig.color} className="w-4 h-4" />
                  <span className={i === 0 ? 'font-medium' : 'text-gray-600'}>
                    {seatConfig.name}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        <div className="mt-3 flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            className="px-3 py-1 text-sm rounded bg-gray-200 hover:bg-gray-300"
            onClick={onHome}
          >
            Home
          </button>
          {replayHref && (
            <Link
              href={replayHref}
              className="px-3 py-1 text-sm rounded bg-amber-500 text-white hover:bg-amber-400"
            >
              Replay
            </Link>
          )}
          {reviewHref && (
            <Link
              href={reviewHref}
              className="px-3 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              Review
            </Link>
          )}
          {onPlayAgain && (
            <button
              type="button"
              className="px-3 py-1 text-sm rounded bg-gray-900 text-white hover:bg-gray-800"
              onClick={onPlayAgain}
            >
              Play Again
            </button>
          )}
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
