'use client';

import { useEffect, useRef } from 'react';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { cubeEquals } from '@/game/coordinates';
import { getValidMoves } from '@/game/moves';
import { isGameFullyOver } from '@/game/state';
import type { PlayerIndex } from '@/types/game';

/**
 * Fires queued pre-moves when the local user's turn arrives.
 *
 * - Waits for animation to finish before firing (so opponent's move settles first).
 * - Uses the game's own valid-move list (which represents each chain-jump destination as
 *   a single Move with a full jumpPath) so a queued destination fires in one makeMove.
 * - Bypasses `selectPiece` so there is no visible "piece selected" ring or destination
 *   highlights on the pm.from cell — the move just happens.
 * - Clears the selection UI (selectedPiece + validMovesForSelected) after the move so
 *   the landing coord doesn't show as "still selectable"; the persist-selection logic
 *   in confirmMove handles restoring the piece across turn transitions.
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

    // Promote a lingering pre-move piece into the normal selection when the turn arrives
    // with no queued pre-moves. Guarded by !firingRef so this doesn't run in the effect
    // re-entry that happens right after we've popped the queue below.
    if (preMoves.length === 0 && preMoveSelectedFrom && !firingRef.current) {
      const held = preMoveSelectedFrom;
      useGameStore.setState({ preMoveSelectedFrom: null });
      useGameStore.getState().selectPiece(held);
      return;
    }

    if (preMoves.length === 0) return;
    if (firingRef.current) return;

    const pm = preMoves[0];
    firingRef.current = true;

    // Look up the move directly against the current board without going through
    // selectPiece. The game's own getValidMoves treats a chain jump as a single Move
    // with a full jumpPath, so a matching entry fires the whole chain in one makeMove.
    const moves = getValidMoves(gameState, pm.from);
    const target = moves.find((m) => cubeEquals(m.to, pm.to));
    if (!target) {
      // Not reachable this turn — clear the rest of the queue and let the player move manually.
      useGameStore.setState({ preMoves: [], preMoveSelectedFrom: null });
      firingRef.current = false;
      return;
    }

    // Populate the minimum state makeMove needs, fire it, then wipe the UI state.
    // All synchronous so React batches into a single render — no selection blip.
    // preMoveSelectedFrom is intentionally left untouched: if the player already
    // selected a different piece for a future pre-move, that selection survives
    // through this fire and is picked up by the promote branch on the next turn.
    useGameStore.setState({
      preMoves: preMoves.slice(1),
      selectedPiece: pm.from,
      validMovesForSelected: moves,
    });
    useGameStore.getState().makeMove(pm.to, animateMoves);
    useGameStore.setState({
      selectedPiece: null,
      validMovesForSelected: [],
    });
    firingRef.current = false;
  }, [active, localPlayer, gameState, preMoves, preMoveSelectedFrom, pendingConfirmation, animatingPiece, animateMoves]);
}
