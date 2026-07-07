'use client';

import type { HexMove } from '@/game/hexchess';

interface HexMoveIndicatorProps {
  lastMove: HexMove | null;
  canResign: boolean;
  onResign: () => void;
}

export function HexMoveIndicator({ lastMove, canResign, onResign }: HexMoveIndicatorProps) {
  const summary = lastMove ? formatMoveShort(lastMove) : 'Waiting for first move';
  return (
    <div className="p-2 flex items-center justify-between bg-gray-50 rounded">
      <span className="text-sm text-gray-700">{summary}</span>
      {canResign && (
        <button
          type="button"
          className="text-sm text-red-600 hover:underline"
          onClick={onResign}
        >
          Resign
        </button>
      )}
    </div>
  );
}

function formatMoveShort(move: HexMove): string {
  const fromStr = `(${move.from.q},${move.from.r})`;
  const toStr = `(${move.to.q},${move.to.r})`;
  const capture = move.capture ? 'x' : '→';
  const promoSuffix = move.promotion ? `=${move.promotion[0].toUpperCase()}` : '';
  return `${fromStr} ${capture} ${toStr}${promoSuffix}`;
}
