'use client';

import { useEffect, useMemo, useRef, useCallback, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { useAuthStore } from '@/store/authStore';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { reconstructGameState, serializeMoves } from '@/game/onlineState';
import type { OnlineGameData } from '@/game/onlineState';
import { parseCoordKey, getMovePath } from '@/game/coordinates';
import { clearStateHistory, recordBoardState } from '@/game/ai/search';
import { clearPathfindingCache } from '@/game/pathfinding';
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
  // Reactive version so the UI re-renders when submission state changes
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      setIsSubmitting(false);

      // Run side effects before the atomic state update
      clearStateHistory();
      clearPathfindingCache();
      recordBoardState(gameState);

      // Build the animation overlay for opponent moves BEFORE updating the store,
      // so we can apply everything in a single atomic setState (prevents highlight flash).
      const animationOverlay: Record<string, unknown> = {};

      // Determine local player's slot index for animation skipping
      const localPlayerIndex = (onlineGame.players as any[]).findIndex(
        (p: any) => p.userId === user?.id
      );

      if (turnCount > 0) {
        const lastTurn = turns[turnCount - 1];
        const moves = lastTurn.moves as Array<{ from: string; to: string; jumpPath?: string[] }>;
        const isOwnMove = lastTurn.playerIndex === localPlayerIndex;
        if (moves.length > 0) {
          const origin = parseCoordKey(moves[0].from);
          const destination = parseCoordKey(moves[moves.length - 1].to);
          const playerIdx = gameState.activePlayers[lastTurn.playerIndex] as PlayerIndex;

          animationOverlay.lastMoveInfo = { origin, destination, player: playerIdx };

          // Animate only for opponent turns, not initial load or own moves
          if (!isInitialLoad && !isOwnMove && useSettingsStore.getState().animateMoves) {
            const fullPath: CubeCoord[] = [];
            for (const m of moves) {
              const from = parseCoordKey(m.from);
              const to = parseCoordKey(m.to);
              const jp = m.jumpPath?.map(parseCoordKey);
              const segmentPath = getMovePath(from, to, jp);
              if (fullPath.length === 0) {
                fullPath.push(...segmentPath);
              } else {
                fullPath.push(...segmentPath.slice(1));
              }
            }
            animationOverlay.animatingPiece = destination;
            animationOverlay.animationPath = fullPath;
            animationOverlay.animationStep = 0;
          }
        }
      }

      // Single atomic update — loadGame fields + animation overlay together
      useGameStore.setState({
        gameId,
        gameState,
        selectedPiece: null,
        validMovesForSelected: [],
        pendingConfirmation: false,
        stateBeforeMove: null,
        lastMoveInfo: null,
        originalPiecePosition: null,
        animatingPiece: null,
        animationPath: null,
        animationStep: 0,
        pendingServerSubmission: false,
        pendingAnimationSubmission: false,
        ...animationOverlay,
      });
    }
  }, [gameState, onlineGame, gameId, user?.id]);

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
    setIsSubmitting(true);

    try {
      await submitTurn({ gameId, moves, playerFinished: justFinished || undefined });
    } catch (e) {
      console.error('[OnlineGame] Failed to submit turn:', e);
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [gameId, onlineGame, submitTurn]);

  // Watch gameStore for local turn completions and submit to server.
  // Both confirmMove() and auto-confirm in makeMove() set pendingServerSubmission.
  useEffect(() => {
    const unsubscribe = useGameStore.subscribe((state, prevState) => {
      if (!state.gameState) return;

      // Detect turn completion: pendingServerSubmission just became true
      if (state.pendingServerSubmission && !prevState.pendingServerSubmission) {
        // Clear the flag immediately so it doesn't re-trigger
        useGameStore.setState({ pendingServerSubmission: false });

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
    isSubmitting,
    myPlayerIndex,
    myPlayerSlot,
    submitTurn: handleSubmitTurn,
  };
}
