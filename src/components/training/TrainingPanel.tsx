'use client';

import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { useAIReviewStore } from '@/store/aiReviewStore';

export function TrainingPanel() {
  const { gameState } = useGameStore();
  const {
    isPaused, togglePause,
    stateHistory,
    pendingFlag, setPendingFlag,
    captureMode, captureFrom, captureTo,
    startCapture, cancelCapture,
    flags, addFlag, removeFlag, clearFlags,
    exportText,
  } = useAIReviewStore();

  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  function handleRewind() {
    const prev = useAIReviewStore.getState().popHistory();
    if (!prev) return;
    if (!isPaused) togglePause();
    useGameStore.setState({
      gameState: prev,
      lastMoveInfo: null,
      selectedPiece: null,
      pendingConfirmation: false,
      animatingPiece: null,
      animationPath: null,
      animationStep: 0,
    });
    setPendingFlag(null);
  }

  function handleSaveFlag() {
    if (!pendingFlag) return;
    const suggestedMove =
      captureFrom && captureTo
        ? {
            from: { q: captureFrom.q, r: captureFrom.r },
            to: { q: captureTo.q, r: captureTo.r },
          }
        : undefined;
    addFlag({ ...pendingFlag, note: note.trim(), suggestedMove });
    setNote('');
    setPendingFlag(null);
  }

  function handleDismiss() {
    setPendingFlag(null);
    setNote('');
  }

  async function handleExport() {
    const text = exportText();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const blob = new Blob([text], { type: 'text/plain' });
      window.open(URL.createObjectURL(blob), '_blank');
    }
  }

  const panelContent = (
    <div className="bg-white rounded-lg shadow p-4 space-y-4">
      {/* Zone 1: Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={togglePause}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
            isPaused
              ? 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'
              : 'bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100'
          }`}
        >
          {isPaused ? '▶ Resume' : '⏸ Pause'}
        </button>
        <button
          onClick={handleRewind}
          disabled={stateHistory.length === 0}
          className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 bg-gray-50 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          ← Back
        </button>
        <span className="ml-auto text-xs text-gray-400">
          Turn {gameState?.turnNumber ?? 1}
        </span>
      </div>

      {/* Zone 2: Flag Zone */}
      {pendingFlag && (
        <div className="border border-red-200 rounded-lg p-3 space-y-3 bg-red-50/30">
          <div className="text-xs text-gray-600 space-y-0.5">
            <div className="font-medium text-gray-800 text-sm">Flag this move?</div>
            <div>
              Turn {pendingFlag.turnNumber} · P{pendingFlag.player} ·{' '}
              {pendingFlag.difficulty}/{pendingFlag.personality}
            </div>
            <div>
              Move: ({pendingFlag.actualMove.from.q},{pendingFlag.actualMove.from.r}) →{' '}
              ({pendingFlag.actualMove.to.q},{pendingFlag.actualMove.to.r})
            </div>
            <div>{pendingFlag.piecesInGoal}/10 in goal</div>
          </div>

          {/* Click-capture for suggested move */}
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
                <button
                  onClick={cancelCapture}
                  className="ml-2 text-gray-400 hover:text-gray-600"
                >
                  cancel
                </button>
              </div>
            )}
            {captureMode === 'to' && (
              <div className="text-xs text-blue-700 font-medium">
                From ({captureFrom?.q},{captureFrom?.r}) — click destination…
                <button
                  onClick={cancelCapture}
                  className="ml-2 text-gray-400 hover:text-gray-600"
                >
                  cancel
                </button>
              </div>
            )}
            {captureMode === null && captureFrom && captureTo && (
              <div className="flex items-center gap-1.5 text-xs text-green-700 font-medium">
                ({captureFrom.q},{captureFrom.r}) → ({captureTo.q},{captureTo.r})
                <button
                  onClick={cancelCapture}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          <textarea
            className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
            rows={3}
            placeholder="What should have happened?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          <div className="flex gap-2">
            <button
              onClick={handleSaveFlag}
              className="flex-1 text-xs font-medium py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
            >
              ⚑ Save flag
            </button>
            <button
              onClick={handleDismiss}
              className="flex-1 text-xs font-medium py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Zone 3: Saved flags */}
      {flags.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-700">
              {flags.length} flag{flags.length !== 1 ? 's' : ''}
            </span>
            <div className="flex gap-1">
              <button
                onClick={handleExport}
                className="text-xs px-2 py-1 rounded border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
              >
                {copied ? '✓ Copied' : '⎘ Export'}
              </button>
              <button
                onClick={() => {
                  if (confirm('Clear all flags?')) clearFlags();
                }}
                className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {flags.map((f) => (
              <div
                key={f.id}
                className="flex items-start gap-1.5 text-xs text-gray-500 py-1 border-b border-gray-100 last:border-0"
              >
                <span className="text-red-400 mt-0.5 flex-shrink-0">⚑</span>
                <div className="flex-1 min-w-0">
                  <span className="font-medium">T{f.turnNumber} P{f.player}</span>
                  {' '}({f.actualMove.from.q},{f.actualMove.from.r})→(
                  {f.actualMove.to.q},{f.actualMove.to.r})
                  {f.note && (
                    <div className="truncate italic text-gray-400">"{f.note}"</div>
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
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:block">{panelContent}</div>

      {/* Mobile collapsible */}
      <div className="md:hidden mt-2">
        <button
          onClick={() => setMobileOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-2 bg-white rounded-lg shadow text-sm font-medium text-gray-700"
        >
          <span>
            Training{flags.length > 0 ? ` (${flags.length} flags)` : ''}
          </span>
          <span>{mobileOpen ? '▲' : '▼'}</span>
        </button>
        {mobileOpen && <div className="mt-1">{panelContent}</div>}
      </div>
    </>
  );
}
