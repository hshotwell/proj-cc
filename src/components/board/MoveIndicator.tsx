'use client';

import type { CubeCoord } from '@/types/game';
import { cubeToPixel } from '@/game/coordinates';

interface MoveIndicatorProps {
  coord: CubeCoord;
  onClick: () => void;
  size?: number;
  playerColor?: string;
  isJump?: boolean;
  isSwap?: boolean;
}

export function MoveIndicator({ coord, onClick, size = 18, playerColor = '#22c55e', isJump = false, isSwap = false }: MoveIndicatorProps) {
  const { x, y } = cubeToPixel(coord, size);

  if (isSwap) {
    // Spinning dashed circle in the current player's color around the opponent piece.
    // Matches the selection-dash style but uses the player color for contrast.
    const pieceRadius = size * 0.58;
    const ringRadius = pieceRadius + size * 0.14;
    return (
      <g onClick={onClick} style={{ cursor: 'pointer' }}>
        <circle
          cx={x}
          cy={y}
          r={ringRadius}
          fill="none"
          stroke={playerColor}
          strokeWidth={2.5}
          strokeDasharray="5 3"
          opacity={0.85}
          className="selection-dash"
        />
      </g>
    );
  }

  // Jump moves are larger and more visible, step moves are smaller and more subtle
  const baseRadius = isJump ? size * 0.38 : size * 0.25;
  const ringRadius = isJump ? size * 0.48 : size * 0.35;
  const opacity = isJump ? 0.4 : 0.25;

  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
      {/* Pulsing outer ring - stationary position, pulses in size */}
      <circle
        cx={x}
        cy={y}
        r={ringRadius}
        fill="none"
        stroke={playerColor}
        strokeWidth={isJump ? 3 : 2}
        opacity={opacity}
        className="move-indicator-pulse"
        style={{ transformOrigin: `${x}px ${y}px` }}
      />
      {/* Solid center dot */}
      <circle
        cx={x}
        cy={y}
        r={baseRadius}
        fill={playerColor}
        opacity={opacity + 0.15}
      />
    </g>
  );
}
