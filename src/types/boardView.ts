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
  | 'check'
  | 'preMoveFrom'
  | 'preMoveTo';

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
  /** CSS color of the active player. Used to color legal-move dots. */
  activePlayerColor?: string;
  /** Rotation angle (deg) to use on initial mount. */
  initialRotation?: number;
  /** Rotation angle (deg) to use when rotateBoard is on and the active player changes. */
  activeRotation?: number;
  /** True when the active player is an AI seat — used to skip rotation on AI turns. */
  activePlayerIsAI?: boolean;
  /** Fires once per capture — cell + color of the captured piece for particle burst. */
  captureBurst?: { cell: CubeCoord; color: string; key: string } | null;
  /** Maps every player index in the game to their CSS color. Used to resolve
   * a *specific* player's color (e.g. the local human's) independent of
   * whose turn it currently is. */
  playerColors?: Record<number, string>;
  /** Stable identity for the current game/replay, used to reset local-only
   * UI state (e.g. board annotations) when it changes. */
  gameId?: string;
}
