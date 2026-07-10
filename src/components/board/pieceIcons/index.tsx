import type { BoardPieceType } from '@/types/boardView';
import { KingIcon } from './King';
import { QueenIcon } from './Queen';
import { RookIcon } from './Rook';
import { BishopIcon } from './Bishop';
import { KnightIcon } from './Knight';
import { PeonIcon } from './Peon';
import { PawnIcon } from './Pawn';

export { KingIcon, QueenIcon, RookIcon, BishopIcon, KnightIcon, PeonIcon, PawnIcon };

export function pieceIconFor(type: BoardPieceType) {
  switch (type) {
    case 'king': return KingIcon;
    case 'queen': return QueenIcon;
    case 'rook': return RookIcon;
    case 'bishop': return BishopIcon;
    case 'knight': return KnightIcon;
    case 'soldier': return PeonIcon;   // Hex Chess "Soldier" is displayed as "Peon"
    case 'pawn': return PawnIcon;
    default: return null;              // marble has no glyph
  }
}
