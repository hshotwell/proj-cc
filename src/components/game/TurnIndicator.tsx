'use client';

import { getPlayerColorFromState, getPlayerDisplayName } from '@/game/colors';
import { useGameStore } from '@/store/gameStore';

export function TurnIndicator() {
  const { gameState } = useGameStore();

  if (!gameState) return null;

  const displayPlayer = gameState.currentPlayer;
  const color = getPlayerColorFromState(displayPlayer, gameState);
  const name = getPlayerDisplayName(displayPlayer, gameState.activePlayers);
  const turnNumber = gameState.turnNumber;
  const isAI = gameState.aiPlayers?.[displayPlayer] != null;

  return (
    <div className="flex items-center gap-3 p-4 rounded-lg shadow bg-white">
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
  );
}
