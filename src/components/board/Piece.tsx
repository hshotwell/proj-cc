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
  darkMode?: boolean;
  glassPieces?: boolean;
}

// Metallic colors that get special shiny treatment
const METALLIC_COLORS: Record<string, {
  light: string; mid: string; dark: string; rim: string;
  bandLight: string; bandDark: string;
  // Radial gradient stops for glass/realistic mode (Option B: dark core)
  radial: [string, string, string, string];
  // Per-metal sheen/sparkle tuning
  sheenDur: number; sheenOpacity: number; twinkleMult: number;
}> = {
  '#b87333': { light: '#d08848', mid: '#a06028', dark: '#5a3018', rim: '#704020', bandLight: '#d89858', bandDark: '#6a3818', radial: ['#e0a060', '#b87333', '#6a3818', '#3a1808'], sheenDur: 3.5, sheenOpacity: 0.5, twinkleMult: 1.6 }, // Copper — slower, more transparent
  '#c0c0c0': { light: '#c8c8c8', mid: '#989898', dark: '#404040', rim: '#606060', bandLight: '#d8d8d8', bandDark: '#585858', radial: ['#e8e8e8', '#b0b0b0', '#606060', '#303030'], sheenDur: 2.8, sheenOpacity: 0.8, twinkleMult: 1.3 }, // Silver — medium
  '#ffd700': { light: '#e8b800', mid: '#c09000', dark: '#604800', rim: '#806000', bandLight: '#f0c820', bandDark: '#785808', radial: ['#ffe060', '#d4a800', '#8a6000', '#503000'], sheenDur: 2.2, sheenOpacity: 1, twinkleMult: 1 }, // Gold — fastest, full opacity
};

function isMetallic(hex: string): boolean {
  return hex.toLowerCase() in METALLIC_COLORS;
}

