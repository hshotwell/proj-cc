'use client';

import type { ComponentType } from 'react';
import type { PieceIconProps } from '@/components/board/pieceIcons/shading';
import { KingIcon, QueenIcon, RookIcon, BishopIcon, KnightIcon, PeonIcon } from '@/components/board/pieceIcons';
import type { HexLayoutPieceType } from '@/game/hexchess';

// The unified pawn/peon uses the Peon glyph — the piece players know from games.
const ROWS: { type: HexLayoutPieceType; label: string; Icon: ComponentType<PieceIconProps> }[] = [
  { type: 'pawn', label: 'Pawn', Icon: PeonIcon },
  { type: 'knight', label: 'Knight', Icon: KnightIcon },
  { type: 'bishop', label: 'Bishop', Icon: BishopIcon },
  { type: 'rook', label: 'Rook', Icon: RookIcon },
  { type: 'queen', label: 'Queen', Icon: QueenIcon },
  { type: 'king', label: 'King', Icon: KingIcon },
];

/** Canvas rendering reuses the same icon mapping as the grid. */
export const HEX_PIECE_ICONS: Record<HexLayoutPieceType, ComponentType<PieceIconProps>> =
  Object.fromEntries(ROWS.map(r => [r.type, r.Icon])) as Record<HexLayoutPieceType, ComponentType<PieceIconProps>>;

export interface HexBrush { type: HexLayoutPieceType; color: string }

export function HexPieceGrid({
  colors, brush, onSelect, usedColors, darkMode,
}: {
  colors: string[];
  brush: HexBrush;
  onSelect: (b: HexBrush) => void;
  /** Colors currently assigned to an army (shown with an underline). */
  usedColors: Set<string>;
  darkMode: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {ROWS.map(({ type, label, Icon }) => (
        <div key={type} className="flex items-center gap-0.5">
          {colors.map((color) => {
            const selected = brush.type === type && brush.color === color;
            return (
              <button
                key={color}
                onClick={() => onSelect({ type, color })}
                title={`${label} (${color})`}
                className={`p-0.5 rounded transition-all ${
                  selected
                    ? `ring-2 ring-blue-500 ${darkMode ? 'ring-offset-gray-800' : ''} ring-offset-1`
                    : 'hover:scale-110'
                } ${usedColors.has(color) ? 'border-b-2 border-blue-400' : 'border-b-2 border-transparent'}`}
              >
                <Icon size={18} fill={color} outlined />
              </button>
            );
          })}
          <span className={`text-[10px] ml-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{label}</span>
        </div>
      ))}
    </div>
  );
}
