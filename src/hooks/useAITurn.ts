'use client';

import { useEffect, useRef } from 'react';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { isGameFullyOver } from '@/game/state';
import { AI_THINK_DELAY } from '@/types/ai';
import { serializeGameState } from '@/game/ai/workerClient';
import type { WorkerResponse } from '@/game/ai/workerClient';

export function useAITurn() {
  const {
    gameState,
    pendingConfirmation,
    animatingPiece,
  } = useGameStore();

  const thinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workerRef = useRef<Worker | null>(null);

  // Create / tear-down the worker once on mount
  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../game/ai/worker.ts', import.meta.url)
    );
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const isAITurn =
    gameState != null &&
    !isGameFullyOver(gameState) &&
    gameState.aiPlayers?.[gameState.currentPlayer] != null;

  // Phase 1: AI's turn, not pending, not animating -> think and make a move
  useEffect(() => {
    if (!isAITurn || pendingConfirmation || animatingPiece) return;
    if (!gameState) return;

    // Snapshot identifying state at dispatch time
    const turnSnapshot = gameState.turnNumber;
    const playerSnapshot = gameState.currentPlayer;

    thinkTimerRef.current = setTimeout(() => {
      const worker = workerRef.current;
      if (!worker) return;

      // Re-check state to avoid stale closure
      const current = useGameStore.getState();
      if (
        !current.gameState ||
        current.pendingConfirmation ||
        current.animatingPiece ||
        isGameFullyOver(current.gameState)
      ) {
        return;
      }

      const currentAI = current.gameState.aiPlayers?.[current.gameState.currentPlayer];
      if (!currentAI) return;

      const serialized = serializeGameState(current.gameState);

      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const { move } = e.data;
        if (!move) return;

        // Guard against stale results (user may have clicked undo/reset)
        const latest = useGameStore.getState();
        if (
          !latest.gameState ||
          latest.gameState.turnNumber !== turnSnapshot ||
          latest.gameState.currentPlayer !== playerSnapshot ||
          latest.pendingConfirmation ||
          latest.animatingPiece ||
          isGameFullyOver(latest.gameState)
        ) {
          return;
        }

        latest.selectPiece(move.from);
        // Small delay to let selectPiece state settle
        setTimeout(() => {
          const animate = useSettingsStore.getState().animateMoves;
          useGameStore.getState().makeMove(move.to, animate);
        }, 50);
      };

      worker.postMessage({
        state: serialized,
        difficulty: currentAI.difficulty,
        personality: currentAI.personality,
      });
    }, AI_THINK_DELAY);

    return () => {
      if (thinkTimerRef.current) {
        clearTimeout(thinkTimerRef.current);
        thinkTimerRef.current = null;
      }
    };
  }, [isAITurn, pendingConfirmation, animatingPiece, gameState?.currentPlayer, gameState?.turnNumber]);

  // Phase 2: Pending + not animating + AI turn -> auto-confirm after delay
  useEffect(() => {
    if (!isAITurn || !pendingConfirmation || animatingPiece) return;

    confirmTimerRef.current = setTimeout(() => {
      const current = useGameStore.getState();
      if (current.pendingConfirmation && !current.animatingPiece) {
        current.confirmMove();
      }
    }, 200);

    return () => {
      if (confirmTimerRef.current) {
        clearTimeout(confirmTimerRef.current);
        confirmTimerRef.current = null;
      }
    };
  }, [isAITurn, pendingConfirmation, animatingPiece]);

  return { isAITurn };
}
