'use client';
import { useEffect, useRef, useState } from 'react';
import { useHexChessStore } from '@/store/hexChessStore';
import { createHexChessWorker, analyzeWithWorker } from '@/game/ai/hexchess/workerClient';
import type { HexChessDifficulty } from '@/game/hexchess';
import { legalMoves } from '@/game/hexchess';

interface DifficultyProfile {
  budgetMs: number;
  maxDepth: number;
  // Probability that the AI plays a random legal move instead of the engine's
  // best move. Zero for hard, tiny for medium, meaningful for easy so the
  // player can actually beat easy.
  blunderChance: number;
}

const DIFFICULTY_BUDGET: Record<HexChessDifficulty, DifficultyProfile> = {
  easy:   { budgetMs: 200, maxDepth: 1, blunderChance: 0.40 },
  medium: { budgetMs: 1200, maxDepth: 3, blunderChance: 0.10 },
  hard:   { budgetMs: 6000, maxDepth: 5, blunderChance: 0 },
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
        // Blunder chance: at easier tiers the AI occasionally picks a random
        // legal move instead of the engine's best move so the player can win.
        let chosenMove = result.move;
        const blunderChance = DIFFICULTY_BUDGET[difficultyForTurn].blunderChance;
        if (blunderChance > 0 && Math.random() < blunderChance && store.state) {
          const legals = legalMoves(store.state);
          if (legals.length > 0) {
            const random = legals[Math.floor(Math.random() * legals.length)];
            console.debug(`[hexchess AI] blunder — player ${currentPlayer} played random move instead of best`);
            chosenMove = random;
          }
        }
        store.selectPiece(chosenMove.pieceId);
        const applied = store.attemptMove(chosenMove.to);
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
