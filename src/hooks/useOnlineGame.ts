'use client';

import { useEffect, useMemo, useRef, useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { useAuthStore } from '@/store/authStore';
import { useGameStore } from '@/store/gameStore';
import { reconstructGameState, serializeMoves } from '@/game/onlineState';
import type { OnlineGameData } from '@/game/onlineState';

export function useOnlineGame(gameId: Id<"onlineGames">) {
  const onlineGame = useQuery(api.onlineGames.getLobby, { gameId });
  const submitTurn = useMutation(api.onlineGames.submitTurn);
  const markFinished = useMutation(api.onlineGames.markPlayerFinished);
  const { user } = useAuthStore();

  // Track the number of turns we've already synced to avoid re-processing
  const lastSyncedTurnCount = useRef(0);
  // Track the moveHistory length at the point of last server sync
  const moveHistoryBaseLength = useRef(0);

  // Reconstruct GameState from online data
  const gameState = useMemo(() => {
    if (!onlineGame || (onlineGame.status !== 'playing' && onlineGame.status !== 'finished')) {
      return null;
    }
    return reconstructGameState(onlineGame as unknown as OnlineGameData);
  }, [onlineGame]);

  // Sync reconstructed state into gameStore when server data changes
  useEffect(() => {
    if (!gameState || !onlineGame) return;

    const turnCount = (onlineGame.turns as any[])?.length ?? 0;

    // Only reload if server turn count changed (new turn arrived)
    if (turnCount !== lastSyncedTurnCount.current) {
      lastSyncedTurnCount.current = turnCount;
      moveHistoryBaseLength.current = gameState.moveHistory.length;
      useGameStore.getState().loadGame(gameId, gameState);
    }
  }, [gameState, onlineGame, gameId]);

  // Determine player info
  const players = (onlineGame?.players as any[]) ?? [];
  const myPlayerIndex = players.findIndex((p: any) => p.userId === user?.id);
  const myPlayerSlot = myPlayerIndex >= 0 ? players[myPlayerIndex] : null;
  const isHost = onlineGame?.hostId === user?.id;
  const isMyTurn = onlineGame?.status === 'playing' &&
    onlineGame.currentPlayerIndex === myPlayerIndex;
  const isAITurn = onlineGame?.status === 'playing' &&
    onlineGame.currentPlayerIndex !== undefined &&
    players[onlineGame.currentPlayerIndex]?.type === 'ai';

  // Submit turn handler
  const handleSubmitTurn = useCallback(async () => {
    const store = useGameStore.getState();
    if (!store.gameState || !onlineGame) return;

    const moves = serializeMoves(store.gameState, moveHistoryBaseLength.current);
    if (moves.length === 0) return;

    try {
      await submitTurn({ gameId, moves });

      // Check if the current player just won
      if (store.gameState.winner !== null) {
        const winnerIdx = players.findIndex((_: any, i: number) => {
          const activePlayers = store.gameState!.activePlayers;
          return activePlayers[i] === store.gameState!.winner;
        });
        if (winnerIdx >= 0) {
          await markFinished({ gameId, playerIndex: winnerIdx });
        }
      }
    } catch (e) {
      console.error('[OnlineGame] Failed to submit turn:', e);
    }
  }, [gameId, onlineGame, submitTurn, markFinished, players]);

  // Watch for pendingConfirmation → confirmed transition to submit turns
  const prevPending = useRef(false);
  useEffect(() => {
    const unsubscribe = useGameStore.subscribe((state) => {
      // Detect transition from pending to not-pending (move confirmed)
      if (prevPending.current && !state.pendingConfirmation) {
        // A move was just confirmed locally
        if (isMyTurn || (isHost && isAITurn)) {
          void handleSubmitTurn();
        }
      }
      prevPending.current = state.pendingConfirmation;
    });

    return unsubscribe;
  }, [isMyTurn, isHost, isAITurn, handleSubmitTurn]);

  return {
    onlineGame,
    gameState,
    isMyTurn,
    isHost,
    isAITurn,
    myPlayerIndex,
    myPlayerSlot,
    submitTurn: handleSubmitTurn,
  };
}
