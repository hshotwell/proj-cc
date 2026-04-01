'use client';

import React, { useMemo } from 'react';
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
  hexCells?: boolean;
  showTriangleLines?: boolean;
}

function lightenColor(hex: string, amount: number): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return `#${Math.round(r + (255 - r) * amount).toString(16).padStart(2, '0')}${Math.round(g + (255 - g) * amount).toString(16).padStart(2, '0')}${Math.round(b + (255 - b) * amount).toString(16).padStart(2, '0')}`;
}

function darkenColor(hex: string, amount: number): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return `#${Math.round(r * (1 - amount)).toString(16).padStart(2, '0')}${Math.round(g * (1 - amount)).toString(16).padStart(2, '0')}${Math.round(b * (1 - amount)).toString(16).padStart(2, '0')}`;
}

// Concentric hexagon gradient stops: [fraction of hexR, lighten (+) or darken (-) amount]
// Renders outer → inner so inner polygons cover outer (= dark center, lighter rim)
const HEX_GRAD_STOPS: [number, number][] = [
  [1.00,  0.04],  // rim — slightly lighter
  [0.93,  0.00],  // base color — very close to edge
  [0.78, -0.04],
  [0.60, -0.10],
  [0.42, -0.15],
  [0.24, -0.19],
  [0.10, -0.22],  // pit — subtly darker
];

// Reduce saturation of a hex color by `amount` (0=unchanged, 1=fully grey) via HSL
function desaturateColor(hex: string, amount: number): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  const s2 = s * (1 - amount);
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  const q2 = l < 0.5 ? l * (1 + s2) : l + s2 - l * s2;
  const p2 = 2 * l - q2;
  const nr = s2 === 0 ? l : hue2rgb(p2, q2, h + 1/3);
  const ng = s2 === 0 ? l : hue2rgb(p2, q2, h);
  const nb = s2 === 0 ? l : hue2rgb(p2, q2, h - 1/3);
  return `#${Math.round(nr * 255).toString(16).padStart(2, '0')}${Math.round(ng * 255).toString(16).padStart(2, '0')}${Math.round(nb * 255).toString(16).padStart(2, '0')}`;
}

function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30);
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(' ');
}

