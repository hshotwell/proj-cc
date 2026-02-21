'use client';

import { useEffect, useMemo, useRef, useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { useAuthStore } from '@/store/authStore';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { reconstructGameState, serializeMoves } from '@/game/onlineState';
import type { OnlineGameData } from '@/game/onlineState';
import { parseCoordKey, getMovePath } from '@/game/coordinates';
import type { CubeCoord, PlayerIndex } from '@/types/game';

export function useOnlineGame(gameId: Id<"onlineGames">) {
  const onlineGame = useQuery(api.onlineGames.getLobby, { gameId });
  const submitTurn = useMutation(api.onlineGames.submitTurn);
  const { user } = useAuthStore();

  // Track the number of turns we've already synced to avoid re-processing
  // Initialize to -1 so the first sync (with 0 turns) always fires
  const lastSyncedTurnCount = useRef(-1);
  // Track the moveHistory length at the point of last server sync
  const moveHistoryBaseLength = useRef(0);
  // Track whether a turn submission is in flight to block interaction
  const isSubmittingRef = useRef(false);

  // Reconstruct GameState from online data
  const gameState = useMemo(() => {
    if (!onlineGame || (onlineGame.status !== 'playing' && onlineGame.status !== 'finished')) {
      return null;
    }
    try {
      return reconstructGameState(onlineGame as unknown as OnlineGameData);
    } catch (e) {
      console.error('[OnlineGame] Failed to reconstruct state:', e);
      return null;
    }
  }, [onlineGame]);

  // Sync reconstructed state into gameStore when server data changes
  useEffect(() => {
    if (!gameState || !onlineGame) return;

    const turns = (onlineGame.turns as any[]) ?? [];
    const turnCount = turns.length;

    // Reload on initial load (lastSyncedTurnCount = -1) or when turn count changes
    if (turnCount !== lastSyncedTurnCount.current) {
      const isInitialLoad = lastSyncedTurnCount.current === -1;
      lastSyncedTurnCount.current = turnCount;
      moveHistoryBaseLength.current = gameState.moveHistory.length;
      // Server acknowledged the turn — clear submission lock
      isSubmittingRef.current = false;
      useGameStore.getState().loadGame(gameId, gameState);

      // Set lastMoveInfo and animation for the latest turn so opponent
      // moves show the "last move" path and animate into place
      if (turnCount > 0) {
        const lastTurn = turns[turnCount - 1];
        const moves = lastTurn.moves as Array<{ from: string; to: string; jumpPath?: string[] }>;
        if (moves.length > 0) {
          const origin = parseCoordKey(moves[0].from);
          const destination = parseCoordKey(moves[moves.length - 1].to);
          const playerIdx = gameState.activePlayers[lastTurn.playerIndex] as PlayerIndex;

          const storeUpdate: Record<string, unknown> = {
            lastMoveInfo: { origin, destination, player: playerIdx },
          };

          // Animate only for newly received turns, not on initial page load
          if (!isInitialLoad && useSettingsStore.getState().animateMoves) {
            // Build full hop-by-hop path using jumpPath data
            const fullPath: CubeCoord[] = [];
            for (const m of moves) {
              const from = parseCoordKey(m.from);
              const to = parseCoordKey(m.to);
              const jp = m.jumpPath?.map(parseCoordKey);
              const segmentPath = getMovePath(from, to, jp);
              if (fullPath.length === 0) {
                fullPath.push(...segmentPath);
              } else {
                // Skip the first point of subsequent segments (it's the same as the last)
                fullPath.push(...segmentPath.slice(1));
              }
            }
            storeUpdate.animatingPiece = destination;
            storeUpdate.animationPath = fullPath;
            storeUpdate.animationStep = 0;
          }

          useGameStore.setState(storeUpdate);
        }
      }
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
    if (isSubmittingRef.current) return;
    const store = useGameStore.getState();
    if (!store.gameState || !onlineGame) return;

    const moves = serializeMoves(store.gameState, moveHistoryBaseLength.current);
    if (moves.length === 0) return;

    // Check if the player who just moved has finished
    const currentIdx = onlineGame.currentPlayerIndex ?? 0;
    const currentPlayerColor = store.gameState.activePlayers[currentIdx];
    const justFinished = store.gameState.finishedPlayers.some(fp => fp.player === currentPlayerColor);

    // Lock interaction immediately — cleared when server acknowledges
    isSubmittingRef.current = true;

    try {
      await submitTurn({ gameId, moves, playerFinished: justFinished || undefined });
    } catch (e) {
      console.error('[OnlineGame] Failed to submit turn:', e);
      isSubmittingRef.current = false;
    }
  }, [gameId, onlineGame, submitTurn]);

  // Watch gameStore for local turn completions and submit to server.
  // Handles both normal confirm (pendingConfirmation true→false) and
  // auto-confirm (lastMoveInfo set directly, pendingConfirmation never true).
  useEffect(() => {
    const unsubscribe = useGameStore.subscribe((state, prevState) => {
      if (!state.gameState) return;

      // Only submit if there are unsubmitted local moves
      const hasLocalMoves = state.gameState.moveHistory.length > moveHistoryBaseLength.current;
      if (!hasLocalMoves) return;

      // Detect turn completion via either path:
      // 1. Normal: pendingConfirmation went true → false
      const normalConfirm = prevState.pendingConfirmation && !state.pendingConfirmation;
      // 2. Auto-confirm: lastMoveInfo was just set (pending was never true)
      const autoConfirmDone = !state.pendingConfirmation && !prevState.pendingConfirmation
        && state.lastMoveInfo !== null && prevState.lastMoveInfo === null;

      if (normalConfirm || autoConfirmDone) {
        if (isMyTurn || (isHost && isAITurn)) {
          void handleSubmitTurn();
        }
      }
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
    isSubmittingRef,
    submitTurn: handleSubmitTurn,
  };
}
