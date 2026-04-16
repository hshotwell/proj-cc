'use client';

import { useEffect, useRef } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useGameStore } from '@/store/gameStore';
import { useAuthStore } from '@/store/authStore';
import { normalizeMoveHistory } from '@/game/replay';
import { isGameFullyOver } from '@/game/state';
import type { Move } from '@/types/game';

function serializeMove(move: Move): Move {
  return {
    from: { q: move.from.q, r: move.from.r, s: move.from.s },
    to: { q: move.to.q, r: move.to.r, s: move.to.s },
    isJump: move.isJump,
    ...(move.jumpPath ? { jumpPath: move.jumpPath.map(c => ({ q: c.q, r: c.r, s: c.s })) } : {}),
    ...(move.isSwap ? { isSwap: true } : {}),
    ...(move.player !== undefined ? { player: move.player } : {}),
    ...(move.turnNumber !== undefined ? { turnNumber: move.turnNumber } : {}),
  };
}

/**
 * Syncs the current local game to Convex after each turn, for authenticated users.
 * Deletes the in-progress record when the game finishes.
 */
export function useLocalGameSync() {
  const { gameState, gameId } = useGameStore();
  const { isAuthenticated } = useAuthStore();
  const saveInProgress = useMutation(api.localGames.saveInProgress);
  const deleteInProgress = useMutation(api.localGames.deleteInProgress);

  // Track the last turnNumber we synced so we don't re-save on every render
  const lastSyncedTurnRef = useRef<number | null>(null);
  const lastGameIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !gameState || !gameId) return;

    const turnNumber = gameState.turnNumber;

    // Reset tracking when game changes
    if (lastGameIdRef.current !== gameId) {
      lastGameIdRef.current = gameId;
      lastSyncedTurnRef.current = null;
    }

    // Already synced this turn
    if (lastSyncedTurnRef.current === turnNumber) return;

    if (isGameFullyOver(gameState)) {
      // Game is done — remove the in-progress record (completed game goes to savedGames)
      lastSyncedTurnRef.current = turnNumber;
      deleteInProgress({ gameId }).catch(() => {});
      return;
    }

    lastSyncedTurnRef.current = turnNumber;

    const normalizedMoves = normalizeMoveHistory(gameState.moveHistory, gameState.activePlayers);
    const now = Date.now();

    const gameData = {
      id: gameId,
      initialConfig: {
        playerCount: gameState.playerCount,
        activePlayers: [...gameState.activePlayers],
        ...(gameState.playerColors ? { playerColors: { ...gameState.playerColors } } : {}),
        ...(gameState.aiPlayers ? { aiPlayers: { ...gameState.aiPlayers } } : {}),
        ...(gameState.isCustomLayout ? {
          isCustomLayout: true,
          customCells: Array.from(gameState.board.keys()),
          customStartingPositions: gameState.startingPositions ? { ...gameState.startingPositions } : undefined,
          customGoalPositions: gameState.customGoalPositions ? { ...gameState.customGoalPositions } : undefined,
          customWalls: Array.from(gameState.board.entries())
            .filter(([_, c]) => c.type === 'wall')
            .map(([k]) => k),
        } : {}),
        ...(gameState.teamMode ? { teamMode: true } : {}),
      },
      moves: normalizedMoves.map(serializeMove),
      finishedPlayers: gameState.finishedPlayers.map(fp => ({ ...fp })),
      dateSaved: now,
    };

    const summary = {
      id: gameId,
      updatedAt: now,
      playerCount: gameState.playerCount,
      activePlayers: [...gameState.activePlayers],
      turnNumber,
      totalMoves: normalizedMoves.length,
      ...(gameState.playerColors ? { playerColors: { ...gameState.playerColors } } : {}),
      ...(gameState.aiPlayers ? { aiPlayers: { ...gameState.aiPlayers } } : {}),
    };

    saveInProgress({ gameId, gameData, summary }).catch(() => {});
  }, [gameState?.turnNumber, gameId, isAuthenticated]);
}
