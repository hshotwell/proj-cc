'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Board } from '@/components/board';
import { SettingsButton } from '@/components/SettingsButton';
import { SettingsPopup } from '@/components/SettingsPopup';
import { useReplayStore } from '@/store/replayStore';
import { useAIReviewStore } from '@/store/aiReviewStore';
import { ReviewMoveHistory } from './ReviewMoveHistory';
import { ReviewPanel } from './ReviewPanel';
import type { CubeCoord } from '@/types/game';

export function ReviewContainer() {
  const router = useRouter();
  const {
    moves, currentStep,
    stepForward, stepBackward, goToStep, goToStart, goToEnd,
    closeReplay,
  } = useReplayStore();
  const { flags, activeGameId, captureMode, captureFrom, captureCell, setActiveGameId } = useAIReviewStore();

  const [editingMoveIndex, setEditingMoveIndex] = useState<number | null>(null);
  const [editingFlagId, setEditingFlagId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'moves' | 'review'>('moves');

  const totalMoves = moves.length;

  const gameFlags = flags.filter((f) => f.gameId === activeGameId);
  const flaggedMoveIndices = new Set(
    gameFlags
      .map((f) => f.moveIndex)
      .filter((i): i is number => i !== undefined)
  );

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          stepBackward();
          break;
        case 'ArrowRight':
          e.preventDefault();
          stepForward();
          break;
        case 'Home':
          e.preventDefault();
          goToStart();
          break;
        case 'End':
          e.preventDefault();
          goToEnd();
          break;
        case 'Escape':
          if (editingMoveIndex !== null) {
            setEditingMoveIndex(null);
            setEditingFlagId(null);
          }
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [stepForward, stepBackward, goToStart, goToEnd, editingMoveIndex]);

  function handleFlagClick(moveIndex: number) {
    const existing = gameFlags.find((f) => f.moveIndex === moveIndex);
    goToStep(moveIndex + 1);
    setEditingMoveIndex(moveIndex);
    setEditingFlagId(existing?.id ?? null);
    setActiveTab('review');
  }

  function handleSave() {
    setEditingMoveIndex(null);
    setEditingFlagId(null);
  }

  function handleCancel() {
    setEditingMoveIndex(null);
    setEditingFlagId(null);
  }

  const handleCaptureClick: ((coord: CubeCoord) => void) | undefined =
    captureMode !== null ? (coord) => captureCell(coord) : undefined;

  const handleClose = () => {
    closeReplay();
    setActiveGameId(null);
    router.push('/replays');
  };

  const bottomBar = (
    <div className="flex items-center gap-2 bg-white rounded-lg shadow px-3 py-2 mt-2">
      <button
        onClick={goToStart}
        disabled={currentStep === 0}
        className="px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title="First move (Home)"
      >
        |&lt;
      </button>
      <button
        onClick={stepBackward}
        disabled={currentStep === 0}
        className="px-3 py-1 text-xs font-medium rounded bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title="Previous (←)"
      >
        &lt;
      </button>
      <span className="text-xs text-gray-500 w-24 text-center flex-shrink-0">
        Move {currentStep} of {totalMoves}
      </span>
      <input
        type="range"
        min={0}
        max={totalMoves}
        value={currentStep}
        onChange={(e) => goToStep(Number(e.target.value))}
        className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
      />
      <button
        onClick={stepForward}
        disabled={currentStep >= totalMoves}
        className="px-3 py-1 text-xs font-medium rounded bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title="Next (→)"
      >
        &gt;
      </button>
      <button
        onClick={goToEnd}
        disabled={currentStep >= totalMoves}
        className="px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title="Last move (End)"
      >
        &gt;|
      </button>
      <button
        onClick={handleClose}
        className="ml-2 px-3 py-1 text-xs font-medium rounded bg-gray-900 text-white hover:bg-gray-800 transition-colors flex-shrink-0"
      >
        Close Review
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 py-2 sm:py-4">
        <Link
          href="/home"
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-2 transition-colors"
        >
          ← Home
        </Link>

        {/* Desktop: three columns */}
        <div className="hidden lg:grid lg:grid-cols-[1fr_14rem_18rem] lg:gap-4 lg:items-start">
          {/* Board */}
          <div>
            <div className="relative w-full bg-white rounded-lg shadow-lg p-2 sm:p-4">
              <SettingsButton />
              <Board
                onCellClick={handleCaptureClick}
                highlightCoord={captureFrom ?? undefined}
              />
            </div>
            {bottomBar}
          </div>

          {/* Move history */}
          <div
            className="bg-white rounded-lg shadow p-2 sticky top-4 overflow-y-auto"
            style={{ maxHeight: 'calc(100vh - 2rem)' }}
          >
            <ReviewMoveHistory
              flaggedMoveIndices={flaggedMoveIndices}
              editingMoveIndex={editingMoveIndex}
              onFlagClick={handleFlagClick}
            />
          </div>

          {/* Review panel */}
          <div className="sticky top-4">
            <ReviewPanel
              editingMoveIndex={editingMoveIndex}
              editingFlagId={editingFlagId}
              onSave={handleSave}
              onCancel={handleCancel}
            />
          </div>
        </div>

        {/* Mobile: board + tabs */}
        <div className="lg:hidden space-y-2">
          <div className="relative w-full bg-white rounded-lg shadow-lg p-2">
            <SettingsButton />
            <Board
              onCellClick={handleCaptureClick}
              highlightCoord={captureFrom ?? undefined}
            />
          </div>

          {/* Tab strip */}
          <div className="flex border-b border-gray-200 bg-white rounded-t-lg shadow-sm">
            {(['moves', 'review'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab === 'moves' ? 'Moves' : `Review${gameFlags.length > 0 ? ` (${gameFlags.length})` : ''}`}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-b-lg shadow p-3">
            {activeTab === 'moves' ? (
              <ReviewMoveHistory
                flaggedMoveIndices={flaggedMoveIndices}
                editingMoveIndex={editingMoveIndex}
                onFlagClick={handleFlagClick}
              />
            ) : (
              <ReviewPanel
                editingMoveIndex={editingMoveIndex}
                editingFlagId={editingFlagId}
                onSave={handleSave}
                onCancel={handleCancel}
              />
            )}
          </div>

          {bottomBar}
        </div>
      </div>

      <SettingsPopup mode="replay" />
    </div>
  );
}
