'use client';

import { useEffect } from 'react';
import type { CubeCoord, PlayerIndex, ColorMapping, PieceVariant } from '@/types/game';
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
  // Optional: render at exact pixel position (overrides coord/displayCoord — for arc animations)
  displayPx?: { x: number; y: number };
  isAnimating?: boolean;
  animationDuration?: number;
  // Highlight this piece as the last moved piece for its player
  isLastMoved?: boolean;
  darkMode?: boolean;
  glassPieces?: boolean;
  hexCells?: boolean;
  variant?: PieceVariant;
  // Counter-rotate piece to stay upright when the board is rotated
  boardRotation?: number;
}

// Metallic colors that get special shiny treatment
const METALLIC_COLORS: Record<string, {
  light: string; mid: string; dark: string; rim: string;
  bandLight: string; bandDark: string;
  // Radial gradient stops for glass/realistic mode (Option B: dark core)
  radial: [string, string, string, string];
  // Per-metal sheen/sparkle tuning
  sheenDur: number; sheenOpacity: number; twinkleMult: number; sheenColor?: string;
}> = {
  '#b87333': { light: '#d08848', mid: '#a06028', dark: '#5a3018', rim: '#704020', bandLight: '#d89858', bandDark: '#6a3818', radial: ['#e0a060', '#b87333', '#6a3818', '#3a1808'], sheenDur: 3.5, sheenOpacity: 0.5, twinkleMult: 1.6 }, // Copper — slower, more transparent
  '#c0c0c0': { light: '#c8c8c8', mid: '#989898', dark: '#404040', rim: '#606060', bandLight: '#d8d8d8', bandDark: '#585858', radial: ['#e8e8e8', '#b0b0b0', '#606060', '#303030'], sheenDur: 2.8, sheenOpacity: 0.8, twinkleMult: 1.3 }, // Silver — medium
  '#ffd700': { light: '#e8b800', mid: '#c09000', dark: '#604800', rim: '#806000', bandLight: '#f0c820', bandDark: '#785808', radial: ['#ffe060', '#d4a800', '#8a6000', '#503000'], sheenDur: 2.2, sheenOpacity: 1, twinkleMult: 1 }, // Gold — fastest, full opacity
  '#a8d8f0': { light: '#daf4ff', mid: '#a8d8f0', dark: '#4888b8', rim: '#68a8cc', bandLight: '#c0e8f8', bandDark: '#5080a0', radial: ['#e8f8ff', '#b8e0f4', '#78aad0', '#3870a0'], sheenDur: 2.5, sheenOpacity: 0.5, twinkleMult: 1.0 }, // Ice
  '#1a1820': { light: '#585868', mid: '#282838', dark: '#080810', rim: '#181828', bandLight: '#383848', bandDark: '#08080e', radial: ['#686878', '#383848', '#181820', '#08080e'], sheenDur: 3.0, sheenOpacity: 0.5, twinkleMult: 1.8 }, // Onyx
  '#f0e8dc': { light: '#fffef8', mid: '#f0e8dc', dark: '#c8b8a8', rim: '#d8c8b8', bandLight: '#fff8f0', bandDark: '#d0c0b0', radial: ['#ffffff', '#f8f0e8', '#e0d0c0', '#c8b8a8'], sheenDur: 2.0, sheenOpacity: 1.0, twinkleMult: 0.8 }, // Pearl
  '#3a7850': { light: '#72b878', mid: '#3a7850', dark: '#1a5030', rim: '#285840', bandLight: '#52a868', bandDark: '#183828', radial: ['#82c888', '#4a9060', '#285840', '#103020'], sheenDur: 3.8, sheenOpacity: 0.5, twinkleMult: 1.4 }, // Jade
  '#303858': { light: '#6878a8', mid: '#404870', dark: '#182030', rim: '#202840', bandLight: '#506090', bandDark: '#101828', radial: ['#6878a8', '#404870', '#202840', '#101828'], sheenDur: 3.0, sheenOpacity: 0.5, twinkleMult: 1.2 }, // Iron
  '#f07090': { light: '#ffc0d0', mid: '#f07090', dark: '#c04870', rim: '#c05878', bandLight: '#ffacc0', bandDark: '#d06080', radial: ['#ffc8d8', '#f07090', '#d06080', '#a04060'], sheenDur: 2.3, sheenOpacity: 0.5, twinkleMult: 1.1 }, // Morganite
};

// Gem color configs — faceted polygon pieces with distinct shade palettes
const GEM_CONFIGS: Record<string, {
  shades: [string, string, string, string, string, string]; // lightest → darkest
  rimColor: string;
  twinkleMult: number;
}> = {
  '#cc2244': { shades: ['#ff5577', '#ee3355', '#cc2244', '#aa1833', '#881122', '#660011'], rimColor: '#881122', twinkleMult: 1.4 }, // Ruby
  '#e07020': { shades: ['#ffaa55', '#f09030', '#e07020', '#c85a18', '#b04810', '#8c3808'], rimColor: '#b04810', twinkleMult: 1.3 }, // Amber
  '#2244cc': { shades: ['#5577ff', '#3355ee', '#2244cc', '#1833aa', '#112288', '#001166'], rimColor: '#112288', twinkleMult: 1.2 }, // Sapphire
  '#22aa44': { shades: ['#55dd77', '#33cc55', '#22aa44', '#188833', '#116622', '#004411'], rimColor: '#116622', twinkleMult: 1.5 }, // Emerald
  '#8833aa': { shades: ['#bb66dd', '#aa44cc', '#8833aa', '#662288', '#441166', '#330044'], rimColor: '#441166', twinkleMult: 1.3 }, // Amethyst
  '#88ccee': { shades: ['#ccf0ff', '#aae0ff', '#88ccee', '#66aacc', '#4488aa', '#226688'], rimColor: '#4488aa', twinkleMult: 1.0 }, // Diamond
  '#2a2a40': { shades: ['#6a6a8a', '#4a4a6a', '#2a2a40', '#1a1a2e', '#0e0e1e', '#06060e'], rimColor: '#1a1a2e', twinkleMult: 1.5 }, // Obsidian
  '#8c8c9c': { shades: ['#dcdce8', '#bcbcc8', '#9c9cac', '#7c7c8c', '#5c5c6c', '#3c3c4c'], rimColor: '#5c5c6c', twinkleMult: 1.1 }, // Marble
  '#e8e0d0': { shades: ['#fefefe', '#f8f4ec', '#ede6d8', '#ddd4c0', '#c8bca8', '#b0a490'], rimColor: '#c8bca8', twinkleMult: 0.8 }, // Pearl
};

// Flower configs — per-flower shape and color data for piece rendering
const FLOWER_CONFIGS: Record<string, {
  petalRx: number;   // Half-width of petal ellipse (fraction of pieceRadius)
  petalRy: number;   // Half-length of petal ellipse (fraction of pieceRadius)
  petalDist: number; // Distance from center to ellipse midpoint (fraction of pieceRadius)
  petalCount: number;
  centerR: number;   // Center circle radius (fraction of pieceRadius)
  centerColor: string;
  lightColor: string;
  darkColor: string;
  centerLightColor: string;
  ruffleDepth?: number;     // If set, render as ruffled hex instead of petals
  ruffleR?: number;         // Outer radius fraction for ruffled shape (default 0.78)
  ruffleBumps?: number;     // Number of bumps for ruffled shape (default 6)
  ruffleRotation?: number;  // Rotate entire flower by this many degrees
  innerLayer?: boolean;     // Replace center circle with inner rotated ruffled layer
  centerAsRuffled?: boolean; // Render center as smaller same-shape ruffled path instead of circle
  spiralVeins?: boolean;    // Glass mode: spiral vein lines on outer layer + seeded center
  cloverLeaf?: boolean;     // Render as 4-leaf clover (heart-shaped leaves, no stem)
  innerPetals?: { count: number; rx: number; ry: number; dist: number }; // Second ring of petals
  petalTips?: boolean;      // Add small triangle tip on top of each ruffled petal peak
  petalPoints?: boolean;    // Add small pointed triangle tip at outer end of each ellipse petal
  gradientCenter?: boolean; // Petals use radial gradient from centerColor (center) → petalColor (edge)
  lightModeColor?: string;  // Override base petal color in light mode (!darkMode)
}> = {
  '#d4364e': { petalRx: 0.25, petalRy: 0.36, petalDist: 0.42, petalCount: 6, centerR: 0.22, centerColor: '#401017', lightColor: '#8a1520', darkColor: '#751e2b', centerLightColor: '#c03048', ruffleDepth: 0.14, ruffleR: 0.86, innerLayer: true }, // Rose
  '#e8b800': { petalRx: 0.16, petalRy: 0.44, petalDist: 0.45, petalCount: 6, centerR: 0.28, centerColor: '#3d2000', lightColor: '#f1d466', darkColor: '#8b6e00', centerLightColor: '#7a4010', innerPetals: { count: 6, rx: 0.16, ry: 0.44, dist: 0.45 } }, // Sunflower — 12 equal petals
  '#5ba3d9': { petalRx: 0.22, petalRy: 0.36, petalDist: 0.48, petalCount: 5, centerR: 0.18, centerColor: '#f0d020', lightColor: '#9dc8e8', darkColor: '#376282', centerLightColor: '#f8e860' }, // Forget-me-not — 5 petals
  '#5040cc': { petalRx: 0.36, petalRy: 0.44, petalDist: 0.40, petalCount: 5, centerR: 0.20, centerColor: '#f0d020', lightColor: '#9080e0', darkColor: '#281a6a', centerLightColor: '#f8e860', ruffleDepth: 0.20, ruffleR: 0.88, ruffleBumps: 5, ruffleRotation: -90, gradientCenter: true }, // Violet
  '#f090b0': { petalRx: 0.27, petalRy: 0.40, petalDist: 0.47, petalCount: 5, centerR: 0.20, centerColor: '#ff5090', lightColor: '#f6bcd0', darkColor: '#90566a', centerLightColor: '#ff80b8' }, // Cherry Blossom — 5 petals
  '#241848': { petalRx: 0.22, petalRy: 0.46, petalDist: 0.38, petalCount: 6, centerR: 0.20, centerColor: '#9030e0', lightColor: '#8050d0', darkColor: '#100820', centerLightColor: '#c080ff', lightModeColor: '#2d0e50', petalPoints: true, innerPetals: { count: 6, rx: 0.19, ry: 0.34, dist: 0.28 } }, // Black Lotus
  '#f4f0e8': { petalRx: 0.22, petalRy: 0.50, petalDist: 0.46, petalCount: 6, centerR: 0.22, centerColor: '#e060a0', lightColor: '#ede4cc', darkColor: '#b7b4ae', centerLightColor: '#f080c0', lightModeColor: '#d8d2c8' }, // White Lily
  '#4a9e60': { petalRx: 0.22, petalRy: 0.36, petalDist: 0.30, petalCount: 4, centerR: 0.14, centerColor: '#1a5228', lightColor: '#92c5a0', darkColor: '#2c5f3a', centerLightColor: '#3a8040', cloverLeaf: true }, // Clover
  '#b4b8cc': { petalRx: 0.24, petalRy: 0.34, petalDist: 0.42, petalCount: 5, centerR: 0.20, centerColor: '#d84020', lightColor: '#dcdfe8', darkColor: '#787c90', centerLightColor: '#ff6020', ruffleDepth: 0.12, ruffleR: 0.88, ruffleBumps: 5, centerAsRuffled: true, ruffleRotation: -90, spiralVeins: true }, // Grey Hibiscus — orange-red center
};

function isFlower(hex: string): boolean {
  return hex.toLowerCase() in FLOWER_CONFIGS;
}

function getFlowerConfig(hex: string) {
  return FLOWER_CONFIGS[hex.toLowerCase()];
}

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

// Player colors used for rainbow/opal pieces (clockwise board order)
const SPECIAL_PIECE_COLORS = ['#ef4444', '#facc15', '#22c55e', '#22d3ee', '#3b82f6', '#a855f7'];

// SVG pie-slice path for rainbow marble sectors (starting from top = -90°)
function pieSlice(radius: number, startDeg: number, endDeg: number): string {
  const toRad = (d: number) => (d - 90) * Math.PI / 180;
  const x1 = (radius * Math.cos(toRad(startDeg))).toFixed(3);
  const y1 = (radius * Math.sin(toRad(startDeg))).toFixed(3);
  const x2 = (radius * Math.cos(toRad(endDeg))).toFixed(3);
  const y2 = (radius * Math.sin(toRad(endDeg))).toFixed(3);
  return `M 0,0 L ${x1},${y1} A ${radius},${radius} 0 0,1 ${x2},${y2} Z`;
}

// Generate pointy-top hex vertices (vertex 0 at top) in SVG coords (y-down)
function hexVertices(r: number, cx = 0, cy = 0): { x: number; y: number }[] {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = -Math.PI / 2 + i * (Math.PI / 3);
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });
}

// Petal path whose side edges exactly follow the spiral vein bezier curves.
// layerR = outer ruffled radius, troughR = layerR*(1-depth), same control-point formula as the vein lines.
function spiralPetalPath(layerR: number, troughR: number, bumps: number, depth: number, petalIndex: number): string {
  const angleA = (petalIndex - 0.5) * 2 * Math.PI / bumps; // CCW trough
  const angleB = (petalIndex + 0.5) * 2 * Math.PI / bumps; // CW  trough
  // Trough points + bezier control points (same formula as spiral vein lines)
  const pxA = troughR * Math.cos(angleA), pyA = troughR * Math.sin(angleA);
  const cpxA = pxA * 0.5 + 0.6 * pyA,    cpyA = pyA * 0.5 - 0.6 * pxA;
  const pxB = troughR * Math.cos(angleB), pyB = troughR * Math.sin(angleB);
  const cpxB = pxB * 0.5 + 0.6 * pyB,    cpyB = pyB * 0.5 - 0.6 * pxB;
  // Ruffled arc from trough A to trough B (skip first point — already at pxA,pyA after Q)
  const ptCount = 16;
  const arcPts = Array.from({ length: ptCount }, (_, j) => {
    const θ = angleA + ((j + 1) / ptCount) * (angleB - angleA);
    const rad = layerR * (1 - (depth / 2) * (1 - Math.cos(bumps * θ)));
    return `${(rad * Math.cos(θ)).toFixed(2)},${(rad * Math.sin(θ)).toFixed(2)}`;
  });
  return [
    `M 0,0`,
    `Q ${cpxA.toFixed(2)},${cpyA.toFixed(2)} ${pxA.toFixed(2)},${pyA.toFixed(2)}`,
    `L ${arcPts.join(' L ')}`,
    `Q ${cpxB.toFixed(2)},${cpyB.toFixed(2)} 0,0`,
    `Z`,
  ].join(' ');
}

