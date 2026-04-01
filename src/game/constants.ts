import type { CubeCoord, PlayerIndex, PlayerCount, TriangleIndex } from '@/types/game';

// The 6 directions in cube coordinates for hexagonal movement
// Each direction moves to an adjacent hex
export const DIRECTIONS: readonly CubeCoord[] = [
  { q: 1, r: -1, s: 0 },  // East
  { q: 1, r: 0, s: -1 },  // Southeast
  { q: 0, r: 1, s: -1 },  // Southwest
  { q: -1, r: 1, s: 0 },  // West
  { q: -1, r: 0, s: 1 },  // Northwest
  { q: 0, r: -1, s: 1 },  // Northeast
] as const;

// Player colors - vibrant and distinguishable
// Clockwise board order (0→4→3→2→1→5): Red, Yellow, Green, Cyan, Blue, Purple
export const PLAYER_COLORS: Record<PlayerIndex, string> = {
  0: '#ef4444', // Red (top)
  1: '#3b82f6', // Blue (bottom-left)
  2: '#22d3ee', // Cyan (bottom)
  3: '#22c55e', // Green (bottom-right)
  4: '#facc15', // Yellow (top-right)
  5: '#a855f7', // Purple (top-left)
};

// Display order for color swatches: R, Y, G, C, B, P (clockwise board order)
export const COLOR_DISPLAY_ORDER: string[] = [
  PLAYER_COLORS[0], // Red
  PLAYER_COLORS[4], // Yellow
  PLAYER_COLORS[3], // Green
  PLAYER_COLORS[2], // Cyan
  PLAYER_COLORS[1], // Blue
  PLAYER_COLORS[5], // Purple
];

// Additional metallic color options beyond the defaults
export const METALLIC_EXTRA = [
  '#b87333', // Copper
  '#c0c0c0', // Silver
  '#ffd700', // Gold
  '#a8d8f0', // Ice
  '#1a1820', // Onyx
  '#f0e8dc', // Pearl
  '#3a7850', // Jade
  '#303858', // Iron
  '#f07090', // Morganite
];

// Neutral colors (black, grey, white) shown on row 1 of the color picker
export const NEUTRAL_COLORS = [
  '#1a1a1a', // Black
  '#888888', // Grey
  '#ffffff', // White
];

// Flower colors for row 4 of the color picker
export const FLOWER_COLORS = [
  '#d4364e', // Rose
  '#e8b800', // Sunflower
  '#5ba3d9', // Forget-me-not
  '#5040cc', // Violet
  '#f090b0', // Cherry Blossom
  '#241848', // Black Lotus
  '#f4f0e8', // Lily
  '#4a9e60', // Clover
  '#b4b8cc', // Grey Hibiscus
  'bouquet', // Bouquet (all-flowers sentinel)
];

// Display order for row 4 (aligned with column hues: R, Y, G, Cx/B/P + specials)
export const ROW4_DISPLAY_ORDER: string[] = [
  '#d4364e', // Rose (red)
  '#e8b800', // Sunflower (yellow)
  '#4a9e60', // Clover (green)
  '#5ba3d9', // Forget-me-not (light blue)
  '#5040cc', // Violet (blue-purple)
  '#f090b0', // Cherry Blossom (pink)
  '#241848', // Black Lotus (dark indigo)
  '#b4b8cc', // Grey Hibiscus (light grey)
  '#f4f0e8', // Lily (cream-white)
  'bouquet', // Bouquet
];

// Center colors for each flower (for swatch and piece rendering)
export const FLOWER_CENTER_COLORS: Record<string, string> = {
  '#d4364e': '#401017', // Rose — very dark red
  '#e8b800': '#3d2000', // Sunflower — dark brown
  '#5ba3d9': '#f0d020', // Forget-me-not — yellow
  '#5040cc': '#f0d020', // Violet — yellow
  '#f090b0': '#ff5090', // Cherry Blossom — bright pink
  '#241848': '#9030e0', // Black Lotus — bright purple for contrast
  '#f4f0e8': '#e060a0', // White Lily — pink
  '#4a9e60': '#1a5228', // Clover — dark green
  '#b4b8cc': '#d84020', // Grey Hibiscus — orange-red
};

