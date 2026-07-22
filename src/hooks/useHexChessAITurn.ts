'use client';
import { useEffect, useRef, useState } from 'react';
import { useHexChessStore } from '@/store/hexChessStore';
import { createHexChessWorker, analyzeWithWorker } from '@/game/ai/hexchess/workerClient';
import { PIECE_VALUE } from '@/game/ai/hexchess/moveOrdering';
import type { HexChessDifficulty, HexChessState, HexMove, HexPlayerIndex } from '@/game/hexchess';
import { legalMoves, applyMove, rulesModeOf } from '@/game/hexchess';
import { isCellAttacked, isCellAttackedByEnemies, isCheckmate, isInCheck } from '@/game/hexchess/check';
import { livingPlayers } from '@/game/hexchess/board';

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
  // Find the piece at the destination (should be the moved piece).
  const moved = next.pieces.find(p => p.player === mover && p.cell.q === move.to.q && p.cell.r === move.to.r);
  if (!moved) return false;
  const attacked = isCellAttackedByEnemies(next, move.to, mover);
  if (!attacked) return false;
  // Count defenders of the destination cell (other than the moved piece).
  const otherPieces = next.pieces.filter(p => p.id !== moved.id);
  const stateWithoutMover: HexChessState = { ...next, pieces: otherPieces };
  const defended = isCellAttacked(stateWithoutMover, move.to, mover);
  return !defended;
}

// A "check" opportunity is worth less than a real capture but still worth
// protecting from a careless blunder/shuffle roll.
const CHECK_TACTICAL_WEIGHT = 250;
// Suppression scales linearly from 1 (nothing tactical happening) down to
// this floor once tacticalWeight reaches a queen's value — a real chance
// always keeps SOME weight so blunders remain possible, just much rarer.
const MIN_SUPPRESSION = 0.05;
const TACTICAL_SCALE = PIECE_VALUE.queen;

/** Highest-value legal capture currently available to `player` (0 if none). */
export function maxCaptureAvailable(state: HexChessState, legals: HexMove[]): number {
  let max = 0;
  for (const m of legals) {
    if (!m.capture) continue;
    const victim = state.pieces.find(p => p.id === m.capture!.pieceId);
    if (victim) max = Math.max(max, PIECE_VALUE[victim.type]);
  }
  return max;
}

/** Highest value among `player`'s own pieces that are currently hanging (attacked, undefended). */
export function maxHangingOwnValue(state: HexChessState, player: HexPlayerIndex): number {
  let max = 0;
  for (const piece of state.pieces) {
    if (piece.player !== player) continue;
    if (!isCellAttackedByEnemies(state, piece.cell, player)) continue;
    const others = state.pieces.filter(p => p.id !== piece.id);
    const stateWithoutPiece: HexChessState = { ...state, pieces: others };
    if (!isCellAttacked(stateWithoutPiece, piece.cell, player)) {
      max = Math.max(max, PIECE_VALUE[piece.type]);
    }
  }
  return max;
}

/**
 * How much the blunder/shuffle chances should be scaled down (1 = no
 * suppression, MIN_SUPPRESSION = maximally suppressed) given the tactics on
 * the board: a valuable capture sitting there for the taking, one of the
 * AI's own pieces already hanging, or a move that gives check.
 */
export function tacticalSuppression(tacticalWeight: number): number {
  const t = Math.min(1, tacticalWeight / TACTICAL_SCALE);
  return 1 - t * (1 - MIN_SUPPRESSION);
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
        let engineMove = result.move;
        if (engineMove === null) {
          // Safety net: the engine should always return a move while legal
          // moves exist. If it ever fails to, play any legal move rather than
          // stalling the game forever.
          const fallbacks = legalMoves(store.state);
          if (fallbacks.length === 0) {
            console.debug(`[hexchess AI] no move returned for player ${currentPlayer} (no legal moves)`);
            return;
          }
          console.warn(`[hexchess AI] engine returned no move for player ${currentPlayer} despite ${fallbacks.length} legal moves — playing fallback`);
          engineMove = fallbacks[0];
        }
        // Handicap: at easier tiers the AI occasionally picks a suboptimal
        // move. Two independent chances:
        //   - blunderChance: pick a move that hangs the moved piece (drops it
        //     onto an attacked cell with no adequate defender).
        //   - shuffleChance: pick a random legal move that is at least NOT a
        //     piece-hanger — wastes a tempo without giving material away.
        let chosenMove = engineMove;
        const profile = DIFFICULTY_BUDGET[difficultyForTurn];
        const currentState = store.state;
        if (currentState) {
          const legals = legalMoves(currentState);
          const nextState = applyMove(currentState, engineMove);
          const isMultiplayer = rulesModeOf(currentState) === 'king-capture';
          // Never let a found mate (2p) or an actual king capture (3+)
          // get thrown away by a blunder/shuffle roll.
          const capturedVictim = engineMove.capture
            ? currentState.pieces.find(p => p.id === engineMove.capture!.pieceId)
            : undefined;
          const isDecisive = isMultiplayer
            ? capturedVictim?.type === 'king'
            : isCheckmate(nextState);
          if (!isDecisive) {
            const givesCheck = livingPlayers(nextState).some(
              seat => seat !== currentPlayer && isInCheck(nextState, seat),
            );
            const tacticalWeight = Math.max(
              maxCaptureAvailable(currentState, legals),
              maxHangingOwnValue(currentState, currentPlayer),
              givesCheck ? CHECK_TACTICAL_WEIGHT : 0,
            );
            const suppression = tacticalSuppression(tacticalWeight);
            const effectiveBlunderChance = profile.blunderChance * suppression;
            const effectiveShuffleChance = profile.shuffleChance * suppression;
            const roll = Math.random();
            if (roll < effectiveBlunderChance) {
              const hangers = legals.filter(m => movePutsPieceEnPrise(currentState, m));
              if (hangers.length > 0) {
                chosenMove = hangers[Math.floor(Math.random() * hangers.length)];
                console.debug(`[hexchess AI] BLUNDER — player ${currentPlayer} hangs a piece (suppression=${suppression.toFixed(2)})`);
              }
            } else if (roll < effectiveBlunderChance + effectiveShuffleChance) {
              const safe = legals.filter(m => !movePutsPieceEnPrise(currentState, m));
              if (safe.length > 0) {
                chosenMove = safe[Math.floor(Math.random() * safe.length)];
                console.debug(`[hexchess AI] shuffle — player ${currentPlayer} plays a random safe move (suppression=${suppression.toFixed(2)})`);
              }
            }
          }
        }
        store.selectPiece(chosenMove.pieceId);
        const applied = store.attemptMove(chosenMove.to);
        if (applied) {
          const freshState = useHexChessStore.getState().state;
          if (freshState?.pendingPromotion) {
            useHexChessStore.getState().confirmPromotion(engineMove.promotion ?? 'queen');
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
