import type { PlayerCount, PlayerIndex, ColorMapping, Move, PieceVariant } from './game';
import type { AIPlayerMap } from './ai';

export interface SavedGameSummary {
  id: string;
  dateSaved: number;
  playerCount: PlayerCount;
  activePlayers: PlayerIndex[];
  winner: PlayerIndex;
  totalMoves: number;
  totalTurns: number;
  longestHop: number;
  playerColors?: ColorMapping;
  aiPlayers?: AIPlayerMap;
  teamMode?: boolean;
  // Custom board name (undefined = Standard Board)
  boardName?: string;
  // Game mode (piece variant applied to all players; undefined or 'normal' = classic)
  gameMode?: PieceVariant;
}

export interface SavedGameData {
  id: string;
  initialConfig: {
    playerCount: PlayerCount;
    activePlayers: PlayerIndex[];
    playerColors?: ColorMapping;
    aiPlayers?: AIPlayerMap;
    isCustomLayout?: boolean;
    // Custom layout data (only present when isCustomLayout is true)
    customCells?: string[];
    customStartingPositions?: Partial<Record<PlayerIndex, string[]>>;
    customGoalPositions?: Partial<Record<PlayerIndex, string[]>>;
    customWalls?: string[];
    teamMode?: boolean;
  };
  moves: Move[];
  finishedPlayers: Array<{ player: PlayerIndex; moveCount: number }>;
  dateSaved: number;
}