export function isFlowerColor(hex: string): boolean {
  return FLOWER_COLORS.some(c => c.toLowerCase() === hex.toLowerCase());
}

// Gem colors — faceted polygon pieces
export const GEM_COLORS = [
  '#cc2244', // Ruby
  '#e07020', // Amber
  '#22aa44', // Emerald
  '#88ccee', // Diamond
  '#2244cc', // Sapphire
  '#8833aa', // Amethyst
  '#2a2a40', // Obsidian
  '#8c8c9c', // Marble
  '#e8e0d0', // Pearl
  'opal',    // Opal (all 6 player colors)
];

// Row 3: metals and rainbow marble (all selectable values, no nulls)
export const EXTRA_COLORS_NO_GEMS = [
  '#b87333', // Copper
  '#ffd700', // Gold
  '#c0c0c0', // Silver
  '#a8d8f0', // Ice
  '#1a1820', // Onyx
  '#f0e8dc', // Pearl
  '#3a7850', // Jade
  '#303858', // Iron
  '#f07090', // Morganite
  'rainbow', // Rainbow Marble
];

// Display order for row 3 of the color picker
export const ROW3_DISPLAY_ORDER: string[] = [
  '#b87333', // Copper
  '#ffd700', // Gold
  '#3a7850', // Jade
  '#a8d8f0', // Ice
  '#303858', // Iron
  '#f07090', // Morganite
  '#1a1820', // Onyx
  '#c0c0c0', // Silver
  '#f0e8dc', // Pearl
  'rainbow', // Rainbow
];

// Elemental animated marble sentinels — EXPERIMENTAL, kept for future use (not in picker)
export const ELEMENTAL_COLORS = [
  'fire', 'lightning', 'grass', 'air', 'water', 'magic', 'shadow', 'smoke', 'cloud',
];

// Egg colors — row 5 of the color picker (hex-based, like flowers)
export const EGG_COLORS = [
  '#8a1818', // Dragon Egg
  '#d4a020', // Golden Egg
  '#b8d890', // Dino Egg
  '#50c0b0', // Robin Egg
  '#4878c0', // Emu Egg
  '#7030a0', // Kraken Egg
  '#181010', // Volcanic Egg
  '#b8b8b8', // Penguin Egg
  '#f4f4f0', // Egg
  '#f0c8e8', // Easter Egg
];

export const ROW5_DISPLAY_ORDER: string[] = [...EGG_COLORS];

export function isEggColor(hex: string): boolean {
  return EGG_COLORS.some(c => c.toLowerCase() === hex.toLowerCase());
}

// All extra colors including gems, flowers, elementals and eggs (for validation/lookup)
export const EXTRA_COLORS = [
  ...EXTRA_COLORS_NO_GEMS,
  ...GEM_COLORS,
  ...FLOWER_COLORS,
  ...ELEMENTAL_COLORS,
  ...EGG_COLORS,
];

// The first 3 extra colors are metallic (copper, silver, gold)
const METALLIC_EXTRA_COLORS = METALLIC_EXTRA;

// Check if a color is metallic
export function isMetallicColor(hex: string): boolean {
  return METALLIC_EXTRA_COLORS.some(c => c.toLowerCase() === hex.toLowerCase());
}

