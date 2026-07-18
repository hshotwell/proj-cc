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
    // Unified pawn/peon: one icon regardless of which ruleset the engine
    // assigned (soldier = point-forward, pawn = edge-forward).
    case 'soldier': return PeonIcon;
    case 'pawn': return PeonIcon;
    default: return null;              // marble has no glyph
  }
}
