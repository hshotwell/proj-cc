'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useReplayStore } from '@/store/replayStore';

export function ReplayControls() {
  const router = useRouter();
  const {
    currentStep,
    moves,
    stepForward,
    stepBackward,
    goToStep,
    goToStart,
    goToEnd,
    closeReplay,
  } = useReplayStore();

  const totalMoves = moves.length;

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture if user is focused on an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          stepBackward();
          break;
        case 'ArrowRight':
          e.preventDefault();
          stepForward();
          break;
        case 'Home':
          e.preventDefault();
          goToStart();
          break;
        case 'End':
          e.preventDefault();
          goToEnd();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [stepForward, stepBackward, goToStart, goToEnd]);

  const handleClose = () => {
    closeReplay();
    router.push('/replays');
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
        Controls
      </h3>

      {/* Progress text */}
      <div className="text-center text-sm text-gray-600">
        Move {currentStep} of {totalMoves}
      </div>

      {/* Scrubber bar */}
      <input
        type="range"
        min={0}
        max={totalMoves}
        value={currentStep}
        onChange={(e) => goToStep(Number(e.target.value))}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
      />

      {/* Navigation buttons */}
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={goToStart}
          disabled={currentStep === 0}
          className="px-3 py-2 text-sm font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Go to start (Home)"
        >
          |&lt;
        </button>
        <button
          onClick={stepBackward}
          disabled={currentStep === 0}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Step backward (Left Arrow)"
        >
          &lt;
        </button>
        <button
          onClick={stepForward}
          disabled={currentStep >= totalMoves}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Step forward (Right Arrow)"
        >
          &gt;
        </button>
        <button
          onClick={goToEnd}
          disabled={currentStep >= totalMoves}
          className="px-3 py-2 text-sm font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Go to end (End)"
        >
          &gt;|
        </button>
      </div>

      {/* Keyboard hint */}
      <div className="text-center text-xs text-gray-400">
        Use arrow keys to navigate
      </div>

      {/* Close button */}
      <button
        onClick={handleClose}
        className="w-full px-4 py-2 text-sm font-medium rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition-colors"
      >
        Close Replay
      </button>
    </div>
  );
}
