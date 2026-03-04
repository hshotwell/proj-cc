'use client';

import { useEffect } from 'react';
import type { CubeCoord, PlayerIndex, ColorMapping } from '@/types/game';
import { MOVE_ANIMATION_DURATION } from '@/game/constants';
import { cubeToPixel } from '@/game/coordinates';
import { getPlayerColor } from '@/game/colors';
import { startSheenSync, METALLIC_SHEEN_KEY } from '@/game/sheenSync';

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

// Gem color configs — faceted polygon pieces with distinct shade palettes
const GEM_CONFIGS: Record<string, {
  shades: [string, string, string, string, string, string]; // lightest → darkest
  rimColor: string;
  twinkleMult: number;
}> = {
  '#cc2244': { shades: ['#ff5577', '#ee3355', '#cc2244', '#aa1833', '#881122', '#660011'], rimColor: '#881122', twinkleMult: 1.4 }, // Ruby
  '#2244cc': { shades: ['#5577ff', '#3355ee', '#2244cc', '#1833aa', '#112288', '#001166'], rimColor: '#112288', twinkleMult: 1.2 }, // Sapphire
  '#22aa44': { shades: ['#55dd77', '#33cc55', '#22aa44', '#188833', '#116622', '#004411'], rimColor: '#116622', twinkleMult: 1.5 }, // Emerald
  '#8833aa': { shades: ['#bb66dd', '#aa44cc', '#8833aa', '#662288', '#441166', '#330044'], rimColor: '#441166', twinkleMult: 1.3 }, // Amethyst
  '#88ccee': { shades: ['#ccf0ff', '#aae0ff', '#88ccee', '#66aacc', '#4488aa', '#226688'], rimColor: '#4488aa', twinkleMult: 1.0 }, // Diamond
};

function isMetallic(hex: string): boolean {
  return hex.toLowerCase() in METALLIC_COLORS;
}

function getMetallicInfo(hex: string) {
  return METALLIC_COLORS[hex.toLowerCase()];
}

function isGem(hex: string): boolean {
  return hex.toLowerCase() in GEM_CONFIGS;
}

function getGemConfig(hex: string) {
  return GEM_CONFIGS[hex.toLowerCase()];
}

// Generate pointy-top hex vertices (vertex 0 at top) in SVG coords (y-down)
function hexVertices(r: number, cx = 0, cy = 0): { x: number; y: number }[] {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = -Math.PI / 2 + i * (Math.PI / 3);
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });
}

// Wedge-to-shade index map for advanced gem mode.
// Light source is upper-left (shadow offset 1,2 = lower-right).
// Wedge face directions (pointy-top, vertex 0=top, clockwise):
//   0→upper-right, 1→right, 2→lower-right, 3→lower-left, 4→left, 5→upper-left
// Shades are 0=lightest → 5=darkest, so map brightest to upper-left, darkest to lower-right.
const WEDGE_SHADE_MAP = [1, 3, 5, 4, 2, 0] as const;

