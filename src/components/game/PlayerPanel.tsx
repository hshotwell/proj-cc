'use client';

import type { PlayerIndex, ColorMapping } from '@/types/game';
import type { AIPlayerMap } from '@/types/ai';
import { getPlayerColor, getPlayerDisplayName } from '@/game/colors';
import { countPiecesInGoal } from '@/game/state';
import { useGameStore } from '@/store/gameStore';

const RANK_LABELS = ['1st', '2nd', '3rd', '4th', '5th', '6th'];

interface PlayerCardProps {
  player: PlayerIndex;
  isCurrentTurn: boolean;
  piecesInGoal: number;
  customColors?: ColorMapping;
  activePlayers: PlayerIndex[];
  finishRank?: number; // 0-based index in finishedPlayers, undefined if not finished
  aiPlayers?: AIPlayerMap;
}

function PlayerCard({ player, isCurrentTurn, piecesInGoal, customColors, activePlayers, finishRank, aiPlayers }: PlayerCardProps) {
  const color = getPlayerColor(player, customColors);
  const name = getPlayerDisplayName(player, activePlayers);
  const isFinished = finishRank !== undefined;
  const isAI = aiPlayers?.[player] != null;

  return (
    <div
      className={`p-3 rounded-lg border-2 transition-all ${
        isCurrentTurn
          ? 'border-gray-800 shadow-lg scale-105'
          : 'border-transparent'
      } ${isFinished ? 'opacity-60' : ''}`}
      style={{
        backgroundColor: isCurrentTurn ? `${color}20` : 'white',
      }}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-4 h-4 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="font-medium" style={{ color: isCurrentTurn ? color : '#374151' }}>
          {name}
        </span>
        {isAI && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 uppercase">
            AI
          </span>
        )}
        {isFinished && (
          <span className="ml-auto text-xs font-bold text-gray-500">
            {RANK_LABELS[finishRank]}
          </span>
        )}
      </div>
      {!isFinished && (
        <>
          <div className="mt-1 text-xs text-gray-500">
            {piecesInGoal}/10 in goal
          </div>
          {/* Progress bar */}
          <div className="mt-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${(piecesInGoal / 10) * 100}%`,
                backgroundColor: color,
              }}
            />
          </div>
        </>
      )}
      {isFinished && (
        <div className="mt-1 text-xs text-green-600 font-medium">Finished</div>
      )}
    </div>
  );
}

export function PlayerPanel() {
  const { gameState } = useGameStore();

  if (!gameState) return null;

  const currentPlayer = gameState.currentPlayer;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
        Players
      </h3>
      <div className="space-y-2">
        {gameState.activePlayers.map((player) => {
          const finishIdx = gameState.finishedPlayers.findIndex((fp) => fp.player === player);
          return (
            <PlayerCard
              key={player}
              player={player}
              isCurrentTurn={player === currentPlayer}
              piecesInGoal={countPiecesInGoal(gameState, player)}
              customColors={gameState.playerColors}
              activePlayers={gameState.activePlayers}
              finishRank={finishIdx >= 0 ? finishIdx : undefined}
              aiPlayers={gameState.aiPlayers}
            />
          );
        })}
      </div>
    </div>
  );
}
