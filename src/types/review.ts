import type { PlayerIndex } from './game';

export interface BoardSnapshot {
  pieces: Partial<Record<PlayerIndex, Array<{ q: number; r: number }>>>;
}

export interface FlaggedMove {
  id: string;
  gameId: string | null;
  turnNumber: number;
  player: PlayerIndex;
  difficulty: string;
  personality: string;
  piecesInGoal: number;
  actualMove: { from: { q: number; r: number }; to: { q: number; r: number } };
  suggestedMove?: { from: { q: number; r: number }; to: { q: number; r: number } };
  note: string;
  boardAfter: BoardSnapshot;
  timestamp: number;
}
