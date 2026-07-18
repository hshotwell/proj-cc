import type { CubeCoord } from '@/types/game';

// Hex Chess board: 3-color the tiles using (q + 2r) mod 3 so no two adjacent
// hex cells share the same color. Ordered darkest → medium → lightest so the
// center cell (0,0) → index 0 → darkest, and neighbors fan out lighter.
const HEX_CHESS_TILE_COLORS_LIGHT: [string, string, string] = ['#c9a97b', '#d8b990', '#efdcbb'];
const HEX_CHESS_TILE_COLORS_DARK:  [string, string, string] = ['#493627', '#584331', '#6b543a'];

export function hexChessTileColor(cell: CubeCoord, darkMode: boolean): string {
  const palette = darkMode ? HEX_CHESS_TILE_COLORS_DARK : HEX_CHESS_TILE_COLORS_LIGHT;
  const idx = ((cell.q + 2 * cell.r) % 3 + 3) % 3;
  return palette[idx];
}
