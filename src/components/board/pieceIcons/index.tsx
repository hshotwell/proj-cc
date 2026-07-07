import type { BoardPieceType } from '@/types/boardView';
import { KingIcon } from './King';
import { QueenIcon } from './Queen';
import { RookIcon } from './Rook';
import { BishopIcon } from './Bishop';
import { KnightIcon } from './Knight';

export { KingIcon, QueenIcon, RookIcon, BishopIcon, KnightIcon };

export function pieceIconFor(type: BoardPieceType) {
  switch (type) {
    case 'king': return KingIcon;
    case 'queen': return QueenIcon;
    case 'rook': return RookIcon;
    case 'bishop': return BishopIcon;
    case 'knight': return KnightIcon;
    default: return null; // soldier, pawn, marble have no glyph
  }
}
