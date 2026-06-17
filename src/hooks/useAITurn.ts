'use client';

import { useEffect, useRef } from 'react';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTutorialStore } from '@/store/tutorialStore';
import { isGameFullyOver } from '@/game/state';
import { AI_THINK_DELAY } from '@/types/ai';
import { serializeGameState } from '@/game/ai/workerClient';
import type { WorkerResponse } from '@/game/ai/workerClient';
import { getValidMoves } from '@/game/moves';
import { coordKey } from '@/game/coordinates';
import { useOpeningStore } from '@/store/openingStore';
import { AI_STANDARD_MOVES, AI_STANDARD_MIRROR_MOVES, getMovesForOpening } from '@/game/ai/openingBook';

export function useAITurn(enabled: boolean = true) {
  const {
    gameState,
    pendingConfirmation,
    animatingPiece,
  } = useGameStore();

  const thinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workerRef = useRef<Worker | null>(null);
  // AI opening variant: picked once per game (standard or mirrored)
  const openingVariantRef = useRef<'standard' | 'standard-mirror' | null>(null);
  const prevTurnRef = useRef<number>(Infinity);

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
    enabled &&
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
        let { move } = e.data;
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

        // Tutorial: if the selected move is from the blocked piece, pick an alternative
        const blockedKey = useTutorialStore.getState().blockedPieceKey;
        if (blockedKey && coordKey(move.from) === blockedKey) {
          const gs = latest.gameState;
          const aiPlayer = gs.currentPlayer;
          const altMoves: typeof move[] = [];
          for (const [key, content] of gs.board) {
            if (content.type !== 'piece' || content.player !== aiPlayer || key === blockedKey) continue;
            const parts = key.split(',').map(Number);
            const coord = { q: parts[0], r: parts[1], s: -parts[0] - parts[1] };
            altMoves.push(...getValidMoves(gs, coord));
          }
          if (altMoves.length > 0) {
            move = altMoves[Math.floor(Math.random() * altMoves.length)];
          }
          // If no alternative, fall through and allow the blocked piece to move
        }

        latest.selectPiece(move.from);
        // Small delay to let selectPiece state settle
        setTimeout(() => {
          const animate = useSettingsStore.getState().animateMoves;
          useGameStore.getState().makeMove(move.to, animate);
        }, 50);
      };

      // Pick opening variant once per game; reset when turn number decreases (new game)
      const turn = current.gameState.turnNumber;
      if (openingVariantRef.current === null || turn < prevTurnRef.current) {
        openingVariantRef.current = Math.random() < 0.5 ? 'standard' : 'standard-mirror';
      }
      prevTurnRef.current = turn;

      // Resolve opening moves to pass directly to the worker.
      // For non-normal modes, pick a random custom opening tagged for that mode.
      // For normal mode, use the AI-internal standard opening (first 4 moves).
      const variant = current.gameState.playerPieceTypes?.[current.gameState.currentPlayer] ?? 'normal';
      const { customOpenings } = useOpeningStore.getState();
      const matching = customOpenings.filter((o) => (o.gameMode ?? 'normal') === variant);
      let openingMoves;
      if (matching.length > 0) {
        const chosen = matching[Math.floor(Math.random() * matching.length)];
        openingMoves = getMovesForOpening(chosen.id, customOpenings);
      } else if (variant === 'normal') {
        openingMoves = openingVariantRef.current === 'standard-mirror'
          ? AI_STANDARD_MIRROR_MOVES
          : AI_STANDARD_MOVES;
      }

      worker.postMessage({
        state: serialized,
        difficulty: currentAI.difficulty,
        personality: currentAI.personality,
        openingMoves,
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
