'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Board } from '@/components/board';
import { SettingsPopup } from '@/components/SettingsPopup';
import { SettingsButton } from '@/components/SettingsButton';
import { TurnIndicator } from './TurnIndicator';
import { GameOverDialog } from './GameOverDialog';
import { MoveConfirmation } from './MoveConfirmation';
import { useAITurn } from '@/hooks/useAITurn';
import { usePlayerOpening } from '@/hooks/usePlayerOpening';
import { usePreMoveFiring } from '@/hooks/usePreMoveFiring';
import { useLocalGameSync } from '@/hooks/useLocalGameSync';
import { TutorialOverlay } from '@/components/tutorial/TutorialOverlay';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { saveCompletedGame } from '@/game/persistence';
import { isGameFullyOver } from '@/game/state';
import { ClearPreMovesButton } from './ClearPreMovesButton';
import type { PlayerIndex } from '@/types/game';
import { useEffect } from 'react';

export function GameContainer() {
  const router = useRouter();
  const { gameState, gameId } = useGameStore();
  const preMovesSetting = useSettingsStore((s) => s.preMoves);
  const clearAllPreMoves = useGameStore((s) => s.clearAllPreMoves);
  useAITurn();
  usePlayerOpening();

  // Local: pre-moves are only enabled if the game has exactly one human player
  // (multi-human hotseat games don't get pre-moves — would be confusing).
  const humanPlayers = gameState
    ? gameState.activePlayers.filter((p) => !gameState.aiPlayers?.[p])
    : [];
  const localPlayer: PlayerIndex | undefined = humanPlayers.length === 1 ? humanPlayers[0] : undefined;
  const preMovesAllowed =
    preMovesSetting &&
    localPlayer !== undefined &&
    !!gameState &&
    !isGameFullyOver(gameState) &&
    gameState.currentPlayer !== localPlayer;

  usePreMoveFiring(localPlayer, preMovesSetting && localPlayer !== undefined);
  useLocalGameSync();

  // If the setting toggles off mid-game, drop any queued pre-moves.
  useEffect(() => {
    if (!preMovesSetting) clearAllPreMoves();
  }, [preMovesSetting, clearAllPreMoves]);

  const hasAI = Object.keys(gameState?.aiPlayers ?? {}).length > 0;
  const isOver = gameState ? isGameFullyOver(gameState) : false;
  const hasMoves = (gameState?.moveHistory.length ?? 0) > 0;
  const showAbandon = hasAI && !isOver && hasMoves;

  function handleAbandon() {
    if (!gameState || !gameId) return;
    saveCompletedGame(gameId, gameState);
    router.push(`/review/${gameId}`);
  }

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <div className="w-full max-w-2xl mx-auto px-2 sm:px-4 py-2 sm:py-4">
        <Link href="/home" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-2 transition-colors">
          ← Home
        </Link>
        <div className="relative w-full bg-white rounded-lg shadow-lg p-2 sm:p-4">
          <SettingsButton />
          <Board preMovesAllowed={preMovesAllowed} localPlayer={localPlayer} />
          <TutorialOverlay />
        </div>
        <MoveConfirmation />
        {preMovesAllowed && <ClearPreMovesButton localPlayer={localPlayer} />}
        <div className="mt-2 sm:mt-4">
          <TurnIndicator />
        </div>
        {showAbandon && (
          <div className="mt-3 text-center">
            <button
              onClick={handleAbandon}
              className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors"
            >
              End game &amp; review moves
            </button>
          </div>
        )}
      </div>
      <GameOverDialog />
      <SettingsPopup mode="game" />
    </div>
  );
}
