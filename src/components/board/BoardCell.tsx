'use client';

import type { CubeCoord, TriangleIndex, PlayerIndex, ColorMapping } from '@/types/game';
import { TRIANGLE_TO_PLAYER } from '@/game/constants';
import { cubeToPixel } from '@/game/coordinates';
import { getTriangleForPosition } from '@/game/board';
import { getPlayerColor, hexToRgba } from '@/game/colors';

interface BoardCellProps {
  coord: CubeCoord;
  size?: number;
  activePlayers?: PlayerIndex[];
  isCustomLayout?: boolean;
  playerColors?: ColorMapping;
}

export function BoardCell({ coord, size = 18, activePlayers, isCustomLayout = false, playerColors }: BoardCellProps) {
  const { x, y } = cubeToPixel(coord, size);

  // For custom layouts, just use neutral gray
  let fillColor = '#e5e7eb';

  if (!isCustomLayout) {
    const triangle = getTriangleForPosition(coord);
    // Determine fill color based on triangle and active players
    if (triangle !== null) {
      const triangleOwner = TRIANGLE_TO_PLAYER[triangle as TriangleIndex];
      // Only color the triangle if its owner is an active player
      if (!activePlayers || activePlayers.includes(triangleOwner)) {
        fillColor = hexToRgba(getPlayerColor(triangleOwner, playerColors), 0.15);
      }
    }
  }

  return (
    <circle
      cx={x}
      cy={y}
      r={size * 0.45}
      fill={fillColor}
      stroke="#9ca3af"
      strokeWidth={1}
    />
  );
}
