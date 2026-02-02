'use client';

import { useRef, useEffect } from 'react';
import type { Move, PlayerIndex, ColorMapping } from '@/types/game';
import { ACTIVE_PLAYERS } from '@/game/constants';
import { getPlayerColor, getPlayerDisplayName } from '@/game/colors';
import { useGameStore } from '@/store/gameStore';

function formatCoord(coord: { q: number; r: number }): string {
  return `(${coord.q},${coord.r})`;
}

interface MoveEntryProps {
  move: Move;
  index: number;
  player: PlayerIndex;
  activePlayers: PlayerIndex[];
  customColors?: ColorMapping;
}

function MoveEntry({ move, index, player, activePlayers, customColors }: MoveEntryProps) {
  const color = getPlayerColor(player, customColors);
  const name = getPlayerDisplayName(player, activePlayers);

  return (
    <div className="flex items-center gap-2 py-1 px-2 text-xs rounded hover:bg-gray-50">
      <span className="text-gray-400 w-6">{index + 1}.</span>
      <div
        className="w-3 h-3 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
        title={name}
      />
      <span className="font-mono">
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
    </div>
  );
}

export function MoveHistory() {
  const { gameState } = useGameStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new moves are added
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [gameState?.moveHistory.length]);

  if (!gameState) return null;

  const { moveHistory, playerCount } = gameState;
  const activePlayers = ACTIVE_PLAYERS[playerCount];

  return (
    <div className="flex flex-col h-full">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
        Move History
      </h3>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto border rounded-lg bg-white"
        style={{ maxHeight: '200px' }}
      >
        {moveHistory.length === 0 ? (
          <div className="p-4 text-sm text-gray-400 text-center">
            No moves yet
          </div>
        ) : (
          <div className="p-1">
            {moveHistory.map((move, index) => {
              // Determine which player made this move based on index
              const playerIndex = activePlayers[index % activePlayers.length];
              return (
                <MoveEntry
                  key={index}
                  move={move}
                  index={index}
                  player={playerIndex}
                  activePlayers={activePlayers}
                  customColors={gameState.playerColors}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
