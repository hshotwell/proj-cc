// Cube coordinate system for hexagonal grid (q + r + s = 0)
export interface CubeCoord {
  q: number;
  r: number;
  s: number;
}

// Player indices (0-5) for up to 6 players
export type PlayerIndex = 0 | 1 | 2 | 3 | 4 | 5;

// Piece color: a valid CSS color, hex code, or special sentinel (rainbow, opal, bouquet, etc.)
export type PieceColor = string;

// Valid player counts for Chinese Checkers
export type PlayerCount = 2 | 3 | 4 | 6;

// Custom color mapping for players (falls back to PLAYER_COLORS if not specified)
export type ColorMapping = Partial<Record<PlayerIndex, string>>;

// Custom name mapping for players (falls back to "Player N" if not specified)
export type PlayerNameMapping = Partial<Record<PlayerIndex, string>>;

// Piece variant — determines movement rules
// normal:  standard hop over adjacent piece/wall
// turbo:   hop over a piece/wall any distance away in a line, same distance on the other side (represented as smaller pieces)
// ghost:   hop over a contiguous run of adjacent pieces/walls, land after the run (translucent)
// big:     standard movement; opponents cannot jump over you (only you or teammates can)
export type PieceVariant = 'normal' | 'turbo' | 'ghost' | 'big';

// Cell content - empty, piece, or wall
export type CellContent =
  | { type: 'empty' }
  | { type: 'piece'; player: PlayerIndex }
  | { type: 'wall' };

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
  // Turn number when this move was made (for detecting turn boundaries)
  turnNumber?: number;
  // AI scoring debug info (only set on AI-chosen moves)
  debug?: AIDebugInfo;
}

/**
 * Per-candidate scoring breakdown captured by findBestMove.
 * Keys correspond 1:1 with scorer function names so it's easy to trace which
 * signal flipped a decision.
 */
export interface AIScoreBreakdown {
  evaluatePosition: number;
  regressionPenalty: number;
  repetitionPenalty: number;
  strategicTotal: number;
  landingQuality: number;
  lastMoveResponse: number;
  setupBlockRisk: number;
  leapfrogPotential: number;
  residualTrajectory: number;
  sourceDominance: number;
  createsOpponentJump: number;
  backPieceChainSetup: number;
  backPiecePriority: number;
  chainEnablingStep: number;
  frontPieceSidestep: number;
  inGoalLateral: number;
  samePieceMissedForward: number;
  lateralReachableByForward: number;
  shallowGoalEntry: number;
  lateralCohesion: number;
  chainExtension: number;
  makeRoomSetup: number;
  inGoalRegression: number;
  chainEndpointSetup: number;
  chainBackwardHop: number;
  goalEntryBonus: number;
  endgameLateral: number;
  endgameMove: number;
  landingHopQuality: number;
  bigJumpOpportunity: number;
  minimaxScore: number;
}

export interface AIDebugCandidate {
  from: CubeCoord;
  to: CubeCoord;
  isJump: boolean;
  jumpPath?: CubeCoord[];
  finalScore: number;
  breakdown: AIScoreBreakdown;
  picked: boolean;
}

export interface AIDebugInfo {
  difficulty: 'easy' | 'medium' | 'hard';
  personality: 'aggressive' | 'defensive' | 'generalist';
  depthReached: number;
  candidateCount: number;
  candidates: AIDebugCandidate[];
  // Free-text note for fast-path picks (opening book, endgame solver, etc.)
  note?: string;
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
  // Custom names for players (falls back to "Player N")
  playerNames?: PlayerNameMapping;
  // AI player configurations
  aiPlayers?: import('./ai').AIPlayerMap;
  // Custom goal positions if using a custom layout
  customGoalPositions?: Partial<Record<PlayerIndex, string[]>>;
  // Starting positions for each player (used for triangle coloring)
  startingPositions?: Partial<Record<PlayerIndex, string[]>>;
  // Team mode: opposite players are teammates, both must finish to win
  teamMode?: boolean;
  // Piece variant per player (normal if absent)
  playerPieceTypes?: Partial<Record<PlayerIndex, PieceVariant>>;
  // Per-piece variant overrides: coord key → variant (moves with the piece)
  pieceVariants?: Map<string, PieceVariant>;
  // Powerup positions: coord key → variant (consumed when a piece lands on them)
  powerups?: Map<string, PieceVariant>;
  // Power-ups picked up during the current turn, applied to pieceVariants on confirmMove
  pendingPowerups?: Map<string, PieceVariant>;
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
  // Wall positions (coord keys) - can be jumped over but not landed on
  walls?: string[];
  // Powerup positions: coord key → variant (consumed when a piece lands on them)
  powerups?: Record<string, PieceVariant>;
  // Starting piece specialties: coord key → variant (piece at that position starts with this type)
  pieceSpecialties?: Record<string, PieceVariant>;
  // Which player indices participate for each player count (overrides ACTIVE_PLAYERS default)
  playerCountConfig?: Partial<Record<PlayerCount, PlayerIndex[]>>;
  createdAt: number;
  isDefault?: boolean;
  // For endgame puzzles: the number of turns it took to finish in the original game (used as par/goal)
  puzzleGoalMoves?: number;
  // --- Mode & shared display fields ---
  // undefined = 'sternhalma' (backward compatible with all existing saves)
  gameMode?: 'sternhalma' | 'hexchess';
  // Display-only 30-degree board rotation (pointy-top -> flat-top). Both modes.
  rotated30?: boolean;
  // Board default colors per seat; play setup pre-fills from these.
  defaultColors?: Partial<Record<PlayerIndex, string>>;
  // --- Hex chess fields (gameMode === 'hexchess' only) ---
  // cellKey -> piece. 'pawn' is the unified pawn/peon; engine decides behavior.
  hexPieces?: Record<string, { player: PlayerIndex; type: 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king' }>;
  // Per-army promotion tiles (drawn like goals in the editor).
  promotionPositions?: Partial<Record<PlayerIndex, string[]>>;
  // Global promote-to options; undefined = all four.
  promotionOptions?: ('knight' | 'bishop' | 'rook' | 'queen')[];
}