// Per-metal swatch twinkle CSS variable presets (indexed by EXTRA_COLORS order)
export const METALLIC_SWATCH_STYLES: React.CSSProperties[] = [
  { '--tw-delay': '0s', '--tw-dur': '4s', '--tw-x1': '28%', '--tw-y1': '22%', '--tw-x2': '68%', '--tw-y2': '55%', '--tw-x3': '25%', '--tw-y3': '65%', '--tw-x4': '62%', '--tw-y4': '30%', '--sheen-opacity': '0.4' } as React.CSSProperties,
  { '--tw-delay': '0.9s', '--tw-dur': '3.3s', '--tw-x1': '65%', '--tw-y1': '30%', '--tw-x2': '30%', '--tw-y2': '60%', '--tw-x3': '60%', '--tw-y3': '68%', '--tw-x4': '35%', '--tw-y4': '25%' } as React.CSSProperties,
  { '--tw-delay': '1.6s', '--tw-dur': '2.5s', '--tw-x1': '40%', '--tw-y1': '65%', '--tw-x2': '60%', '--tw-y2': '25%', '--tw-x3': '30%', '--tw-y3': '40%', '--tw-x4': '70%', '--tw-y4': '60%' } as React.CSSProperties,
  { '--tw-delay': '0.3s', '--tw-dur': '2.8s', '--tw-x1': '55%', '--tw-y1': '25%', '--tw-x2': '30%', '--tw-y2': '60%', '--tw-x3': '65%', '--tw-y3': '65%', '--tw-x4': '40%', '--tw-y4': '28%' } as React.CSSProperties, // Ice
  { '--tw-delay': '1.2s', '--tw-dur': '3.2s', '--tw-x1': '35%', '--tw-y1': '30%', '--tw-x2': '60%', '--tw-y2': '60%', '--tw-x3': '28%', '--tw-y3': '65%', '--tw-x4': '65%', '--tw-y4': '35%', '--sheen-opacity': '0.5' } as React.CSSProperties, // Onyx
  { '--tw-delay': '0.7s', '--tw-dur': '2.2s', '--tw-x1': '45%', '--tw-y1': '22%', '--tw-x2': '65%', '--tw-y2': '58%', '--tw-x3': '32%', '--tw-y3': '52%', '--tw-x4': '68%', '--tw-y4': '28%' } as React.CSSProperties, // Pearl
  { '--tw-delay': '0.5s', '--tw-dur': '3.8s', '--tw-x1': '30%', '--tw-y1': '28%', '--tw-x2': '65%', '--tw-y2': '55%', '--tw-x3': '35%', '--tw-y3': '62%', '--tw-x4': '60%', '--tw-y4': '30%', '--sheen-opacity': '0.5' } as React.CSSProperties, // Jade
  { '--tw-delay': '0.9s', '--tw-dur': '3.0s', '--tw-x1': '40%', '--tw-y1': '30%', '--tw-x2': '58%', '--tw-y2': '62%', '--tw-x3': '32%', '--tw-y3': '55%', '--tw-x4': '62%', '--tw-y4': '28%', '--sheen-opacity': '0.5' } as React.CSSProperties, // Iron
  { '--tw-delay': '0.4s', '--tw-dur': '2.3s', '--tw-x1': '50%', '--tw-y1': '22%', '--tw-x2': '28%', '--tw-y2': '58%', '--tw-x3': '68%', '--tw-y3': '60%', '--tw-x4': '38%', '--tw-y4': '30%', '--sheen-opacity': '0.5' } as React.CSSProperties, // Pink
];

// Get the swatch style for a metallic color, or undefined if not metallic
export function getMetallicSwatchStyle(hex: string): React.CSSProperties | undefined {
  const idx = METALLIC_EXTRA_COLORS.findIndex(c => c.toLowerCase() === hex.toLowerCase());
  return idx >= 0 ? METALLIC_SWATCH_STYLES[idx] : undefined;
}

// Check if a color is a gem color
export function isGemColor(hex: string): boolean {
  return GEM_COLORS.some(c => c.toLowerCase() === hex.toLowerCase());
}

// Simple-mode conic-gradient backgrounds for gem swatches.
// Wedge pattern (SIMPLE_PAIR_MAP [0,4,4,2,2,0]): shades[0] light 0-60°,
// shades[4] dark 60-180°, shades[2] mid 180-300°, shades[0] light 300-360°.
// A CSS conic-gradient with hard stops exactly replicates the SVG wedge rendering.
const GEM_SIMPLE_BG: Record<string, string> = {
  '#cc2244': 'conic-gradient(#ff5577 0deg 60deg, #881122 60deg 180deg, #cc2244 180deg 300deg, #ff5577 300deg 360deg)',   // Ruby
  '#e07020': 'conic-gradient(#ffaa55 0deg 60deg, #b04810 60deg 180deg, #e07020 180deg 300deg, #ffaa55 300deg 360deg)',   // Amber
  '#22aa44': 'conic-gradient(#55dd77 0deg 60deg, #116622 60deg 180deg, #22aa44 180deg 300deg, #55dd77 300deg 360deg)',   // Emerald
  '#88ccee': 'conic-gradient(#ccf0ff 0deg 60deg, #4488aa 60deg 180deg, #88ccee 180deg 300deg, #ccf0ff 300deg 360deg)',   // Diamond
  '#2244cc': 'conic-gradient(#5577ff 0deg 60deg, #112288 60deg 180deg, #2244cc 180deg 300deg, #5577ff 300deg 360deg)',   // Sapphire
  '#8833aa': 'conic-gradient(#bb66dd 0deg 60deg, #441166 60deg 180deg, #8833aa 180deg 300deg, #bb66dd 300deg 360deg)',   // Amethyst
  '#2a2a40': 'conic-gradient(#6a6a8a 0deg 60deg, #0e0e1e 60deg 180deg, #2a2a40 180deg 300deg, #6a6a8a 300deg 360deg)',   // Obsidian
  '#8c8c9c': 'conic-gradient(#dcdce8 0deg 60deg, #5c5c6c 60deg 180deg, #9c9cac 180deg 300deg, #dcdce8 300deg 360deg)',   // Marble
  '#e8e0d0': 'conic-gradient(#fefefe 0deg 60deg, #c8bca8 60deg 180deg, #ede6d8 180deg 300deg, #fefefe 300deg 360deg)',   // Pearl
};

