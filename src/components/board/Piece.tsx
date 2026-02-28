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
  // Highlight this piece as the last moved piece for its player
  isLastMoved?: boolean;
}

// Lighten a hex color by mixing with white
function lightenColor(hex: string, amount: number): string {
  // Remove # if present
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);

  // Mix with white
  const newR = Math.round(r + (255 - r) * amount);
  const newG = Math.round(g + (255 - g) * amount);
  const newB = Math.round(b + (255 - b) * amount);

  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

// Darken a hex color by mixing with black
function darkenColor(hex: string, amount: number): string {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);

  const newR = Math.round(r * (1 - amount));
  const newG = Math.round(g * (1 - amount));
  const newB = Math.round(b * (1 - amount));

  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
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
  isLastMoved,
}: PieceProps) {
  // Use displayCoord for visual position if provided, otherwise use actual coord
  const renderCoord = displayCoord ?? coord;
  const { x, y } = cubeToPixel(renderCoord, size);
  const baseColor = getPlayerColor(player, customColors);
  const pieceColor = isLastMoved ? darkenColor(baseColor, 0.2) : baseColor; // Apply darker shade

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
        fill={pieceColor}
        stroke={isSelected ? '#000' : '#fff'}
        strokeWidth={1.5}
      />
      {/* Highlight for current player's pieces - 6 spinning segments outside border */}
      {isCurrentPlayer && !isSelected && !isAnimating && (() => {
        const borderOuter = pieceRadius + 0.75; // half of 1.5 strokeWidth
        const highlightR = borderOuter + 1 + 1; // 1px gap + half of 2px stroke
        const circumference = 2 * Math.PI * highlightR;
        const segmentLen = circumference / 12;
        return (
          <circle
            cx={0}
            cy={0}
            r={highlightR}
            fill="none"
            stroke={pieceColor}
            strokeWidth={2}
            strokeDasharray={`${segmentLen} ${segmentLen}`}
            className="active-piece-highlight"
            style={{ transformOrigin: '0px 0px' }}
          />
        );
      })()}
      {/* Selection indicator - 12 triangle spikes rotating opposite */}
      {isSelected && !isAnimating && (() => {
        const spikeR = pieceRadius + size * 0.18;
        const innerR = pieceRadius + size * 0.02;
        const segments = 12;
        const spikeAngle = (2 * Math.PI) / segments;
        const baseHalfAngle = spikeAngle * 0.5;
        const triangles: string[] = [];
        for (let i = 0; i < segments; i++) {
          const tipAngle = i * spikeAngle;
          const x1 = Math.cos(tipAngle - baseHalfAngle) * innerR;
          const y1 = Math.sin(tipAngle - baseHalfAngle) * innerR;
          const tx = Math.cos(tipAngle) * spikeR;
          const ty = Math.sin(tipAngle) * spikeR;
          const x2 = Math.cos(tipAngle + baseHalfAngle) * innerR;
          const y2 = Math.sin(tipAngle + baseHalfAngle) * innerR;
          triangles.push(`M${x1},${y1} L${tx},${ty} L${x2},${y2} Z`);
        }
        return (
          <path
            d={triangles.join(' ')}
            fill="#000"
            className="selection-dash"
            style={{ transformOrigin: '0px 0px' }}
          />
        );
      })()}
    </g>
  );
}
