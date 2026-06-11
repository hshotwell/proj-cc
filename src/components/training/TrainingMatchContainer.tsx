'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Board } from '@/components/board';
import { SettingsPopup } from '@/components/SettingsPopup';
import { SettingsButton } from '@/components/SettingsButton';
import { TurnIndicator } from '@/components/game/TurnIndicator';
import { GameOverDialog } from '@/components/game/GameOverDialog';
import { MoveConfirmation } from '@/components/game/MoveConfirmation';
import { useAITurn } from '@/hooks/useAITurn';
import { usePlayerOpening } from '@/hooks/usePlayerOpening';
import { useLocalGameSync } from '@/hooks/useLocalGameSync';
import { useGameStore } from '@/store/gameStore';
import { useAIReviewStore } from '@/store/aiReviewStore';
import type { CapturedAIMove } from '@/store/aiReviewStore';
import { TrainingPanel } from './TrainingPanel';
import { countPiecesInGoal } from '@/game/state';
import type { CubeCoord, PlayerIndex } from '@/types/game';
import type { FlaggedMove } from '@/types/review';

function buildBoardSnapshot(
  gameState: NonNullable<ReturnType<typeof useGameStore.getState>['gameState']>
): FlaggedMove['boardAfter'] {
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

export function TrainingMatchContainer() {
  const { gameState, lastMoveInfo, gameId } = useGameStore();
  const {
    isPaused,
    pushHistory,
    setPendingFlag,
    captureMode,
    captureFrom,
    captureCell,
  } = useAIReviewStore();

  // Ref mirror of isPaused — checked inside worker.onmessage to discard
  // results that arrive after the user paused mid-flight.
  const isPausedRef = useRef(isPaused);
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  const { isAITurn } = useAITurn(true, isPaused, isPausedRef);
  usePlayerOpening();
  useLocalGameSync();

  // Capture pre-move game state when AI turn starts (before the move executes).
  const preMoveRef = useRef<typeof gameState>(null);
  useEffect(() => {
    if (isAITurn && gameState) {
      preMoveRef.current = gameState;
    }
  }, [isAITurn, gameState]);

  // When turnNumber advances the AI's move completed — push the pre-move snapshot.
  useEffect(() => {
    if (preMoveRef.current) {
      pushHistory(preMoveRef.current);
      preMoveRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.turnNumber]);

  // Detect completed AI moves and surface them as pending flags.
  const prevTurnRef = useRef<number | null>(null);
  useEffect(() => {
    if (!gameState || !lastMoveInfo) return;
    const { player } = lastMoveInfo;
    const aiConfig = gameState.aiPlayers?.[player];
    if (!aiConfig) return;
    if (prevTurnRef.current === gameState.turnNumber) return;
    prevTurnRef.current = gameState.turnNumber;

    const captured: CapturedAIMove = {
      gameId,
      turnNumber: gameState.turnNumber - 1,
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
    setPendingFlag(captured);
  }, [lastMoveInfo, gameState?.turnNumber, gameId]);

  // Route board clicks to capture store when in capture mode.
  const handleCaptureClick: ((coord: CubeCoord) => void) | undefined =
    captureMode !== null ? (coord) => captureCell(coord) : undefined;

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <div className="w-full max-w-5xl mx-auto px-2 sm:px-4 py-2 sm:py-4">
        <Link
          href="/home"
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-2 transition-colors"
        >
          ← Home
        </Link>

        <div className="md:grid md:grid-cols-[1fr_288px] md:gap-4 md:items-start">
          {/* Game column */}
          <div>
            <div className="relative w-full bg-white rounded-lg shadow-lg p-2 sm:p-4">
              <SettingsButton />
              <Board
                onCellClick={handleCaptureClick}
                highlightCoord={captureFrom ?? undefined}
              />
            </div>
            <MoveConfirmation />
            <div className="mt-2 sm:mt-4">
              <TurnIndicator />
            </div>
          </div>

          {/* Training panel column */}
          <TrainingPanel />
        </div>
      </div>

      <GameOverDialog />
      <SettingsPopup mode="game" />
    </div>
  );
}
