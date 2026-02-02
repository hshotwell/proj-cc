import type { PlayerCount, PlayerIndex, ColorMapping, Move } from './game';
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
}

export interface SavedGameData {
  id: string;
  initialConfig: {
    playerCount: PlayerCount;
    activePlayers: PlayerIndex[];
    playerColors?: ColorMapping;
    aiPlayers?: AIPlayerMap;
    isCustomLayout?: boolean;
  };
  moves: Move[];
  finishedPlayers: Array<{ player: PlayerIndex; moveCount: number }>;
  dateSaved: number;
}
