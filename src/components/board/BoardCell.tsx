'use client';

import type { CubeCoord, PlayerIndex, ColorMapping } from '@/types/game';
import { cubeToPixel } from '@/game/coordinates';
import { getTriangleForPosition } from '@/game/board';
import { OPPOSITE_PLAYER } from '@/game/state';
import { getPlayerColor, hexToRgba } from '@/game/colors';

interface BoardCellProps {
  coord: CubeCoord;
  size?: number;
  activePlayers?: PlayerIndex[];
  isCustomLayout?: boolean;
  playerColors?: ColorMapping;
  customGoalPositions?: Partial<Record<PlayerIndex, string[]>>;
  darkMode?: boolean;
}

export function BoardCell({ coord, size = 18, activePlayers, isCustomLayout = false, playerColors, customGoalPositions, darkMode = false }: BoardCellProps) {
  const { x, y } = cubeToPixel(coord, size);
  const coordKeyStr = `${coord.q},${coord.r}`;

  let goalColor: string | null = null;

  if (isCustomLayout && customGoalPositions) {
    const players: PlayerIndex[] = activePlayers || [0, 1, 2, 3, 4, 5];
    for (const player of players) {
      if (customGoalPositions[player]?.includes(coordKeyStr)) {
        goalColor = getPlayerColor(player, playerColors);
        break;
      }
    }
  } else if (!isCustomLayout) {
    const homePlayer = getTriangleForPosition(coord);
    if (homePlayer !== null) {
      const goalPlayer = OPPOSITE_PLAYER[homePlayer as PlayerIndex];
      if (!activePlayers || activePlayers.includes(goalPlayer)) {
        goalColor = getPlayerColor(goalPlayer, playerColors);
      }
    }
  }

  return (
    <g>
      {/* Solid grey background to cover triangle lines */}
      <circle
        cx={x}
        cy={y}
        r={size * 0.45}
        fill="#e5e7eb"
        stroke="#9ca3af"
        strokeWidth={1}
      />
      {/* Goal tint overlay — more opaque in dark mode for visibility */}
      {goalColor && (
        <circle
          cx={x}
          cy={y}
          r={size * 0.45}
          fill={hexToRgba(goalColor, darkMode ? 0.65 : 0.15)}
          stroke={hexToRgba(goalColor, darkMode ? 0.85 : 0.35)}
          strokeWidth={1.5}
        />
      )}
    </g>
  );
}
