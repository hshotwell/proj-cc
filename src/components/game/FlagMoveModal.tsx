'use client';

import { useState } from 'react';
import type { PlayerIndex } from '@/types/game';
import type { FlaggedMove } from '@/types/review';

interface CapturedMove {
  gameId: string | null;
  turnNumber: number;
  player: PlayerIndex;
  difficulty: string;
  personality: string;
  piecesInGoal: number;
  actualMove: { from: { q: number; r: number }; to: { q: number; r: number } };
  boardAfter: FlaggedMove['boardAfter'];
}

interface Props {
  captured: CapturedMove;
  onSave: (flag: Omit<FlaggedMove, 'id' | 'timestamp'>) => void;
  onCancel: () => void;
}

function coordLabel(c: { q: number; r: number }) {
  return `(${c.q}, ${c.r})`;
}

export function FlagMoveModal({ captured, onSave, onCancel }: Props) {
  const [note, setNote] = useState('');
  const [sugFromQ, setSugFromQ] = useState('');
  const [sugFromR, setSugFromR] = useState('');
  const [sugToQ, setSugToQ] = useState('');
  const [sugToR, setSugToR] = useState('');

  const hasSuggested =
    sugFromQ !== '' && sugFromR !== '' && sugToQ !== '' && sugToR !== '';

  function handleSave() {
    const flag: Omit<FlaggedMove, 'id' | 'timestamp'> = {
      ...captured,
      note: note.trim(),
      ...(hasSuggested && {
        suggestedMove: {
          from: { q: parseInt(sugFromQ, 10), r: parseInt(sugFromR, 10) },
          to: { q: parseInt(sugToQ, 10), r: parseInt(sugToR, 10) },
        },
      }),
    };
    onSave(flag);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4">
        <h2 className="font-semibold text-gray-800">Flag AI Move</h2>

        <div className="text-sm text-gray-600 space-y-1">
          <div>
            <span className="font-medium">Turn:</span> {captured.turnNumber} &nbsp;
            <span className="font-medium">Player:</span> {captured.player} &nbsp;
            <span className="font-medium">({captured.difficulty}/{captured.personality})</span>
          </div>
          <div>
            <span className="font-medium">Move:</span>{' '}
            {coordLabel(captured.actualMove.from)} → {coordLabel(captured.actualMove.to)}
          </div>
          <div>
            <span className="font-medium">Pieces in goal:</span> {captured.piecesInGoal}/10
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            What should have happened? (note)
          </label>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
            rows={3}
            placeholder="e.g. should have moved (3,-5) deeper to (3,-6) to unblock entry"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            autoFocus
          />
        </div>

        <div>
          <div className="text-sm font-medium text-gray-700 mb-1">
            Suggested move coords <span className="text-gray-400 font-normal">(optional)</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <div className="text-xs text-gray-500 mb-0.5">From q, r</div>
              <div className="flex gap-1">
                <input
                  type="number"
                  placeholder="q"
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                  value={sugFromQ}
                  onChange={(e) => setSugFromQ(e.target.value)}
                />
                <input
                  type="number"
                  placeholder="r"
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                  value={sugFromR}
                  onChange={(e) => setSugFromR(e.target.value)}
                />
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">To q, r</div>
              <div className="flex gap-1">
                <input
                  type="number"
                  placeholder="q"
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                  value={sugToQ}
                  onChange={(e) => setSugToQ(e.target.value)}
                />
                <input
                  type="number"
                  placeholder="r"
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                  value={sugToR}
                  onChange={(e) => setSugToR(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg transition-colors"
          >
            Save flag
          </button>
          <button
            onClick={onCancel}
            className="flex-1 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium py-2 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
