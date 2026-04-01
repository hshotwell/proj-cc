'use client';

import { useEffect, useRef } from 'react';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useOpeningStore } from '@/store/openingStore';
import { isGameFullyOver } from '@/game/state';
import { getMovesForOpening, getOpeningMove } from '@/game/ai/openingBook';

const OPENING_PLAY_DELAY = 500; // ms before auto-playing (player can see it happening)

export function usePlayerOpening() {
  const { gameState, pendingConfirmation, animatingPiece } = useGameStore();
  const enabled = useSettingsStore((s) => s.usePlayerOpening);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Only fire on human turns (no AI entry in aiPlayers for currentPlayer)
  const isHumanTurn =
    enabled &&
    gameState != null &&
    !isGameFullyOver(gameState) &&
    !pendingConfirmation &&
    !animatingPiece &&
    !gameState.isCustomLayout &&
    !gameState.aiPlayers?.[gameState.currentPlayer];

  // Phase 1: It's the human's turn — look up and play the next opening move
  useEffect(() => {
    if (!isHumanTurn || !gameState) return;

    const store = useOpeningStore.getState();
    const openingId = store.playerOpeningId;
    if (!openingId) return;

    // Validate mode compatibility: non-normal modes require a custom opening with matching gameMode
    const variant = gameState.playerPieceTypes?.[gameState.currentPlayer] ?? 'normal';
    if (variant !== 'normal') {
      const opening = store.customOpenings.find((o) => o.id === openingId);
      if (!opening || (opening.gameMode ?? 'normal') !== variant) return;
    }

    const moves = getMovesForOpening(openingId, store.customOpenings);
    if (moves.length === 0) return;

    const player = gameState.currentPlayer;
    const move = getOpeningMove(gameState, player, moves);
    if (!move) return; // Opening exhausted or diverged — player moves manually

    const turnSnapshot = gameState.turnNumber;
    const playerSnapshot = player;

    timerRef.current = setTimeout(() => {
      const current = useGameStore.getState();
      if (
        !current.gameState ||
        current.pendingConfirmation ||
        current.animatingPiece ||
        isGameFullyOver(current.gameState) ||
        current.gameState.turnNumber !== turnSnapshot ||
        current.gameState.currentPlayer !== playerSnapshot
      ) return;

      current.selectPiece(move.from);
      setTimeout(() => {
        const animate = useSettingsStore.getState().animateMoves;
        useGameStore.getState().makeMove(move.to, animate);
      }, 50);
    }, OPENING_PLAY_DELAY);

    return () => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };
  }, [isHumanTurn, gameState?.currentPlayer, gameState?.turnNumber]);

  // Phase 2: Move is pending — auto-confirm while still within the opening sequence
  useEffect(() => {
    if (!enabled || !pendingConfirmation || animatingPiece) return;
    if (!gameState || isGameFullyOver(gameState)) return;
    if (gameState.aiPlayers?.[gameState.currentPlayer]) return; // AI's pending move

    const store = useOpeningStore.getState();
    const openingId = store.playerOpeningId;
    if (!openingId) return;

    const moves = getMovesForOpening(openingId, store.customOpenings);
    const player = gameState.currentPlayer;
    // Count moves this player has committed so far (pending move not yet in history)
    const committed = gameState.moveHistory.filter((m) => m.player === player).length;
    if (committed >= moves.length) return; // Opening done — player confirms manually

    confirmTimerRef.current = setTimeout(() => {
      const current = useGameStore.getState();
      if (current.pendingConfirmation && !current.animatingPiece) {
        current.confirmMove();
      }
    }, 200);

    return () => {
      if (confirmTimerRef.current) { clearTimeout(confirmTimerRef.current); confirmTimerRef.current = null; }
    };
  }, [enabled, pendingConfirmation, animatingPiece, gameState?.currentPlayer, gameState?.turnNumber]);
}