function getMetallicInfo(hex: string) {
  return METALLIC_COLORS[hex.toLowerCase()];
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
  darkMode,
  glassPieces,
}: PieceProps) {
  // Use displayCoord for visual position if provided, otherwise use actual coord
  const renderCoord = displayCoord ?? coord;
  const { x, y } = cubeToPixel(renderCoord, size);
  const baseColor = getPlayerColor(player, customColors);
  const pieceColor = isLastMoved ? darkenColor(baseColor, 0.2) : baseColor; // Apply darker shade

  // Piece radius is larger than board cell (0.45) so pieces stand out
  const pieceRadius = size * 0.58;

  // Gradient IDs (unique per piece coordinate)
  const gId = `mb${coord.q}_${coord.r}`;
  const metallic = isMetallic(baseColor) ? getMetallicInfo(baseColor) : null;
  const lightColor = glassPieces ? lightenColor(pieceColor, 0.35) : '';
  const darkColor = glassPieces ? darkenColor(pieceColor, 0.25) : '';
  const useGlassGradient = glassPieces && !metallic;
  const useMetallicGradient = glassPieces && !!metallic;

  // Deterministic pseudo-random values per piece for staggered effects
  const seed = Math.abs(coord.q * 7 + coord.r * 13);
  const seed2 = Math.abs(coord.q * 11 + coord.r * 3);
  const seed3 = Math.abs(coord.q * 5 + coord.r * 17);

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
      {useGlassGradient && (
        <defs>
          <radialGradient id={`${gId}f`} cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor={lightColor} />
            <stop offset="100%" stopColor={darkColor} />
          </radialGradient>
          <radialGradient id={`${gId}h`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.75)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
          <radialGradient id={`${gId}r`} cx="50%" cy="30%" r="50%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.35)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
        </defs>
      )}
      {useMetallicGradient && metallic && (
        <defs>
          {/* Radial gradient — bright highlight, dark edges (Option B) */}
          <radialGradient id={`${gId}f`} cx="40%" cy="35%" r="60%">
            <stop offset="0%" stopColor={metallic.radial[0]} />
            <stop offset="40%" stopColor={metallic.radial[1]} />
            <stop offset="75%" stopColor={metallic.radial[2]} />
            <stop offset="100%" stopColor={metallic.radial[3]} />
          </radialGradient>
          <clipPath id={`${gId}clip`}>
            <circle cx={0} cy={0} r={pieceRadius} />
          </clipPath>
        </defs>
      )}
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
        fill={(useGlassGradient || useMetallicGradient) ? `url(#${gId}f)` : pieceColor}
        stroke={(useGlassGradient || useMetallicGradient) ? 'none' : (isSelected ? (darkMode ? '#fff' : '#000') : (darkMode ? '#000' : '#fff'))}
        strokeWidth={(useGlassGradient || useMetallicGradient) ? 0 : 1.5}
      />
      {/* Metallic rim stroke in glass mode */}
      {useMetallicGradient && metallic && (
        <circle
          cx={0}
          cy={0}
          r={pieceRadius - 0.5}
          fill="none"
          stroke={metallic.rim}
          strokeWidth={1}
          opacity={0.6}
        />
      )}
      {/* Glass marble effects (non-metallic) */}
      {useGlassGradient && (
        <>
          <ellipse
            cx={-pieceRadius * 0.3}
            cy={-pieceRadius * 0.3}
            rx={pieceRadius * 0.35}
            ry={pieceRadius * 0.25}
            fill={`url(#${gId}h)`}
          />
          <ellipse
            cx={pieceRadius * 0.1}
            cy={pieceRadius * 0.3}
            rx={pieceRadius * 0.4}
            ry={pieceRadius * 0.15}
            fill={`url(#${gId}r)`}
          />
        </>
      )}
      {/* Metallic effects — twinkles + sheen (both glass and flat modes) */}
      {metallic && (() => {
        const r = pieceRadius;
        const tm = metallic.twinkleMult;
        // Twinkle positions offset from center, scaled by per-metal multiplier
        const twinkles = [
          { cx: -r * 0.3, cy: -r * 0.2, s: 0.8, delay: (seed % 7) * 1.2 + 3, dur: (5 + (seed % 3)) * tm },
          { cx: r * 0.25, cy: -r * 0.35, s: 0.6, delay: (seed2 % 9) * 0.9 + 5, dur: (6 + (seed2 % 3)) * tm },
          { cx: r * 0.1, cy: r * 0.3, s: 0.7, delay: (seed3 % 8) * 1.1 + 7, dur: (7 + (seed3 % 2)) * tm },
        ];
        const clipId = useMetallicGradient ? `${gId}clip` : `${gId}fclip`;
        return (
          <>
            {/* Clip path for flat mode */}
            {!useMetallicGradient && (
              <defs>
                <clipPath id={clipId}>
                  <circle cx={0} cy={0} r={r} />
                </clipPath>
              </defs>
            )}
            {/* Twinkle stars at offset positions */}
            {twinkles.map((t, i) => (
              <g
                key={i}
                className="metallic-twinkle"
                style={{
                  '--twinkle-delay': `${t.delay}s`,
                  '--twinkle-dur': `${t.dur}s`,
                  transformOrigin: `${t.cx}px ${t.cy}px`,
                } as React.CSSProperties}
              >
                <line
                  x1={t.cx - r * 0.2 * t.s} y1={t.cy}
                  x2={t.cx + r * 0.2 * t.s} y2={t.cy}
                  stroke="white" strokeWidth={1} strokeLinecap="round"
                />
                <line
                  x1={t.cx} y1={t.cy - r * 0.2 * t.s}
                  x2={t.cx} y2={t.cy + r * 0.2 * t.s}
                  stroke="white" strokeWidth={1} strokeLinecap="round"
                />
              </g>
            ))}
            {/* Static sheen glow at corner + animated narrow sweep */}
            <g clipPath={`url(#${clipId})`}>
              <defs>
                <linearGradient id={`${clipId}sh`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="white" stopOpacity={0} />
                  <stop offset="20%" stopColor="white" stopOpacity={0.1 * metallic.sheenOpacity} />
                  <stop offset="45%" stopColor="white" stopOpacity={0.4 * metallic.sheenOpacity} />
                  <stop offset="55%" stopColor="white" stopOpacity={0.4 * metallic.sheenOpacity} />
                  <stop offset="80%" stopColor="white" stopOpacity={0.1 * metallic.sheenOpacity} />
                  <stop offset="100%" stopColor="white" stopOpacity={0} />
                </linearGradient>
                <linearGradient id={`${clipId}sh2`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="white" stopOpacity={0} />
                  <stop offset="30%" stopColor="white" stopOpacity={0.35 * metallic.sheenOpacity} />
                  <stop offset="50%" stopColor="white" stopOpacity={0.7 * metallic.sheenOpacity} />
                  <stop offset="70%" stopColor="white" stopOpacity={0.35 * metallic.sheenOpacity} />
                  <stop offset="100%" stopColor="white" stopOpacity={0} />
                </linearGradient>
              </defs>
              {/* Static glow — always visible at corner */}
              <rect
                x={-r * 0.75}
                y={-r * 1.4}
                width={r * 1.5}
                height={r * 2.8}
                fill={`url(#${clipId}sh)`}
                style={{ transform: `rotate(35deg) translateX(${-r * 0.6}px)` }}
              />
              {/* Animated narrow sweep */}
              <rect
                className="metallic-sheen"
                x={-r * 0.3}
                y={-r * 1.4}
                width={r * 0.6}
                height={r * 2.8}
                fill={`url(#${clipId}sh2)`}
                style={{ '--sheen-r': `${r}`, '--sheen-dur': `${metallic.sheenDur}s`, '--sheen-opacity': `${metallic.sheenOpacity}` } as React.CSSProperties}
              />
            </g>
          </>
        );
      })()}
      {/* Highlight for current player's pieces - 6 spinning segments outside border */}
      {isCurrentPlayer && !isSelected && !isAnimating && (() => {
        const borderOuter = pieceRadius + 0.75; // half of 1.5 strokeWidth
        const highlightR = borderOuter + 1 + 1; // 1px gap + half of 2px stroke
        const circumference = 2 * Math.PI * highlightR;
        const segmentLen = circumference / 12;
        const segmentColor = lightenColor(pieceColor, 0.4);
        return (
          <circle
            cx={0}
            cy={0}
            r={highlightR}
            fill="none"
            stroke={segmentColor}
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
            fill={darkMode ? '#fff' : '#000'}
            className="selection-dash"
            style={{ transformOrigin: '0px 0px' }}
          />
        );
      })()}
    </g>
  );
}
