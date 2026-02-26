'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getPlayerColorFromState, getPlayerDisplayNameFromState } from '@/game/colors';
import { isGameFullyOver } from '@/game/state';
import { saveCompletedGame } from '@/game/persistence';
import { useGameStore } from '@/store/gameStore';
import { useReplayStore } from '@/store/replayStore';

const RANK_LABELS = ['1st', '2nd', '3rd', '4th', '5th', '6th'];

export function GameOverDialog() {
  const { gameState, gameId, resetGame } = useGameStore();
  const { loadReplayFromState } = useReplayStore();
  const router = useRouter();
  const savedRef = useRef<string | null>(null);

  const isOver = gameState && isGameFullyOver(gameState);

  // Auto-save on game completion
  useEffect(() => {
    if (!isOver || !gameState || !gameId) return;
    // Only save once per game
    if (savedRef.current === gameId) return;
    savedRef.current = gameId;
    saveCompletedGame(gameId, gameState);
  }, [isOver, gameState, gameId]);

  if (!gameState || !isOver) return null;

  const { finishedPlayers, activePlayers, moveHistory } = gameState;

  // Count per-player moves from history
  const playerMoveCounts = new Map<number, number>();
  for (const move of moveHistory) {
    if (move.player !== undefined) {
      playerMoveCounts.set(move.player, (playerMoveCounts.get(move.player) ?? 0) + 1);
    }
  }
  const firstPlayerMoves = finishedPlayers[0] ? (playerMoveCounts.get(finishedPlayers[0].player) ?? 0) : 0;

  const handleWatchReplay = () => {
    if (!gameId) return;
    loadReplayFromState(gameState, gameId);
    router.push(`/replay/${gameId}`);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Game Over!</h2>

          <div className="space-y-2 mb-6 text-left">
            {finishedPlayers.map((fp, i) => {
              const color = getPlayerColorFromState(fp.player, gameState);
              const name = getPlayerDisplayNameFromState(fp.player, gameState);
              const thisPlayerMoves = playerMoveCounts.get(fp.player) ?? 0;
              const extra = thisPlayerMoves - firstPlayerMoves;
              return (
                <div key={fp.player} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50">
                  <span className="text-sm font-bold text-gray-500 w-8">{RANK_LABELS[i]}</span>
                  <div
                    className="w-5 h-5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="font-semibold flex-1" style={{ color }}>
                    {name}
                  </span>
                  {i > 0 && (
                    <span className="text-xs text-gray-400">+{extra} moves</span>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-sm text-gray-500 mb-6">
            Completed in {gameState.moveHistory.length} moves over{' '}
            {Math.max(1, gameState.turnNumber - 1)} turns
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={resetGame}
              className="w-full px-6 py-3 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors"
            >
              Play Again
            </button>
            <button
              onClick={handleWatchReplay}
              className="w-full px-6 py-3 bg-amber-500 text-white font-medium rounded-lg hover:bg-amber-400 transition-colors"
            >
              Watch Replay
            </button>
            <button
              onClick={() => router.push('/play')}
              className="w-full px-6 py-3 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors"
            >
              New Game
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
