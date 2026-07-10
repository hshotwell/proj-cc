'use client';
import { useEffect, useRef } from 'react';
import { useHexChessStore } from '@/store/hexChessStore';
import { createHexChessWorker, analyzeWithWorker } from '@/game/ai/hexchess/workerClient';
import type { HexChessDifficulty } from '@/game/hexchess';

const DIFFICULTY_BUDGET: Record<HexChessDifficulty, { budgetMs: number; maxDepth: number }> = {
  easy: { budgetMs: 300, maxDepth: 2 },
  medium: { budgetMs: 2000, maxDepth: 4 },
  hard: { budgetMs: 8000, maxDepth: 6 },
};

export { DIFFICULTY_BUDGET };

export function useHexChessAITurn(enabled: boolean = true) {
  const state = useHexChessStore(s => s.state);
  const config = useHexChessStore(s => s.config);
  const workerRef = useRef<Worker | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    workerRef.current = createHexChessWorker();
    // Reset busy flag when we (re)mount. In React StrictMode dev double-mount, the
    // previous worker is terminated in cleanup which aborts its .then/.finally chain
    // and leaves busyRef stuck at true forever, blocking every subsequent AI turn.
    busyRef.current = false;
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      busyRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !state || !config || state.result !== null) return;
    if (state.pendingPromotion !== null) return;
    if (config.ai === null) {
      console.debug('[hexchess AI] skipped: config.ai is null');
      return;
    }
    const difficultyForTurn = config.ai[state.currentPlayer];
    if (!difficultyForTurn) {
      console.debug(`[hexchess AI] skipped: player ${state.currentPlayer} is human (config.ai=${JSON.stringify(config.ai)})`);
      return;
    }
    if (busyRef.current) {
      console.debug(`[hexchess AI] skipped: busyRef stuck (player ${state.currentPlayer}, turn ${state.turnNumber})`);
      return;
    }
    if (!workerRef.current) {
      console.debug('[hexchess AI] skipped: worker not ready');
      return;
    }

    console.debug(`[hexchess AI] firing for player ${state.currentPlayer}, difficulty ${difficultyForTurn}, turn ${state.turnNumber}`);
    busyRef.current = true;
    const currentPlayer = state.currentPlayer;
    const opts = DIFFICULTY_BUDGET[difficultyForTurn];
    analyzeWithWorker(workerRef.current, state, opts)
      .then((result) => {
        // Guard against race: re-check that it's still the same player's turn.
        const store = useHexChessStore.getState();
        if (!store.state || store.state.result !== null || store.state.currentPlayer !== currentPlayer) return;
        if (result.move === null) return;
        store.selectPiece(result.move.pieceId);
        const applied = store.attemptMove(result.move.to);
        if (applied) {
          const freshState = useHexChessStore.getState().state;
          if (freshState?.pendingPromotion) {
            useHexChessStore.getState().confirmPromotion(result.move.promotion ?? 'queen');
          }
        }
      })
      .catch((err) => {
        console.error('Hex chess AI worker error:', err);
      })
      .finally(() => {
        busyRef.current = false;
      });
  }, [state?.currentPlayer, state?.turnNumber, state?.result, state?.pendingPromotion, config, enabled]);
}
