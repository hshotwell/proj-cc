'use client';

import { useState, useEffect, useRef } from 'react';
import { useGameStore } from '@/store/gameStore';
import { useReviewStore } from '@/store/reviewStore';
import { countPiecesInGoal } from '@/game/state';
import { FlagMoveModal } from './FlagMoveModal';
import type { PlayerIndex } from '@/types/game';
import type { FlaggedMove } from '@/types/review';

type CapturedAIMove = Omit<FlaggedMove, 'id' | 'timestamp' | 'note' | 'suggestedMove'>;

function buildBoardSnapshot(gameState: NonNullable<ReturnType<typeof useGameStore.getState>['gameState']>) {
  const pieces: FlaggedMove['boardAfter']['pieces'] = {};
  for (const [key, cell] of gameState.board) {
    if (cell.type !== 'piece') continue;
    const p = cell.player as PlayerIndex;
    if (!pieces[p]) pieces[p] = [];
    const [q, r] = key.split(',').map(Number);
    pieces[p]!.push({ q, r });
  }
  return { pieces };
}

export function ReviewControls({ gameId }: { gameId: string | null }) {
  const { gameState, lastMoveInfo } = useGameStore();
  const { isPaused, togglePause, flags, addFlag, removeFlag, clearFlags, exportText } = useReviewStore();

  const [flaggable, setFlaggable] = useState<CapturedAIMove | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const prevTurnRef = useRef<number | null>(null);

  // Detect a completed AI move: lastMoveInfo changed, player was AI, and the turn advanced
  useEffect(() => {
    if (!gameState || !lastMoveInfo) return;
    const { player } = lastMoveInfo;
    const aiConfig = gameState.aiPlayers?.[player];
    if (!aiConfig) return;

    // Only capture once per turn (guard against re-renders)
    if (prevTurnRef.current === gameState.turnNumber) return;
    prevTurnRef.current = gameState.turnNumber;
    if (modalOpen) return;

    const captured: CapturedAIMove = {
      gameId,
      turnNumber: gameState.turnNumber - 1, // the turn that just finished
      player,
      difficulty: aiConfig.difficulty,
      personality: aiConfig.personality,
      piecesInGoal: countPiecesInGoal(gameState, player),
      actualMove: {
        from: { q: lastMoveInfo.origin.q, r: lastMoveInfo.origin.r },
        to: { q: lastMoveInfo.destination.q, r: lastMoveInfo.destination.r },
      },
      boardAfter: buildBoardSnapshot(gameState),
    };
    setFlaggable(captured);
  }, [lastMoveInfo, gameState?.turnNumber, gameId]);

  const hasAI = gameState != null &&
    gameState.activePlayers.some((p) => gameState.aiPlayers?.[p] != null);

  if (!hasAI) return null;

  async function handleExport() {
    const text = exportText();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: open in a new tab as plain text
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mt-2 px-1">
        {/* Pause / Resume */}
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

        {/* Flag last move */}
        {flaggable && (
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
          >
            ⚑ Flag last move
          </button>
        )}

        {/* Flags count + export + clear */}
        {flags.length > 0 && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-xs text-gray-500">{flags.length} flag{flags.length !== 1 ? 's' : ''}</span>
            <button
              onClick={handleExport}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
            >
              {copied ? '✓ Copied' : '⎘ Copy export'}
            </button>
            <button
              onClick={() => { if (confirm('Clear all flags?')) clearFlags(); }}
              className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
              title="Clear all flags"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Per-flag remove buttons (collapsed list) */}
      {flags.length > 0 && (
        <div className="mt-1 px-1 space-y-1">
          {flags.map((f) => (
            <div key={f.id} className="flex items-center gap-2 text-xs text-gray-500">
              <span className="font-medium text-red-500">⚑</span>
              <span>Turn {f.turnNumber} — P{f.player} {f.actualMove.from.q},{f.actualMove.from.r} → {f.actualMove.to.q},{f.actualMove.to.r}</span>
              {f.note && <span className="truncate max-w-32 italic">"{f.note}"</span>}
              <button
                onClick={() => removeFlag(f.id)}
                className="ml-auto text-gray-300 hover:text-gray-500"
                title="Remove flag"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && flaggable && (
        <FlagMoveModal
          captured={flaggable}
          onSave={(flag) => {
            addFlag(flag);
            setFlaggable(null);
            setModalOpen(false);
          }}
          onCancel={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
