'use client';

import type { CubeCoord, TriangleIndex, PlayerIndex, ColorMapping } from '@/types/game';
import { TRIANGLE_TO_PLAYER, GOAL_TRIANGLE_TO_PLAYER } from '@/game/constants';
import { cubeToPixel } from '@/game/coordinates';
import { getTriangleForPosition } from '@/game/board';
import { getPlayerColor, hexToRgba } from '@/game/colors';

interface BoardCellProps {
  coord: CubeCoord;
  size?: number;
  activePlayers?: PlayerIndex[];
  isCustomLayout?: boolean;
  playerColors?: ColorMapping;
  customGoalPositions?: Partial<Record<PlayerIndex, string[]>>;
}

export function BoardCell({ coord, size = 18, activePlayers, isCustomLayout = false, playerColors, customGoalPositions }: BoardCellProps) {
  const { x, y } = cubeToPixel(coord, size);
  const coordKeyStr = `${coord.q},${coord.r}`;

  let fillColor = '#e5e7eb'; // Default neutral gray
  let fillOpacity = 1;
  let isGoalCell = false;

  if (isCustomLayout && customGoalPositions) {
    // Custom layout: check if this cell is a custom goal for any active player
    for (const player of activePlayers || ALL_PLAYERS) { // Assuming ALL_PLAYERS is defined or passed down
      if (customGoalPositions[player]?.includes(coordKeyStr)) {
        fillColor = getPlayerColor(player, playerColors);
        fillOpacity = 0.25;
        isGoalCell = true;
        break;
      }
    }
  } else if (!isCustomLayout) {
    // Default layout: use TRIANGLE_TO_PLAYER logic for goal highlighting
    const triangle = getTriangleForPosition(coord);
    if (triangle !== null) {
      const goalPlayer = GOAL_TRIANGLE_TO_PLAYER[triangle as TriangleIndex];
      if (!activePlayers || activePlayers.includes(goalPlayer)) {
        fillColor = getPlayerColor(goalPlayer, playerColors);
        fillOpacity = 0.25;
        isGoalCell = true;
      }
    }
  }

  // Fallback for active cells that are not goals
  if (!isGoalCell && activePlayers && activePlayers.length > 0) { // Check if it's an active cell not being used as a goal
    // Determine if this cell is part of the "active" board, not necessarily a start/goal
    // This part of the logic might need refinement based on how activeCells is actually determined for non-editor mode
    // For now, assuming if it's not a goal, and we have activePlayers, it's a general active board cell
    // if (!isCustomLayout) { // Assuming non-custom layouts always have active board cells implicitly
    //   fillColor = '#d1d5db'; // Medium gray for general active cells
    //   fillOpacity = 1;
    // }
  }


  return (
    <circle
      cx={x}
      cy={y}
      r={size * 0.45}
      fill={fillColor}
      fillOpacity={fillOpacity}
      stroke="#9ca3af" // Default stroke
      strokeWidth={1}
      className={isGoalCell ? 'pulse-opacity' : ''}
    />
  );
}
