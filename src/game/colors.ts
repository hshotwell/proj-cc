import { PLAYER_COLORS } from './constants';
import type { GameState, PlayerIndex, ColorMapping } from '@/types/game';

/**
 * Convert a hex color string to rgba with given alpha
 */
export function hexToRgba(hex: string, alpha: number): string {
  const cleaned = hex.replace('#', '');
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Get a display name for a player based on their 1-based position in the active players list
 */
export function getPlayerDisplayName(
  player: PlayerIndex,
  activePlayers: PlayerIndex[]
): string {
  const index = activePlayers.indexOf(player);
  return `Player ${index + 1}`;
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
