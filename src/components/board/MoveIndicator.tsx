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
  hexCells?: boolean;
  darkMode?: boolean;
}

export function MoveIndicator({ coord, onClick, size = 18, playerColor = '#22c55e', isJump = false, isSwap = false, hexCells = false, darkMode = false }: MoveIndicatorProps) {
  const { x, y } = cubeToPixel(coord, size);

  // In light mode, darken near-grey colors (e.g. silver) that would wash out (luminance > 185)
  const isRainbowOrOpal = playerColor === 'rainbow' || playerColor === 'opal' || playerColor === 'bouquet';
  const cleanHex = isRainbowOrOpal ? '808080' : playerColor.replace('#', '');
  const lum = (parseInt(cleanHex.substring(0, 2), 16) + parseInt(cleanHex.substring(2, 4), 16) + parseInt(cleanHex.substring(4, 6), 16)) / 3;
  const effectiveColor = isRainbowOrOpal ? '#ff0000' : (!darkMode && lum > 185
    ? `#${[0, 2, 4].map(i => Math.round(parseInt(cleanHex.substring(i, i + 2), 16) * 0.55).toString(16).padStart(2, '0')).join('')}`
    : playerColor);

  if (isSwap) {
    const pieceRadius = size * 0.58;
    const ringRadius = pieceRadius + size * 0.14;
    const inner = (
      <g onClick={onClick} style={{ cursor: 'pointer' }}>
        <circle
          cx={x}
          cy={y}
          r={ringRadius}
          fill="none"
          stroke={effectiveColor}
          strokeWidth={2.5}
          strokeDasharray="5 3"
          opacity={0.85}
          className="selection-dash"
          style={{ transformOrigin: `${x}px ${y}px` }}
        />
      </g>
    );
    return isRainbowOrOpal ? <g className="rainbow-ui-filter">{inner}</g> : inner;
  }

  // Jump moves are larger and more visible, step moves are smaller and more subtle
  const baseRadius = isJump ? size * 0.38 : size * 0.25;
  const ringRadius = isJump ? size * 0.48 : size * 0.35;
  const opacity = isJump ? (hexCells ? 0.8 : 0.4) : (hexCells ? 0.55 : 0.25);

  const inner = (
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
      {/* Pulsing outer ring - stationary position, pulses in size */}
      <circle
        cx={x}
        cy={y}
        r={ringRadius}
        fill="none"
        stroke={effectiveColor}
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
        fill={effectiveColor}
        opacity={opacity + 0.15}
      />
    </g>
  );
  return isRainbowOrOpal ? <g className="rainbow-ui-filter">{inner}</g> : inner;
}
