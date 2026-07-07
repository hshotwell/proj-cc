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
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !state || !config || state.result !== null) return;
    if (state.pendingPromotion !== null) return;
    if (config.ai === null) return;
    if (state.currentPlayer !== config.ai.forPlayer) return;
    if (busyRef.current || !workerRef.current) return;

    busyRef.current = true;
    const opts = DIFFICULTY_BUDGET[config.ai.difficulty];
    analyzeWithWorker(workerRef.current, state, opts)
      .then((result) => {
        // Guard against race: re-check state matches.
        const store = useHexChessStore.getState();
        if (!store.state || store.state.result !== null || store.state.currentPlayer !== config.ai!.forPlayer) return;
        if (result.move === null) return;
        store.selectPiece(result.move.pieceId);
        const applied = store.attemptMove(result.move.to);
        if (applied && store.state?.pendingPromotion) {
          store.confirmPromotion(result.move.promotion ?? 'queen');
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
