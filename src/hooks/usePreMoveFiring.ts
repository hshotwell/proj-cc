'use client';

import { useEffect, useRef } from 'react';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { cubeEquals } from '@/game/coordinates';
import { isGameFullyOver } from '@/game/state';
import type { PlayerIndex } from '@/types/game';

const SELECT_DELAY = 50; // ms after selectPiece before makeMove; matches usePlayerOpening

/**
 * Fires queued pre-moves when the local user's turn arrives.
 * - Waits for animation to finish before firing (so the opponent's move settles first).
 * - Uses the game store's own valid-moves list (which already treats a chain jump as
 *   a single Move with a jumpPath) so a queued destination fires in one makeMove call.
 * - If the destination isn't reachable in one turn, clears the entire queue and lets
 *   the player move manually.
 * - Also promotes a lingering pre-move piece selection into the normal selection when
 *   the turn arrives with no queued pre-moves, so the player doesn't have to reselect.
 *
 * @param localPlayer - the local user's PlayerIndex (undefined disables the hook)
 * @param active     - false disables the hook regardless of state
 */
export function usePreMoveFiring(localPlayer: PlayerIndex | undefined, active: boolean = true) {
  const gameState = useGameStore((s) => s.gameState);
  const preMoves = useGameStore((s) => s.preMoves);
  const preMoveSelectedFrom = useGameStore((s) => s.preMoveSelectedFrom);
  const pendingConfirmation = useGameStore((s) => s.pendingConfirmation);
  const animatingPiece = useGameStore((s) => s.animatingPiece);
  const animateMoves = useSettingsStore((s) => s.animateMoves);

  const firingRef = useRef(false);

  useEffect(() => {
    if (!active) return;
    if (localPlayer === undefined) return;
    if (!gameState) return;
    if (isGameFullyOver(gameState)) return;
    if (gameState.currentPlayer !== localPlayer) return;
    if (pendingConfirmation) return;
    if (animatingPiece) return;

    // If the player had a piece selected for a pre-move but never queued one, keep
    // that piece selected as the normal turn's selection so they don't have to reclick.
    if (preMoves.length === 0 && preMoveSelectedFrom) {
      const held = preMoveSelectedFrom;
      useGameStore.setState({ preMoveSelectedFrom: null });
      useGameStore.getState().selectPiece(held);
      return;
    }

    if (preMoves.length === 0) return;
    if (firingRef.current) return;

    const pm = preMoves[0];

    firingRef.current = true;
    const turnAtStart = gameState.turnNumber;

    // Pop this pre-move optimistically and select the origin piece.
    useGameStore.setState({ preMoves: preMoves.slice(1) });
    useGameStore.getState().selectPiece(pm.from);

    setTimeout(() => {
      const current = useGameStore.getState();
      firingRef.current = false;
      if (
        !current.gameState ||
        isGameFullyOver(current.gameState) ||
        current.gameState.turnNumber !== turnAtStart ||
        current.gameState.currentPlayer !== localPlayer
      ) {
        return;
      }
      // The game's own valid-move list treats chain jumps as a single Move whose to =
      // the final landing (with a multi-cell jumpPath). Look it up and fire in one call.
      const target = current.validMovesForSelected.find((m) => cubeEquals(m.to, pm.to));
      if (!target) {
        // Not reachable this turn — clear the rest of the queue and let the player move manually.
        current.clearSelection();
        useGameStore.getState().clearAllPreMoves();
        return;
      }
      current.makeMove(pm.to, animateMoves);
    }, SELECT_DELAY);
  }, [active, localPlayer, gameState, preMoves, preMoveSelectedFrom, pendingConfirmation, animatingPiece, animateMoves]);
}
