'use client';

import { useRef, useEffect } from 'react';
import type { Move, PlayerIndex, ColorMapping } from '@/types/game';
import { getPlayerColor, getPlayerDisplayName } from '@/game/colors';
import { useReplayStore } from '@/store/replayStore';

function formatCoord(coord: { q: number; r: number }): string {
  return `(${coord.q},${coord.r})`;
}

interface ReplayMoveEntryProps {
  move: Move;
  index: number;
  player: PlayerIndex;
  activePlayers: PlayerIndex[];
  customColors?: ColorMapping;
  isCurrent: boolean;
  isLongestHop: boolean;
  onClick: () => void;
}

function ReplayMoveEntry({ move, index, player, activePlayers, customColors, isCurrent, isLongestHop, onClick }: ReplayMoveEntryProps) {
  const color = getPlayerColor(player, customColors);
  const name = getPlayerDisplayName(player, activePlayers);

  return (
    <div
      className={`flex items-center gap-2 py-1 px-2 text-xs rounded cursor-pointer transition-colors ${
        isCurrent ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
      }`}
      onClick={onClick}
    >
      <span className="text-gray-400 w-6">{index + 1}.</span>
      <div
        className="w-3 h-3 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
        title={name}
      />
      <span className="font-mono flex-1">
        {formatCoord(move.from)} → {formatCoord(move.to)}
      </span>
      {move.isJump && (
        <span className="text-green-600 font-medium">
          {move.jumpPath && move.jumpPath.length > 1 ? `×${move.jumpPath.length}` : 'jump'}
        </span>
      )}
      {move.isSwap && (
        <span className="text-amber-600 font-medium">swap</span>
      )}
      {isLongestHop && (
        <span className="text-amber-500" title="Longest hop">
          ★
        </span>
      )}
    </div>
  );
}

export function ReplayMoveHistory() {
  const { moves, currentStep, longestHopIndex, displayState, goToStep } = useReplayStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentEntryRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to keep current step visible
  useEffect(() => {
    if (currentEntryRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const entry = currentEntryRef.current;
      const containerRect = container.getBoundingClientRect();
      const entryRect = entry.getBoundingClientRect();

      if (entryRect.top < containerRect.top || entryRect.bottom > containerRect.bottom) {
        entry.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [currentStep]);

  if (!displayState) return null;

  const { activePlayers } = displayState;

  return (
    <div className="flex flex-col h-full">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
        Move History
      </h3>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto border rounded-lg bg-white"
        style={{ maxHeight: '400px' }}
      >
        {moves.length === 0 ? (
          <div className="p-4 text-sm text-gray-400 text-center">
            No moves
          </div>
        ) : (
          <div className="p-1">
            {moves.map((move, index) => {
              const playerIndex = activePlayers[index % activePlayers.length];
              const isCurrent = index === currentStep - 1;
              return (
                <div key={index} ref={isCurrent ? currentEntryRef : undefined}>
                  <ReplayMoveEntry
                    move={move}
                    index={index}
                    player={playerIndex}
                    activePlayers={activePlayers}
                    customColors={displayState.playerColors}
                    isCurrent={isCurrent}
                    isLongestHop={longestHopIndex === index}
                    onClick={() => goToStep(index + 1)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
