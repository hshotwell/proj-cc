// Cube coordinate system for hexagonal grid (q + r + s = 0)
export interface CubeCoord {
  q: number;
  r: number;
  s: number;
}

// Player indices (0-5) for up to 6 players
export type PlayerIndex = 0 | 1 | 2 | 3 | 4 | 5;

// Valid player counts for Chinese Checkers
export type PlayerCount = 2 | 3 | 4 | 6;

// Custom color mapping for players (falls back to PLAYER_COLORS if not specified)
export type ColorMapping = Partial<Record<PlayerIndex, string>>;

// Cell content - either empty or contains a piece
export type CellContent =
  | { type: 'empty' }
  | { type: 'piece'; player: PlayerIndex };

// A move from one position to another (may be a step or jump)
export interface Move {
  from: CubeCoord;
  to: CubeCoord;
  isJump: boolean;
  // For chain jumps, track intermediate positions
  jumpPath?: CubeCoord[];
  // Swap move: displaces an opponent piece from goal cell
  isSwap?: boolean;
  // Player who made this move (set when added to history)
  player?: PlayerIndex;
}

// Triangle index (0-5) representing each of the 6 points of the star
export type TriangleIndex = 0 | 1 | 2 | 3 | 4 | 5;

// Complete game state
export interface GameState {
  // Board state: Map key is "q,r" string
  board: Map<string, CellContent>;
  // Number of players in this game
  playerCount: PlayerCount;
  // Which players are active (indices depend on playerCount)
  activePlayers: PlayerIndex[];
  // Current player's turn
  currentPlayer: PlayerIndex;
  // Move history for undo
  moveHistory: Move[];
  // First player to finish (null if no one has finished yet)
  winner: PlayerIndex | null;
  // Ordered list of players who have finished, with the move count at time of finish
  finishedPlayers: Array<{ player: PlayerIndex; moveCount: number }>;
  // Turn number
  turnNumber: number;
  // Whether this is a custom layout (no triangle coloring)
  isCustomLayout?: boolean;
  // Custom colors for players (falls back to PLAYER_COLORS)
  playerColors?: ColorMapping;
  // AI player configurations
  aiPlayers?: import('./ai').AIPlayerMap;
  // Custom goal positions if using a custom layout
  customGoalPositions?: Partial<Record<PlayerIndex, string[]>>;
  // Starting positions for each player (used for triangle coloring)
  startingPositions?: Partial<Record<PlayerIndex, string[]>>;
}

// Player configuration (name, color, etc.)
export interface PlayerConfig {
  index: PlayerIndex;
  name: string;
  color: string;
  homeTriangle: TriangleIndex;
  goalTriangle: TriangleIndex;
}

// Game configuration for starting a new game
export interface GameConfig {
  playerCount: PlayerCount;
  playerNames?: string[];
}

// Custom board layout for the editor
export interface BoardLayout {
  id: string;
  name: string;
  // Array of coord keys ("q,r") for active cells
  cells: string[];
  // Starting positions for each player (player index -> array of coord keys)
  startingPositions: Partial<Record<PlayerIndex, string[]>>;
  // Goal positions for each player (player index -> array of coord keys)
  goalPositions?: Partial<Record<PlayerIndex, string[]>>;
  createdAt: number;
  isDefault?: boolean;
}