export function getGemSimpleBackground(hex: string): string | undefined {
  return GEM_SIMPLE_BG[hex.toLowerCase()];
}

// Per-gem swatch twinkle CSS variable presets (twinkle dot positions, no sheen)
// Order matches GEM_COLORS: Ruby, Amber, Emerald, Diamond, Sapphire, Amethyst, Opal
export const GEM_SWATCH_STYLES: React.CSSProperties[] = [
  { '--tw-delay': '0.2s', '--tw-dur': '3.5s', '--tw-x1': '30%', '--tw-y1': '20%', '--tw-x2': '70%', '--tw-y2': '55%', '--tw-x3': '25%', '--tw-y3': '70%', '--tw-x4': '65%', '--tw-y4': '28%' } as React.CSSProperties,  // Ruby
  { '--tw-delay': '0.4s', '--tw-dur': '3.6s', '--tw-x1': '45%', '--tw-y1': '22%', '--tw-x2': '58%', '--tw-y2': '62%', '--tw-x3': '30%', '--tw-y3': '55%', '--tw-x4': '72%', '--tw-y4': '32%' } as React.CSSProperties,  // Amber
  { '--tw-delay': '0.5s', '--tw-dur': '3.8s', '--tw-x1': '35%', '--tw-y1': '30%', '--tw-x2': '65%', '--tw-y2': '60%', '--tw-x3': '28%', '--tw-y3': '58%', '--tw-x4': '68%', '--tw-y4': '25%' } as React.CSSProperties,  // Emerald
  { '--tw-delay': '0.8s', '--tw-dur': '2.8s', '--tw-x1': '40%', '--tw-y1': '25%', '--tw-x2': '62%', '--tw-y2': '58%', '--tw-x3': '32%', '--tw-y3': '62%', '--tw-x4': '58%', '--tw-y4': '22%' } as React.CSSProperties,  // Diamond
  { '--tw-delay': '1.0s', '--tw-dur': '3.0s', '--tw-x1': '60%', '--tw-y1': '25%', '--tw-x2': '35%', '--tw-y2': '65%', '--tw-x3': '65%', '--tw-y3': '60%', '--tw-x4': '30%', '--tw-y4': '30%' } as React.CSSProperties,  // Sapphire
  { '--tw-delay': '1.4s', '--tw-dur': '3.2s', '--tw-x1': '55%', '--tw-y1': '22%', '--tw-x2': '30%', '--tw-y2': '55%', '--tw-x3': '60%', '--tw-y3': '65%', '--tw-x4': '40%', '--tw-y4': '35%' } as React.CSSProperties,  // Amethyst
  { '--tw-delay': '0.3s', '--tw-dur': '4.0s', '--tw-x1': '25%', '--tw-y1': '30%', '--tw-x2': '70%', '--tw-y2': '50%', '--tw-x3': '35%', '--tw-y3': '65%', '--tw-x4': '60%', '--tw-y4': '22%' } as React.CSSProperties,  // Obsidian
  { '--tw-delay': '0.7s', '--tw-dur': '5.0s', '--tw-x1': '40%', '--tw-y1': '28%', '--tw-x2': '55%', '--tw-y2': '65%', '--tw-x3': '30%', '--tw-y3': '50%', '--tw-x4': '65%', '--tw-y4': '38%' } as React.CSSProperties,  // Marble
  { '--tw-delay': '1.2s', '--tw-dur': '4.5s', '--tw-x1': '45%', '--tw-y1': '25%', '--tw-x2': '60%', '--tw-y2': '60%', '--tw-x3': '28%', '--tw-y3': '55%', '--tw-x4': '70%', '--tw-y4': '30%' } as React.CSSProperties,  // Pearl
  { '--tw-delay': '0.6s', '--tw-dur': '2.5s', '--tw-x1': '50%', '--tw-y1': '20%', '--tw-x2': '50%', '--tw-y2': '70%', '--tw-x3': '22%', '--tw-y3': '45%', '--tw-x4': '78%', '--tw-y4': '50%' } as React.CSSProperties,  // Opal
];

