'use client';

import { getPlayerColorFromState, getPlayerDisplayName } from '@/game/colors';
import { countPiecesInGoal } from '@/game/state';
import { computePlayerProgress } from '@/game/progress';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';

export function TurnIndicator() {
  const { gameState } = useGameStore();
  const { showPlayerProgress } = useSettingsStore();

  if (!gameState) return null;

  const displayPlayer = gameState.currentPlayer;
  const color = getPlayerColorFromState(displayPlayer, gameState);
  const name = getPlayerDisplayName(displayPlayer, gameState.activePlayers);
  const turnNumber = gameState.turnNumber;
  const isAI = gameState.aiPlayers?.[displayPlayer] != null;
  const isFinished = gameState.finishedPlayers.some((fp) => fp.player === displayPlayer);

  // Progress stats for current player
  const piecesInGoal = countPiecesInGoal(gameState, displayPlayer);
  const progress = computePlayerProgress(gameState, displayPlayer);

  return (
    <div className="p-4 rounded-lg shadow bg-white">
      <div className="flex items-center gap-3">
        <div
          className="w-6 h-6 rounded-full border-2 border-white shadow"
          style={{ backgroundColor: color }}
        />
        <div>
          <div className="text-sm text-gray-500">Current Turn</div>
          <div className="font-semibold" style={{ color }}>
            {name}{isAI && <span className="text-gray-400 font-normal text-xs ml-1">(AI)</span>}
          </div>
        </div>
        <div className="ml-auto text-sm text-gray-500">
          Turn {turnNumber}
        </div>
      </div>
      {showPlayerProgress && !isFinished && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>{piecesInGoal}/10 in goal</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-300"
              style={{ width: `${progress}%`, backgroundColor: color }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
