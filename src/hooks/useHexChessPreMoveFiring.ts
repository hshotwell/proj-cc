'use client';

import { useEffect, useRef } from 'react';
import { useHexChessStore } from '@/store/hexChessStore';
import type { QueuedHexPreMove } from '@/store/hexChessStore';
import { legalMoves } from '@/game/hexchess';
import type { HexChessState, HexPieceType } from '@/game/hexchess/state';
import { cubeEquals } from '@/game/coordinates';
import type { CubeCoord, PlayerIndex } from '@/types/game';

export type PreMoveFiringDecision =
  | { type: 'none' }
  | { type: 'promote-selection'; pieceId: string }
  | { type: 'fire'; pieceId: string; to: CubeCoord; promotion: HexPieceType | null }
  | { type: 'invalidate' };

/**
 * Pure decision function for what the pre-move firing hook should do, given
 * the real current state and the queue. Kept separate from the useEffect
 * below so it can be unit tested without mounting React.
 */
export function resolvePreMoveFiring(
  state: HexChessState,
  preMoves: QueuedHexPreMove[],
  preMoveSelectedPieceId: string | null,
): PreMoveFiringDecision {
  if (preMoves.length === 0) {
    if (preMoveSelectedPieceId !== null) {
      return { type: 'promote-selection', pieceId: preMoveSelectedPieceId };
    }
    return { type: 'none' };
  }

  const pm = preMoves[0];
  const legals = legalMoves(state).filter(m => m.pieceId === pm.pieceId);
  const target = legals.find(m => cubeEquals(m.to, pm.to));
  if (!target) return { type: 'invalidate' };

  return { type: 'fire', pieceId: pm.pieceId, to: pm.to, promotion: pm.promotion };
}

/**
 * Fires queued pre-moves when the local user's turn arrives in hex chess.
 * Only one pre-move fires per real turn — `attemptMove` flips `currentPlayer`
 * away from `localPlayer`, which stops the effect from firing again until
 * the opponent replies.
 */
export function useHexChessPreMoveFiring(localPlayer: PlayerIndex | undefined, active: boolean = true) {
  const state = useHexChessStore((s) => s.state);
  const preMoves = useHexChessStore((s) => s.preMoves);
  const preMoveSelectedPieceId = useHexChessStore((s) => s.preMoveSelectedPieceId);
  const animatingCapture = useHexChessStore((s) => s.animatingCapture);

  const firingRef = useRef(false);

  useEffect(() => {
    if (!active) return;
    if (localPlayer === undefined) return;
    if (!state) return;
    if (state.result !== null) return;
    if (state.currentPlayer !== localPlayer) return;
    if (state.pendingPromotion !== null) return;
    if (animatingCapture) return;
    if (firingRef.current) return;

    const decision = resolvePreMoveFiring(state, preMoves, preMoveSelectedPieceId);
    if (decision.type === 'none') return;

    firingRef.current = true;

    if (decision.type === 'promote-selection') {
      useHexChessStore.setState({ preMoveSelectedPieceId: null });
      useHexChessStore.getState().selectPiece(decision.pieceId);
      firingRef.current = false;
      return;
    }

    if (decision.type === 'invalidate') {
      useHexChessStore.setState({ preMoves: [], preMoveSelectedPieceId: null });
      firingRef.current = false;
      return;
    }

    // decision.type === 'fire'
    useHexChessStore.setState({ preMoves: preMoves.slice(1) });
    useHexChessStore.getState().selectPiece(decision.pieceId);
    useHexChessStore.getState().attemptMove(decision.to);
    const afterMove = useHexChessStore.getState().state;
    if (afterMove?.pendingPromotion) {
      useHexChessStore.getState().confirmPromotion(decision.promotion ?? 'queen');
    }
    firingRef.current = false;
  }, [active, localPlayer, state, preMoves, preMoveSelectedPieceId, animatingCapture]);
}
