import { PLAYER_COLORS, METALLIC_EXTRA, GEM_COLORS, FLOWER_COLORS, ELEMENTAL_COLORS, EGG_COLORS } from './constants';
import type { GameState, PlayerIndex, ColorMapping, PlayerNameMapping } from '@/types/game';

/**
 * Convert a hex color string to rgba with given alpha
 */
export function hexToRgba(hex: string, alpha: number): string {
  if (!hex.startsWith('#')) return `rgba(0,0,0,${alpha})`;
  const cleaned = hex.replace('#', '');
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Parse a hex color to RGB components
 */
function hexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace('#', '');
  return [
    parseInt(cleaned.substring(0, 2), 16),
    parseInt(cleaned.substring(2, 4), 16),
    parseInt(cleaned.substring(4, 6), 16),
  ];
}

/**
 * Lighten a hex color by blending it toward white.
 * amount=0 returns the original color, amount=1 returns white.
 */
export function lightenHex(hex: string, amount: number): string {
  if (!hex.startsWith('#')) return hex;
  const [r, g, b] = hexToRgb(hex);
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
}

/**
 * Blend multiple hex colors weighted by occurrence count, returning rgba string.
 * E.g. 2x red + 1x blue → weighted 2:1 toward red.
 */
export function blendColorsRgba(hexColors: string[], alpha: number): string {
  if (hexColors.length === 0) return `rgba(0,0,0,${alpha})`;
  let rSum = 0, gSum = 0, bSum = 0;
  for (const hex of hexColors) {
    const [r, g, b] = hexToRgb(hex);
    rSum += r;
    gSum += g;
    bSum += b;
  }
  const n = hexColors.length;
  return `rgba(${Math.round(rSum / n)}, ${Math.round(gSum / n)}, ${Math.round(bSum / n)}, ${alpha})`;
}

/**
 * Get a display name for a player based on their 1-based position in the active players list
 * or a custom name if provided
 */
export function getPlayerDisplayName(
  player: PlayerIndex,
  activePlayers: PlayerIndex[],
  customNames?: PlayerNameMapping
): string {
  if (customNames?.[player]) {
    return customNames[player]!;
  }
  const index = activePlayers.indexOf(player);
  return `Player ${index + 1}`;
}

/**
 * Get player display name from game state (convenience function for components)
 */
export function getPlayerDisplayNameFromState(
  player: PlayerIndex,
  state?: GameState | null
): string {
  if (!state) return `Player ${player + 1}`;
  return getPlayerDisplayName(player, state.activePlayers, state.playerNames);
}

/**
 * Perceptual color distance using the redmean approximation (0–765 range).
 * Values below COLOR_SIMILARITY_THRESHOLD are considered confusingly similar.
 */
export const COLOR_SIMILARITY_THRESHOLD = 100;

export function colorDistance(hexA: string, hexB: string): number {
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  const rMean = (r1 + r2) / 2;
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return Math.sqrt((2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db);
}

function hexToHslComponents(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
    case g: h = ((b - r) / d + 2) / 6; break;
    case b: h = ((r - g) / d + 4) / 6; break;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

// Metallic and gem colors are visually distinct by piece appearance and are
// exempt from hue-based blocking (exact duplicates are still blocked).
// 'rainbow' and 'opal' are sentinel strings, not hex — always exempt.
const HUE_EXEMPT_COLORS = new Set([...METALLIC_EXTRA, ...GEM_COLORS, ...FLOWER_COLORS, ...ELEMENTAL_COLORS, ...EGG_COLORS, 'rainbow'].map((c) => c.toLowerCase()));

// Base hue angle tolerance in degrees — keeps orange (≥20°) distinct from red
const HUE_SIMILARITY_THRESHOLD = 20;
// Wider tolerance for green — more natural variation between lime, green, and teal
const GREEN_HUE_THRESHOLD = 35;
const GREEN_HUE_CENTER = 135;

function getHueThreshold(hA: number, hB: number): number {
  const isGreenish = (h: number) =>
    Math.min(Math.abs(h - GREEN_HUE_CENTER), 360 - Math.abs(h - GREEN_HUE_CENTER)) < 50;
  return isGreenish(hA) || isGreenish(hB) ? GREEN_HUE_THRESHOLD : HUE_SIMILARITY_THRESHOLD;
}

/**
 * Returns true if two colors are too similar to use together.
 * For saturated colors, uses hue proximity only — this correctly distinguishes
 * red from orange without false positives from perceptual-distance checks.
 * For near-grayscale colors (black, white, silver), falls back to perceptual distance.
 * Metallic and gem colors are exempt — exact duplicates are still blocked.
 */
export function areTooSimilar(hexA: string, hexB: string): boolean {
  const hexALower = hexA.toLowerCase();
  const hexBLower = hexB.toLowerCase();
  // Exact duplicates are always blocked
  if (hexALower === hexBLower) return true;
  // Metallic/gem colors are visually distinct by appearance — skip similarity check
  if (HUE_EXEMPT_COLORS.has(hexALower) || HUE_EXEMPT_COLORS.has(hexBLower)) return false;
  const hslA = hexToHslComponents(hexA);
  const hslB = hexToHslComponents(hexB);
  // For saturated colors, hue distance is the right measure
  if (hslA.s >= 20 && hslB.s >= 20) {
    const hueDiff = Math.abs(hslA.h - hslB.h);
    return Math.min(hueDiff, 360 - hueDiff) < getHueThreshold(hslA.h, hslB.h);
  }
  // For near-grayscale colors, fall back to perceptual distance
  return colorDistance(hexA, hexB) < COLOR_SIMILARITY_THRESHOLD;
}

/**
 * Get player color with fallback to default
 */
export function getPlayerColor(
  player: PlayerIndex,
  customColors?: ColorMapping
): string {
  return customColors?.[player] ?? PLAYER_COLORS[player];
}

/**
 * Get player color from game state (convenience function for components)
 */
export function getPlayerColorFromState(
  player: PlayerIndex,
  state?: GameState | null
): string {
  return state?.playerColors?.[player] ?? PLAYER_COLORS[player];
}
