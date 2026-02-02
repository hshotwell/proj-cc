'use client';

import { useMemo } from 'react';
import type { GameState, CubeCoord, PlayerIndex } from '@/types/game';
import { HEX_SIZE, BOARD_PADDING } from '@/game/constants';
import { generateBoardPositions } from '@/game/board';
import { cubeToPixel, coordKey } from '@/game/coordinates';
import { BoardCell } from './BoardCell';
import { Piece } from './Piece';

interface TrainingBoardProps {
  gameState: GameState;
}

export function TrainingBoard({ gameState }: TrainingBoardProps) {
  const boardPositions = useMemo(() => generateBoardPositions(), []);

  const viewBox = useMemo(() => {
    const positions = boardPositions.map((pos) => cubeToPixel(pos, HEX_SIZE));
    const xs = positions.map((p) => p.x);
    const ys = positions.map((p) => p.y);
    const minX = Math.min(...xs) - BOARD_PADDING;
    const maxX = Math.max(...xs) + BOARD_PADDING;
    const minY = Math.min(...ys) - BOARD_PADDING;
    const maxY = Math.max(...ys) + BOARD_PADDING;
    return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
  }, [boardPositions]);

  const pieces = useMemo(() => {
    const result: Array<{ coord: CubeCoord; player: PlayerIndex }> = [];
    for (const [key, content] of gameState.board) {
      if (content.type === 'piece') {
        const [q, r] = key.split(',').map(Number);
        result.push({
          coord: { q, r, s: -q - r },
          player: content.player,
        });
      }
    }
    return result;
  }, [gameState.board]);

  return (
    <svg
      viewBox={viewBox}
      className="w-full h-full"
      preserveAspectRatio="xMidYMid meet"
    >
      <g>
        {boardPositions.map((coord) => (
          <BoardCell
            key={coordKey(coord)}
            coord={coord}
            size={HEX_SIZE}
            activePlayers={gameState.activePlayers}
          />
        ))}
      </g>
      <g>
        {pieces.map(({ coord, player }) => (
          <Piece
            key={`piece-${coordKey(coord)}`}
            coord={coord}
            player={player}
            isCurrentPlayer={player === gameState.currentPlayer}
            isSelected={false}
            onClick={() => {}}
            size={HEX_SIZE}
          />
        ))}
      </g>
    </svg>
  );
}