// Get the swatch style for a gem color, or undefined if not a gem
export function getGemSwatchStyle(hex: string): React.CSSProperties | undefined {
  const idx = GEM_COLORS.findIndex(c => c.toLowerCase() === hex.toLowerCase());
  return idx >= 0 ? GEM_SWATCH_STYLES[idx] : undefined;
}

// Human-readable names for all selectable colors
export const COLOR_NAMES: Record<string, string> = {
  '#ef4444': 'Red',
  '#3b82f6': 'Blue',
  '#22d3ee': 'Cyan',
  '#22c55e': 'Green',
  '#facc15': 'Yellow',
  '#a855f7': 'Purple',
  '#ffffff': 'White',
  '#888888': 'Grey',
  '#1a1a1a': 'Black',
  '#b87333': 'Copper',
  '#c0c0c0': 'Silver',
  '#ffd700': 'Gold',
  'rainbow': 'Rainbow',
  '#cc2244': 'Ruby',
  '#e07020': 'Amber',
  '#22aa44': 'Emerald',
  '#2244cc': 'Sapphire',
  '#88ccee': 'Diamond',
  '#8833aa': 'Amethyst',
  '#2a2a40': 'Obsidian',
  '#8c8c9c': 'Granite',
  '#e8e0d0': 'Marble',
  '#a8d8f0': 'Ice',
  '#1a1820': 'Onyx',
  '#f0e8dc': 'Pearl',
  '#3a7850': 'Jade',
  '#303858': 'Iron',
  '#f07090': 'Morganite',
  'opal': 'Opal',
  '#d4364e': 'Rose',
  '#e8b800': 'Sunflower',
  '#5ba3d9': 'Forget-me-not',
  '#5040cc': 'Violet',
  '#f090b0': 'Cherry Blossom',
  '#241848': 'Black Lotus',
  '#f4f0e8': 'White Lily',
  '#4a9e60': 'Clover',
  '#b4b8cc': 'Grey Hibiscus',
  'bouquet': 'Bouquet',
  'fire': 'Fire',
  'lightning': 'Lightning',
  'grass': 'Grass',
  'air': 'Air',
  'water': 'Water',
  'magic': 'Magic',
  'shadow': 'Shadow',
  'smoke': 'Smoke',
  'cloud': 'Cloud',
  '#8a1818': 'Dragon Egg',
  '#d4a020': 'Golden Egg',
  '#b8d890': 'Dino Egg',
  '#50c0b0': 'Robin Egg',
  '#4878c0': 'Emu Egg',
  '#7030a0': 'Kraken Egg',
  '#181010': 'Volcanic Egg',
  '#b8b8b8': 'Penguin Egg',
  '#f4f4f0': 'Egg',
  '#f0c8e8': 'Easter Egg',
};

export function getColorName(hex: string): string {
  return COLOR_NAMES[hex.toLowerCase()] ?? hex;
}

// Light background colors for triangles
export const TRIANGLE_COLORS: Record<TriangleIndex, string> = {
  0: '#fecaca', // Light red
  1: '#bfdbfe', // Light blue
  2: '#cffafe', // Light cyan
  3: '#bbf7d0', // Light green
  4: '#fef9c3', // Light yellow
  5: '#e9d5ff', // Light purple
};

