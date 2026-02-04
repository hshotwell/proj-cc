import type {
  CubeCoord,
  CellContent,
  GameState,
  PlayerCount,
  PlayerIndex,
  BoardLayout,
  ColorMapping,
} from '@/types/game';
import type { AIPlayerMap } from '@/types/ai';
import { ACTIVE_PLAYERS } from './constants';
import { generateBoardPositions } from './board';
import { coordKey, parseCoordKey } from './coordinates';
import { getDefaultStartingPositions } from './defaultLayout';

// Get the initial piece positions for a player
export function getInitialPieces(player: PlayerIndex): CubeCoord[] {
  const positions = getDefaultStartingPositions(player);
  return positions.map(parseCoordKey);
}

// Create initial board state with empty cells
function createEmptyBoard(): Map<string, CellContent> {
  const board = new Map<string, CellContent>();
  const positions = generateBoardPositions();

  for (const pos of positions) {
    board.set(coordKey(pos), { type: 'empty' });
  }

  return board;
}

// Place initial pieces for all active players
function placePieces(
  board: Map<string, CellContent>,
  activePlayers: PlayerIndex[]
): void {
  for (const player of activePlayers) {
    const pieces = getInitialPieces(player);
    for (const pos of pieces) {
      board.set(coordKey(pos), { type: 'piece', player });
    }
  }
}

// Create a new game state
export function createGame(
  playerCount: PlayerCount,
  selectedPlayers?: PlayerIndex[],
  playerColors?: ColorMapping,
  aiPlayers?: AIPlayerMap
): GameState {
  // Use selectedPlayers if provided, otherwise fall back to defaults
  const activePlayers = selectedPlayers ?? (ACTIVE_PLAYERS[playerCount] as PlayerIndex[]);
  const board = createEmptyBoard();
  placePieces(board, activePlayers);

  return {
    board,
    playerCount,
    activePlayers,
    currentPlayer: activePlayers[0],
    moveHistory: [],
    winner: null,
    finishedPlayers: [],
    turnNumber: 1,
    playerColors,
    aiPlayers,
  };
}

// Create a game state from a custom board layout
export function createGameFromLayout(layout: BoardLayout): GameState {
  const board = new Map<string, CellContent>();

  // Add all cells from the layout
  for (const key of layout.cells) {
    board.set(key, { type: 'empty' });
  }

  // Determine active players (those with starting positions)
  const activePlayers: PlayerIndex[] = [];
  for (let i = 0; i < 6; i++) {
    const positions = layout.startingPositions[i as PlayerIndex];
    if (positions && positions.length > 0) {
      activePlayers.push(i as PlayerIndex);
      // Place pieces
      for (const key of positions) {
        board.set(key, { type: 'piece', player: i as PlayerIndex });
      }
    }
  }

  // Determine player count based on active players
  const playerCount = (activePlayers.length <= 2 ? 2 :
    activePlayers.length === 3 ? 3 :
    activePlayers.length <= 4 ? 4 : 6) as PlayerCount;

  return {
    board,
    playerCount,
    activePlayers,
    currentPlayer: activePlayers[0] || 0,
    moveHistory: [],
    winner: null,
    finishedPlayers: [],
    turnNumber: 1,
    isCustomLayout: true,
    customGoalPositions: layout.goalPositions,
  };
}

// Clone a game state (for immutable updates)
export function cloneGameState(state: GameState): GameState {
  return {
    ...state,
    board: new Map(state.board),
    activePlayers: [...state.activePlayers],
    moveHistory: [...state.moveHistory],
    finishedPlayers: [...state.finishedPlayers],
    playerColors: state.playerColors ? { ...state.playerColors } : undefined,
    aiPlayers: state.aiPlayers ? { ...state.aiPlayers } : undefined,
  };
}

// Get all piece positions for a player
export function getPlayerPieces(
  state: GameState,
  player: PlayerIndex
): CubeCoord[] {
  const pieces: CubeCoord[] = [];

  for (const [key, content] of state.board) {
    if (content.type === 'piece' && content.player === player) {
      const [q, r] = key.split(',').map(Number);
      pieces.push({ q, r, s: -q - r });
    }
  }

  return pieces;
}
