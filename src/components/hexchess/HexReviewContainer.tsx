'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { loadHexChessGame } from '@/game/hexchess/persistence';
import { createInitialState, applyMove, confirmPromotion } from '@/game/hexchess';
import { selectHexChessBoardView } from '@/store/hexChessStore';
import { useAIReviewStore } from '@/store/aiReviewStore';
import { Board } from '@/components/board/Board';
import { HexTurnIndicator } from '@/components/hexchess/HexTurnIndicator';
import { ColorSwatch } from '@/components/ui/SpecialSwatch';
import type { CubeCoord } from '@/types/game';
import { coordKey } from '@/game/coordinates';

interface HexReviewContainerProps {
  gameId: string;
}

export function HexReviewContainer({ gameId }: HexReviewContainerProps) {
  const saved = useMemo(() => loadHexChessGame(gameId), [gameId]);
  const [step, setStep] = useState(0);
  const [flagFormOpen, setFlagFormOpen] = useState(false);
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);

  const {
    hexFlags,
    captureMode, captureFrom, captureTo,
    startCapture, captureCell, cancelCapture,
    addHexFlag, removeHexFlag,
    exportHexText,
  } = useAIReviewStore();

  const states = useMemo(() => {
    if (!saved) return [];
    const arr = [createInitialState(saved.config)];
    for (const move of saved.moveHistory) {
      let next = applyMove(arr[arr.length - 1], move);
      if (next.pendingPromotion !== null && move.promotion !== null) {
        next = confirmPromotion(next, move.promotion);
      }
      arr.push(next);
    }
    return arr;
  }, [saved]);

  if (!saved) {
    return (
      <div className="p-4">
        <div className="text-gray-600 mb-2">Game not found.</div>
        <Link href="/replays" className="text-blue-600 hover:underline">
          Return to Replays
        </Link>
      </div>
    );
  }

  const currentState = states[step];
  const lastMove = step > 0 ? saved.moveHistory[step - 1] : null;
  const total = states.length - 1;
  const gameFlags = hexFlags.filter((f) => f.gameId === saved.id);

  const view = selectHexChessBoardView({
    state: currentState,
    config: saved.config,
    gameId: saved.id,
    selectedPieceId: null,
    legalMoveTargets: [],
    lastMove,
    animatingCapture: null,
    captureTimeoutId: null,
  } as never);

  const handleCellClick = (cell: CubeCoord) => {
    if (captureMode !== null) captureCell(cell);
  };

  // Details of the currently-displayed move (the move that produced `step`).
  const moveDetails = (() => {
    if (step === 0) return null;
    const move = saved.moveHistory[step - 1];
    const stateBefore = states[step - 1];
    const pieceType = stateBefore.pieces.find((p) => p.id === move.pieceId)?.type ?? 'unknown';
    const capturedType = move.capture
      ? stateBefore.pieces.find((p) => p.id === move.capture!.pieceId)?.type ?? null
      : null;
    return { move, pieceType, capturedType };
  })();

  const handleSaveFlag = () => {
    if (!moveDetails) return;
    const { move, pieceType, capturedType } = moveDetails;
    const stateAfter = states[step];
    addHexFlag({
      gameId: saved.id,
      moveIndex: step - 1,
      turnNumber: move.turnNumber,
      seat: move.player,
      difficulty: saved.config.ai?.[move.player],
      actualMove: {
        pieceType,
        from: { q: move.from.q, r: move.from.r },
        to: { q: move.to.q, r: move.to.r },
        capture: capturedType,
        promotion: move.promotion,
      },
      suggestedMove: captureFrom && captureTo
        ? { from: { q: captureFrom.q, r: captureFrom.r }, to: { q: captureTo.q, r: captureTo.r } }
        : undefined,
      note: note.trim(),
      boardAfter: {
        pieces: Object.fromEntries(
          stateAfter.pieces.map((p) => [coordKey(p.cell), { player: p.player, type: p.type }]),
        ),
      },
    });
    setNote('');
    cancelCapture();
    setFlagFormOpen(false);
  };

  const handleCancelFlag = () => {
    setNote('');
    cancelCapture();
    setFlagFormOpen(false);
  };

  const handleExport = async () => {
    const text = exportHexText(saved.id);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const blob = new Blob([text], { type: 'text/plain' });
      window.open(URL.createObjectURL(blob), '_blank');
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-4">
      <Link
        href="/replays"
        className="text-sm text-gray-500 hover:text-gray-800 mb-2 inline-block transition-colors"
      >
        &larr; Replays
      </Link>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Board + stepper */}
        <div className="flex-1 min-w-0">
          <div className="relative w-full bg-white rounded-lg shadow-lg mb-3">
            {view && <Board view={view} onCellClick={handleCellClick} />}
          </div>

          {/* Navigation controls */}
          <div className="flex items-center justify-between p-2 bg-gray-50 rounded mb-3">
            <div className="flex gap-1">
              <button
                onClick={() => setStep(0)}
                disabled={step === 0}
                className="px-2 py-1 rounded bg-gray-200 disabled:opacity-50 hover:bg-gray-300 transition-colors"
                aria-label="First move"
              >
                |&lt;
              </button>
              <button
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
                className="px-2 py-1 rounded bg-gray-200 disabled:opacity-50 hover:bg-gray-300 transition-colors"
                aria-label="Previous move"
              >
                &lt;
              </button>
              <button
                onClick={() => setStep((s) => Math.min(total, s + 1))}
                disabled={step === total}
                className="px-2 py-1 rounded bg-gray-200 disabled:opacity-50 hover:bg-gray-300 transition-colors"
                aria-label="Next move"
              >
                &gt;
              </button>
              <button
                onClick={() => setStep(total)}
                disabled={step === total}
                className="px-2 py-1 rounded bg-gray-200 disabled:opacity-50 hover:bg-gray-300 transition-colors"
                aria-label="Last move"
              >
                &gt;|
              </button>
            </div>
            <div className="text-sm text-gray-600">
              Move {step} / {total}
            </div>
          </div>

          <HexTurnIndicator state={currentState} config={saved.config} />
        </div>

        {/* Review panel */}
        <div className="w-full lg:w-80 flex-shrink-0 space-y-4">
          <div className="bg-white rounded-lg shadow p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Review
              </h3>
              {gameFlags.length > 0 && (
                <button
                  onClick={() => void handleExport()}
                  className="text-xs px-2 py-1 rounded border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                >
                  {copied ? '✓ Copied' : '⎘ Export'}
                </button>
              )}
            </div>

            {/* Current move summary + flag form */}
            {moveDetails ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <ColorSwatch
                    color={saved.config.players[moveDetails.move.player]!.color}
                    className="w-4 h-4 flex-shrink-0"
                  />
                  <span className="text-xs font-mono text-gray-600 bg-gray-50 rounded px-2 py-1 flex-1">
                    {moveDetails.pieceType} ({moveDetails.move.from.q},{moveDetails.move.from.r}) → ({moveDetails.move.to.q},{moveDetails.move.to.r})
                    {moveDetails.capturedType && <span className="ml-1 text-red-600">x {moveDetails.capturedType}</span>}
                    {moveDetails.move.promotion && <span className="ml-1 text-purple-600">={moveDetails.move.promotion}</span>}
                  </span>
                </div>

                {!flagFormOpen && (
                  <button
                    onClick={() => setFlagFormOpen(true)}
                    className="text-xs px-2 py-1 rounded border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
                  >
                    ⚑ Flag this move
                  </button>
                )}

                {flagFormOpen && (
                  <div className="space-y-3">
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
                        onClick={handleSaveFlag}
                        className="flex-1 text-xs font-medium py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
                      >
                        ⚑ Save flag
                      </button>
                      <button
                        onClick={handleCancelFlag}
                        className="flex-1 text-xs font-medium py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-400">
                Step to a move to flag it.
              </p>
            )}

            {/* Flag list */}
            {gameFlags.length > 0 && (
              <div className="space-y-1 max-h-96 overflow-y-auto border-t border-gray-100 pt-2">
                {gameFlags.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-start gap-1.5 text-xs text-gray-500 py-1.5 border-b border-gray-100 last:border-0"
                  >
                    <span className="text-red-400 mt-0.5 flex-shrink-0">⚑</span>
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => setStep(f.moveIndex + 1)}
                        className="font-medium hover:text-blue-600"
                      >
                        Move {f.moveIndex + 1}
                      </button>{' '}
                      {f.actualMove.pieceType} ({f.actualMove.from.q},{f.actualMove.from.r})→({f.actualMove.to.q},{f.actualMove.to.r})
                      {f.note && (
                        <div className="truncate italic text-gray-400 mt-0.5">&quot;{f.note}&quot;</div>
                      )}
                    </div>
                    <button
                      onClick={() => removeHexFlag(f.id)}
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
        </div>
      </div>
    </div>
  );
}