// Default player names
export const DEFAULT_PLAYER_NAMES: Record<PlayerIndex, string> = {
  0: 'Red',
  1: 'Blue',
  2: 'Cyan',
  3: 'Green',
  4: 'Yellow',
  5: 'Purple',
};

// Triangle assignments: home (start) and goal (destination) triangles
// Triangles are numbered 0-5 going clockwise, with 0 at top-right
// Each player starts in their home triangle and must move all pieces to goal triangle (opposite)
export const TRIANGLE_ASSIGNMENTS: Record<PlayerIndex, { home: TriangleIndex; goal: TriangleIndex }> = {
  0: { home: 0, goal: 2 }, // Red: top -> bottom (opposite of Cyan)
  1: { home: 1, goal: 4 }, // Blue: bottom-left -> top-right (opposite of Yellow)
  2: { home: 2, goal: 0 }, // Cyan: bottom -> top (opposite of Red)
  3: { home: 3, goal: 5 }, // Green: bottom-right -> top-left (opposite of Purple)
  4: { home: 4, goal: 1 }, // Yellow: top-right -> bottom-left (opposite of Blue)
  5: { home: 5, goal: 3 }, // Purple: top-left -> bottom-right (opposite of Green)
};

// Maps a goal triangle to the player who is trying to reach it
export const GOAL_TRIANGLE_TO_PLAYER = Object.entries(
  TRIANGLE_ASSIGNMENTS
).reduce((acc, [player, assignment]) => {
  acc[assignment.goal] = parseInt(player, 10) as PlayerIndex;
  return acc;
}, {} as Record<TriangleIndex, PlayerIndex>);

// Maps triangle/sector index to the player who uses it as home
// Now identity mapping since getTriangleForPosition returns player index directly
export const TRIANGLE_TO_PLAYER: Record<TriangleIndex, PlayerIndex> = {
  0: 0, // Red's home (top, tip at 4,-8)
  1: 1, // Blue's home (bottom-left, tip at -8,4)
  2: 2, // Cyan's home (bottom, tip at -4,8)
  3: 3, // Green's home (bottom-right, tip at 4,4)
  4: 4, // Yellow's home (top-right, tip at 8,-4)
  5: 5, // Purple's home (top-left, tip at -4,-4)
};

// Which players are active based on player count
// Turn order follows clockwise position on the board
// Clockwise triangle order: 0 -> 2 -> 4 -> 1 -> 3 -> 5
// Player home triangles: 0=tri0, 1=tri3, 2=tri1, 3=tri4, 4=tri2, 5=tri5
export const ACTIVE_PLAYERS: Record<PlayerCount, PlayerIndex[]> = {
  2: [0, 2],              // Red (tri 0) -> Cyan (tri 2) - clockwise
  3: [0, 3, 1],           // Red (tri 0) -> Green (tri 3) -> Blue (tri 1) - clockwise
  4: [4, 3, 1, 5],        // Yellow (tri 4) -> Green (tri 3) -> Blue (tri 1) -> Purple (tri 5) - clockwise
  6: [0, 4, 3, 2, 1, 5],  // Red -> Yellow -> Green -> Cyan -> Blue -> Purple - clockwise
};

// Board dimensions
export const CENTER_RADIUS = 4; // Center hexagon extends 4 from origin
export const TRIANGLE_SIZE = 4; // Each triangle has 4 rows (10 pieces total: 4+3+2+1)

// SVG rendering constants
export const HEX_SIZE = 18; // Radius of each hex cell in pixels
export const BOARD_PADDING = 40; // Padding around the board

// Animation durations (ms)
export const MOVE_ANIMATION_DURATION = 200;
export const HIGHLIGHT_PULSE_DURATION = 1000;
export const BOARD_ROTATION_DURATION = 900;

// Rotation angle (degrees) to bring each player's home triangle to the bottom of the board.
// Triangle clockwise positions: 0=top, 4=top-right, 3=bottom-right, 2=bottom, 1=bottom-left, 5=top-left
export const ROTATION_FOR_PLAYER: Record<PlayerIndex, number> = {
  0: 180,   // top -> bottom
  1: -60,   // bottom-left -> bottom
  2: 0,     // bottom -> bottom (no rotation)
  3: 60,    // bottom-right -> bottom
  4: 120,   // top-right -> bottom
  5: -120,  // top-left -> bottom
};
