'use client';
import type { CubeCoord, PieceColor } from '@/types/game';
import type { HexPieceType } from '@/game/hexchess/state';
import { pieceIconFor } from '@/components/board/pieceIcons';
import { getCSSColor } from '@/game/constants';

export interface PromotionPickerProps {
  /** Board cell where the promoting piece sits (reserved for future anchoring). */
  pieceCell: CubeCoord;
  /** Player's color — used to tint piece icons. */
  playerColor: PieceColor;
  /** Called with the chosen piece type when the user clicks a button. */
  onChoose: (choice: HexPieceType) => void;
  /** Called when the user clicks the backdrop. Optional in v1. */
  onCancel?: () => void;
}

const PROMOTION_OPTIONS: HexPieceType[] = ['queen', 'rook', 'bishop', 'knight'];

export function PromotionPicker({
  playerColor,
  onChoose,
  onCancel,
}: PromotionPickerProps){
  const fill = getCSSColor(playerColor);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onCancel}
    >
      {/* Semi-transparent backdrop */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Picker card — stop propagation so clicking inside doesn't fire onCancel */}
      <div
        className="relative bg-white rounded-lg shadow-xl p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-medium text-gray-800 mb-3">Promote to:</div>

        <div className="grid grid-cols-4 gap-2">
          {PROMOTION_OPTIONS.map((opt) => {
            const Icon = pieceIconFor(opt)!;
            return (
              <button
                key={opt}
                onClick={() => onChoose(opt)}
                className="w-16 h-16 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                aria-label={`Promote to ${opt}`}
              >
                <Icon size={48} fill={fill} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
