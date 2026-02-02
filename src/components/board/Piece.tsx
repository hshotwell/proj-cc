'use client';

import type { CubeCoord, PlayerIndex, ColorMapping } from '@/types/game';
import { MOVE_ANIMATION_DURATION } from '@/game/constants';
import { cubeToPixel } from '@/game/coordinates';
import { getPlayerColor } from '@/game/colors';

interface PieceProps {
  coord: CubeCoord;
  player: PlayerIndex;
  isCurrentPlayer: boolean;
  isSelected: boolean;
  onClick: () => void;
  size?: number;
  customColors?: ColorMapping;
  // Optional: render at this position instead of coord (for animation)
  displayCoord?: CubeCoord;
  isAnimating?: boolean;
}

export function Piece({
  coord,
  player,
  isCurrentPlayer,
  isSelected,
  onClick,
  size = 18,
  customColors,
  displayCoord,
  isAnimating,
}: PieceProps) {
  // Use displayCoord for visual position if provided, otherwise use actual coord
  const renderCoord = displayCoord ?? coord;
  const { x, y } = cubeToPixel(renderCoord, size);
  const color = getPlayerColor(player, customColors);

  // Piece radius is larger than board cell (0.45) so pieces stand out
  const pieceRadius = size * 0.58;

  return (
    <g
      onClick={onClick}
      transform={`translate(${x}, ${y})`}
      style={{
        cursor: isCurrentPlayer ? 'pointer' : 'default',
        transition: isAnimating
          ? `transform ${MOVE_ANIMATION_DURATION}ms ease-in-out`
          : undefined,
      }}
    >
      {/* Piece shadow */}
      <circle
        cx={1}
        cy={2}
        r={pieceRadius}
        fill="rgba(0,0,0,0.2)"
      />
      {/* Main piece */}
      <circle
        cx={0}
        cy={0}
        r={pieceRadius}
        fill={color}
        stroke={isSelected ? '#000' : '#fff'}
        strokeWidth={isSelected ? 3 : 2}
      />
      {/* Highlight for current player's pieces - spinning dashed circle */}
      {isCurrentPlayer && !isSelected && !isAnimating && (
        <circle
          cx={0}
          cy={0}
          r={pieceRadius + size * 0.1}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeDasharray="6 4"
          opacity={0.7}
          className="active-piece-highlight"
          style={{ transformOrigin: '0px 0px' }}
        />
      )}
      {/* Selection indicator with animation */}
      {isSelected && !isAnimating && (
        <circle
          cx={0}
          cy={0}
          r={pieceRadius + size * 0.12}
          fill="none"
          stroke="#000"
          strokeWidth={2}
          strokeDasharray="4 2"
          className="selection-dash"
        />
      )}
    </g>
  );
}
