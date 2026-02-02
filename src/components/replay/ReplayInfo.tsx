'use client';

import { getPlayerColor, getPlayerDisplayName } from '@/game/colors';
import { useReplayStore } from '@/store/replayStore';

export function ReplayInfo() {
  const { gameSummary } = useReplayStore();

  if (!gameSummary) return null;

  const winnerColor = getPlayerColor(gameSummary.winner, gameSummary.playerColors);
  const winnerName = getPlayerDisplayName(gameSummary.winner, gameSummary.activePlayers);
  const dateStr = new Date(gameSummary.dateSaved).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
        Game Replay
      </h3>
      <div className="text-xs text-gray-500">{dateStr}</div>
      <div className="flex items-center gap-2">
        <div
          className="w-4 h-4 rounded-full"
          style={{ backgroundColor: winnerColor }}
        />
        <span className="font-medium" style={{ color: winnerColor }}>
          {winnerName}
        </span>
        <span className="text-xs text-gray-500">won</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-gray-50 rounded p-2">
          <div className="text-gray-400">Players</div>
          <div className="font-semibold text-gray-700">{gameSummary.playerCount}</div>
        </div>
        <div className="bg-gray-50 rounded p-2">
          <div className="text-gray-400">Total Moves</div>
          <div className="font-semibold text-gray-700">{gameSummary.totalMoves}</div>
        </div>
        <div className="bg-gray-50 rounded p-2">
          <div className="text-gray-400">Turns</div>
          <div className="font-semibold text-gray-700">{gameSummary.totalTurns}</div>
        </div>
        {gameSummary.longestHop > 0 && (
          <div className="bg-amber-50 rounded p-2">
            <div className="text-amber-600">Longest Hop</div>
            <div className="font-semibold text-amber-700">{gameSummary.longestHop} jumps</div>
          </div>
        )}
      </div>
    </div>
  );
}
