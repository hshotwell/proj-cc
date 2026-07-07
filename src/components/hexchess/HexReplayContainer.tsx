'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { loadHexChessGame } from '@/game/hexchess/persistence';
import { createInitialState, applyMove } from '@/game/hexchess';
import { selectHexChessBoardView } from '@/store/hexChessStore';
import { Board } from '@/components/board/Board';
import { HexTurnIndicator } from '@/components/hexchess/HexTurnIndicator';

interface HexReplayContainerProps {
  gameId: string;
}

export function HexReplayContainer({ gameId }: HexReplayContainerProps) {
  const saved = useMemo(() => loadHexChessGame(gameId), [gameId]);
  const [step, setStep] = useState(0);

  const states = useMemo(() => {
    if (!saved) return [];
    const arr = [createInitialState(saved.config)];
    for (const move of saved.moveHistory) {
      arr.push(applyMove(arr[arr.length - 1], move));
    }
    return arr;
  }, [saved]);

  if (!saved) {
    return (
      <div className="p-4">
        <div className="text-gray-600 mb-2">Replay not found.</div>
        <Link href="/replays" className="text-blue-600 hover:underline">
          Return to Replays
        </Link>
      </div>
    );
  }

  const currentState = states[step];
  const lastMove = step > 0 ? saved.moveHistory[step - 1] : null;

  const view = selectHexChessBoardView({
    state: currentState,
    config: saved.config,
    gameId: saved.id,
    selectedPieceId: null,
    legalMoveTargets: [],
    lastMove,
    animatingCapture: null,
    captureTimeoutId: null,
  } as never);

  const total = states.length - 1;

  return (
    <div className="max-w-2xl mx-auto p-4">
      <Link
        href="/replays"
        className="text-sm text-gray-500 hover:text-gray-800 mb-2 inline-block transition-colors"
      >
        &larr; Replays
      </Link>

      {/* Board card */}
      <div className="relative w-full bg-white rounded-lg shadow-lg mb-3">
        {view && <Board view={view} />}
      </div>

      {/* Navigation controls */}
      <div className="flex items-center justify-between p-2 bg-gray-50 rounded mb-3">
        <div className="flex gap-1">
          <button
            onClick={() => setStep(0)}
            disabled={step === 0}
            className="px-2 py-1 rounded bg-gray-200 disabled:opacity-50 hover:bg-gray-300 transition-colors"
            aria-label="First move"
          >
            |&lt;
          </button>
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="px-2 py-1 rounded bg-gray-200 disabled:opacity-50 hover:bg-gray-300 transition-colors"
            aria-label="Previous move"
          >
            &lt;
          </button>
          <button
            onClick={() => setStep((s) => Math.min(total, s + 1))}
            disabled={step === total}
            className="px-2 py-1 rounded bg-gray-200 disabled:opacity-50 hover:bg-gray-300 transition-colors"
            aria-label="Next move"
          >
            &gt;
          </button>
          <button
            onClick={() => setStep(total)}
            disabled={step === total}
            className="px-2 py-1 rounded bg-gray-200 disabled:opacity-50 hover:bg-gray-300 transition-colors"
            aria-label="Last move"
          >
            &gt;|
          </button>
        </div>
        <div className="text-sm text-gray-600">
          Move {step} / {total}
        </div>
      </div>

      {/* Turn / result indicator */}
      <HexTurnIndicator state={currentState} config={saved.config} />
    </div>
  );
}
