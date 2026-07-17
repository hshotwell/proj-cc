import type { CubeCoord, PieceColor } from '@/types/game';
import type { HexLayoutSnapshot } from './geometry';

export type HexPieceType =
  | 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn' | 'soldier';

// Seat indices are unified with Chinese Checkers player indices: a seat's
// number IS its home triangle (0=top, 4=top-right, 3=bottom-right, 2=bottom,
// 1=bottom-left, 5=top-left). 2-player hex chess uses seats [0, 2].
export type HexPlayerIndex = 0 | 1 | 2 | 3 | 4 | 5;
export type HexChessDifficulty = 'easy' | 'medium' | 'hard';
export type HexEndReason =
  | 'checkmate' | 'stalemate' | 'repetition' | 'insufficient-material'
  | 'resignation' | 'king-capture';

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
  /** Seats in clockwise turn order (from ACTIVE_PLAYERS[count]). */
  seats: HexPlayerIndex[];
  /** Per-seat player config, keyed by seat index. */
  players: Partial<Record<HexPlayerIndex, HexChessPlayerConfig>>;
  layoutPreset: 'v1-default' | 'custom';
  /** Legacy standard-board option; ignored by new games (peon rules always). */
  soldierVariant?: 'soldier' | 'pawn';
  // ai maps seat → difficulty. An empty object (or null) means no AI.
  ai: null | Partial<Record<HexPlayerIndex, HexChessDifficulty>>;
  /** Custom board snapshot; absent = standard v1 board. */
  layout?: HexLayoutSnapshot;
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
  /** Seats in turn order (copy of config.seats). */
  activePlayers: HexPlayerIndex[];
  /** Seats whose king has been captured (or who resigned), in elimination order. */
  eliminated: HexPlayerIndex[];
  enPassantTarget: HexEnPassantTarget | null;
  pendingPromotion: HexPendingPromotion | null;
  moveHistory: HexMove[];
  positionHashes: Record<string, number>;
  result: null | { winner: HexPlayerIndex | 'draw'; reason: HexEndReason };
  /** Custom board snapshot; absent = standard v1 board. */
  layout?: HexLayoutSnapshot;
}

/**
 * 2-player games keep classic chess rules (checkmate, no self-check).
 * 3+ player games use king-capture rules: check is advisory only and a
 * player is eliminated when their king is actually captured.
 */
export function rulesModeOf(state: HexChessState): 'checkmate' | 'king-capture' {
  return state.activePlayers.length === 2 ? 'checkmate' : 'king-capture';
}
