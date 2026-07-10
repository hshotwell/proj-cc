'use client';
import { useEffect, useRef, useState } from 'react';
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
  // Use state (not ref) for busy so that changes trigger a re-render, which
  // re-runs the effect and lets the NEXT AI seat pick up its turn without
  // waiting for an unrelated dep to change.
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    workerRef.current = createHexChessWorker();
    setBusy(false);
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      setBusy(false);
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
    if (busy) {
      console.debug(`[hexchess AI] skipped: another turn still in flight (player ${state.currentPlayer}, turn ${state.turnNumber})`);
      return;
    }
    if (!workerRef.current) {
      console.debug('[hexchess AI] skipped: worker not ready');
      return;
    }

    console.debug(`[hexchess AI] firing for player ${state.currentPlayer}, difficulty ${difficultyForTurn}, turn ${state.turnNumber}`);
    setBusy(true);
    const currentPlayer = state.currentPlayer;
    const opts = DIFFICULTY_BUDGET[difficultyForTurn];
    analyzeWithWorker(workerRef.current, state, opts)
      .then((result) => {
        const store = useHexChessStore.getState();
        if (!store.state || store.state.result !== null || store.state.currentPlayer !== currentPlayer) {
          console.debug(`[hexchess AI] result discarded — turn advanced past player ${currentPlayer}`);
          return;
        }
        if (result.move === null) {
          console.debug(`[hexchess AI] no move returned for player ${currentPlayer}`);
          return;
        }
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
        console.error('[hexchess AI] worker error:', err);
      })
      .finally(() => {
        setBusy(false);
      });
  }, [state?.currentPlayer, state?.turnNumber, state?.result, state?.pendingPromotion, config, enabled, busy]);
}