export function BoardCell({
  coord,
  size = 18,
  activePlayers,
  isCustomLayout = false,
  playerColors,
  customGoalPositions,
  darkMode = false,
  woodenBoard = false,
  glassPieces = false,
  hexCells = false,
  showTriangleLines = false,
}: BoardCellProps) {
  const { x, y } = cubeToPixel(coord, size);
  const coordKeyStr = `${coord.q},${coord.r}`;

  // gradientId is needed for both circle and hex glass modes
  const gradientId = useMemo(() => glassPieces ? `cell-${coord.q}-${coord.r}` : null, [glassPieces, coord.q, coord.r]);

  // ── Zone detection ────────────────────────────────────────────────────────
  // homePlayer: who starts in this triangle; goalPlayer: who aims to finish here
  let goalColor: string | null = null;
  let homeColor: string | null = null;
  let homeIsActive = false;
  let zoneExists = false; // true if cell belongs to any triangle

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
      zoneExists = true;
      const goalPlayer = OPPOSITE_PLAYER[homePlayer as PlayerIndex];
      if (!activePlayers || activePlayers.includes(goalPlayer)) {
        goalColor = getPlayerColor(goalPlayer, playerColors);
      }
      if (!activePlayers || activePlayers.includes(homePlayer)) {
        homeColor = getPlayerColor(homePlayer, playerColors);
        homeIsActive = true;
      }
    }
  }

  // ── Shared color palette ──────────────────────────────────────────────────
  const baseColor = woodenBoard
    ? (darkMode ? '#7a6040' : '#c8a878')
    : (darkMode ? '#4b5563' : '#e5e7eb');

  // Slightly darker base for inactive zones in hex mode
  const inactiveZoneColor = woodenBoard
    ? (darkMode ? '#4a3820' : '#a08858')
    : (darkMode ? '#374151' : '#d1d5db');

  // Depth gradient stops (dark center → lighter rim = concave indent)
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

  // ── Sentinel color detection (rainbow / opal / bouquet are not valid CSS/SVG colors) ──
  const SENTINELS = ['rainbow', 'opal', 'bouquet'];
  const isSpecialHome = !!(homeIsActive && homeColor && SENTINELS.includes(homeColor));
  const isSpecialGoal = !!(goalColor && SENTINELS.includes(goalColor));
  const isSpecialColor = isSpecialHome || isSpecialGoal;
  // Use a vivid red as stand-in so hue-rotate cycles through the full spectrum
  const effectiveHomeColor = isSpecialHome ? '#ff4444' : homeColor;
  const effectiveGoalColor = isSpecialGoal ? '#ff0000' : goalColor;

  // ── Hex cell rendering ────────────────────────────────────────────────────
  if (hexCells) {
    const hexR = size * 0.855;
    const pts = hexPoints(x, y, hexR);
    const lineWidth = showTriangleLines ? 2.2 : (goalColor ? 1.4 : 0.8);
    const strokeColor = effectiveGoalColor
      ?? (woodenBoard
        ? (darkMode ? '#3a2810' : '#5a4020')
        : (darkMode ? '#6b7280' : '#9ca3af'));

    let hexContent: React.ReactNode;
    if (glassPieces) {
      // Glass mode: hexagonal gradient via concentric polygons in zone-base color
      const zoneColor = homeIsActive && effectiveHomeColor
        ? desaturateColor(effectiveHomeColor, 0.65)
        : (zoneExists ? inactiveZoneColor : baseColor);
      hexContent = (
        <g>
          {HEX_GRAD_STOPS.map(([frac, adj], idx) => (
            <polygon
              key={idx}
              points={hexPoints(x, y, hexR * frac)}
              fill={adj >= 0 ? lightenColor(zoneColor, adj) : darkenColor(zoneColor, -adj)}
              stroke="none"
            />
          ))}
          {/* Border stroke on top */}
          <polygon points={pts} fill="none" stroke={strokeColor} strokeWidth={lineWidth} />
        </g>
      );
    } else {
      // Flat mode: solid fill based on zone
      let hexFill: string;
      if (!zoneExists) {
        hexFill = baseColor;
      } else if (homeIsActive && effectiveHomeColor) {
        hexFill = desaturateColor(effectiveHomeColor, 0.65);
      } else {
        hexFill = inactiveZoneColor;
      }
      hexContent = (
        <g>
          <polygon points={pts} fill={hexFill} stroke={strokeColor} strokeWidth={lineWidth} />
        </g>
      );
    }

    return isSpecialColor
      ? <g className="rainbow-ui-filter">{hexContent}</g>
      : <>{hexContent}</>;
  }

  // ── Circle cell rendering (standard mode) ─────────────────────────────────
  return (
    <g>
      {glassPieces && gradientId && (
        <defs>
          <radialGradient id={gradientId} cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor={pitColor} />
            <stop offset="15%"  stopColor={deepColor} />
            <stop offset="35%"  stopColor={darkColor} />
            <stop offset="58%"  stopColor={midColor} />
            <stop offset="82%"  stopColor={edgeColor} />
            <stop offset="100%" stopColor={edgeColor} />
          </radialGradient>
          <radialGradient id={`${gradientId}-shd`} cx="30%" cy="30%" r="90%">
            <stop offset="0%"   stopColor="black" stopOpacity={darkMode ? '0.45' : '0.35'} />
            <stop offset="50%"  stopColor="black" stopOpacity={darkMode ? '0.15' : '0.1'} />
            <stop offset="100%" stopColor="black" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${gradientId}-rim`} cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="black" stopOpacity="0" />
            <stop offset="40%"  stopColor="black" stopOpacity="0" />
            <stop offset="60%"  stopColor="black" stopOpacity={darkMode ? '0.25' : '0.18'} />
            <stop offset="80%"  stopColor="black" stopOpacity={darkMode ? '0.55' : '0.42'} />
            <stop offset="100%" stopColor="black" stopOpacity={darkMode ? '0.8' : '0.65'} />
          </radialGradient>
        </defs>
      )}
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
      {glassPieces && gradientId && (
        <circle cx={x} cy={y} r={size * 0.45} fill={`url(#${gradientId}-shd)`} />
      )}
      {glassPieces && gradientId && (
        <circle cx={x} cy={y} r={size * 0.45} fill={`url(#${gradientId}-rim)`} />
      )}
      {goalColor && (
        isSpecialGoal
          ? <g className="rainbow-ui-filter"><circle cx={x} cy={y} r={size * 0.45} fill="none" stroke="#ff0000" strokeWidth={2.5} /></g>
          : <circle cx={x} cy={y} r={size * 0.45} fill="none" stroke={goalColor} strokeWidth={2.5} />
      )}
    </g>
  );
}
