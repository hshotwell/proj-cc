'use client';

import { useMemo } from 'react';
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
  woodenBoard?: boolean;
  glassPieces?: boolean;
}

export function BoardCell({ coord, size = 18, activePlayers, isCustomLayout = false, playerColors, customGoalPositions, darkMode = false, woodenBoard = false, glassPieces = false }: BoardCellProps) {
  const { x, y } = cubeToPixel(coord, size);
  const coordKeyStr = `${coord.q},${coord.r}`;

  const gradientId = useMemo(() => glassPieces ? `cell-${coord.q}-${coord.r}` : null, [glassPieces, coord.q, coord.r]);

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

  // Gradient colors for depth effect (concave indent)
  const baseColor = woodenBoard
    ? (darkMode ? '#7a6040' : '#c8a878')
    : (darkMode ? '#4b5563' : '#e5e7eb');

  // Multi-layer depth colors: pit → deep → dark → mid → edge (darkest at center)
  const pitColor = woodenBoard
    ? (darkMode ? '#241408' : '#553018')
    : (darkMode ? '#141c26' : '#606870');
  const deepColor = woodenBoard
    ? (darkMode ? '#2e1c0c' : '#60381c')
    : (darkMode ? '#1a2230' : '#687078');
  const darkColor = woodenBoard
    ? (darkMode ? '#2a1810' : '#5a3818')
    : (darkMode ? '#1a2332' : '#687078');
  const midColor = woodenBoard
    ? (darkMode ? '#3a2818' : '#7a5028')
    : (darkMode ? '#283040' : '#808890');
  const edgeColor = woodenBoard
    ? (darkMode ? '#4a3420' : '#906038')
    : (darkMode ? '#364050' : '#949ca0');

  return (
    <g>
      {glassPieces && gradientId && (
        <defs>
          <radialGradient id={gradientId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={pitColor} />
            <stop offset="15%" stopColor={deepColor} />
            <stop offset="35%" stopColor={darkColor} />
            <stop offset="58%" stopColor={midColor} />
            <stop offset="82%" stopColor={edgeColor} />
            <stop offset="100%" stopColor={edgeColor} />
          </radialGradient>
          <radialGradient id={`${gradientId}-shd`} cx="30%" cy="30%" r="90%">
            <stop offset="0%" stopColor="black" stopOpacity={darkMode ? '0.45' : '0.35'} />
            <stop offset="50%" stopColor="black" stopOpacity={darkMode ? '0.15' : '0.1'} />
            <stop offset="100%" stopColor="black" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${gradientId}-rim`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="black" stopOpacity="0" />
            <stop offset="40%" stopColor="black" stopOpacity="0" />
            <stop offset="60%" stopColor="black" stopOpacity={darkMode ? '0.25' : '0.18'} />
            <stop offset="80%" stopColor="black" stopOpacity={darkMode ? '0.55' : '0.42'} />
            <stop offset="100%" stopColor="black" stopOpacity={darkMode ? '0.8' : '0.65'} />
          </radialGradient>
        </defs>
      )}
      {/* Solid background to cover triangle lines */}
      <circle
        cx={x}
        cy={y}
        r={size * 0.45}
        fill={glassPieces && gradientId ? `url(#${gradientId})` : baseColor}
        stroke={glassPieces
          ? 'none'
          : (woodenBoard
            ? (darkMode ? '#3a2810' : '#5a4020')
            : '#9ca3af')}
        strokeWidth={glassPieces ? 0 : (woodenBoard ? 1.5 : 1)}
      />
      {/* Lower-right shadow (opposite marble light) */}
      {glassPieces && gradientId && (
        <circle cx={x} cy={y} r={size * 0.45} fill={`url(#${gradientId}-shd)`} />
      )}
      {/* Rim shadow for hard edge definition */}
      {glassPieces && gradientId && (
        <circle cx={x} cy={y} r={size * 0.45} fill={`url(#${gradientId}-rim)`} />
      )}
      {/* Goal ring — fully opaque colored stroke */}
      {goalColor && (
        <circle
          cx={x}
          cy={y}
          r={size * 0.45}
          fill="none"
          stroke={goalColor}
          strokeWidth={2.5}
        />
      )}
    </g>
  );
}
