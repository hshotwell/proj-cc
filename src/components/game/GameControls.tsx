'use client';

import { useGameStore } from '@/store/gameStore';
import { useRouter } from 'next/navigation';

export function GameControls() {
  const { gameState, resetGame } = useGameStore();
  const router = useRouter();

  if (!gameState) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
        Controls
      </h3>
      <div className="flex flex-col gap-2">
        <button
          onClick={resetGame}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
        >
          Restart Game
        </button>
        <button
          onClick={() => router.push('/play')}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
        >
          New Game
        </button>
      </div>
    </div>
  );
}
