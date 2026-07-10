'use client';
import { useEffect, useRef, useState } from 'react';
import { useHexChessStore } from '@/store/hexChessStore';
import { createHexChessWorker, analyzeWithWorker } from '@/game/ai/hexchess/workerClient';
import type { HexChessDifficulty, HexChessState, HexMove } from '@/game/hexchess';
import { legalMoves, applyMove } from '@/game/hexchess';
import { isCellAttacked } from '@/game/hexchess/check';
import { otherPlayer } from '@/game/hexchess/board';

interface DifficultyProfile {
  budgetMs: number;
  maxDepth: number;
  // Probability that the AI plays an obviously losing move — one that
  // parks a piece on a cell attacked by the enemy where no adequate
  // defender exists ("hangs" a piece).
  blunderChance: number;
  // Probability (in addition to blunder) that the AI plays a random legal
  // move that is at least NOT a piece-hanger — an aimless "shuffle" that
  // wastes a tempo but doesn't lose material outright.
  shuffleChance: number;
}

const DIFFICULTY_BUDGET: Record<HexChessDifficulty, DifficultyProfile> = {
  easy:   { budgetMs: 200, maxDepth: 1, blunderChance: 0.20, shuffleChance: 0.60 },
  medium: { budgetMs: 1200, maxDepth: 3, blunderChance: 0.05, shuffleChance: 0.30 },
  hard:   { budgetMs: 6000, maxDepth: 5, blunderChance: 0,    shuffleChance: 0 },
};

/**
 * True if the given move, if played, would leave the moving piece on a cell
 * attacked by the opponent with no adequate defender — an obvious material
 * blunder.
 */
function movePutsPieceEnPrise(state: HexChessState, move: HexMove): boolean {
  const next = applyMove(state, move);
  const mover = state.currentPlayer;
  const opp = otherPlayer(mover);
  // Find the piece at the destination (should be the moved piece).
  const moved = next.pieces.find(p => p.player === mover && p.cell.q === move.to.q && p.cell.r === move.to.r);
  if (!moved) return false;
  const attacked = isCellAttacked(next, move.to, opp);
  if (!attacked) return false;
  // Count defenders of the destination cell (other than the moved piece).
  const otherPieces = next.pieces.filter(p => p.id !== moved.id);
  const stateWithoutMover: HexChessState = { ...next, pieces: otherPieces };
  const defended = isCellAttacked(stateWithoutMover, move.to, mover);
  return !defended;
}

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
        // Handicap: at easier tiers the AI occasionally picks a suboptimal
        // move. Two independent chances:
        //   - blunderChance: pick a move that hangs the moved piece (drops it
        //     onto an attacked cell with no adequate defender).
        //   - shuffleChance: pick a random legal move that is at least NOT a
        //     piece-hanger — wastes a tempo without giving material away.
        let chosenMove = result.move;
        const profile = DIFFICULTY_BUDGET[difficultyForTurn];
        const roll = Math.random();
        const currentState = store.state;
        if (currentState && roll < profile.blunderChance) {
          const legals = legalMoves(currentState);
          const hangers = legals.filter(m => movePutsPieceEnPrise(currentState, m));
          if (hangers.length > 0) {
            chosenMove = hangers[Math.floor(Math.random() * hangers.length)];
            console.debug(`[hexchess AI] BLUNDER — player ${currentPlayer} hangs a piece`);
          }
        } else if (currentState && roll < profile.blunderChance + profile.shuffleChance) {
          const legals = legalMoves(currentState);
          const safe = legals.filter(m => !movePutsPieceEnPrise(currentState, m));
          if (safe.length > 0) {
            chosenMove = safe[Math.floor(Math.random() * safe.length)];
            console.debug(`[hexchess AI] shuffle — player ${currentPlayer} plays a random safe move`);
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
