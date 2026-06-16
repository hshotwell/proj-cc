'use client';

import { useState, useEffect } from 'react';
import type { PlayerIndex } from '@/types/game';
import type { GameState } from '@/types/game';
import type { BoardSnapshot } from '@/types/review';
import { getPlayerColor, getPlayerDisplayName } from '@/game/colors';
import { countPiecesInGoal } from '@/game/state';
import { useReplayStore } from '@/store/replayStore';
import { useAIReviewStore } from '@/store/aiReviewStore';
import { ColorSwatch } from '@/components/ui/SpecialSwatch';

function buildBoardSnapshot(gameState: GameState): BoardSnapshot {
  const pieces: BoardSnapshot['pieces'] = {};
  for (const [key, cell] of gameState.board) {
    if (cell.type !== 'piece') continue;
    const p = cell.player as PlayerIndex;
    if (!pieces[p]) pieces[p] = [];
    const [q, r] = key.split(',').map(Number);
    pieces[p]!.push({ q, r });
  }
  return { pieces };
}

interface ReviewPanelProps {
  editingMoveIndex: number | null;
  editingFlagId: string | null;
  onSave: () => void;
  onCancel: () => void;
}

export function ReviewPanel({ editingMoveIndex, editingFlagId, onSave, onCancel }: ReviewPanelProps) {
  const { moves, states, displayState } = useReplayStore();
  const {
    flags, activeGameId,
    captureMode, captureFrom, captureTo,
    startCapture, cancelCapture,
    addFlag, updateFlag, removeFlag,
    exportText,
  } = useAIReviewStore();

  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);

  const gameFlags = flags.filter((f) => f.gameId === activeGameId);

  // Pre-fill form when opening edit mode
  useEffect(() => {
    if (editingFlagId) {
      const flag = flags.find((f) => f.id === editingFlagId);
      setNote(flag?.note ?? '');
      if (flag?.suggestedMove) {
        const { from, to } = flag.suggestedMove;
        useAIReviewStore.setState({
          captureFrom: { q: from.q, r: from.r, s: -from.q - from.r },
          captureTo: { q: to.q, r: to.r, s: -to.q - to.r },
          captureMode: null,
        });
      } else {
        cancelCapture();
      }
    } else if (editingMoveIndex !== null) {
      // New flag — clear form
      setNote('');
      cancelCapture();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingFlagId, editingMoveIndex]);

  function handleSave() {
    if (editingMoveIndex === null || !displayState) return;
    const move = moves[editingMoveIndex];
    const stateAfter = states[editingMoveIndex + 1];
    if (!move || !stateAfter) return;

    const activePlayers = displayState.activePlayers;
    const player = (move.player ?? activePlayers[editingMoveIndex % activePlayers.length]) as PlayerIndex;
    const aiConfig = stateAfter.aiPlayers?.[player];

    const suggestedMove =
      captureFrom && captureTo
        ? { from: { q: captureFrom.q, r: captureFrom.r }, to: { q: captureTo.q, r: captureTo.r } }
        : undefined;

    if (editingFlagId) {
      updateFlag(editingFlagId, { suggestedMove, note: note.trim() });
    } else {
      addFlag({
        gameId: activeGameId,
        moveIndex: editingMoveIndex,
        turnNumber: move.turnNumber ?? editingMoveIndex + 1,
        player,
        difficulty: aiConfig?.difficulty,
        personality: aiConfig?.personality,
        piecesInGoal: countPiecesInGoal(stateAfter, player),
        actualMove: { from: { q: move.from.q, r: move.from.r }, to: { q: move.to.q, r: move.to.r } },
        suggestedMove,
        note: note.trim(),
        boardAfter: buildBoardSnapshot(stateAfter),
      });
    }

    cancelCapture();
    onSave();
  }

  function handleCancel() {
    setNote('');
    cancelCapture();
    onCancel();
  }

  async function handleExport() {
    const text = exportText(activeGameId ?? undefined);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const blob = new Blob([text], { type: 'text/plain' });
      window.open(URL.createObjectURL(blob), '_blank');
    }
  }

  // Flag form (create or edit)
  if (editingMoveIndex !== null && displayState) {
    const move = moves[editingMoveIndex];
    const activePlayers = displayState.activePlayers;
    const player = move
      ? ((move.player ?? activePlayers[editingMoveIndex % activePlayers.length]) as PlayerIndex)
      : activePlayers[0];
    const color = getPlayerColor(player, displayState.playerColors);
    const name = getPlayerDisplayName(player, activePlayers);

    return (
      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <div className="flex items-center gap-2">
          <ColorSwatch color={color} className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm font-semibold text-gray-800">{name}</span>
          <span className="text-xs text-gray-400 ml-auto">
            Move {editingMoveIndex + 1}
          </span>
        </div>

        {move && (
          <div className="text-xs font-mono text-gray-600 bg-gray-50 rounded px-2 py-1">
            ({move.from.q},{move.from.r}) → ({move.to.q},{move.to.r})
            {move.isJump && <span className="ml-2 text-green-600">jump</span>}
          </div>
        )}

        {/* Suggested move capture */}
        <div className="space-y-1">
          <div className="text-xs font-medium text-gray-700">
            Better move{' '}
            <span className="text-gray-400 font-normal">(click board)</span>
          </div>
          {captureMode === null && !captureTo && (
            <button
              onClick={startCapture}
              className="text-xs px-2 py-1 rounded border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
            >
              Select piece…
            </button>
          )}
          {captureMode === 'from' && (
            <div className="text-xs text-blue-700 font-medium">
              Click the piece that should move…
              <button onClick={cancelCapture} className="ml-2 text-gray-400 hover:text-gray-600">
                cancel
              </button>
            </div>
          )}
          {captureMode === 'to' && (
            <div className="text-xs text-blue-700 font-medium">
              From ({captureFrom?.q},{captureFrom?.r}) — click destination…
              <button onClick={cancelCapture} className="ml-2 text-gray-400 hover:text-gray-600">
                cancel
              </button>
            </div>
          )}
          {captureMode === null && captureFrom && captureTo && (
            <div className="flex items-center gap-1.5 text-xs text-green-700 font-medium">
              ({captureFrom.q},{captureFrom.r}) → ({captureTo.q},{captureTo.r})
              <button onClick={cancelCapture} className="text-gray-400 hover:text-gray-600">
                ✕
              </button>
            </div>
          )}
        </div>

        <textarea
          className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
          rows={4}
          placeholder="What should have happened and why?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="flex-1 text-xs font-medium py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
          >
            ⚑ {editingFlagId ? 'Update flag' : 'Save flag'}
          </button>
          <button
            onClick={handleCancel}
            className="flex-1 text-xs font-medium py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Flag list view
  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          Review
        </h3>
        {gameFlags.length > 0 && (
          <div className="flex gap-1">
            <button
              onClick={handleExport}
              className="text-xs px-2 py-1 rounded border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
            >
              {copied ? '✓ Copied' : '⎘ Export'}
            </button>
          </div>
        )}
      </div>

      {gameFlags.length === 0 ? (
        <p className="text-xs text-gray-400">
          Click ⚑ next to any move to flag it.
        </p>
      ) : (
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {gameFlags.map((f) => (
            <div
              key={f.id}
              className="flex items-start gap-1.5 text-xs text-gray-500 py-1.5 border-b border-gray-100 last:border-0"
            >
              <span className="text-red-400 mt-0.5 flex-shrink-0">⚑</span>
              <div className="flex-1 min-w-0">
                <span className="font-medium">
                  Move {(f.moveIndex ?? 0) + 1}
                </span>{' '}
                ({f.actualMove.from.q},{f.actualMove.from.r})→({f.actualMove.to.q},{f.actualMove.to.r})
                {f.note && (
                  <div className="truncate italic text-gray-400 mt-0.5">"{f.note}"</div>
                )}
              </div>
              <button
                onClick={() => removeFlag(f.id)}
                className="text-gray-300 hover:text-gray-500 flex-shrink-0"
                title="Remove flag"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
