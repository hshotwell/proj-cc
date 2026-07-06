// src/types/boardView.ts
import type { CubeCoord, PlayerIndex, PieceColor } from './game';

export type BoardPieceType =
  | 'marble'
  | 'king'
  | 'queen'
  | 'rook'
  | 'bishop'
  | 'knight'
  | 'pawn'
  | 'soldier';

export type BoardHighlightKind =
  | 'selection'
  | 'legalMoveEmpty'
  | 'legalMoveCapture'
  | 'lastMoveFrom'
  | 'lastMoveTo'
  | 'check';

export interface BoardPiece {
  id: string;
  cell: CubeCoord;
  color: PieceColor;
  pieceType?: BoardPieceType;
  faded?: boolean;
}

export interface BoardHighlight {
  kind: BoardHighlightKind;
  cell: CubeCoord;
  playerIndex?: PlayerIndex;
}

export interface BoardMoveAnimation {
  pieceId: string;
  from: CubeCoord;
  to: CubeCoord;
  path?: CubeCoord[];
  separateCaptureCell?: CubeCoord;
  startedAt: number;
}

export interface BoardView {
  cells: CubeCoord[];
  homeZones: Map<PlayerIndex, CubeCoord[]>;
  pieces: BoardPiece[];
  highlights: BoardHighlight[];
  animatingMove: BoardMoveAnimation | null;
  rotation: number;
  activePlayerIndex: PlayerIndex;
}
