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
import { lookupTablebase } from '@/game/ai/tablebase';
import { getPiecesOutsideGoal, getEmptyGoalsByDepth } from '@/game/ai/endgame';
import { getSerializedPatternCache } from '@/game/training/patternCache';

/**
 * @param enabled     Set false to disable AI entirely (e.g. during tutorial).
 * @param isPaused    Reactive pause flag — prevents new think timers when true.
 * @param isPausedRef Ref mirror of isPaused — checked inside worker.onmessage to
 *                    discard results that arrive after the user paused mid-flight.
 */
export function useAITurn(
  enabled: boolean = true,
  isPaused: boolean = false,
  isPausedRef?: React.RefObject<boolean>,
) {
  const {
    gameState,
    pendingConfirmation,
    animatingPiece,
  } = useGameStore();

  const thinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const openingVariantRef = useRef<'standard' | 'standard-mirror' | null>(null);
  const prevTurnRef = useRef<number>(Infinity);

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
    !isPaused &&
    gameState != null &&
    !isGameFullyOver(gameState) &&
    gameState.aiPlayers?.[gameState.currentPlayer] != null;

  useEffect(() => {
    if (!isAITurn || pendingConfirmation || animatingPiece) return;
    if (!gameState) return;

    const turnSnapshot = gameState.turnNumber;
    const playerSnapshot = gameState.currentPlayer;

    thinkTimerRef.current = setTimeout(() => {
      const worker = workerRef.current;
      if (!worker) return;

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

        // Discard result if user paused after this think was dispatched
        if (isPausedRef?.current) return;

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
        }

        latest.selectPiece(move.from);
        setTimeout(() => {
          const animate = useSettingsStore.getState().animateMoves;
          useGameStore.getState().makeMove(move.to, animate);
        }, 50);
      };

      const turn = current.gameState.turnNumber;
      if (openingVariantRef.current === null || turn < prevTurnRef.current) {
        openingVariantRef.current = Math.random() < 0.5 ? 'standard' : 'standard-mirror';
      }
      prevTurnRef.current = turn;

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

      const tbPlayer = current.gameState.currentPlayer;
      const outsidePieces = getPiecesOutsideGoal(current.gameState, tbPlayer);
      if (outsidePieces.length >= 1 && outsidePieces.length <= 2) {
        const emptyGoals = getEmptyGoalsByDepth(current.gameState, tbPlayer);
        const tbEntry = lookupTablebase(outsidePieces, emptyGoals);
        if (tbEntry) {
          const fromCoord = { q: tbEntry.from.q, r: tbEntry.from.r, s: -tbEntry.from.q - tbEntry.from.r };
          const tbMoves = getValidMoves(current.gameState, fromCoord);
          const tbMove = tbMoves.find(m => m.to.q === tbEntry.to.q && m.to.r === tbEntry.to.r);
          if (tbMove) {
            if (isPausedRef?.current) return;
            useGameStore.getState().selectPiece(tbMove.from);
            setTimeout(() => {
              const animate = useSettingsStore.getState().animateMoves;
              useGameStore.getState().makeMove(tbMove.to, animate);
            }, 50);
            return;
          }
        }
      }

      worker.postMessage({
        state: serialized,
        difficulty: currentAI.difficulty,
        personality: currentAI.personality,
        openingMoves,
        patternCache: getSerializedPatternCache(),
      });
    }, AI_THINK_DELAY);

    return () => {
      if (thinkTimerRef.current) {
        clearTimeout(thinkTimerRef.current);
        thinkTimerRef.current = null;
      }
    };
  }, [isAITurn, pendingConfirmation, animatingPiece, gameState?.currentPlayer, gameState?.turnNumber, isPaused]);

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
  }, [isAITurn, pendingConfirmation, animatingPiece, isPaused]);

  return { isAITurn };
}
