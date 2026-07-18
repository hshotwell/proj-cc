import type { PlayerIndex } from './game';

export interface BoardSnapshot {
  pieces: Partial<Record<PlayerIndex, Array<{ q: number; r: number }>>>;
}

export interface FlaggedMove {
  id: string;
  gameId: string | null;
  moveIndex?: number;
  turnNumber: number;
  player: PlayerIndex;
  difficulty?: string;
  personality?: string;
  piecesInGoal: number;
  actualMove: { from: { q: number; r: number }; to: { q: number; r: number } };
  suggestedMove?: { from: { q: number; r: number }; to: { q: number; r: number } };
  note: string;
  boardAfter: BoardSnapshot;
  timestamp: number;
}

// Hex chess flags carry piece identity: the moved piece's type, what it
// captured/promoted to, and a piece-typed board snapshot keyed by cell.
export interface HexBoardAfterSnapshot {
  pieces: Record<string, { player: number; type: string }>;
}

export interface FlaggedHexMove {
  id: string;
  gameId: string | null;
  moveIndex: number;
  turnNumber: number;
  seat: number;
  difficulty?: string;
  actualMove: {
    pieceType: string;
    from: { q: number; r: number };
    to: { q: number; r: number };
    capture: string | null;
    promotion: string | null;
  };
  suggestedMove?: { from: { q: number; r: number }; to: { q: number; r: number } };
  note: string;
  boardAfter: HexBoardAfterSnapshot;
  timestamp: number;
}
