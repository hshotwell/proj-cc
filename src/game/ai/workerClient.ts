import type { GameState, CellContent } from '@/types/game';
import type { AIDifficulty, AIPersonality } from '@/types/ai';
import type { Move } from '@/types/game';

// Serialized version of GameState where the board Map is converted to an array
// of entries for structured cloning across the worker boundary.
export interface SerializedGameState {
  boardEntries: [string, CellContent][];
  playerCount: GameState['playerCount'];
  activePlayers: GameState['activePlayers'];
  currentPlayer: GameState['currentPlayer'];
  moveHistory: GameState['moveHistory'];
  winner: GameState['winner'];
  finishedPlayers: GameState['finishedPlayers'];
  turnNumber: GameState['turnNumber'];
  isCustomLayout?: GameState['isCustomLayout'];
  playerColors?: GameState['playerColors'];
  aiPlayers?: GameState['aiPlayers'];
  customGoalPositions?: GameState['customGoalPositions'];
  startingPositions?: GameState['startingPositions'];
}

export interface WorkerRequest {
  state: SerializedGameState;
  difficulty: AIDifficulty;
  personality: AIPersonality;
}

export interface WorkerResponse {
  move: Move | null;
}

export function serializeGameState(state: GameState): SerializedGameState {
  return {
    boardEntries: Array.from(state.board.entries()),
    playerCount: state.playerCount,
    activePlayers: state.activePlayers,
    currentPlayer: state.currentPlayer,
    moveHistory: state.moveHistory,
    winner: state.winner,
    finishedPlayers: state.finishedPlayers,
    turnNumber: state.turnNumber,
    isCustomLayout: state.isCustomLayout,
    playerColors: state.playerColors,
    aiPlayers: state.aiPlayers,
    customGoalPositions: state.customGoalPositions,
    startingPositions: state.startingPositions,
  };
}

export function deserializeGameState(serialized: SerializedGameState): GameState {
  return {
    board: new Map(serialized.boardEntries),
    playerCount: serialized.playerCount,
    activePlayers: serialized.activePlayers,
    currentPlayer: serialized.currentPlayer,
    moveHistory: serialized.moveHistory,
    winner: serialized.winner,
    finishedPlayers: serialized.finishedPlayers,
    turnNumber: serialized.turnNumber,
    isCustomLayout: serialized.isCustomLayout,
    playerColors: serialized.playerColors,
    aiPlayers: serialized.aiPlayers,
    customGoalPositions: serialized.customGoalPositions,
    startingPositions: serialized.startingPositions,
  };
}
