import type { CubeCoord, PieceColor } from '@/types/game';

export type HexPieceType =
  | 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn' | 'soldier';

export type HexPlayerIndex = 0 | 1;
export type HexChessDifficulty = 'easy' | 'medium' | 'hard';
export type HexEndReason =
  | 'checkmate' | 'stalemate' | 'repetition' | 'insufficient-material' | 'resignation';

export interface HexPiece {
  id: string;
  player: HexPlayerIndex;
  type: HexPieceType;
  cell: CubeCoord;
  hasMoved: boolean;
}

export interface HexChessPlayerConfig {
  color: PieceColor;
  name: string;
  isAI: boolean;
}

export interface HexChessConfig {
  id: string;
  players: [HexChessPlayerConfig, HexChessPlayerConfig];
  layoutPreset: 'v1-default';
  soldierVariant: 'soldier' | 'pawn';
  ai: null | { forPlayer: HexPlayerIndex; difficulty: HexChessDifficulty };
}

export interface HexMove {
  pieceId: string;
  from: CubeCoord;
  to: CubeCoord;
  capture: null | { pieceId: string; cell: CubeCoord };
  promotion: null | HexPieceType;
  isEnPassant: boolean;
  isDoubleStep: boolean;
  player: HexPlayerIndex;
  turnNumber: number;
}

export interface HexEnPassantTarget {
  capturedPieceId: string;
  targetCells: CubeCoord[];
  availableUntilTurn: number;
}

export interface HexPendingPromotion {
  pieceId: string;
  targetCell: CubeCoord;
  options: HexPieceType[];
}

export interface HexChessState {
  mode: 'hexchess';
  pieces: HexPiece[];
  currentPlayer: HexPlayerIndex;
  turnNumber: number;
  enPassantTarget: HexEnPassantTarget | null;
  pendingPromotion: HexPendingPromotion | null;
  moveHistory: HexMove[];
  positionHashes: Record<string, number>;
  result: null | { winner: HexPlayerIndex | 'draw'; reason: HexEndReason };
}
