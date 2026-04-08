'use client';

import { getPlayerColorFromState, getPlayerDisplayNameFromState } from '@/game/colors';
import { countPiecesInGoal } from '@/game/state';
import { computePlayerProgress } from '@/game/progress';
import { getGemSwatchStyle, getCSSColor } from '@/game/constants';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { ColorSwatch } from '@/components/ui/SpecialSwatch';

export function TurnIndicator() {
  const { gameState, currentLayout } = useGameStore();
  const { showPlayerProgress } = useSettingsStore();

  if (!gameState) return null;

  const displayPlayer = gameState.currentPlayer;
  const color = getPlayerColorFromState(displayPlayer, gameState);
  const name = getPlayerDisplayNameFromState(displayPlayer, gameState);
  const turnNumber = gameState.turnNumber;
  const isAI = gameState.aiPlayers?.[displayPlayer] != null;
  const isFinished = gameState.finishedPlayers.some((fp) => fp.player === displayPlayer);

  // Progress stats for current player
  const piecesInGoal = countPiecesInGoal(gameState, displayPlayer);
  const progress = computePlayerProgress(gameState, displayPlayer);
  const gemStyle = getGemSwatchStyle(color);
  const borderClass = !gemStyle && color !== 'opal' && color !== 'rainbow'
    ? ` border-2${color.toLowerCase() === '#ffffff' ? ' border-gray-400' : ' border-white'}`
    : '';

  const puzzlePar = currentLayout?.puzzleGoalMoves;
  // Turns completed so far (turnNumber is 1-indexed, current turn is in progress)
  const turnsCompleted = Math.max(0, turnNumber - 1);

  return (
    <div className="p-4 rounded-lg shadow bg-white">
      <div className="flex items-center gap-3">
        <ColorSwatch color={color} className={`w-6 h-6 shadow${borderClass}`} />
        <div>
          <div className="text-sm text-gray-500">Current Turn</div>
          <div className="font-semibold" style={{ color: getCSSColor(color) }}>
            {name}{isAI && <span className="text-gray-400 font-normal text-xs ml-1">(AI)</span>}
          </div>
        </div>
        {puzzlePar ? (
          <div className="ml-auto text-right">
            <div className="text-sm font-semibold text-gray-700">
              {turnsCompleted}
              <span className="text-gray-400 font-normal"> / par {puzzlePar}</span>
            </div>
            {turnsCompleted > 0 && (() => {
              const diff = turnsCompleted - puzzlePar;
              return (
                <div className={`text-xs font-medium ${diff < 0 ? 'text-green-600' : diff === 0 ? 'text-gray-500' : 'text-red-500'}`}>
                  {diff > 0 ? `+${diff}` : diff === 0 ? 'even' : `${diff}`}
                </div>
              );
            })()}
          </div>
        ) : (
          <div className="ml-auto text-sm text-gray-500">
            Turn {turnNumber}
          </div>
        )}
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
              style={{ width: `${progress}%`, backgroundColor: getCSSColor(color) }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
