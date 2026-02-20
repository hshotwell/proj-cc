'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation } from 'convex/react';
import type { Id } from '../../../../convex/_generated/dataModel';
import { api } from '../../../../convex/_generated/api';
import { AuthGuard } from '@/components/auth';
import { useOnlineGame } from '@/hooks/useOnlineGame';
import { useGameStore } from '@/store/gameStore';
import { useAITurn } from '@/hooks/useAITurn';
import { Board } from '@/components/board';
import { TurnIndicator } from '@/components/game/TurnIndicator';
import { MoveConfirmation } from '@/components/game/MoveConfirmation';
import { GameOverDialog } from '@/components/game/GameOverDialog';
import { SettingsPopup } from '@/components/SettingsPopup';
import { SettingsButton } from '@/components/SettingsButton';

function OnlineGameContent() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.id as Id<"onlineGames">;
  const abandonGame = useMutation(api.onlineGames.abandonGame);

  const {
    onlineGame,
    gameState,
    isMyTurn,
    isHost,
    isAITurn,
    myPlayerIndex,
  } = useOnlineGame(gameId);

  // AI turns run only on host's client
  useAITurn(isHost && isAITurn);

  const { pendingConfirmation } = useGameStore();

  // Redirect if game is abandoned or lobby
  useEffect(() => {
    if (onlineGame?.status === 'abandoned') {
      router.replace('/profile');
    }
    if (onlineGame?.status === 'lobby') {
      router.replace(`/lobby/${gameId}`);
    }
  }, [onlineGame?.status, router, gameId]);

  if (!onlineGame || !gameState) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  const players = onlineGame.players as any[];
  const currentPlayerName = onlineGame.currentPlayerIndex !== undefined
    ? players[onlineGame.currentPlayerIndex]?.username || 'AI'
    : '';
  const isFinished = onlineGame.status === 'finished';

  const handleAbandon = async () => {
    try {
      await abandonGame({ gameId });
      router.push('/profile');
    } catch (e) {
      console.error('Failed to abandon game:', e);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <div className="w-full max-w-2xl mx-auto px-2 sm:px-4 py-2 sm:py-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <Link href="/profile" className="text-blue-600 hover:underline text-sm">
            &larr; Back
          </Link>
          {!isFinished && (
            <button
              onClick={() => void handleAbandon()}
              className="text-xs text-red-500 hover:text-red-700"
            >
              Abandon Game
            </button>
          )}
        </div>

        {/* Turn status banner */}
        {!isFinished && !isMyTurn && !isAITurn && myPlayerIndex >= 0 && (
          <div className="mb-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-center">
            <p className="text-sm text-amber-800">
              Waiting for <span className="font-semibold">{currentPlayerName}</span>...
            </p>
          </div>
        )}

        {!isFinished && isAITurn && (
          <div className="mb-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-center">
            <p className="text-sm text-blue-800">AI is thinking...</p>
          </div>
        )}

        {/* Board */}
        <div className="relative w-full bg-white rounded-lg shadow-lg p-2 sm:p-4">
          <SettingsButton />
          <Board />
        </div>

        {/* Turn Indicator */}
        <div className="mt-2 sm:mt-4">
          <TurnIndicator />
        </div>

        {/* Move Confirmation - only show when it's your turn */}
        {isMyTurn && <MoveConfirmation />}
      </div>

      {/* Game Over Dialog */}
      <GameOverDialog />

      {/* Settings */}
      <SettingsPopup mode="game" />
    </div>
  );
}

export default function OnlineGamePage() {
  return (
    <AuthGuard>
      <OnlineGameContent />
    </AuthGuard>
  );
}
