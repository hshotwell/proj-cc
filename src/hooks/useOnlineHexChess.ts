'use client';

import { useEffect, useMemo, useRef, useCallback, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { useAuthStore } from '@/store/authStore';
import { useHexChessStore } from '@/store/hexChessStore';
import {
  reconstructHexChessOnline, serializeHexMove, applyResign,
  type OnlineHexGameData,
} from '@/game/hexchess/onlineState';
import type { HexPlayerIndex } from '@/game/hexchess';
import { isInCheck } from '@/game/hexchess';
import { livingPlayers } from '@/game/hexchess/board';
import { playStep, playCapture, playCheck, playCheckmate } from '@/audio/soundEffects';

export function useOnlineHexChess(gameId: Id<'onlineGames'>) {
  const onlineGame = useQuery(api.onlineGames.getLobby, { gameId });
  const submitTurn = useMutation(api.onlineGames.submitTurn);
  const { user } = useAuthStore();

  const lastSyncedTurnCount = useRef(-1);
  // moveHistory length at the last server sync; store growth beyond this is a
  // locally-played move that needs submitting.
  const lastSyncedMoveCount = useRef(0);
  const isSubmittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const players = (onlineGame?.players as { userId?: string; type: string }[]) ?? [];
  const mySlotIndex = players.findIndex((p) => p.userId === user?.id);
  const isHost = onlineGame?.hostId === user?.id;
  const status = onlineGame?.status;

  const reconstructed = useMemo(() => {
    if (!onlineGame || (status !== 'playing' && status !== 'finished')) return null;
    try {
      return reconstructHexChessOnline(onlineGame as unknown as OnlineHexGameData);
    } catch (e) {
      console.error('[OnlineHexChess] Failed to reconstruct state:', e);
      return null;
    }
  }, [onlineGame, status]);

  // Sync server state into the store whenever the turn count changes.
  useEffect(() => {
    if (!reconstructed || !onlineGame) return;
    const turns = (onlineGame.turns as unknown[]) ?? [];
    if (turns.length === lastSyncedTurnCount.current) return;
    const isInitialLoad = lastSyncedTurnCount.current === -1;
    const lastTurn = turns[turns.length - 1] as { playerIndex: number } | undefined;
    lastSyncedTurnCount.current = turns.length;
    lastSyncedMoveCount.current = reconstructed.state.moveHistory.length;
    isSubmittingRef.current = false;
    setIsSubmitting(false);

    useHexChessStore.setState({
      state: reconstructed.state,
      gameId: String(gameId),
      config: reconstructed.config,
      selectedPieceId: null,
      legalMoveTargets: [],
      lastMove: reconstructed.lastMove,
      animatingCapture: null,
      captureTimeoutId: null,
      // preMoves intentionally preserved — they fire when it becomes our turn
    });

    // Sounds for opponent turns (own moves already played locally).
    if (!isInitialLoad && lastTurn && lastTurn.playerIndex !== mySlotIndex) {
      const st = reconstructed.state;
      const lm = reconstructed.lastMove;
      if (lm?.capture) playCapture(reconstructed.config.players[lm.player]?.color);
      else if (lm) playStep();
      if (st.result !== null) playCheckmate();
      else if (livingPlayers(st).some((s) => isInCheck(st, s))) playCheck();
    }
  }, [reconstructed, onlineGame, gameId, mySlotIndex]);

  const currentSlotIndex = onlineGame?.currentPlayerIndex ?? 0;
  const isMyTurn = status === 'playing' && currentSlotIndex === mySlotIndex;
  const isAITurn = status === 'playing' && players[currentSlotIndex]?.type === 'ai';
  const mySeat: HexPlayerIndex | undefined =
    mySlotIndex >= 0 ? reconstructed?.config.seats[mySlotIndex] : undefined;

  const handleSubmit = useCallback(async () => {
    if (isSubmittingRef.current) return;
    const s = useHexChessStore.getState();
    if (!s.state || !s.config) return;
    const newMoves = s.state.moveHistory.slice(lastSyncedMoveCount.current);
    if (newMoves.length === 0) return;
    const move = newMoves[newMoves.length - 1]; // hex chess: one move per turn
    const nextPlayerIndex = s.config.seats.indexOf(s.state.currentPlayer);
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      await submitTurn({
        gameId,
        moves: serializeHexMove(move),
        nextPlayerIndex: nextPlayerIndex >= 0 ? nextPlayerIndex : currentSlotIndex,
        result: s.state.result ?? undefined,
      });
    } catch (e) {
      console.error('[OnlineHexChess] Failed to submit turn:', e);
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [gameId, submitTurn, currentSlotIndex]);

  // Watch the store for locally-applied moves (human click, promotion confirm,
  // pre-move firing, or the host-run AI) and push them to the server.
  useEffect(() => {
    const unsubscribe = useHexChessStore.subscribe((state, prevState) => {
      if (!state.state || state.state === prevState.state) return;
      if (state.state.pendingPromotion !== null) return; // wait for the choice
      if (state.state.moveHistory.length <= lastSyncedMoveCount.current) return;
      if (isMyTurn || (isHost && isAITurn)) void handleSubmit();
    });
    return unsubscribe;
  }, [isMyTurn, isHost, isAITurn, handleSubmit]);

  const submitResign = useCallback(async () => {
    const s = useHexChessStore.getState();
    if (!s.state || !s.config || mySeat === undefined || isSubmittingRef.current) return;
    const after = applyResign(s.state, mySeat);
    const nextPlayerIndex = s.config.seats.indexOf(after.currentPlayer);
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      await submitTurn({
        gameId,
        moves: { kind: 'resign' },
        resign: true,
        nextPlayerIndex: nextPlayerIndex >= 0 ? nextPlayerIndex : currentSlotIndex,
        result: after.result ?? undefined,
      });
    } catch (e) {
      console.error('[OnlineHexChess] Failed to resign:', e);
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [gameId, submitTurn, mySeat, currentSlotIndex]);

  return { onlineGame, isMyTurn, isHost, isAITurn, isSubmitting, mySlotIndex, mySeat, submitResign };
}
