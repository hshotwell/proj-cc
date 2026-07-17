'use client';

import type { HexChessState, HexChessConfig } from '@/game/hexchess';
import { isInCheck } from '@/game/hexchess';
import { isEliminated } from '@/game/hexchess/board';
import { getCSSColor } from '@/game/constants';
import { ColorSwatch } from '@/components/ui/SpecialSwatch';
import { ELIMINATED_GREY } from '@/store/hexChessStore';

interface HexTurnIndicatorProps {
  state: HexChessState;
  config: HexChessConfig;
}

function reasonLabel(reason: string): string {
  return reason === 'king-capture' ? 'last player standing' : reason;
}

export function HexTurnIndicator({ state, config }: HexTurnIndicatorProps) {
  if (state.result) {
    if (state.result.winner === 'draw') {
      return (
        <div className="p-3 rounded bg-gray-100 text-center">
          Draw: {state.result.reason}
        </div>
      );
    }
    const winnerConfig = config.players[state.result.winner]!;
    return (
      <div className="p-3 rounded bg-green-100 text-center flex items-center justify-center gap-2">
        <ColorSwatch color={winnerConfig.color} className="w-6 h-6" />
        <span className="font-medium">
          {winnerConfig.name} wins ({reasonLabel(state.result.reason)})
        </span>
      </div>
    );
  }

  // 2-player: classic single-line indicator.
  if (state.activePlayers.length === 2) {
    const currentConfig = config.players[state.currentPlayer]!;
    const inCheck = isInCheck(state, state.currentPlayer);
    return (
      <div
        className="p-2 rounded bg-white shadow flex items-center gap-2"
        style={{ borderLeft: `4px solid ${getCSSColor(currentConfig.color)}` }}
      >
        <ColorSwatch color={currentConfig.color} className="w-6 h-6" />
        <span>{currentConfig.name}&apos;s turn</span>
        {inCheck && (
          <span className="text-red-600 font-medium ml-1">in check</span>
        )}
      </div>
    );
  }

  // Multiplayer: all seats in turn order; eliminated seats greyed out.
  const currentConfig = config.players[state.currentPlayer]!;
  return (
    <div
      className="p-2 rounded bg-white shadow"
      style={{ borderLeft: `4px solid ${getCSSColor(currentConfig.color)}` }}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {state.activePlayers.map((seat) => {
          const seatConfig = config.players[seat]!;
          const eliminated = isEliminated(state, seat);
          const isCurrent = seat === state.currentPlayer;
          const inCheck = !eliminated && isInCheck(state, seat);
          return (
            <div
              key={seat}
              className={`flex items-center gap-1.5 ${
                eliminated ? 'opacity-50' : ''
              } ${isCurrent ? 'font-semibold' : ''}`}
            >
              <ColorSwatch
                color={eliminated ? ELIMINATED_GREY : seatConfig.color}
                className="w-5 h-5"
              />
              <span className={eliminated ? 'line-through text-gray-500' : ''}>
                {seatConfig.name}
              </span>
              {isCurrent && !eliminated && (
                <span className="text-xs text-gray-500">to move</span>
              )}
              {inCheck && (
                <span className="text-red-600 text-xs font-medium">in check</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
