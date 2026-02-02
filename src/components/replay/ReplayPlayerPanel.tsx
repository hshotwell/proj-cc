'use client';

import type { PlayerIndex, ColorMapping } from '@/types/game';
import type { AIPlayerMap } from '@/types/ai';
import { getPlayerColor, getPlayerDisplayName } from '@/game/colors';
import { countPiecesInGoal } from '@/game/state';
import { useReplayStore } from '@/store/replayStore';

const RANK_LABELS = ['1st', '2nd', '3rd', '4th', '5th', '6th'];

interface ReplayPlayerCardProps {
  player: PlayerIndex;
  piecesInGoal: number;
  customColors?: ColorMapping;
  activePlayers: PlayerIndex[];
  finishRank?: number;
  moveCount?: number;
  aiPlayers?: AIPlayerMap;
}

function ReplayPlayerCard({ player, piecesInGoal, customColors, activePlayers, finishRank, moveCount, aiPlayers }: ReplayPlayerCardProps) {
  const color = getPlayerColor(player, customColors);
  const name = getPlayerDisplayName(player, activePlayers);
  const isFinished = finishRank !== undefined;
  const isAI = aiPlayers?.[player] != null;

  return (
    <div className={`p-3 rounded-lg border-2 border-transparent ${isFinished ? 'opacity-80' : ''}`}>
      <div className="flex items-center gap-2">
        <div
          className="w-4 h-4 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="font-medium" style={{ color }}>
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
      {isFinished && moveCount !== undefined && (
        <div className="mt-1 text-xs text-green-600 font-medium">
          Finished in {moveCount} moves
        </div>
      )}
      {!isFinished && (
        <>
          <div className="mt-1 text-xs text-gray-500">
            {piecesInGoal}/10 in goal
          </div>
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
    </div>
  );
}

export function ReplayPlayerPanel() {
  const { displayState, gameSummary } = useReplayStore();

  if (!displayState) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
        Players
      </h3>
      <div className="space-y-2">
        {displayState.activePlayers.map((player) => {
          const finishIdx = displayState.finishedPlayers.findIndex((fp) => fp.player === player);
          const fp = finishIdx >= 0 ? displayState.finishedPlayers[finishIdx] : undefined;
          return (
            <ReplayPlayerCard
              key={player}
              player={player}
              piecesInGoal={countPiecesInGoal(displayState, player)}
              customColors={displayState.playerColors}
              activePlayers={displayState.activePlayers}
              finishRank={finishIdx >= 0 ? finishIdx : undefined}
              moveCount={fp?.moveCount}
              aiPlayers={displayState.aiPlayers}
            />
          );
        })}
      </div>
    </div>
  );
}
