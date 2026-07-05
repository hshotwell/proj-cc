'use client';

import { useEffect, useRef } from 'react';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { findMovePath } from '@/game/pathfinding';
import { isGameFullyOver } from '@/game/state';
import type { PlayerIndex } from '@/types/game';

const SELECT_DELAY = 50; // ms after selectPiece before makeMove; matches usePlayerOpening

/**
 * Fires queued pre-moves when the local user's turn arrives.
 * - Waits for animation to finish before firing (so the opponent's move settles first).
 * - Finds a full step/chain-jump path from queued origin to queued destination.
 * - If the path exists, executes it via existing makeMove flow (respects autoConfirm).
 * - If the path doesn't exist, clears the entire queue and lets the player move manually.
 *
 * @param localPlayer - the local user's PlayerIndex (undefined disables the hook)
 * @param active     - false disables the hook regardless of state
 */
export function usePreMoveFiring(localPlayer: PlayerIndex | undefined, active: boolean = true) {
  const gameState = useGameStore((s) => s.gameState);
  const preMoves = useGameStore((s) => s.preMoves);
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
    if (preMoves.length === 0) return;
    if (firingRef.current) return;

    const pm = preMoves[0];
    const path = findMovePath(gameState, pm.from, pm.to, localPlayer);
    if (!path || path.length === 0) {
      // Unreachable — clear the entire queue.
      useGameStore.getState().clearAllPreMoves();
      return;
    }

    firingRef.current = true;
    // Snapshot for guarded execution
    const turnAtStart = gameState.turnNumber;

    // Pop this pre-move optimistically
    useGameStore.setState({ preMoves: preMoves.slice(1) });

    const store = useGameStore.getState();
    store.selectPiece(pm.from);

    const fireHop = (i: number) => {
      const current = useGameStore.getState();
      if (
        !current.gameState ||
        isGameFullyOver(current.gameState) ||
        current.gameState.turnNumber !== turnAtStart ||
        current.gameState.currentPlayer !== localPlayer
      ) {
        firingRef.current = false;
        return;
      }
      const move = path[i];
      current.makeMove(move.to, animateMoves);
      if (i < path.length - 1) {
        setTimeout(() => fireHop(i + 1), SELECT_DELAY);
      } else {
        // Last hop dispatched; release the ref so the next tick can fire the next pre-move
        firingRef.current = false;
      }
    };

    setTimeout(() => fireHop(0), SELECT_DELAY);
  }, [active, localPlayer, gameState, preMoves, pendingConfirmation, animatingPiece, animateMoves]);
}