// Simple mode: 3 colors in adjacent pairs.
// Wedge faces (pointy-top): 0=upper-right, 1=right, 2=lower-right, 3=lower-left, 4=left, 5=upper-left
// lightest=top (5,0), darkest=right (1,2), mid=left (3,4)
// shades[0]=light, shades[2]=mid, shades[4]=dark
const SIMPLE_PAIR_MAP = [0, 4, 4, 2, 2, 0] as const;

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
  // Start the global sheen sync loop (idempotent)
  useEffect(() => { startSheenSync(); }, []);

  // Use displayCoord for visual position if provided, otherwise use actual coord
  const renderCoord = displayCoord ?? coord;
  const { x, y } = cubeToPixel(renderCoord, size);
  const baseColor = getPlayerColor(player, customColors);
  // Apply last-moved shade: lighten very dark colors, soften very light ones, darken the rest
  const baseLum = (() => {
    const c = baseColor.replace('#', '');
    return (parseInt(c.substring(0, 2), 16) + parseInt(c.substring(2, 4), 16) + parseInt(c.substring(4, 6), 16)) / 3;
  })();
  const pieceColor = isLastMoved
    ? baseLum > 200 ? darkenColor(baseColor, 0.15) : baseLum < 40 ? lightenColor(baseColor, 0.25) : darkenColor(baseColor, 0.2)
    : baseColor;

  // Piece radius is larger than board cell (0.45) so pieces stand out
  const pieceRadius = size * 0.58;

  // Gradient IDs (unique per piece coordinate)
  const gId = `mb${coord.q}_${coord.r}`;
  const metallic = isMetallic(baseColor) ? getMetallicInfo(baseColor) : null;
  const gemRaw = isGem(baseColor) ? getGemConfig(baseColor) : null;
  // Apply last-moved darkening to gem shades
  const gem = gemRaw ? {
    ...gemRaw,
    shades: (isLastMoved
      ? gemRaw.shades.map(s => darkenColor(s, 0.15))
      : gemRaw.shades) as typeof gemRaw.shades,
    rimColor: isLastMoved ? darkenColor(gemRaw.rimColor, 0.15) : gemRaw.rimColor,
  } : null;
  const sheenKey = metallic ? METALLIC_SHEEN_KEY[baseColor.toLowerCase()] : null;
  const lightColor = glassPieces ? lightenColor(pieceColor, 0.35) : '';
  const darkColor = glassPieces ? darkenColor(pieceColor, 0.25) : '';
  const useGlassGradient = glassPieces && !metallic && !gem;
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
      {/* Piece shadow — hex-shaped for gems, circle otherwise */}
      {gem ? (
        <polygon
          points={hexVertices(pieceRadius, 1, 2).map(v => `${v.x},${v.y}`).join(' ')}
          fill="rgba(0,0,0,0.2)"
        />
      ) : (
        <circle cx={1} cy={2} r={pieceRadius} fill="rgba(0,0,0,0.2)" />
      )}
      {/* Main piece circle — for non-gem pieces only */}
      {!gem && (() => {
        const hasGradient = useGlassGradient || useMetallicGradient;
        const borderColor = isSelected ? (darkMode ? '#fff' : '#000') : (darkMode ? '#000' : '#fff');
        return (
          <circle
            cx={0}
            cy={0}
            r={pieceRadius}
            fill={hasGradient ? `url(#${gId}f)` : pieceColor}
            stroke={hasGradient ? 'none' : borderColor}
            strokeWidth={hasGradient ? 0 : 1.5}
          />
        );
      })()}
      {/* Gem faceted rendering */}
      {gem && (() => {
        const r = pieceRadius;
        const s = gem.shades;
        const outerVerts = hexVertices(r);
        if (glassPieces) {
          const innerR = r * 0.55;
          const innerVerts = hexVertices(innerR);
          // Advanced mode: 6 wedge facets with light-based shading + inner hex
          return (
            <>
              {outerVerts.map((v, i) => {
                const next = outerVerts[(i + 1) % 6];
                return (
                  <polygon
                    key={`w${i}`}
                    points={`0,0 ${v.x},${v.y} ${next.x},${next.y}`}
                    fill={s[WEDGE_SHADE_MAP[i]]}
                  />
                );
              })}
              {/* Outer hex rim */}
              <polygon
                points={outerVerts.map(v => `${v.x},${v.y}`).join(' ')}
                fill="none"
                stroke={gem.rimColor}
                strokeWidth={0.5}
              />
              {/* Facet lines from inner to outer vertices */}
              {innerVerts.map((v, i) => (
                <line key={`fl${i}`} x1={v.x} y1={v.y} x2={outerVerts[i].x} y2={outerVerts[i].y} stroke={gem.rimColor} strokeWidth={0.3} opacity={0.4} />
              ))}
              {/* Inner hex highlight */}
              <polygon
                points={innerVerts.map(v => `${v.x},${v.y}`).join(' ')}
                fill={s[0]}
                stroke={gem.rimColor}
                strokeWidth={0.3}
                opacity={0.85}
              />
            </>
          );
        } else {
          // Simple mode: hex with 6 wedge facets, 3 colors in adjacent pairs
          // Dividing line: lighter than lightest shade, same width as hex rim
          const divideColor = lightenColor(s[0], 0.4);
          // Pair boundaries: vertices where two same-colored wedges meet
          // Vertex 0 = between wedge 5 (light) & wedge 0 (light)
          // Vertex 2 = between wedge 1 (dark) & wedge 2 (dark)
          // Vertex 4 = between wedge 3 (mid) & wedge 4 (mid)
          const pairBoundaryVerts = [0, 2, 4];
          return (
            <>
              {outerVerts.map((v, i) => {
                const next = outerVerts[(i + 1) % 6];
                return (
                  <polygon
                    key={`sw${i}`}
                    points={`0,0 ${v.x},${v.y} ${next.x},${next.y}`}
                    fill={s[SIMPLE_PAIR_MAP[i]]}
                  />
                );
              })}
              {/* Dividing lines between same-colored pairs */}
              {pairBoundaryVerts.map(vi => (
                <line
                  key={`div${vi}`}
                  x1={0} y1={0}
                  x2={outerVerts[vi].x} y2={outerVerts[vi].y}
                  stroke={divideColor}
                  strokeWidth={0.5}
                />
              ))}
              {/* Outer hex rim */}
              <polygon
                points={outerVerts.map(v => `${v.x},${v.y}`).join(' ')}
                fill="none"
                stroke={gem.rimColor}
                strokeWidth={0.5}
              />
            </>
          );
        }
      })()}
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
      {/* Glass marble effects (non-metallic, non-gem) */}
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
              {/* Animated narrow sweep — position driven by global JS sync */}
              <rect
                className="metallic-sheen"
                x={-r * 0.3}
                y={-r * 1.4}
                width={r * 0.6}
                height={r * 2.8}
                fill={`url(#${clipId}sh2)`}
                style={{ '--sheen-r': `${r}`, '--sheen-phase': `var(--sheen-phase-${sheenKey})`, '--sheen-opacity': `${metallic.sheenOpacity}` } as React.CSSProperties}
              />
            </g>
          </>
        );
      })()}
      {/* Gem twinkle effects — sparkle stars, NO sheen */}
      {gem && (() => {
        const r = pieceRadius;
        const tm = gem.twinkleMult;
        const twinkles = [
          { cx: -r * 0.3, cy: -r * 0.2, s: 0.8, delay: (seed % 7) * 1.2 + 3, dur: (5 + (seed % 3)) * tm },
          { cx: r * 0.25, cy: -r * 0.35, s: 0.6, delay: (seed2 % 9) * 0.9 + 5, dur: (6 + (seed2 % 3)) * tm },
          { cx: r * 0.1, cy: r * 0.3, s: 0.7, delay: (seed3 % 8) * 1.1 + 7, dur: (7 + (seed3 % 2)) * tm },
        ];
        return (
          <>
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
          </>
        );
      })()}
      {/* Highlight for current player's pieces - 6 spinning segments outside border */}
      {isCurrentPlayer && !isSelected && !isAnimating && (() => {
        const borderOuter = pieceRadius + 0.75; // half of 1.5 strokeWidth
        const highlightR = borderOuter + 1 + 1; // 1px gap + half of 2px stroke
        const circumference = 2 * Math.PI * highlightR;
        const segmentLen = circumference / 12;
        // For very light colors (like white), darken instead of lighten so the spinner is visible
        const cleanHex = pieceColor.replace('#', '');
        const luminance = (parseInt(cleanHex.substring(0, 2), 16) + parseInt(cleanHex.substring(2, 4), 16) + parseInt(cleanHex.substring(4, 6), 16)) / 3;
        const segmentColor = luminance > 200 && !darkMode ? darkenColor(pieceColor, 0.15) : lightenColor(pieceColor, 0.4);
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