// Cosine-modulated ruffled circle — bumps=6 for hex-ish, depth controls pointedness
function ruffledPath(R: number, bumps: number, depth: number): string {
  const pts = Array.from({ length: 96 }, (_, i) => {
    const θ = (i / 96) * 2 * Math.PI;
    const rad = R * (1 - (depth / 2) * (1 - Math.cos(bumps * θ)));
    return `${(rad * Math.cos(θ)).toFixed(2)},${(rad * Math.sin(θ)).toFixed(2)}`;
  });
  return `M ${pts[0]} L ${pts.slice(1).join(' L ')} Z`;
}


// Clover leaf: heart shape with visible center cleft. Tip at (0, tipY), two round lobes at top.
function heartLeafPath(s: number): string {
  const tipY = s * 0.52;
  const topY = -s * 0.50;
  const w = s * 0.60;
  return [
    `M 0,${tipY.toFixed(2)}`,
    `C ${(-w * 1.05).toFixed(2)},${(s * 0.25).toFixed(2)} ${(-w).toFixed(2)},${topY.toFixed(2)} ${(-w * 0.28).toFixed(2)},${topY.toFixed(2)}`,
    `C ${(-w * 0.06).toFixed(2)},${(topY + s * 0.05).toFixed(2)} ${(w * 0.06).toFixed(2)},${(topY + s * 0.05).toFixed(2)} ${(w * 0.28).toFixed(2)},${topY.toFixed(2)}`,
    `C ${w.toFixed(2)},${topY.toFixed(2)} ${(w * 1.05).toFixed(2)},${(s * 0.25).toFixed(2)} 0,${tipY.toFixed(2)}`,
    `Z`,
  ].join(' ');
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

// Egg-shaped SVG path centered at 0,0. Top is oval/smooth, bottom is rounder.
// rx: half-width, ryTop: height to top, ryBot: height to round bottom.
function eggPath(rx: number, ryTop: number, ryBot: number): string {
  const magic = 0.5523; // bezier constant for quarter-circle approximation
  return [
    `M 0,${(-ryTop).toFixed(2)}`,
    `C ${(rx * 0.55).toFixed(2)},${(-ryTop).toFixed(2)} ${rx.toFixed(2)},${(-ryTop * 0.45).toFixed(2)} ${rx.toFixed(2)},0`,
    `C ${rx.toFixed(2)},${(ryBot * magic).toFixed(2)} ${(rx * magic).toFixed(2)},${ryBot.toFixed(2)} 0,${ryBot.toFixed(2)}`,
    `C ${(-rx * magic).toFixed(2)},${ryBot.toFixed(2)} ${(-rx).toFixed(2)},${(ryBot * magic).toFixed(2)} ${(-rx).toFixed(2)},0`,
    `C ${(-rx).toFixed(2)},${(-ryTop * 0.45).toFixed(2)} ${(-rx * 0.55).toFixed(2)},${(-ryTop).toFixed(2)} 0,${(-ryTop).toFixed(2)}`,
    `Z`,
  ].join(' ');
}

const EGG_COLOR_SET = new Set([
  '#8a1818', '#d4a020', '#b8d890', '#50c0b0', '#4878c0',
  '#7030a0', '#181010', '#b8b8b8', '#f4f4f0', '#f0c8e8',
]);

// Pre-computed dragon scale rows — normalized to pieceRadius=1, one path per color row.
// Eliminates per-render computation and collapses ~130 <polygon> elements into ~17 <path>s.
const DRAGON_SCALE_ROWS: { row: number; d: string; color: string }[] = (() => {
  const ERX = 0.74, ERYT = 0.93, ERYB = 0.86;
  const scaleSize = 0.17;
  const rowMap = new Map<number, string[]>();
  for (let row = -8; row <= 8; row++) {
    for (let col = -7; col <= 7; col++) {
      const sx = col * scaleSize * 0.88 + (row % 2 === 0 ? 0 : scaleSize * 0.44);
      const sy = row * scaleSize * 0.68;
      const ey = sy >= 0 ? ERYB : ERYT;
      if (Math.sqrt((sx / ERX) ** 2 + (sy / ey) ** 2) < 1.1) {
        const seg = `M${sx.toFixed(2)},${(sy - scaleSize * 0.75).toFixed(2)}L${(sx + scaleSize * 0.48).toFixed(2)},${sy.toFixed(2)}L${sx.toFixed(2)},${(sy + scaleSize * 0.25).toFixed(2)}L${(sx - scaleSize * 0.48).toFixed(2)},${sy.toFixed(2)}Z`;
        if (!rowMap.has(row)) rowMap.set(row, []);
        rowMap.get(row)!.push(seg);
      }
    }
  }
  return Array.from(rowMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([row, segs]) => {
      const t = Math.max(0, Math.min(1, (row + 8) / 16));
      const r = Math.round(232 - t * 168).toString(16).padStart(2, '0');
      const g = Math.round(56 - t * 52).toString(16).padStart(2, '0');
      const b = Math.round(56 - t * 52).toString(16).padStart(2, '0');
      return { row, d: segs.join(''), color: `#${r}${g}${b}` };
    });
})();

// Pre-computed emu dot path — normalized to pieceRadius=1, rendered via scale() transform.
// Eliminates per-render computation and collapses ~140 <circle> elements into one <path>.
const EMU_DOT_PATH_NORM: string = (() => {
  const ERX = 0.74, ERYT = 0.93;
  const step = 0.148, dotR = step * 0.44, jAmp = step * 0.20;
  const segs: string[] = [];
  for (let row = -7; row <= 6; row++) {
    for (let col = -8; col <= 8; col++) {
      const bx = (col + (Math.abs(row) % 2 === 0 ? 0 : 0.5)) * step * 0.95;
      const by = row * step * 0.82;
      const h = Math.abs(row * 1327 + col * 863) & 0x7fff;
      const jx = ((h * 37 + 7) % 200 - 100) / 100 * jAmp;
      const jy = ((h * 53 + 13) % 200 - 100) / 100 * jAmp;
      const x = bx + jx, y = by + jy;
      if (Math.sqrt((x / ERX) ** 2 + (y / ERYT) ** 2) < 1.07)
        segs.push(`M${(x - dotR).toFixed(2)},${y.toFixed(2)}a${dotR.toFixed(2)},${dotR.toFixed(2)} 0 1,0 ${(2 * dotR).toFixed(2)},0a${dotR.toFixed(2)},${dotR.toFixed(2)} 0 1,0 ${(-2 * dotR).toFixed(2)},0`);
    }
  }
  return segs.join('');
})();

// Voronoi-like lava crack network for volcanic egg, normalized to pieceRadius=1.
// Segments connect edge exits through internal junctions, forming ~7 dark plate cells.
const VOLCANIC_CRACK_D: string = (() => {
  const nodes: Record<string, [number, number]> = {
    n0: [0.02, -0.64], n1: [-0.34, -0.22], n2: [0.38, -0.18],
    n3: [-0.46, 0.14], n4: [0.12,  0.08],  n5: [0.50,  0.20],
    n6: [-0.14, 0.52], n7: [0.36,  0.52],
    et:  [0.02, -1.0], eul: [-0.64, -0.60], el:  [-0.80,  0.12],
    eur: [0.66, -0.50], er: [0.80,   0.22],
    ebl: [-0.38, 1.0], ebr: [0.36,   1.0],
  };
  const edges: [string, string][] = [
    ['et', 'n0'], ['n0', 'n1'], ['n0', 'n2'],
    ['n1', 'eul'], ['n1', 'n3'], ['n3', 'el'],
    ['n2', 'eur'], ['n2', 'n5'], ['n5', 'er'],
    ['n3', 'n4'], ['n4', 'n5'],
    ['n4', 'n6'], ['n6', 'ebl'],
    ['n6', 'n7'], ['n7', 'ebr'],
    ['n5', 'n7'],
  ];
  return edges.map(([a, b]) => {
    const [x1, y1] = nodes[a], [x2, y2] = nodes[b];
    return `M${x1.toFixed(2)},${y1.toFixed(2)}L${x2.toFixed(2)},${y2.toFixed(2)}`;
  }).join('');
})();

// Seeded jagged starburst path for fire/elemental pieces.
// Alternates outer tip points (with radius jitter) and inner valley points.
function flameStarPath(
  r: number,
  nTips: number,
  outerR: number,
  innerR: number,
  seedA: number,
  seedB: number,
  rotation = 0,
): string {
  const total = nTips * 2;
  const pts = Array.from({ length: total }, (_, i) => {
    const isOuter = i % 2 === 0;
    const tipIdx = Math.floor(i / 2);
    const baseAngle = rotation + (i / total) * 2 * Math.PI - Math.PI / 2;
    // Jitter outer tips for jagged/crackling look
    const jitter = isOuter ? ((seedA * (tipIdx + 1) * 31 + seedB * (tipIdx + 2) * 17) % 40 - 20) * 0.009 : 0;
    const angle = baseAngle + jitter;
    // Vary outer tip radius slightly per tip
    const rVar = isOuter ? outerR + ((seedB * (tipIdx + 3) * 23) % 20 - 10) * 0.012 : innerR;
    return `${(r * rVar * Math.cos(angle)).toFixed(2)},${(r * rVar * Math.sin(angle)).toFixed(2)}`;
  });
  return `M ${pts[0]} L ${pts.slice(1).join(' L ')} Z`;
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
  displayPx,
  isAnimating,
  animationDuration,
  isLastMoved,
  darkMode,
  glassPieces,
  hexCells,
  variant = 'normal',
  boardRotation = 0,
}: PieceProps) {
  // Start the global sheen sync loop (idempotent)
  useEffect(() => { startSheenSync(); }, []);

  // Use displayPx first (arc animation), then displayCoord, then coord
  const renderCoord = displayCoord ?? coord;
  const { x, y } = displayPx ?? cubeToPixel(renderCoord, size);
  const baseColor = getPlayerColor(player, customColors);
  const isRainbowPiece = baseColor === 'rainbow';
  const isOpalPiece = baseColor === 'opal';
  const isBouquetPiece = baseColor === 'bouquet';
  const isElementalPiece = ['fire','lightning','grass','air','water','magic','shadow','smoke','cloud'].includes(baseColor);
  const isEggPiece = EGG_COLOR_SET.has(baseColor.toLowerCase());
  const isFlowerPiece = !isRainbowPiece && !isOpalPiece && !isBouquetPiece && !isElementalPiece && !isEggPiece && isFlower(baseColor);
  const flowerConfig = isFlowerPiece ? getFlowerConfig(baseColor)! : null;
  // Apply last-moved shade: lighten very dark colors, soften very light ones, darken the rest
  const isNoHexColor = isRainbowPiece || isOpalPiece || isBouquetPiece || isElementalPiece;
  const baseLum = isNoHexColor ? 128 : (() => {
    const c = baseColor.replace('#', '');
    return (parseInt(c.substring(0, 2), 16) + parseInt(c.substring(2, 4), 16) + parseInt(c.substring(4, 6), 16)) / 3;
  })();
  const pieceColor = isNoHexColor
    ? '#808080'
    : isLastMoved
    ? baseLum > 200 ? darkenColor(baseColor, 0.15) : baseLum < 40 ? lightenColor(baseColor, 0.25) : darkenColor(baseColor, 0.2)
    : baseColor;

  // Piece radius scaled by variant: turbo = smaller, big = larger
  const radiusScale = variant === 'turbo' ? 0.72 : variant === 'big' ? 1.18 : 1.0;
  const pieceRadius = size * 0.58 * radiusScale;

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
  const useGlassGradient = glassPieces && !metallic && !gem && !isRainbowPiece && !isOpalPiece && !isFlowerPiece && !isBouquetPiece && !isElementalPiece && !isEggPiece;
  const useMetallicGradient = glassPieces && !!metallic;

  // Deterministic pseudo-random values per piece for staggered effects
  const seed = Math.abs(coord.q * 7 + coord.r * 13);
  const seed2 = Math.abs(coord.q * 11 + coord.r * 3);
  const seed3 = Math.abs(coord.q * 5 + coord.r * 17);

  return (
    <g
      onClick={onClick}
      transform={`translate(${x}, ${y}) rotate(${-boardRotation})`}
      opacity={variant === 'ghost' ? 0.68 : 1}
      style={{
        cursor: isCurrentPlayer ? 'pointer' : 'default',
        // No CSS transition when using pixel-based arc animation (RAF handles it)
        transition: isAnimating && !displayPx
          ? `transform ${animationDuration ?? MOVE_ANIMATION_DURATION}ms ease-in-out`
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
      {/* Piece shadow — hex-shaped for gems and opal, circle otherwise; none for flowers, elementals, or eggs */}
      {!isFlowerPiece && !isBouquetPiece && !isElementalPiece && !isEggPiece && ((gem || isOpalPiece) ? (
        <polygon
          points={hexVertices(pieceRadius, 1, 2).map(v => `${v.x},${v.y}`).join(' ')}
          fill="rgba(0,0,0,0.2)"
        />
      ) : (
        <circle cx={1} cy={2} r={pieceRadius} fill="rgba(0,0,0,0.2)" />
      ))}
      {/* Rainbow marble */}
      {isRainbowPiece && (() => {
        const r = pieceRadius;
        return (
          <>
            {glassPieces ? (
              // Glass mode: smooth 60-slice spectrum wheel with 3D sphere shading
              <>
                <defs>
                  <radialGradient id={`${gId}rg`} cx="30%" cy="28%" r="60%">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.75)" />
                    <stop offset="55%" stopColor="rgba(255,255,255,0)" />
                  </radialGradient>
                  <radialGradient id={`${gId}rv`} cx="50%" cy="50%" r="50%">
                    <stop offset="50%" stopColor="rgba(0,0,0,0)" />
                    <stop offset="100%" stopColor="rgba(0,0,0,0.52)" />
                  </radialGradient>
                  <clipPath id={`${gId}rc`}>
                    <circle cx={0} cy={0} r={r} />
                  </clipPath>
                </defs>
                {Array.from({ length: 60 }, (_, i) => (
                  <path key={`rs${i}`} d={pieSlice(r, i * 6, (i + 1) * 6)} fill={`hsl(${i * 6}, 100%, 50%)`} />
                ))}
                {isLastMoved && <circle cx={0} cy={0} r={r} fill="rgba(0,0,0,0.15)" />}
                <circle cx={0} cy={0} r={r} fill={`url(#${gId}rv)`} clipPath={`url(#${gId}rc)`} />
                <circle cx={0} cy={0} r={r} fill={`url(#${gId}rg)`} clipPath={`url(#${gId}rc)`} />
              </>
            ) : (
              // Simple mode: smooth 360-slice hsl wheel (1° per slice), no overlays
              <>
                {Array.from({ length: 360 }, (_, i) => (
                  <path key={`rs${i}`} d={pieSlice(r, i, i + 1)} fill={`hsl(${i}, 100%, 50%)`} />
                ))}
                {isLastMoved && <circle cx={0} cy={0} r={r} fill="rgba(0,0,0,0.15)" />}
              </>
            )}
          </>
        );
      })()}
      {/* Opal gem: hex facets with 6 player colors */}
      {isOpalPiece && (() => {
        const r = pieceRadius;
        const outerVerts = hexVertices(r);
        const rimColor = '#dddddd';
        if (glassPieces) {
          const innerR = r * 0.55;
          const innerVerts = hexVertices(innerR);
          // Each wedge gets its player color with WEDGE_SHADE_MAP lighting applied
          const opalColors = SPECIAL_PIECE_COLORS.map((color, i) => {
            const shadeIdx = WEDGE_SHADE_MAP[i]; // 0=lightest, 5=darkest
            const lf = Math.max(0, (2.5 - shadeIdx) / 10);
            const df = Math.max(0, (shadeIdx - 2.5) / 10);
            const c = lf > 0 ? lightenColor(color, lf) : df > 0 ? darkenColor(color, df) : color;
            return isLastMoved ? darkenColor(c, 0.15) : c;
          });
          return (
            <>
              {outerVerts.map((v, i) => {
                const next = outerVerts[(i + 1) % 6];
                return (
                  <polygon key={`ow${i}`} points={`0,0 ${v.x},${v.y} ${next.x},${next.y}`} fill={opalColors[i]} />
                );
              })}
              <polygon points={outerVerts.map(v => `${v.x},${v.y}`).join(' ')} fill="none" stroke={rimColor} strokeWidth={0.5} />
              {innerVerts.map((v, i) => (
                <line key={`ofl${i}`} x1={v.x} y1={v.y} x2={outerVerts[i].x} y2={outerVerts[i].y} stroke={rimColor} strokeWidth={0.3} opacity={0.4} />
              ))}
              <polygon
                points={innerVerts.map(v => `${v.x},${v.y}`).join(' ')}
                fill="rgba(255,255,255,0.5)"
                stroke={rimColor}
                strokeWidth={0.3}
              />
            </>
          );
        } else {
          // Simple mode: 6 player colors, one per wedge
          return (
            <>
              {outerVerts.map((v, i) => {
                const next = outerVerts[(i + 1) % 6];
                const c = isLastMoved ? darkenColor(SPECIAL_PIECE_COLORS[i], 0.15) : SPECIAL_PIECE_COLORS[i];
                return (
                  <polygon key={`osw${i}`} points={`0,0 ${v.x},${v.y} ${next.x},${next.y}`} fill={c} />
                );
              })}
              <polygon points={outerVerts.map(v => `${v.x},${v.y}`).join(' ')} fill="none" stroke={rimColor} strokeWidth={0.5} />
            </>
          );
        }
      })()}
      {/* Bouquet: layered green leaves + ring of 5 flowers */}
      {isBouquetPiece && (() => {
        const r = pieceRadius * 1.50;
        const lm = isLastMoved ? 0.15 : 0;
        // 5 flowers: sunflower top, then clockwise violet, cherry blossom, forget-me-not, rose
        const BOUQUET_MINIS = [
          { cx:  0.000, cy: -0.360, key: '#e8b800' }, // Sunflower — top
          { cx:  0.342, cy: -0.111, key: '#5040cc' }, // Violet — upper-right
          { cx:  0.212, cy:  0.291, key: '#f090b0' }, // Cherry Blossom — lower-right
          { cx: -0.212, cy:  0.291, key: '#5ba3d9' }, // Forget-me-not — lower-left
          { cx: -0.342, cy: -0.111, key: '#d4364e' }, // Rose — upper-left
        ];
        const miniS = 0.40;
        const leafColor = lm > 0 ? darkenColor('#1a4f1e', lm) : '#1a4f1e';
        const leafColorDark = lm > 0 ? darkenColor('#133816', lm) : '#133816';
        return (
          <>
            {/* Center green fill — covers the middle so no bare background shows */}
            <circle r={r * 0.16} fill={leafColorDark} />
            {/* Outer 5 longer leaves — between flower positions */}
            {[0, 1, 2, 3, 4].map(i => (
              <g key={`lfo${i}`} transform={`rotate(${i * 72 + 36})`}>
                <polygon points={`0,${(-r * 0.72).toFixed(2)} ${(r * 0.17).toFixed(2)},${(-r * 0.15).toFixed(2)} ${(-r * 0.17).toFixed(2)},${(-r * 0.15).toFixed(2)}`} fill={leafColor} />
              </g>
            ))}
            {/* Inner 5 shorter leaves — at flower positions */}
            {[0, 1, 2, 3, 4].map(i => (
              <g key={`lfi${i}`} transform={`rotate(${i * 72})`}>
                <polygon points={`0,${(-r * 0.50).toFixed(2)} ${(r * 0.13).toFixed(2)},${(-r * 0.12).toFixed(2)} ${(-r * 0.13).toFixed(2)},${(-r * 0.12).toFixed(2)}`} fill={leafColorDark} />
              </g>
            ))}
            {BOUQUET_MINIS.map(({ cx: dx, cy: dy, key }, i) => {
              const cfg = getFlowerConfig(key)!;
              const petalColor = lm > 0 ? darkenColor(key, lm) : key;
              const centerC = lm > 0 ? darkenColor(cfg.centerColor, lm) : cfg.centerColor;
              const tx = (dx * r).toFixed(2), ty = (dy * r).toFixed(2);
              const mr = r * miniS;

              if (glassPieces) {
                const lightRad = -40 * Math.PI / 180;
                const bqId = `${gId}bq${i}`;

                if (cfg.ruffleDepth !== undefined) {
                  const bumps = cfg.ruffleBumps ?? 6;
                  const rR = (cfg.ruffleR ?? 0.78) * mr;

                  if (cfg.innerLayer) {
                    // Rose: 4-layer pinwheel + spiral veins
                    const roseLayers = [
                      { rScale: 1.00, rot: 0,  color: lightenColor(petalColor, 0.08) },
                      { rScale: 0.77, rot: 15, color: petalColor },
                      { rScale: 0.57, rot: 30, color: darkenColor(petalColor, 0.14) },
                      { rScale: 0.30, rot: 45, color: darkenColor(petalColor, 0.42) },
                    ];
                    return (
                      <g key={i} transform={`translate(${tx},${ty})`}>
                        {roseLayers.map(({ rScale, rot, color }, idx) => {
                          const layerR = rR * rScale;
                          const troughR = layerR * (1 - cfg.ruffleDepth!);
                          const stroke = darkenColor(color, 0.35);
                          return (
                            <g key={idx} transform={`rotate(${rot})`}>
                              {Array.from({ length: bumps }, (_, j) => {
                                const screenAngle = rot * Math.PI / 180 + j * 2 * Math.PI / bumps;
                                const t = (1 + Math.cos(screenAngle - lightRad)) / 2;
                                const pFill = t > 0.5 ? lightenColor(color, (t - 0.5) * 0.22) : darkenColor(color, (0.5 - t) * 0.28);
                                return <path key={j} d={spiralPetalPath(layerR, troughR, bumps, cfg.ruffleDepth!, j)} fill={pFill} />;
                              })}
                              <path d={ruffledPath(layerR, bumps, cfg.ruffleDepth!)} fill="none" stroke={stroke} strokeWidth={0.6} />
                              {Array.from({ length: bumps }, (_, j) => {
                                const angle = ((j + 0.5) * 2 * Math.PI) / bumps;
                                const px = troughR * Math.cos(angle), py = troughR * Math.sin(angle);
                                const cpx = px * 0.5 + 0.6 * py, cpy = py * 0.5 - 0.6 * px;
                                return <path key={j} d={`M 0,0 Q ${cpx.toFixed(2)},${cpy.toFixed(2)} ${px.toFixed(2)},${py.toFixed(2)}`}
                                  fill="none" stroke={stroke} strokeWidth={0.5} opacity={0.7} />;
                              })}
                            </g>
                          );
                        })}
                        <circle r={cfg.centerR * mr} fill={centerC} />
                      </g>
                    );
                  }

                  if (cfg.gradientCenter) {
                    // Violet: gradient ellipse petals + shading overlay
                    const gradR = (cfg.petalDist + cfg.petalRy) * mr;
                    const gradId = `${bqId}vg`;
                    const darkC = lm > 0 ? darkenColor(cfg.darkColor, lm) : cfg.darkColor;
                    const pCount = cfg.petalCount, step = 360 / pCount;
                    const border = darkenColor(petalColor, 0.3);
                    return (
                      <g key={i} transform={`translate(${tx},${ty})`}>
                        <defs>
                          <radialGradient id={gradId} cx="0" cy="0" r={gradR.toFixed(2)} gradientUnits="userSpaceOnUse">
                            <stop offset="0%" stopColor={centerC} />
                            <stop offset="68%" stopColor={petalColor} />
                            <stop offset="100%" stopColor={darkC} />
                          </radialGradient>
                        </defs>
                        {Array.from({ length: pCount }, (_, j) => (
                          <g key={`vs${j}`} transform={`rotate(${j * step})`}>
                            <ellipse cx={0} cy={-(cfg.petalDist * mr)} rx={cfg.petalRx * mr * 1.12} ry={cfg.petalRy * mr * 1.10} fill={darkC} />
                          </g>
                        ))}
                        {Array.from({ length: pCount }, (_, j) => {
                          const ang = (j * step) * Math.PI / 180;
                          const t = (1 + Math.cos(ang - lightRad)) / 2;
                          const shade = t > 0.5 ? lightenColor(petalColor, (t - 0.5) * 0.50) : darkenColor(petalColor, (0.5 - t) * 0.65);
                          return (
                            <g key={`vp${j}`} transform={`rotate(${j * step})`}>
                              <ellipse cx={0} cy={-(cfg.petalDist * mr)} rx={cfg.petalRx * mr} ry={cfg.petalRy * mr}
                                fill={`url(#${gradId})`} stroke={border} strokeWidth={0.5} />
                              <ellipse cx={0} cy={-(cfg.petalDist * mr)} rx={cfg.petalRx * mr} ry={cfg.petalRy * mr}
                                fill={shade} opacity={0.55} />
                              <ellipse cx={0} cy={-(cfg.petalDist * mr)}
                                rx={cfg.petalRx * mr * 0.55} ry={cfg.petalRy * mr * 0.85} fill={cfg.lightColor} opacity={0.38} />
                            </g>
                          );
                        })}
                        <circle r={cfg.centerR * mr} fill={centerC} />
                      </g>
                    );
                  }
                }

                // Standard petal flowers (sunflower, cherry blossom, forget-me-not)
                const pCount = cfg.petalCount, step = 360 / pCount;
                const border = darkenColor(petalColor, 0.3);
                const darkC = lm > 0 ? darkenColor(cfg.darkColor, lm) : cfg.darkColor;
                const cR = cfg.centerR * mr;
                const seedR = cR * 0.26;
                return (
                  <g key={i} transform={`translate(${tx},${ty})`}>
                    {Array.from({ length: pCount }, (_, j) => (
                      <g key={`bs${j}`} transform={`rotate(${j * step})`}>
                        <ellipse cx={0} cy={-(cfg.petalDist * mr)} rx={cfg.petalRx * mr * 1.12} ry={cfg.petalRy * mr * 1.10} fill={darkC} />
                      </g>
                    ))}
                    {cfg.innerPetals && Array.from({ length: cfg.innerPetals.count }, (_, j) => {
                      const iStep = 360 / cfg.innerPetals!.count;
                      return (
                        <g key={`bis${j}`} transform={`rotate(${j * iStep + iStep / 2})`}>
                          <ellipse cx={0} cy={-(cfg.innerPetals!.dist * mr)} rx={cfg.innerPetals!.rx * mr * 1.12} ry={cfg.innerPetals!.ry * mr * 1.10} fill={darkC} />
                        </g>
                      );
                    })}
                    {Array.from({ length: pCount }, (_, j) => {
                      const ang = (j * step) * Math.PI / 180;
                      const t = (1 + Math.cos(ang - lightRad)) / 2;
                      const pFill = t > 0.5 ? lightenColor(petalColor, (t - 0.5) * 0.25) : darkenColor(petalColor, (0.5 - t) * 0.35);
                      return (
                        <g key={`p${j}`} transform={`rotate(${j * step})`}>
                          <ellipse cx={0} cy={-(cfg.petalDist * mr)} rx={cfg.petalRx * mr} ry={cfg.petalRy * mr} fill={pFill} stroke={border} strokeWidth={0.5} />
                          <ellipse cx={0} cy={-(cfg.petalDist * mr)} rx={cfg.petalRx * mr * 0.55} ry={cfg.petalRy * mr * 0.85} fill={cfg.lightColor} opacity={0.38} />
                        </g>
                      );
                    })}
                    {cfg.innerPetals && Array.from({ length: cfg.innerPetals.count }, (_, j) => {
                      const iStep = 360 / cfg.innerPetals!.count;
                      const ang = (j * iStep + iStep / 2) * Math.PI / 180;
                      const t = (1 + Math.cos(ang - lightRad)) / 2;
                      const pFill = t > 0.5 ? lightenColor(petalColor, (t - 0.5) * 0.25) : darkenColor(petalColor, (0.5 - t) * 0.35);
                      return (
                        <g key={`ip${j}`} transform={`rotate(${j * iStep + iStep / 2})`}>
                          <ellipse cx={0} cy={-(cfg.innerPetals!.dist * mr)} rx={cfg.innerPetals!.rx * mr} ry={cfg.innerPetals!.ry * mr} fill={pFill} stroke={border} strokeWidth={0.5} />
                          <ellipse cx={0} cy={-(cfg.innerPetals!.dist * mr)} rx={cfg.innerPetals!.rx * mr * 0.55} ry={cfg.innerPetals!.ry * mr * 0.85} fill={cfg.lightColor} opacity={0.38} />
                        </g>
                      );
                    })}
                    <circle r={cR} fill={centerC} />
                    {Array.from({ length: 8 }, (_, j) => {
                      const angle = j * 137.508 * Math.PI / 180;
                      const d = Math.sqrt((j + 0.5) / 8) * (cR - seedR * 0.3);
                      const seedFill = j % 3 === 0 ? cfg.centerLightColor : darkenColor(cfg.centerColor, 0.2);
                      return (
                        <g key={j} transform={`translate(${(d * Math.cos(angle)).toFixed(2)},${(d * Math.sin(angle)).toFixed(2)}) rotate(${((angle * 180 / Math.PI) + 90).toFixed(1)})`}>
                          <ellipse rx={seedR * 0.7} ry={seedR} fill={seedFill} opacity={0.9} />
                        </g>
                      );
                    })}
                  </g>
                );
              }

              // Simple mode
              if (cfg.ruffleDepth !== undefined) {
                const bumps = cfg.ruffleBumps ?? 6;
                const rR = (cfg.ruffleR ?? 0.78) * mr;
                const rot = cfg.ruffleRotation !== undefined ? `rotate(${cfg.ruffleRotation})` : undefined;
                const inner = cfg.innerLayer ? (
                  <>
                    <path d={ruffledPath(rR, bumps, cfg.ruffleDepth)} fill={petalColor} />
                    <path d={ruffledPath(rR * 0.58, bumps, cfg.ruffleDepth)} fill={cfg.lightColor} transform={`rotate(${(180 / bumps).toFixed(1)})`} />
                  </>
                ) : (
                  <>
                    <path d={ruffledPath(rR, bumps, cfg.ruffleDepth)} fill={petalColor} />
                    {cfg.centerAsRuffled
                      ? <path d={ruffledPath(rR * 0.28, bumps, cfg.ruffleDepth)} fill={centerC} />
                      : <circle r={cfg.centerR * mr} fill={centerC} />
                    }
                  </>
                );
                return (
                  <g key={i} transform={`translate(${tx},${ty})`}>
                    {rot ? <g transform={rot}>{inner}</g> : inner}
                  </g>
                );
              }
              const stepDeg = 360 / cfg.petalCount;
              return (
                <g key={i} transform={`translate(${tx},${ty})`}>
                  {Array.from({ length: cfg.petalCount }, (_, j) => (
                    <g key={j} transform={`rotate(${j * stepDeg})`}>
                      <ellipse cx={0} cy={-(cfg.petalDist * mr)} rx={cfg.petalRx * mr} ry={cfg.petalRy * mr} fill={petalColor} />
                    </g>
                  ))}
                  {cfg.innerPetals && Array.from({ length: cfg.innerPetals.count }, (_, j) => {
                    const iStep = 360 / cfg.innerPetals!.count;
                    return (
                      <g key={`ip${j}`} transform={`rotate(${j * iStep + iStep / 2})`}>
                        <ellipse cx={0} cy={-(cfg.innerPetals!.dist * mr)} rx={cfg.innerPetals!.rx * mr} ry={cfg.innerPetals!.ry * mr} fill={petalColor} />
                      </g>
                    );
                  })}
                  <circle r={cfg.centerR * mr} fill={centerC} />
                </g>
              );
            })}
          </>
        );
      })()}
      {/* Flower pieces */}
      {isFlowerPiece && (() => {
        const r = pieceRadius * 1.15;
        const cfg = flowerConfig!;
        const lm = isLastMoved ? 0.15 : 0;
        const centerC = lm > 0 ? darkenColor(cfg.centerColor, lm) : cfg.centerColor;
        const effectiveBase = !darkMode && cfg.lightModeColor ? cfg.lightModeColor : baseColor;
        const petalColor = lm > 0 ? darkenColor(effectiveBase, lm) : effectiveBase;

        // 4-leaf clover
        if (cfg.cloverLeaf) {
          const leafSize = r * 0.90;
          const leafDist = r * 0.47;
          const leafStroke = darkenColor(baseColor, 0.35);
          if (glassPieces) {
            const leafLightRad = -40 * Math.PI / 180;
            return (
              <>
                {[45, 135, 225, 315].map(angle => {
                  const rad = angle * Math.PI / 180;
                  const t = (1 + Math.cos(rad - leafLightRad)) / 2;
                  const leafFill = t > 0.5
                    ? lightenColor(petalColor, (t - 0.5) * 0.30)
                    : darkenColor(petalColor, (0.5 - t) * 0.40);
                  return (
                    <g key={angle} transform={`rotate(${angle}) translate(0,${-leafDist})`}>
                      <path d={heartLeafPath(leafSize)} fill={leafFill} stroke={leafStroke} strokeWidth={0.6} />
                      <g transform="scale(0.55, 0.82)">
                        <path d={heartLeafPath(leafSize)} fill={cfg.lightColor} opacity={0.38} />
                      </g>
                    </g>
                  );
                })}
                <circle r={cfg.centerR * r} fill={centerC} />
              </>
            );
          }
          return (
            <>
              {[45, 135, 225, 315].map(angle => (
                <g key={angle} transform={`rotate(${angle}) translate(0,${-leafDist})`}>
                  <path d={heartLeafPath(leafSize)} fill={petalColor} />
                </g>
              ))}
              <circle r={cfg.centerR * r} fill={centerC} />
            </>
          );
        }

        if (cfg.ruffleDepth !== undefined) {
          // Ruffled-hex flower: smooth (rose, violet, grey hibiscus) or pointed (black lotus)
          const bumps = cfg.ruffleBumps ?? 6;
          const rR = (cfg.ruffleR ?? 0.78) * r;
          const path = ruffledPath(rR, bumps, cfg.ruffleDepth);
          const innerRotation = `rotate(${(180 / bumps).toFixed(1)})`;
          const wrapRotation = cfg.ruffleRotation !== undefined ? `rotate(${cfg.ruffleRotation})` : undefined;
          const renderRuffled = (inner: React.ReactNode) => wrapRotation
            ? <g transform={wrapRotation}>{inner}</g>
            : <>{inner}</>;
          if (glassPieces) {
            if (cfg.innerLayer) {
              // Rose: 4-layer pinwheel — each layer deeper red, spiral vein lines from center to each petal peak
              const roseLayers = [
                { rScale: 1.00, rot: 0,  color: lightenColor(petalColor, 0.08) },
                { rScale: 0.77, rot: 15, color: petalColor },
                { rScale: 0.57, rot: 30, color: darkenColor(petalColor, 0.14) },
                { rScale: 0.30, rot: 45, color: darkenColor(petalColor, 0.42) },
              ];
              return (
                <>
                  {roseLayers.map(({ rScale, rot, color }, idx) => {
                    const layerR = rR * rScale;
                    const troughR = layerR * (1 - cfg.ruffleDepth!);
                    const stroke = darkenColor(color, 0.35);
                    const lightRad = -40 * Math.PI / 180;
                    return (
                      <g key={idx} transform={`rotate(${rot})`}>
                        {/* Per-petal directional shading — peak angle in screen space = rot° + i*360/bumps */}
                        {Array.from({ length: bumps }, (_, i) => {
                          const screenAngle = rot * Math.PI / 180 + i * 2 * Math.PI / bumps;
                          const t = (1 + Math.cos(screenAngle - lightRad)) / 2;
                          const pFill = t > 0.5
                            ? lightenColor(color, (t - 0.5) * 0.22)
                            : darkenColor(color, (0.5 - t) * 0.28);
                          return (
                            <path key={i} d={spiralPetalPath(layerR, troughR, bumps, cfg.ruffleDepth!, i)} fill={pFill} />
                          );
                        })}
                        {/* Outer border stroke */}
                        <path d={ruffledPath(layerR, bumps, cfg.ruffleDepth!)} fill="none" stroke={stroke} strokeWidth={0.8} />
                        {/* Spiral vein lines */}
                        {Array.from({ length: bumps }, (_, i) => {
                          const angle = ((i + 0.5) * 2 * Math.PI) / bumps;
                          const px = troughR * Math.cos(angle);
                          const py = troughR * Math.sin(angle);
                          const cpx = px * 0.5 + 0.6 * py;
                          const cpy = py * 0.5 - 0.6 * px;
                          return (
                            <path key={i} d={`M 0,0 Q ${cpx.toFixed(2)},${cpy.toFixed(2)} ${px.toFixed(2)},${py.toFixed(2)}`}
                              fill="none" stroke={stroke} strokeWidth={0.6} opacity={0.7} />
                          );
                        })}
                      </g>
                    );
                  })}
                  <circle r={cfg.centerR * r} fill={centerC} />
                </>
              );
            }
            if (cfg.spiralVeins) {
              // Grey Hibiscus: outer layer + spiral veins, inner gradual fade, seeded ruffled orange center
              const troughR = rR * (1 - cfg.ruffleDepth!);
              const stroke = darkenColor(petalColor, 0.35);
              const cR = rR * 0.28;
              const seedCount = 14;
              const seedR = cR * 0.24;
              const fadeId = `${gId}hfade`;
              return (
                <>
                  {renderRuffled(
                    <>
                      <defs>
                        <radialGradient id={fadeId} cx="50%" cy="50%" r="50%">
                          <stop offset="0%" stopColor={cfg.lightColor} stopOpacity="0.95" />
                          <stop offset="60%" stopColor={cfg.lightColor} stopOpacity="0.45" />
                          <stop offset="100%" stopColor={cfg.lightColor} stopOpacity="0" />
                        </radialGradient>
                      </defs>
                      <path d={ruffledPath(rR * 1.05, bumps, cfg.ruffleDepth!)} fill={lm > 0 ? darkenColor(cfg.darkColor, lm) : cfg.darkColor} />
                      {/* Per-petal directional shading — screen angle = -90° + i * 360/bumps (due to ruffleRotation -90) */}
                      {Array.from({ length: bumps }, (_, i) => {
                        const lightRad = -40 * Math.PI / 180;
                        const screenAngle = -Math.PI / 2 + i * 2 * Math.PI / bumps;
                        const t = (1 + Math.cos(screenAngle - lightRad)) / 2;
                        const pFill = t > 0.5
                          ? lightenColor(petalColor, (t - 0.5) * 0.50)
                          : darkenColor(petalColor, (0.5 - t) * 0.55);
                        return (
                          <path key={i} d={spiralPetalPath(rR, troughR, bumps, cfg.ruffleDepth!, i)} fill={pFill} />
                        );
                      })}
                      {/* Outer border stroke */}
                      <path d={path} fill="none" stroke={stroke} strokeWidth={0.8} />
                      <circle r={rR * 0.62} fill={`url(#${fadeId})`} />
                      {Array.from({ length: bumps }, (_, i) => {
                        const angle = ((i + 0.5) * 2 * Math.PI) / bumps;
                        const px = troughR * Math.cos(angle);
                        const py = troughR * Math.sin(angle);
                        const cpx = px * 0.5 + 0.6 * py;
                        const cpy = py * 0.5 - 0.6 * px;
                        return (
                          <path key={i} d={`M 0,0 Q ${cpx.toFixed(2)},${cpy.toFixed(2)} ${px.toFixed(2)},${py.toFixed(2)}`}
                            fill="none" stroke={stroke} strokeWidth={0.6} opacity={0.7} />
                        );
                      })}
                      <path d={ruffledPath(cR, bumps, cfg.ruffleDepth!)} fill={lm > 0 ? darkenColor(cfg.centerColor, lm) : cfg.centerColor} />
                      {Array.from({ length: seedCount }, (_, i) => {
                        const angle = i * 137.508 * Math.PI / 180;
                        const dist = Math.sqrt((i + 0.5) / seedCount) * (cR - seedR * 0.3) * 0.85;
                        const rotDeg = ((angle * 180 / Math.PI) + 90).toFixed(1);
                        const seedFill = i % 2 === 0 ? '#f0c020' : '#e87818';
                        return (
                          <g key={i} transform={`translate(${(dist * Math.cos(angle)).toFixed(2)},${(dist * Math.sin(angle)).toFixed(2)}) rotate(${rotDeg})`}>
                            <ellipse rx={seedR * 0.7} ry={seedR} fill={seedFill} opacity={0.9} />
                          </g>
                        );
                      })}
                    </>
                  )}
                </>
              );
            }
            if (cfg.gradientCenter) {
              // Violet glass: thick ellipse petals (like cherry blossom) with radial gradient center→edge
              const petalCount = cfg.petalCount;
              const stepDeg = 360 / petalCount;
              const gradId = `${gId}vgrad`;
              const cR = cfg.centerR * r;
              const seedCount = 22;
              const seedR = cR * 0.26;
              const borderStroke = darkenColor(petalColor, 0.3);
              const gradR = (cfg.petalDist + cfg.petalRy) * r;
              return (
                <>
                  <defs>
                    <radialGradient id={gradId} cx="0" cy="0" r={gradR.toFixed(2)} gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor={centerC} />
                      <stop offset="68%" stopColor={petalColor} />
                      <stop offset="100%" stopColor={lm > 0 ? darkenColor(cfg.darkColor, lm) : cfg.darkColor} />
                    </radialGradient>
                  </defs>
                  {/* Shadow ellipses */}
                  {Array.from({ length: petalCount }, (_, i) => (
                    <g key={`vbs${i}`} transform={`rotate(${i * stepDeg})`}>
                      <ellipse cx={0} cy={-(cfg.petalDist * r)} rx={cfg.petalRx * r * 1.12} ry={cfg.petalRy * r * 1.10}
                        fill={lm > 0 ? darkenColor(cfg.darkColor, lm) : cfg.darkColor} />
                    </g>
                  ))}
                  {/* Gradient petals with border + directional shade + inner highlight */}
                  {Array.from({ length: petalCount }, (_, i) => {
                    const petalAngle = (i * stepDeg) * Math.PI / 180;
                    const lightRad = -40 * Math.PI / 180;
                    const t = (1 + Math.cos(petalAngle - lightRad)) / 2;
                    const shadeFill = t > 0.5 ? lightenColor(petalColor, (t - 0.5) * 0.50) : darkenColor(petalColor, (0.5 - t) * 0.65);
                    return (
                      <g key={`vbp${i}`} transform={`rotate(${i * stepDeg})`}>
                        <ellipse cx={0} cy={-(cfg.petalDist * r)} rx={cfg.petalRx * r} ry={cfg.petalRy * r}
                          fill={`url(#${gradId})`} stroke={borderStroke} strokeWidth={0.5} />
                        <ellipse cx={0} cy={-(cfg.petalDist * r)} rx={cfg.petalRx * r} ry={cfg.petalRy * r}
                          fill={shadeFill} opacity={0.55} />
                        <ellipse cx={0} cy={-(cfg.petalDist * r)}
                          rx={cfg.petalRx * r * 0.55} ry={cfg.petalRy * r * 0.85} fill={cfg.lightColor} opacity={0.38} />
                      </g>
                    );
                  })}
                  {/* Seeded center */}
                  <circle r={cR} fill={centerC} />
                  {Array.from({ length: seedCount }, (_, i) => {
                    const angle = i * 137.508 * Math.PI / 180;
                    const dist = Math.sqrt((i + 0.5) / seedCount) * (cR - seedR * 0.3);
                    const rotDeg = ((angle * 180 / Math.PI) + 90).toFixed(1);
                    const seedFill = i % 3 === 0 ? cfg.centerLightColor : darkenColor(cfg.centerColor, 0.2);
                    return (
                      <g key={i} transform={`translate(${(dist * Math.cos(angle)).toFixed(2)},${(dist * Math.sin(angle)).toFixed(2)}) rotate(${rotDeg})`}>
                        <ellipse rx={seedR * 0.7} ry={seedR} fill={seedFill} opacity={0.9} />
                      </g>
                    );
                  })}
                </>
              );
            }
            if (cfg.petalTips) {
              // Black Lotus glass: dark outer ring + inner purple star with border + ruffled center
              const innerR = rR * 0.55;
              const darkInner = lm > 0 ? darkenColor(cfg.darkColor, lm) : cfg.darkColor;
              const innerStroke = darkenColor(petalColor, 0.50);
              const tipTriangles = (radius: number, fill: string, strokeColor: string) =>
                Array.from({ length: bumps }, (_, i) => {
                  const θ = i * 2 * Math.PI / bumps;
                  const tipH = radius * 0.12, baseW = radius * 0.07;
                  const baseR = radius * 0.94;
                  const tx = (radius + tipH) * Math.cos(θ), ty = (radius + tipH) * Math.sin(θ);
                  const lx = baseR * Math.cos(θ) - baseW * Math.sin(θ), ly = baseR * Math.sin(θ) + baseW * Math.cos(θ);
                  const rx2 = baseR * Math.cos(θ) + baseW * Math.sin(θ), ry2 = baseR * Math.sin(θ) - baseW * Math.cos(θ);
                  return <polygon key={i} points={`${tx.toFixed(2)},${ty.toFixed(2)} ${lx.toFixed(2)},${ly.toFixed(2)} ${rx2.toFixed(2)},${ry2.toFixed(2)}`} fill={fill} stroke={strokeColor} strokeWidth={0.5} />;
                });
              return renderRuffled(
                <>
                  <defs>
                    <radialGradient id={`${gId}fcd`} cx="35%" cy="35%" r="65%">
                      <stop offset="0%" stopColor={cfg.centerLightColor} />
                      <stop offset="100%" stopColor={centerC} />
                    </radialGradient>
                  </defs>
                  <path d={ruffledPath(rR * 1.05, bumps, cfg.ruffleDepth!)} fill={lm > 0 ? darkenColor(cfg.darkColor, lm) : cfg.darkColor} />
                  {/* Outer ring: very dark, no border */}
                  <path d={path} fill={darkInner} />
                  {tipTriangles(rR, darkInner, 'none')}
                  {/* Inner ring: petal color, rotated to point at outer troughs, with darker purple border */}
                  <g transform={innerRotation}>
                    <path d={ruffledPath(innerR, bumps, cfg.ruffleDepth!)} fill={petalColor} stroke={innerStroke} strokeWidth={0.6} />
                    {tipTriangles(innerR, petalColor, innerStroke)}
                  </g>
                  {/* Center: ruffled */}
                  <path d={ruffledPath(cfg.centerR * r, bumps, cfg.ruffleDepth!)} fill={`url(#${gId}fcd)`} />
                </>
              );
            }
            return renderRuffled(
              <>
                <defs>
                  <radialGradient id={`${gId}fcd`} cx="35%" cy="35%" r="65%">
                    <stop offset="0%" stopColor={cfg.centerLightColor} />
                    <stop offset="100%" stopColor={centerC} />
                  </radialGradient>
                </defs>
                <path d={ruffledPath(rR * 1.05, bumps, cfg.ruffleDepth)} fill={lm > 0 ? darkenColor(cfg.darkColor, lm) : cfg.darkColor} />
                <path d={path} fill={petalColor} stroke={darkenColor(petalColor, 0.3)} strokeWidth={0.7} />
                <path d={ruffledPath(rR * 0.55, bumps, cfg.ruffleDepth)} fill={cfg.lightColor} opacity={0.52} />
                {cfg.centerAsRuffled
                  ? <path d={ruffledPath(rR * 0.28, bumps, cfg.ruffleDepth)} fill={`url(#${gId}fcd)`} />
                  : <circle r={cfg.centerR * r} fill={`url(#${gId}fcd)`} />
                }
              </>
            );
          } else {
            if (cfg.petalTips) {
              // Lotus simple: dark outer ring + tips + circle center (no inner ring)
              const darkOuter = lm > 0 ? darkenColor(cfg.darkColor, lm) : cfg.darkColor;
              const mkTips = (radius: number, fill: string) => Array.from({ length: bumps }, (_, i) => {
                const θ = i * 2 * Math.PI / bumps;
                const tipH = radius * 0.12, baseW = radius * 0.07;
                const baseR = radius * 0.94;
                const tx = (radius + tipH) * Math.cos(θ), ty = (radius + tipH) * Math.sin(θ);
                const lx = baseR * Math.cos(θ) - baseW * Math.sin(θ), ly = baseR * Math.sin(θ) + baseW * Math.cos(θ);
                const rx2 = baseR * Math.cos(θ) + baseW * Math.sin(θ), ry2 = baseR * Math.sin(θ) - baseW * Math.cos(θ);
                return <polygon key={i} points={`${tx.toFixed(2)},${ty.toFixed(2)} ${lx.toFixed(2)},${ly.toFixed(2)} ${rx2.toFixed(2)},${ry2.toFixed(2)}`} fill={fill} />;
              });
              return renderRuffled(
                <>
                  <path d={path} fill={darkOuter} />
                  {mkTips(rR, darkOuter)}
                  <circle r={cfg.centerR * r} fill={centerC} />
                </>
              );
            }
            return renderRuffled(
              <>
                <path d={path} fill={petalColor} />
                {cfg.innerLayer ? (
                  <path d={ruffledPath(rR * 0.58, bumps, cfg.ruffleDepth)} fill={cfg.lightColor} transform={innerRotation} />
                ) : cfg.centerAsRuffled ? (
                  <path d={ruffledPath(rR * 0.28, bumps, cfg.ruffleDepth)} fill={centerC} />
                ) : (
                  <circle r={cfg.centerR * r} fill={centerC} />
                )}
              </>
            );
          }
        }

        const petalCount = cfg.petalCount;
        const stepDeg = 360 / petalCount;
        if (glassPieces) {
          const lightRad = -40 * Math.PI / 180;
          const borderStroke = darkenColor(petalColor, 0.3);
          return (
            <>
              {/* Outer petal shadows */}
              {Array.from({ length: petalCount }, (_, i) => {
                const sRy = cfg.petalRy * r * 1.10, sRx = cfg.petalRx * r * 1.12;
                const darkC = lm > 0 ? darkenColor(cfg.darkColor, lm) : cfg.darkColor;
                return (
                  <g key={`bp${i}`} transform={`rotate(${i * stepDeg})`}>
                    <ellipse cx={0} cy={-(cfg.petalDist * r)} rx={sRx} ry={sRy} fill={darkC} />
                    {cfg.petalPoints && <polygon
                      points={`0,${(-(cfg.petalDist * r + sRy * 1.18)).toFixed(2)} ${(-sRx * 0.35).toFixed(2)},${(-(cfg.petalDist * r + sRy * 0.92)).toFixed(2)} ${(sRx * 0.35).toFixed(2)},${(-(cfg.petalDist * r + sRy * 0.92)).toFixed(2)}`}
                      fill={darkC}
                    />}
                  </g>
                );
              })}
              {/* Outer main petals */}
              {Array.from({ length: petalCount }, (_, i) => {
                const petalAngle = (i * stepDeg) * Math.PI / 180;
                const t = (1 + Math.cos(petalAngle - lightRad)) / 2;
                const pFill = t > 0.5 ? lightenColor(petalColor, (t - 0.5) * 0.25) : darkenColor(petalColor, (0.5 - t) * 0.35);
                const pRy = cfg.petalRy * r, pRx = cfg.petalRx * r;
                return (
                  <g key={`fp${i}`} transform={`rotate(${i * stepDeg})`}>
                    <ellipse cx={0} cy={-(cfg.petalDist * r)} rx={pRx} ry={pRy} fill={pFill} stroke={borderStroke} strokeWidth={0.5} />
                    <ellipse cx={0} cy={-(cfg.petalDist * r)}
                      rx={pRx * 0.55} ry={pRy * 0.85} fill={cfg.lightColor} opacity={0.38} />
                    {cfg.petalPoints && <polygon
                      points={`0,${(-(cfg.petalDist * r + pRy * 1.18)).toFixed(2)} ${(-pRx * 0.35).toFixed(2)},${(-(cfg.petalDist * r + pRy * 0.92)).toFixed(2)} ${(pRx * 0.35).toFixed(2)},${(-(cfg.petalDist * r + pRy * 0.92)).toFixed(2)}`}
                      fill={pFill} stroke={borderStroke} strokeWidth={0.5}
                    />}
                  </g>
                );
              })}
              {/* Inner petal shadows (after outer so inner renders on top) */}
              {cfg.innerPetals && Array.from({ length: cfg.innerPetals.count }, (_, i) => {
                const iStep = 360 / cfg.innerPetals!.count;
                const iRy = cfg.innerPetals!.ry * r * 1.10, iRx = cfg.innerPetals!.rx * r * 1.12;
                const iDist = cfg.innerPetals!.dist * r;
                const darkC = lm > 0 ? darkenColor(cfg.darkColor, lm) : cfg.darkColor;
                return (
                  <g key={`bip${i}`} transform={`rotate(${i * iStep + iStep / 2})`}>
                    <ellipse cx={0} cy={-iDist} rx={iRx} ry={iRy} fill={darkC} />
                    {cfg.petalPoints && <polygon
                      points={`0,${(-(iDist + iRy * 1.18)).toFixed(2)} ${(-iRx * 0.35).toFixed(2)},${(-(iDist + iRy * 0.92)).toFixed(2)} ${(iRx * 0.35).toFixed(2)},${(-(iDist + iRy * 0.92)).toFixed(2)}`}
                      fill={darkC}
                    />}
                  </g>
                );
              })}
              {/* Inner main petals (on top of outer petals) */}
              {cfg.innerPetals && Array.from({ length: cfg.innerPetals.count }, (_, i) => {
                const iStep = 360 / cfg.innerPetals!.count;
                const petalAngle = (i * iStep + iStep / 2) * Math.PI / 180;
                const t = (1 + Math.cos(petalAngle - lightRad)) / 2;
                const pFill = t > 0.5 ? lightenColor(petalColor, (t - 0.5) * 0.25) : darkenColor(petalColor, (0.5 - t) * 0.35);
                const iRy = cfg.innerPetals!.ry * r, iRx = cfg.innerPetals!.rx * r;
                const iDist = cfg.innerPetals!.dist * r;
                return (
                  <g key={`fip${i}`} transform={`rotate(${i * iStep + iStep / 2})`}>
                    <ellipse cx={0} cy={-iDist} rx={iRx} ry={iRy} fill={pFill} stroke={borderStroke} strokeWidth={0.5} />
                    <ellipse cx={0} cy={-iDist} rx={iRx * 0.55} ry={iRy * 0.85} fill={cfg.lightColor} opacity={0.38} />
                    {cfg.petalPoints && <polygon
                      points={`0,${(-(iDist + iRy * 1.18)).toFixed(2)} ${(-iRx * 0.35).toFixed(2)},${(-(iDist + iRy * 0.92)).toFixed(2)} ${(iRx * 0.35).toFixed(2)},${(-(iDist + iRy * 0.92)).toFixed(2)}`}
                      fill={pFill} stroke={borderStroke} strokeWidth={0.5}
                    />}
                  </g>
                );
              })}
              {(() => {
                const cR = cfg.centerR * r;
                const seedCount = 22;
                const seedR = cR * 0.26;
                return (
                  <>
                    <circle r={cR} fill={centerC} />
                    {Array.from({ length: seedCount }, (_, i) => {
                      const angle = i * 137.508 * Math.PI / 180;
                      const dist = Math.sqrt((i + 0.5) / seedCount) * (cR - seedR * 0.3);
                      const rotDeg = ((angle * 180 / Math.PI) + 90).toFixed(1);
                      const seedFill = i % 3 === 0 ? cfg.centerLightColor : darkenColor(cfg.centerColor, 0.2);
                      return (
                        <g key={i} transform={`translate(${(dist * Math.cos(angle)).toFixed(2)},${(dist * Math.sin(angle)).toFixed(2)}) rotate(${rotDeg})`}>
                          <ellipse rx={seedR * 0.7} ry={seedR} fill={seedFill} opacity={0.9} />
                        </g>
                      );
                    })}
                  </>
                );
              })()}
            </>
          );
        } else {
          return (
            <>
              {/* Outer petals */}
              {Array.from({ length: petalCount }, (_, i) => {
                const pRy = cfg.petalRy * r, pRx = cfg.petalRx * r;
                return (
                  <g key={`p${i}`} transform={`rotate(${i * stepDeg})`}>
                    <ellipse cx={0} cy={-(cfg.petalDist * r)} rx={pRx} ry={pRy} fill={petalColor} />
                    {cfg.petalPoints && <polygon
                      points={`0,${(-(cfg.petalDist * r + pRy * 1.18)).toFixed(2)} ${(-pRx * 0.35).toFixed(2)},${(-(cfg.petalDist * r + pRy * 0.92)).toFixed(2)} ${(pRx * 0.35).toFixed(2)},${(-(cfg.petalDist * r + pRy * 0.92)).toFixed(2)}`}
                      fill={petalColor}
                    />}
                  </g>
                );
              })}
              {/* Inner petals (on top, same color) */}
              {cfg.innerPetals && Array.from({ length: cfg.innerPetals.count }, (_, i) => {
                const iStep = 360 / cfg.innerPetals!.count;
                const iRy = cfg.innerPetals!.ry * r, iRx = cfg.innerPetals!.rx * r;
                const iDist = cfg.innerPetals!.dist * r;
                return (
                  <g key={`ip${i}`} transform={`rotate(${i * iStep + iStep / 2})`}>
                    <ellipse cx={0} cy={-iDist} rx={iRx} ry={iRy} fill={petalColor} />
                    {cfg.petalPoints && <polygon
                      points={`0,${(-(iDist + iRy * 1.18)).toFixed(2)} ${(-iRx * 0.35).toFixed(2)},${(-(iDist + iRy * 0.92)).toFixed(2)} ${(iRx * 0.35).toFixed(2)},${(-(iDist + iRy * 0.92)).toFixed(2)}`}
                      fill={petalColor}
                    />}
                  </g>
                );
              })}
              <circle r={cfg.centerR * r} fill={centerC} />
            </>
          );
        }
      })()}
      {/* Elemental animated marble */}
      {isElementalPiece && (() => {
        const r = pieceRadius;
        const ph1 = `-${((seed % 20) * 0.15).toFixed(1)}s`;
        const ph2 = `-${((seed2 % 15) * 0.2).toFixed(1)}s`;
        const ph3 = `-${((seed3 % 12) * 0.15).toFixed(1)}s`;
        let inner: React.ReactNode = null;
        if (baseColor === 'fire') {
          const rot1 = (seed % 6) * Math.PI / 3;
          if (!glassPieces) {
            // Simple mode: red starburst only
            inner = (
              <>
                <path d={flameStarPath(r, 7, 1.25, 0.58, seed, seed2, rot1)} fill="#cc2200">
                  <animate attributeName="opacity" values="0.75;1.0;0.82;1.0;0.75" dur="1.3s" repeatCount="indefinite" begin={ph1} />
                </path>
                <circle r={r * 0.38} fill="#881000" />
              </>
            );
          } else {
            // Glass mode: layered red → orange → yellow fire
            const rot2 = rot1 + 0.45;
            const rot3 = rot1 + 0.90;
            inner = (
              <>
                <path d={flameStarPath(r, 8, 1.30, 0.62, seed, seed2, rot1)} fill="#cc1800">
                  <animate attributeName="opacity" values="0.7;1.0;0.8;1.0;0.7" dur="1.1s" repeatCount="indefinite" begin={ph1} />
                </path>
                <path d={flameStarPath(r, 7, 1.05, 0.55, seed2, seed3, rot2)} fill="#ff5500">
                  <animate attributeName="opacity" values="0.8;1.0;0.85;1.0;0.8" dur="0.9s" repeatCount="indefinite" begin={ph2} />
                </path>
                <path d={flameStarPath(r, 6, 0.80, 0.42, seed3, seed, rot3)} fill="#ffaa00">
                  <animate attributeName="opacity" values="0.85;1.0;0.9;1.0;0.85" dur="0.75s" repeatCount="indefinite" begin={ph3} />
                </path>
                <circle r={r * 0.28} fill="#ffe060">
                  <animate attributeName="r" values={`${(r*0.22).toFixed(1)};${(r*0.34).toFixed(1)};${(r*0.24).toFixed(1)};${(r*0.34).toFixed(1)};${(r*0.22).toFixed(1)}`} dur="0.65s" repeatCount="indefinite" begin={ph2} />
                </circle>
              </>
            );
          }
        } else if (baseColor === 'lightning') {
          inner = (
            <>
              <circle r={r} fill="#181e50" />
              <circle r={r * 0.68} fill="#2040b0" opacity={0.7}>
                <animate attributeName="fill" values="#2040b0;#80a0ff;#ffffff;#80a0ff;#2040b0" dur="0.8s" repeatCount="indefinite" begin={ph1} />
                <animate attributeName="opacity" values="0.7;1.0;1.0;1.0;0.7" dur="0.8s" repeatCount="indefinite" begin={ph1} />
              </circle>
              <circle r={r * 0.32} fill="#b0c8ff">
                <animate attributeName="fill" values="#b0c8ff;#ffffff;#b0c8ff" dur="0.5s" repeatCount="indefinite" begin={ph2} />
                <animate attributeName="opacity" values="0.6;1.0;0.6" dur="0.5s" repeatCount="indefinite" begin={ph2} />
              </circle>
            </>
          );
        } else if (baseColor === 'grass') {
          inner = (
            <>
              <circle r={r} fill="#0d2e14" />
              <circle r={r * 0.70} fill="#1a6030">
                <animate attributeName="fill" values="#1a6030;#30a850;#1a6030" dur="2.8s" repeatCount="indefinite" begin={ph1} />
              </circle>
              <circle r={r * 0.35} fill="#50c060">
                <animate attributeName="r" values={`${(r*0.28).toFixed(1)};${(r*0.42).toFixed(1)};${(r*0.28).toFixed(1)}`} dur="3.2s" repeatCount="indefinite" begin={ph2} />
                <animate attributeName="fill" values="#50c060;#90e070;#50c060" dur="3.2s" repeatCount="indefinite" begin={ph2} />
              </circle>
            </>
          );
        } else if (baseColor === 'air') {
          inner = (
            <>
              <circle r={r} fill="#a8c8e0" />
              <circle r={r * 0.72} fill="#c8e0f4">
                <animate attributeName="fill" values="#c8e0f4;#e8f4ff;#c8e0f4" dur="4.0s" repeatCount="indefinite" begin={ph1} />
                <animate attributeName="opacity" values="0.6;0.9;0.6" dur="4.0s" repeatCount="indefinite" begin={ph1} />
              </circle>
              <circle r={r * 0.38} fill="#e8f4ff">
                <animate attributeName="opacity" values="0.4;0.8;0.4" dur="3.0s" repeatCount="indefinite" begin={ph2} />
                <animate attributeName="r" values={`${(r*0.30).toFixed(1)};${(r*0.46).toFixed(1)};${(r*0.30).toFixed(1)}`} dur="3.5s" repeatCount="indefinite" begin={ph3} />
              </circle>
            </>
          );
        } else if (baseColor === 'water') {
          inner = (
            <>
              <circle r={r} fill="#0c2e60" />
              <circle r={r * 0.70} fill="#1454a8">
                <animate attributeName="fill" values="#1454a8;#2878d8;#1454a8" dur="2.2s" repeatCount="indefinite" begin={ph1} />
                <animate attributeName="r" values={`${(r*0.70).toFixed(1)};${(r*0.80).toFixed(1)};${(r*0.70).toFixed(1)}`} dur="2.2s" repeatCount="indefinite" begin={ph1} />
              </circle>
              <circle r={r * 0.38} fill="#4898e8">
                <animate attributeName="fill" values="#4898e8;#90c8f8;#4898e8" dur="1.6s" repeatCount="indefinite" begin={ph2} />
              </circle>
            </>
          );
        } else if (baseColor === 'magic') {
          const spAngle = (seed % 6) * Math.PI / 3;
          inner = (
            <>
              <circle r={r} fill="#2a0850" />
              <circle r={r * 0.70} fill="#6820b8" opacity={0.8}>
                <animate attributeName="fill" values="#6820b8;#c050ff;#6820b8" dur="1.8s" repeatCount="indefinite" begin={ph1} />
                <animate attributeName="opacity" values="0.8;1.0;0.8" dur="1.8s" repeatCount="indefinite" begin={ph1} />
              </circle>
              <circle r={r * 0.35} fill="#d880ff">
                <animate attributeName="fill" values="#d880ff;#ffffff;#d880ff" dur="1.2s" repeatCount="indefinite" begin={ph2} />
                <animate attributeName="opacity" values="0.7;1.0;0.7" dur="1.2s" repeatCount="indefinite" begin={ph2} />
              </circle>
              <circle
                cx={(r * 0.42 * Math.cos(spAngle)).toFixed(2) as unknown as number}
                cy={(r * 0.42 * Math.sin(spAngle)).toFixed(2) as unknown as number}
                r={r * 0.08}
                fill="white"
                opacity={0}
              >
                <animate attributeName="opacity" values="0;1;0" dur="1.5s" repeatCount="indefinite" begin={ph3} />
              </circle>
            </>
          );
        } else if (baseColor === 'shadow') {
          inner = (
            <>
              <circle r={r} fill="#080810" />
              <circle r={r * 0.68} fill="#181028">
                <animate attributeName="fill" values="#181028;#302050;#181028" dur="3.0s" repeatCount="indefinite" begin={ph1} />
              </circle>
              <circle r={r * 0.38} fill="#281840">
                <animate attributeName="fill" values="#281840;#481860;#281840" dur="2.2s" repeatCount="indefinite" begin={ph2} />
                <animate attributeName="opacity" values="0.5;0.9;0.5" dur="2.2s" repeatCount="indefinite" begin={ph2} />
              </circle>
            </>
          );
        } else if (baseColor === 'smoke') {
          inner = (
            <>
              <circle r={r} fill="#282828" />
              <circle r={r * 0.72} fill="#484848">
                <animate attributeName="fill" values="#484848;#707070;#484848" dur="3.5s" repeatCount="indefinite" begin={ph1} />
                <animate attributeName="opacity" values="0.5;0.8;0.5" dur="3.5s" repeatCount="indefinite" begin={ph1} />
              </circle>
              <circle r={r * 0.40} fill="#686868">
                <animate attributeName="r" values={`${(r*0.32).toFixed(1)};${(r*0.48).toFixed(1)};${(r*0.32).toFixed(1)}`} dur="4.5s" repeatCount="indefinite" begin={ph2} />
                <animate attributeName="opacity" values="0.4;0.7;0.4" dur="4.5s" repeatCount="indefinite" begin={ph2} />
              </circle>
            </>
          );
        } else if (baseColor === 'cloud') {
          inner = (
            <>
              <circle r={r} fill="#a8b8c8" />
              <circle r={r * 0.72} fill="#c8d8e8">
                <animate attributeName="fill" values="#c8d8e8;#e8f0f8;#c8d8e8" dur="4.5s" repeatCount="indefinite" begin={ph1} />
                <animate attributeName="opacity" values="0.6;0.9;0.6" dur="4.5s" repeatCount="indefinite" begin={ph1} />
              </circle>
              <circle r={r * 0.38} fill="#e8f0f8">
                <animate attributeName="fill" values="#e8f0f8;#ffffff;#e8f0f8" dur="3.5s" repeatCount="indefinite" begin={ph2} />
                <animate attributeName="opacity" values="0.5;0.85;0.5" dur="3.5s" repeatCount="indefinite" begin={ph2} />
              </circle>
            </>
          );
        }
        return (
          <>
            {inner}
            {isLastMoved && <circle r={r} fill="rgba(0,0,0,0.15)" />}
          </>
        );
      })()}
      {/* Egg piece rendering */}
      {isEggPiece && (() => {
        const ERX = pieceRadius * 0.74;
        const ERYT = pieceRadius * 0.93;
        const ERYB = pieceRadius * 0.86;
        const ep = eggPath(ERX, ERYT, ERYB);
        const lm = isLastMoved ? 0.15 : 0;
        const dk = (c: string, a: number) => darkenColor(c, a + lm);
        const bc = baseColor.toLowerCase();
        const gEgg = `${gId}eg`;

        const selRing = isSelected
          ? <path d={ep} fill="none" stroke={darkMode ? '#fff' : '#000'} strokeWidth={1.5} />
          : null;
        const shadow = <g transform="translate(1,2)"><path d={ep} fill="rgba(0,0,0,0.20)" /></g>;

        // Deterministic speckle positions derived from seed values
        const makeSpots = (n: number, maxRx: number, maxRy: number, r: number) =>
          Array.from({ length: n }, (_, i) => ({
            cx: ((seed * (i + 1) * 37 + seed2 * (i + 2) * 23) % 200 - 100) / 100 * maxRx,
            cy: ((seed2 * (i + 1) * 41 + seed3 * (i + 2) * 29) % 200 - 100) / 100 * maxRy,
            r: r * (0.8 + ((seed3 * (i + 1) * 17) % 40) / 100),
          }));

        if (bc === '#8a1818') { // Dragon Egg — full coverage overlapping scales
          return (
            <>
              {shadow}
              <defs>
                {glassPieces && (
                  <radialGradient id={`${gEgg}g`} cx="35%" cy="30%" r="70%">
                    <stop offset="0%" stopColor={dk('#f05040', 0)} />
                    <stop offset="50%" stopColor={dk('#c02020', 0)} />
                    <stop offset="100%" stopColor={dk('#3a0404', 0)} />
                  </radialGradient>
                )}
                {glassPieces && (
                  <radialGradient id={`${gEgg}ov`} cx="32%" cy="25%" r="68%">
                    <stop offset="0%" stopColor="white" stopOpacity={0.18} />
                    <stop offset="50%" stopColor="white" stopOpacity={0} />
                    <stop offset="100%" stopColor="black" stopOpacity={0.10} />
                  </radialGradient>
                )}
                <clipPath id={`${gEgg}clip`}><path d={ep} /></clipPath>
              </defs>
              <path d={ep} fill={glassPieces ? `url(#${gEgg}g)` : dk('#3a0404', 0)} />
              <g clipPath={`url(#${gEgg}clip)`}>
                <g transform={`scale(${pieceRadius})`}>
                  {DRAGON_SCALE_ROWS.map(({ row, d, color }) => (
                    <path key={row} d={d} fill={color} stroke={color} strokeWidth={0.15 / pieceRadius} />
                  ))}
                </g>
              </g>
              {glassPieces && <path d={ep} fill={`url(#${gEgg}ov)`} />}
              {selRing}
            </>
          );
        }
        if (bc === '#d4a020') { // Golden Egg — exact metallic gold sheen + twinkle style
          const egR = ERX;
          const twinkles = [
            { cx: -egR * 0.30, cy: -ERYT * 0.25, s: 0.8, delay: (seed % 7) * 1.2 + 3, dur: 5 + (seed % 3) },
            { cx: egR * 0.28, cy: -ERYT * 0.38, s: 0.6, delay: (seed2 % 9) * 0.9 + 5, dur: 6 + (seed2 % 3) },
            { cx: egR * 0.08, cy: ERYT * 0.32, s: 0.7, delay: (seed3 % 8) * 1.1 + 7, dur: 7 + (seed3 % 2) },
          ];
          return (
            <>
              {shadow}
              <defs>
                {glassPieces && (
                  <radialGradient id={`${gEgg}g`} cx="35%" cy="28%" r="68%">
                    <stop offset="0%" stopColor={dk('#ffe880', 0)} />
                    <stop offset="50%" stopColor={dk('#d4a020', 0)} />
                    <stop offset="100%" stopColor={dk('#7a5800', 0)} />
                  </radialGradient>
                )}
                <clipPath id={`${gEgg}clip`}><path d={ep} /></clipPath>
                <linearGradient id={`${gEgg}sh`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="rgba(255,255,200,0)" />
                  <stop offset="20%" stopColor="rgba(255,255,200,0.10)" />
                  <stop offset="45%" stopColor="rgba(255,255,200,0.40)" />
                  <stop offset="55%" stopColor="rgba(255,255,200,0.40)" />
                  <stop offset="80%" stopColor="rgba(255,255,200,0.10)" />
                  <stop offset="100%" stopColor="rgba(255,255,200,0)" />
                </linearGradient>
                <linearGradient id={`${gEgg}sh2`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="rgba(255,255,200,0)" />
                  <stop offset="30%" stopColor="rgba(255,255,200,0.35)" />
                  <stop offset="50%" stopColor="rgba(255,255,200,0.70)" />
                  <stop offset="70%" stopColor="rgba(255,255,200,0.35)" />
                  <stop offset="100%" stopColor="rgba(255,255,200,0)" />
                </linearGradient>
                {glassPieces && (
                  <radialGradient id={`${gEgg}ov`} cx="32%" cy="25%" r="68%">
                    <stop offset="0%" stopColor="white" stopOpacity={0.18} />
                    <stop offset="50%" stopColor="white" stopOpacity={0} />
                    <stop offset="100%" stopColor="black" stopOpacity={0.22} />
                  </radialGradient>
                )}
              </defs>
              <path d={ep} fill={glassPieces ? `url(#${gEgg}g)` : dk('#d4a020', 0)} />
              {twinkles.map((t, i) => (
                <g key={i} className="metallic-twinkle" style={{ '--twinkle-delay': `${t.delay}s`, '--twinkle-dur': `${t.dur}s`, transformOrigin: `${t.cx}px ${t.cy}px` } as React.CSSProperties}>
                  <line x1={t.cx - egR * 0.2 * t.s} y1={t.cy} x2={t.cx + egR * 0.2 * t.s} y2={t.cy} stroke="rgba(255,255,200,1)" strokeWidth={1} strokeLinecap="round" />
                  <line x1={t.cx} y1={t.cy - egR * 0.2 * t.s} x2={t.cx} y2={t.cy + egR * 0.2 * t.s} stroke="rgba(255,255,200,1)" strokeWidth={1} strokeLinecap="round" />
                </g>
              ))}
              <g clipPath={`url(#${gEgg}clip)`}>
                <rect x={-egR * 0.75} y={-ERYT * 1.4} width={egR * 1.5} height={(ERYT + ERYB) * 2.8}
                  fill={`url(#${gEgg}sh)`}
                  style={{ transform: `rotate(35deg) translateX(${(egR * 0.6).toFixed(1)}px)` }} />
                <rect className="metallic-sheen"
                  x={-egR * 0.3} y={-ERYT * 1.4} width={egR * 0.6} height={(ERYT + ERYB) * 2.8}
                  fill={`url(#${gEgg}sh2)`}
                  style={{ '--sheen-r': `${(-egR).toFixed(1)}`, '--sheen-phase': 'var(--sheen-phase-gold)', '--sheen-opacity': '1' } as React.CSSProperties} />
              </g>
              {glassPieces && <path d={ep} fill={`url(#${gEgg}ov)`} />}
              {selRing}
            </>
          );
        }
        if (bc === '#b8d890') { // Dino Egg — 3 fixed spots: circle, tall egg, wide oval
          // Fixed spots — identical on every piece (no per-piece seed variation)
          // [cx, cy, rx, ry, rot]
          // Fixed spots — same on every piece. [cx, cy, rx, ry, rot]
          // Edge spots have centers near/outside the egg boundary; clipPath cuts them for a wrap-around illusion.
          const dinoSpots: [number, number, number, number, number][] = [
            // Interior
            [ ERX * 0.32, -ERYT * 0.38,  ERX * 0.17,  ERYT * 0.22,  5],  // upper-right teardrop
            [ ERX * 0.08, -ERYT * 0.18,  ERX * 0.07,  ERYT * 0.08,  0],  // small upper-center dot
            [-ERX * 0.25,  ERYT * 0.04,  ERX * 0.22,  ERYT * 0.17, -8],  // large left-center oval
            [-ERX * 0.18,  ERYT * 0.26,  ERX * 0.08,  ERX * 0.08,   0],  // small dot below left
            [ ERX * 0.22,  ERYT * 0.24,  ERX * 0.23,  ERYT * 0.18, 10],  // large right-center oval
            [-ERX * 0.30,  ERYT * 0.50,  ERX * 0.17,  ERYT * 0.13, -5],  // lower-left oval
            // Edge-clipping (centers at/beyond egg boundary)
            [-ERX * 1.08,  ERYT * 0.00,  ERX * 0.30,  ERYT * 0.24,  5],  // left edge
            [ ERX * 1.05,  ERYT * 0.08,  ERX * 0.28,  ERYT * 0.22,-10],  // right edge
            [ ERX * 0.22, -ERYT * 0.95,  ERX * 0.20,  ERYT * 0.20, 15],  // top edge
            [ ERX * 0.38,  ERYB * 0.92,  ERX * 0.26,  ERYB * 0.20, -5],  // bottom-right edge
          ];
          const dinoSpotColor = '#6a8040';
          return (
            <>
              {shadow}
              <defs>
                {glassPieces && (
                  <radialGradient id={`${gEgg}g`} cx="35%" cy="28%" r="70%">
                    <stop offset="0%" stopColor={dk('#d8f0a8', 0)} />
                    <stop offset="60%" stopColor={dk('#b8d890', 0)} />
                    <stop offset="100%" stopColor={dk('#688040', 0)} />
                  </radialGradient>
                )}
                {glassPieces && (
                  <radialGradient id={`${gEgg}ov`} cx="32%" cy="25%" r="68%">
                    <stop offset="0%" stopColor="white" stopOpacity={0.18} />
                    <stop offset="50%" stopColor="white" stopOpacity={0} />
                    <stop offset="100%" stopColor="black" stopOpacity={0.22} />
                  </radialGradient>
                )}
                <clipPath id={`${gEgg}clip`}><path d={ep} /></clipPath>
              </defs>
              <path d={ep} fill={glassPieces ? `url(#${gEgg}g)` : dk('#b8d890', 0)} />
              <g clipPath={`url(#${gEgg}clip)`}>
                {dinoSpots.map(([cx, cy, rx, ry, rot], i) => (
                  <g key={i} transform={`rotate(${rot}, ${cx.toFixed(1)}, ${cy.toFixed(1)})`}>
                    <ellipse cx={cx} cy={cy} rx={rx} ry={ry}
                      fill={dk(dinoSpotColor, 0)} opacity={0.85} />
                  </g>
                ))}
              </g>
              {glassPieces && <path d={ep} fill={`url(#${gEgg}ov)`} />}
              {selRing}
            </>
          );
        }
        if (bc === '#50c0b0') { // Robin Egg — light blue with a few brown spots
          const robinSpots: [number, number, number, number, number][] = [
            // Interior
            [-ERX * 0.22, -ERYT * 0.52,  ERX * 0.13,  ERYT * 0.17, -5],
            [ ERX * 0.38, -ERYT * 0.20,  ERX * 0.09,  ERX * 0.09,   0],
            [-ERX * 0.38,  ERYT * 0.10,  ERX * 0.17,  ERYT * 0.11, 12],
            [ ERX * 0.14,  ERYT * 0.40,  ERX * 0.07,  ERYT * 0.11,  0],
            [-ERX * 0.10, -ERYT * 0.15,  ERX * 0.06,  ERX * 0.06,   0],
            [ ERX * 0.35,  ERYT * 0.55,  ERX * 0.10,  ERX * 0.10,   0],
            [-ERX * 0.30, -ERYT * 0.70,  ERX * 0.06,  ERX * 0.06,   0],
            [ ERX * 0.18, -ERYT * 0.35,  ERX * 0.06,  ERYT * 0.09,  8],
            [-ERX * 0.18,  ERYT * 0.68,  ERX * 0.08,  ERX * 0.08,   0],
            [ ERX * 0.50, -ERYT * 0.58,  ERX * 0.07,  ERX * 0.07,   0],
            [-ERX * 0.52,  ERYT * 0.42,  ERX * 0.06,  ERX * 0.06,   0],
            // Edge-clipping
            [ ERX * 1.06, -ERYT * 0.25,  ERX * 0.20,  ERYT * 0.18,  5],
            [-ERX * 0.05, -ERYT * 0.98,  ERX * 0.18,  ERYT * 0.16,  0],
            [-ERX * 1.04,  ERYT * 0.30,  ERX * 0.22,  ERYT * 0.16, -5],
          ];
          return (
            <>
              {shadow}
              <defs>
                {glassPieces && (
                  <radialGradient id={`${gEgg}g`} cx="35%" cy="28%" r="70%">
                    <stop offset="0%" stopColor={dk('#b0e8f0', 0)} />
                    <stop offset="60%" stopColor={dk('#70c0d8', 0)} />
                    <stop offset="100%" stopColor={dk('#2878a0', 0)} />
                  </radialGradient>
                )}
                {glassPieces && (
                  <radialGradient id={`${gEgg}ov`} cx="32%" cy="25%" r="68%">
                    <stop offset="0%" stopColor="white" stopOpacity={0.18} />
                    <stop offset="50%" stopColor="white" stopOpacity={0} />
                    <stop offset="100%" stopColor="black" stopOpacity={0.22} />
                  </radialGradient>
                )}
                <clipPath id={`${gEgg}clip`}><path d={ep} /></clipPath>
              </defs>
              <path d={ep} fill={glassPieces ? `url(#${gEgg}g)` : dk('#70c0d8', 0)} />
              <g clipPath={`url(#${gEgg}clip)`}>
                {robinSpots.map(([cx, cy, rx, ry, rot], i) => (
                  <g key={i} transform={`rotate(${rot}, ${cx.toFixed(1)}, ${cy.toFixed(1)})`}>
                    <ellipse cx={cx} cy={cy} rx={rx} ry={ry}
                      fill={dk('#1a4898', 0)} opacity={0.85} />
                  </g>
                ))}
              </g>
              {glassPieces && <path d={ep} fill={`url(#${gEgg}ov)`} />}
              {selRing}
            </>
          );
        }
        if (bc === '#4878c0') { // Emu Egg — deep blue base, hex grid of lighter blue dots
          return (
            <>
              {shadow}
              <defs>
                {glassPieces && (
                  <radialGradient id={`${gEgg}g`} cx="35%" cy="28%" r="70%">
                    <stop offset="0%" stopColor={dk('#3868d0', 0)} />
                    <stop offset="55%" stopColor={dk('#1040a8', 0)} />
                    <stop offset="100%" stopColor={dk('#080c40', 0)} />
                  </radialGradient>
                )}
                {glassPieces && (
                  <radialGradient id={`${gEgg}ov`} cx="32%" cy="25%" r="68%">
                    <stop offset="0%" stopColor="white" stopOpacity={0.18} />
                    <stop offset="50%" stopColor="white" stopOpacity={0} />
                    <stop offset="100%" stopColor="black" stopOpacity={0.22} />
                  </radialGradient>
                )}
                <clipPath id={`${gEgg}clip`}><path d={ep} /></clipPath>
              </defs>
              <path d={ep} fill={glassPieces ? `url(#${gEgg}g)` : dk('#1040a8', 0)} />
              <g clipPath={`url(#${gEgg}clip)`}>
                <g transform={`scale(${pieceRadius})`}>
                  <path d={EMU_DOT_PATH_NORM} fill={dk('#20b8a0', 0)} opacity={0.62} />
                </g>
              </g>
              {glassPieces && <path d={ep} fill={`url(#${gEgg}ov)`} />}
              {selRing}
            </>
          );
        }
        if (bc === '#7030a0') { // Kraken Egg — bottom fill + mid stripe + tentacle nub
          const sc = '#c040e8';
          const ox = ERX * 1.5;
          // Bottom fill — shorter, top edge angles up left→right
          const fillEdge = `M ${(-ox).toFixed(1)},${(ERYB*0.58).toFixed(1)} C ${(-ERX*0.22).toFixed(1)},${(ERYB*0.68).toFixed(1)} ${(ERX*0.28).toFixed(1)},${(ERYB*0.36).toFixed(1)} ${ox.toFixed(1)},${(ERYB*0.28).toFixed(1)}`;
          const fillPath = `${fillEdge} L ${ox.toFixed(1)},${(ERYB*1.5).toFixed(1)} L ${(-ox).toFixed(1)},${(ERYB*1.5).toFixed(1)} Z`;
          // Mid stripe — full S-wave left→right
          const stripePath = `M ${(-ox).toFixed(1)},${(ERYB*0.10).toFixed(1)} C ${(-ERX*0.20).toFixed(1)},${(ERYB*0.36).toFixed(1)} ${(ERX*0.20).toFixed(1)},${(-ERYT*0.16).toFixed(1)} ${ox.toFixed(1)},${(ERYB*0.04).toFixed(1)}`;
          // Tentacle — smaller, nub stops well below top
          const tentaclePath = `M ${(-ox).toFixed(1)},${(-ERYT*0.28).toFixed(1)} C ${(-ERX*0.08).toFixed(1)},${(-ERYT*0.22).toFixed(1)} ${(ERX*0.10).toFixed(1)},${(-ERYT*0.48).toFixed(1)} ${(ERX*0.06).toFixed(1)},${(-ERYT*0.64).toFixed(1)}`;
          const sw = pieceRadius * 0.22;
          // Border fill: same curve shifted up by bw so it sits entirely above the bright fill.
          // Only the strip between borderFillEdge and fillEdge is visible (the rest is covered by fillPath).
          const bw = pieceRadius * 0.08;
          const borderFillEdge = `M ${(-ox).toFixed(1)},${(ERYB*0.58 - bw).toFixed(1)} C ${(-ERX*0.22).toFixed(1)},${(ERYB*0.68 - bw).toFixed(1)} ${(ERX*0.28).toFixed(1)},${(ERYB*0.36 - bw).toFixed(1)} ${ox.toFixed(1)},${(ERYB*0.28 - bw).toFixed(1)}`;
          const borderFillPath = `${borderFillEdge} L ${ox.toFixed(1)},${(ERYB*1.5).toFixed(1)} L ${(-ox).toFixed(1)},${(ERYB*1.5).toFixed(1)} Z`;
          return (
            <>
              {shadow}
              <defs>
                {glassPieces && (
                  <radialGradient id={`${gEgg}g`} cx="40%" cy="32%" r="65%">
                    <stop offset="0%" stopColor={dk('#a858c8', 0)} />
                    <stop offset="55%" stopColor={dk('#7030a0', 0)} />
                    <stop offset="100%" stopColor={dk('#2c1040', 0)} />
                  </radialGradient>
                )}
                {glassPieces && (
                  <radialGradient id={`${gEgg}ov`} cx="32%" cy="25%" r="68%">
                    <stop offset="0%" stopColor="white" stopOpacity={0.18} />
                    <stop offset="50%" stopColor="white" stopOpacity={0} />
                    <stop offset="100%" stopColor="black" stopOpacity={0.22} />
                  </radialGradient>
                )}
                <clipPath id={`${gEgg}clip`}><path d={ep} /></clipPath>
              </defs>
              <path d={ep} fill={glassPieces ? `url(#${gEgg}g)` : dk('#7030a0', 0)} />
              <g clipPath={`url(#${gEgg}clip)`}>
                {glassPieces ? (
                  <>
                    <path d={borderFillPath} fill={dk(sc, 0)} opacity={0.55} />
                    <path d={fillPath} fill="#cc90e8" />
                    <path d={stripePath} fill="none" stroke={dk(sc, 0)} strokeWidth={sw} strokeLinecap="round" opacity={0.55} />
                    <path d={stripePath} fill="none" stroke="#f0d0ff" strokeWidth={pieceRadius * 0.05} strokeLinecap="round" opacity={0.70} />
                    <path d={tentaclePath} fill="none" stroke={dk(sc, 0)} strokeWidth={sw} strokeLinecap="round" opacity={0.55} />
                    <path d={tentaclePath} fill="none" stroke="#f0d0ff" strokeWidth={pieceRadius * 0.05} strokeLinecap="round" opacity={0.70} />
                  </>
                ) : (
                  <>
                    <path d={fillPath} fill={sc} opacity={0.75} />
                    <path d={stripePath} fill="none" stroke={sc} strokeWidth={sw} strokeLinecap="round" opacity={0.75} />
                    <path d={tentaclePath} fill="none" stroke={sc} strokeWidth={sw} strokeLinecap="round" opacity={0.75} />
                  </>
                )}
              </g>
              {glassPieces && <path d={ep} fill={`url(#${gEgg}ov)`} />}
              {selRing}
            </>
          );
        }
        if (bc === '#181010') { // Volcanic Egg — Voronoi lava crack network
          return (
            <>
              {shadow}
              <defs>
                {glassPieces && (
                  <radialGradient id={`${gEgg}g`} cx="35%" cy="28%" r="70%">
                    <stop offset="0%" stopColor="#302018" />
                    <stop offset="55%" stopColor="#181010" />
                    <stop offset="100%" stopColor="#080404" />
                  </radialGradient>
                )}
                {glassPieces && (
                  <radialGradient id={`${gEgg}ov`} cx="32%" cy="25%" r="68%">
                    <stop offset="0%" stopColor="white" stopOpacity={0.18} />
                    <stop offset="50%" stopColor="white" stopOpacity={0} />
                    <stop offset="100%" stopColor="black" stopOpacity={0.22} />
                  </radialGradient>
                )}
                <clipPath id={`${gEgg}clip`}><path d={ep} /></clipPath>
              </defs>
              <path d={ep} fill={glassPieces ? `url(#${gEgg}g)` : '#181010'} />
              <g clipPath={`url(#${gEgg}clip)`}>
                <g transform={`scale(${pieceRadius})`}>
                  {glassPieces ? (
                    <>
                      <path d={VOLCANIC_CRACK_D} fill="none" stroke="rgba(200,40,0,0.40)" strokeWidth={0.14} strokeLinecap="round" />
                      <path d={VOLCANIC_CRACK_D} fill="none" stroke="rgba(255,120,0,0.65)" strokeWidth={0.07} strokeLinecap="round" />
                      <path d={VOLCANIC_CRACK_D} fill="none" stroke="rgba(255,240,80,1.0)" strokeWidth={0.025} strokeLinecap="round" />
                    </>
                  ) : (
                    <path d={VOLCANIC_CRACK_D} fill="none" stroke="#ff8800" strokeWidth={0.030} strokeLinecap="round" />
                  )}
                </g>
              </g>
              {glassPieces && <path d={ep} fill={`url(#${gEgg}ov)`} />}
              {selRing}
            </>
          );
        }
        if (bc === '#b8b8b8') { // Penguin Egg — grey with dark grey spots
          const penguinSpots: [number, number, number, number, number][] = [
            // Interior — [cx, cy, rx, ry, rotation]
            [ ERX * 0.20, -ERYT * 0.54,  ERX * 0.12,  ERYT * 0.16,  10],
            [-ERX * 0.40, -ERYT * 0.22,  ERX * 0.10,  ERX * 0.10,    0],
            [ ERX * 0.42,  ERYT * 0.12,  ERX * 0.15,  ERYT * 0.11,  -8],
            [-ERX * 0.12,  ERYT * 0.44,  ERX * 0.08,  ERYT * 0.12,   0],
            [ ERX * 0.08, -ERYT * 0.18,  ERX * 0.07,  ERX * 0.07,    0],
            [-ERX * 0.32,  ERYT * 0.58,  ERX * 0.10,  ERX * 0.10,    0],
            [ ERX * 0.28, -ERYT * 0.66,  ERX * 0.07,  ERX * 0.07,    0],
            [-ERX * 0.20, -ERYT * 0.32,  ERX * 0.06,  ERYT * 0.09,  -6],
            [ ERX * 0.16,  ERYT * 0.70,  ERX * 0.09,  ERX * 0.09,    0],
            [-ERX * 0.50, -ERYT * 0.54,  ERX * 0.08,  ERX * 0.08,    0],
            [ ERX * 0.50,  ERYT * 0.44,  ERX * 0.07,  ERX * 0.07,    0],
            // Edge-clipping
            [-ERX * 1.06, -ERYT * 0.22,  ERX * 0.20,  ERYT * 0.18,   5],
            [ ERX * 0.06, -ERYT * 0.98,  ERX * 0.17,  ERYT * 0.15,   0],
            [ ERX * 1.04,  ERYT * 0.28,  ERX * 0.22,  ERYT * 0.16,  -5],
          ];
          return (
            <>
              {shadow}
              <defs>
                {glassPieces && (
                  <radialGradient id={`${gEgg}g`} cx="35%" cy="28%" r="70%">
                    <stop offset="0%" stopColor="#e0e0e0" />
                    <stop offset="60%" stopColor="#b8b8b8" />
                    <stop offset="100%" stopColor="#686868" />
                  </radialGradient>
                )}
                {glassPieces && (
                  <radialGradient id={`${gEgg}ov`} cx="32%" cy="25%" r="68%">
                    <stop offset="0%" stopColor="white" stopOpacity={0.18} />
                    <stop offset="50%" stopColor="white" stopOpacity={0} />
                    <stop offset="100%" stopColor="black" stopOpacity={0.22} />
                  </radialGradient>
                )}
                <clipPath id={`${gEgg}clip`}><path d={ep} /></clipPath>
              </defs>
              <path d={ep} fill={glassPieces ? `url(#${gEgg}g)` : '#b8b8b8'} />
              <g clipPath={`url(#${gEgg}clip)`}>
                {penguinSpots.map(([cx, cy, rx, ry, rot], i) => (
                  <g key={i} transform={`rotate(${rot}, ${cx.toFixed(1)}, ${cy.toFixed(1)})`}>
                    <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#505050" opacity={0.80} />
                  </g>
                ))}
              </g>
              {glassPieces && <path d={ep} fill={`url(#${gEgg}ov)`} />}
              {selRing}
            </>
          );
        }
        if (bc === '#f4f4f0') { // Egg
          return (
            <>
              {shadow}
              {glassPieces ? (
                <>
                  <defs>
                    <radialGradient id={`${gEgg}g`} cx="35%" cy="28%" r="70%">
                      <stop offset="0%" stopColor={dk('#ffffff', 0)} />
                      <stop offset="60%" stopColor={dk('#f4f4f0', 0)} />
                      <stop offset="100%" stopColor={dk('#ccccb8', 0)} />
                    </radialGradient>
                  </defs>
                  <path d={ep} fill={`url(#${gEgg}g)`} />
                </>
              ) : (
                <path d={ep} fill={dk('#f4f4f0', 0)} />
              )}
              {selRing}
            </>
          );
        }
        if (bc === '#f0c8e8') { // Easter Egg — glass shading + rainbow stripes
          const stripeColors = ['#c050e8', '#4080e8', '#30c870', '#f0e030', '#f09020', '#e83030'];
          const totalH = ERYT + ERYB;
          const stripeH = totalH * 0.11;
          const stripeSpacing = totalH * 0.16;
          const startY = -ERYT * 0.75;
          return (
            <>
              {shadow}
              <defs>
                {glassPieces && (
                  <radialGradient id={`${gEgg}g`} cx="35%" cy="28%" r="70%">
                    <stop offset="0%" stopColor={dk('#fce0f4', 0)} />
                    <stop offset="60%" stopColor={dk('#f0c8e8', 0)} />
                    <stop offset="100%" stopColor={dk('#b87098', 0)} />
                  </radialGradient>
                )}
                {glassPieces && (
                  <radialGradient id={`${gEgg}ov`} cx="32%" cy="25%" r="68%">
                    <stop offset="0%" stopColor="white" stopOpacity={0.18} />
                    <stop offset="50%" stopColor="white" stopOpacity={0} />
                    <stop offset="100%" stopColor="black" stopOpacity={0.22} />
                  </radialGradient>
                )}
                <clipPath id={`${gEgg}clip`}><path d={ep} /></clipPath>
              </defs>
              <path d={ep} fill={glassPieces ? `url(#${gEgg}g)` : dk('#f0c8e8', 0)} />
              <g clipPath={`url(#${gEgg}clip)`}>
                {stripeColors.map((color, i) => (
                  <rect key={i}
                    x={-ERX * 1.2}
                    y={startY + i * stripeSpacing - stripeH * 0.5}
                    width={ERX * 2.4}
                    height={stripeH}
                    fill={dk(color, 0)}
                    opacity={0.70}
                  />
                ))}
              </g>
              {glassPieces && <path d={ep} fill={`url(#${gEgg}ov)`} />}
              {selRing}
            </>
          );
        }
        return null;
      })()}
      {/* Main piece circle — for non-gem, non-rainbow, non-opal, non-flower, non-elemental, non-egg pieces only */}
      {!gem && !isRainbowPiece && !isOpalPiece && !isFlowerPiece && !isBouquetPiece && !isElementalPiece && !isEggPiece && (() => {
        const hasGradient = useGlassGradient || useMetallicGradient;
        // No border on metallic pieces in simplified mode (they look clean without it)
        const noBorder = !glassPieces && !!metallic;
        const borderColor = isSelected
          ? (darkMode ? '#fff' : '#000')
          : metallic
            ? (darkMode ? '#000' : metallic.dark)
            : (darkMode ? '#000' : '#fff');
        return (
          <circle
            cx={0}
            cy={0}
            r={pieceRadius}
            fill={hasGradient ? `url(#${gId}f)` : pieceColor}
            stroke={hasGradient || noBorder ? 'none' : borderColor}
            strokeWidth={hasGradient || noBorder ? 0 : 1.5}
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
          stroke={darkMode ? metallic.rim : darkenColor(metallic.rim, 0.5)}
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
                  stroke={metallic.sheenColor ?? 'white'} strokeWidth={1} strokeLinecap="round"
                />
                <line
                  x1={t.cx} y1={t.cy - r * 0.2 * t.s}
                  x2={t.cx} y2={t.cy + r * 0.2 * t.s}
                  stroke={metallic.sheenColor ?? 'white'} strokeWidth={1} strokeLinecap="round"
                />
              </g>
            ))}
            {/* Static sheen glow at corner + animated narrow sweep */}
            <g clipPath={`url(#${clipId})`}>
              <defs>
                <linearGradient id={`${clipId}sh`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={metallic.sheenColor ?? 'white'} stopOpacity={0} />
                  <stop offset="20%" stopColor={metallic.sheenColor ?? 'white'} stopOpacity={0.1 * metallic.sheenOpacity} />
                  <stop offset="45%" stopColor={metallic.sheenColor ?? 'white'} stopOpacity={0.4 * metallic.sheenOpacity} />
                  <stop offset="55%" stopColor={metallic.sheenColor ?? 'white'} stopOpacity={0.4 * metallic.sheenOpacity} />
                  <stop offset="80%" stopColor={metallic.sheenColor ?? 'white'} stopOpacity={0.1 * metallic.sheenOpacity} />
                  <stop offset="100%" stopColor={metallic.sheenColor ?? 'white'} stopOpacity={0} />
                </linearGradient>
                <linearGradient id={`${clipId}sh2`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={metallic.sheenColor ?? 'white'} stopOpacity={0} />
                  <stop offset="30%" stopColor={metallic.sheenColor ?? 'white'} stopOpacity={0.35 * metallic.sheenOpacity} />
                  <stop offset="50%" stopColor={metallic.sheenColor ?? 'white'} stopOpacity={0.7 * metallic.sheenOpacity} />
                  <stop offset="70%" stopColor={metallic.sheenColor ?? 'white'} stopOpacity={0.35 * metallic.sheenOpacity} />
                  <stop offset="100%" stopColor={metallic.sheenColor ?? 'white'} stopOpacity={0} />
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

      {/* Rainbow / Opal twinkle effects */}
      {(isRainbowPiece || isOpalPiece) && (() => {
        const r = pieceRadius;
        const twinkles = [
          { cx: -r * 0.3, cy: -r * 0.2, s: 0.8, delay: (seed % 7) * 1.2 + 3, dur: 4 + (seed % 3) },
          { cx: r * 0.25, cy: -r * 0.35, s: 0.6, delay: (seed2 % 9) * 0.9 + 5, dur: 5 + (seed2 % 3) },
          { cx: r * 0.1, cy: r * 0.3, s: 0.7, delay: (seed3 % 8) * 1.1 + 7, dur: 6 + (seed3 % 2) },
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
                <line x1={t.cx - r * 0.2 * t.s} y1={t.cy} x2={t.cx + r * 0.2 * t.s} y2={t.cy} stroke="white" strokeWidth={1} strokeLinecap="round" />
                <line x1={t.cx} y1={t.cy - r * 0.2 * t.s} x2={t.cx} y2={t.cy + r * 0.2 * t.s} stroke="white" strokeWidth={1} strokeLinecap="round" />
              </g>
            ))}
          </>
        );
      })()}
      {/* Highlight for current player's pieces - 6 spinning segments outside border */}
      {/* Keep mounted even when selected (hidden) so the hue-rotate CSS animation never restarts */}
      {isCurrentPlayer && !isAnimating && (() => {
        const borderOuter = pieceRadius + 0.75; // half of 1.5 strokeWidth
        const ringWidth = hexCells ? 3.5 : 2;
        const highlightR = borderOuter + 1 + ringWidth / 2; // keep same gap as before
        const circumference = 2 * Math.PI * highlightR;
        const segmentLen = circumference / 12;
        // In light mode, darken near-grey colors (e.g. silver) that would wash out against the board
        const isRainbowOrOpal = isRainbowPiece || isOpalPiece;
        const isRainbowLike = isRainbowOrOpal || isBouquetPiece;
        const isGreyRing = isFlowerPiece;
        // Flowers/bouquet ring uses their own colour without dark-mode variation (stable across mode switches)
        const ringBaseColor = isRainbowLike ? '#808080' : pieceColor;
        const cleanHex = isRainbowLike ? '808080' : ringBaseColor.replace('#', '');
        const luminance = (parseInt(cleanHex.substring(0, 2), 16) + parseInt(cleanHex.substring(2, 4), 16) + parseInt(cleanHex.substring(4, 6), 16)) / 3;
        const segmentColor = isRainbowLike ? '#ff0000'
          : isGreyRing
            ? (luminance > 185 ? darkenColor(ringBaseColor, 0.25) : lightenColor(ringBaseColor, 0.35))
            : (!darkMode && luminance > 185 ? darkenColor(ringBaseColor, 0.35) : lightenColor(ringBaseColor, 0.4));
        const ring = (
          <circle
            cx={0}
            cy={0}
            r={highlightR}
            fill="none"
            stroke={segmentColor}
            strokeWidth={ringWidth}
            strokeDasharray={`${segmentLen} ${segmentLen}`}
            className="active-piece-highlight"
            style={{ transformOrigin: '0px 0px' }}
          />
        );
        const hiddenStyle: React.CSSProperties | undefined = isSelected ? { opacity: 0, pointerEvents: 'none' } : undefined;
        return isRainbowLike
          ? <g className="rainbow-ui-filter" style={hiddenStyle}>{ring}</g>
          : <g style={hiddenStyle}>{ring}</g>;
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
