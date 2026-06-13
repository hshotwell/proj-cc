'use client';

import { useRef, useEffect } from 'react';
import type { PlayerIndex } from '@/types/game';
import { getPlayerColor } from '@/game/colors';
import { useReplayStore } from '@/store/replayStore';
import { ColorSwatch } from '@/components/ui/SpecialSwatch';

function formatCoord(coord: { q: number; r: number }): string {
  return `(${coord.q},${coord.r})`;
}

interface ReviewMoveHistoryProps {
  flaggedMoveIndices: Set<number>;
  editingMoveIndex: number | null;
  onFlagClick: (moveIndex: number) => void;
}

export function ReviewMoveHistory({ flaggedMoveIndices, editingMoveIndex, onFlagClick }: ReviewMoveHistoryProps) {
  const { moves, currentStep, displayState, goToStep, longestHopIndices } = useReplayStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentEntryRef = useRef<HTMLDivElement>(null);

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

  const { activePlayers, playerColors } = displayState;

  return (
    <div className="flex flex-col h-full">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
        Move History
      </h3>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto border rounded-lg bg-white"
      >
        {moves.length === 0 ? (
          <div className="p-4 text-sm text-gray-400 text-center">No moves</div>
        ) : (
          <div className="p-1">
            {moves.map((move, index) => {
              const player = (move.player ?? activePlayers[index % activePlayers.length]) as PlayerIndex;
              const color = getPlayerColor(player, playerColors);
              const isCurrent = index === currentStep - 1;
              const isFlagged = flaggedMoveIndices.has(index);
              const isEditing = editingMoveIndex === index;

              return (
                <div
                  key={index}
                  ref={isCurrent ? currentEntryRef : undefined}
                  className={`flex items-center gap-1.5 py-1 px-2 text-xs rounded transition-colors ${
                    isEditing
                      ? 'bg-amber-50 border border-amber-300'
                      : isCurrent
                      ? 'bg-blue-50 border border-blue-200'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <span
                    className="text-gray-400 w-6 flex-shrink-0 cursor-pointer"
                    onClick={() => goToStep(index + 1)}
                  >
                    {index + 1}.
                  </span>
                  <span className="flex-shrink-0 cursor-pointer" onClick={() => goToStep(index + 1)}>
                    <ColorSwatch
                      color={color}
                      className="w-3 h-3"
                    />
                  </span>
                  <span
                    className="font-mono flex-1 cursor-pointer"
                    onClick={() => goToStep(index + 1)}
                  >
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
                  {longestHopIndices.has(index) && (
                    <span className="text-amber-500" title="Best hop">✶</span>
                  )}
                  <button
                    onClick={() => onFlagClick(index)}
                    title={isFlagged ? 'Edit flag' : 'Flag this move'}
                    className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded transition-colors ${
                      isFlagged
                        ? 'text-red-500 hover:text-red-700'
                        : 'text-gray-300 hover:text-gray-500'
                    }`}
                  >
                    ⚑
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
