'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation } from 'convex/react';
import type { Id } from '../../../../convex/_generated/dataModel';
import { api } from '../../../../convex/_generated/api';
import { AuthGuard } from '@/components/auth';
import { useOnlineGame } from '@/hooks/useOnlineGame';
import { useOnlineGameLearning } from '@/hooks/useOnlineGameLearning';
import { useGameStore } from '@/store/gameStore';
import { useAuthStore } from '@/store/authStore';
import { useAITurn } from '@/hooks/useAITurn';
import { Board } from '@/components/board';
import { TurnIndicator } from '@/components/game/TurnIndicator';
import { MoveConfirmation } from '@/components/game/MoveConfirmation';
import { SettingsPopup } from '@/components/SettingsPopup';
import { SettingsButton } from '@/components/SettingsButton';
import { getPlayerColorFromState, getPlayerDisplayNameFromState } from '@/game/colors';
import type { PlayerIndex } from '@/types/game';

const RANK_LABELS = ['1st', '2nd', '3rd', '4th', '5th', '6th'];

function OnlineGameOverDialog({ gameId }: { gameId: Id<"onlineGames"> }) {
  const { onlineGame } = useOnlineGame(gameId);
  const { gameState } = useGameStore();
  const { user } = useAuthStore();
  const router = useRouter();

  const requestRematch = useMutation(api.onlineGames.requestRematch);
  const acceptRematch = useMutation(api.onlineGames.acceptRematch);
  const declineRematch = useMutation(api.onlineGames.declineRematch);

  const isFinished = onlineGame?.status === 'finished';
  const rematchGameId = onlineGame?.rematchGameId as Id<"onlineGames"> | undefined;

  // Redirect to new game when rematch is created
  useEffect(() => {
    if (rematchGameId) {
      router.replace(`/online/${rematchGameId}`);
    }
  }, [rematchGameId, router]);

  if (!isFinished || !gameState || !onlineGame) return null;

  const { finishedPlayers } = gameState;
  const firstMoveCount = finishedPlayers[0]?.moveCount ?? 0;

  const myUserId = user?.id;
  const rematchRequestedBy = onlineGame.rematchRequestedBy as string | undefined;
  const rematchAcceptedBy = (onlineGame.rematchAcceptedBy as string[] | undefined) ?? [];
  const rematchDeclinedBy = onlineGame.rematchDeclinedBy as string | undefined;

  const iRequested = rematchRequestedBy === myUserId;
  const iAlreadyAccepted = rematchAcceptedBy.includes(myUserId ?? '');
  const someoneRequestedRematch = !!rematchRequestedBy;
  const rematchWasDeclined = !!rematchDeclinedBy;

  // Find the requester's username for display
  const players = (onlineGame.players as any[]) ?? [];
  const requesterPlayer = players.find((p: any) => p.userId === rematchRequestedBy);
  const requesterName = requesterPlayer?.username ?? 'Someone';
  const declinerPlayer = players.find((p: any) => p.userId === rematchDeclinedBy);
  const declinerName = declinerPlayer?.username ?? 'Someone';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Game Over!</h2>

          <div className="space-y-2 mb-6 text-left">
            {finishedPlayers.map((fp, i) => {
              const color = getPlayerColorFromState(fp.player, gameState);
              const name = getPlayerDisplayNameFromState(fp.player, gameState);
              const extra = fp.moveCount - firstMoveCount;
              return (
                <div key={fp.player} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50">
                  <span className="text-sm font-bold text-gray-500 w-8">{RANK_LABELS[i]}</span>
                  <div
                    className="w-5 h-5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="font-semibold flex-1" style={{ color }}>
                    {name}
                  </span>
                  {i > 0 && (
                    <span className="text-xs text-gray-400">+{extra} moves</span>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-sm text-gray-500 mb-6">
            Completed in {gameState.moveHistory.length} moves over{' '}
            {Math.max(1, gameState.turnNumber - 1)} turns
          </p>

          {/* Rematch state */}
          {rematchWasDeclined && (
            <p className="text-sm text-red-500 mb-4">
              {declinerName} declined the rematch.
            </p>
          )}

          {someoneRequestedRematch && !rematchWasDeclined && iRequested && (
            <p className="text-sm text-blue-600 mb-4">
              Waiting for others to accept...
            </p>
          )}

          {someoneRequestedRematch && !rematchWasDeclined && !iRequested && !iAlreadyAccepted && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800 mb-3">
                <span className="font-semibold">{requesterName}</span> wants a rematch!
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => void acceptRematch({ gameId })}
                  className="flex-1 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-500 transition-colors"
                >
                  Accept
                </button>
                <button
                  onClick={() => void declineRematch({ gameId })}
                  className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-500 transition-colors"
                >
                  Decline
                </button>
              </div>
            </div>
          )}

          {someoneRequestedRematch && !rematchWasDeclined && !iRequested && iAlreadyAccepted && (
            <p className="text-sm text-green-600 mb-4">
              Waiting for others to accept...
            </p>
          )}

          <div className="flex flex-col gap-3">
            {!someoneRequestedRematch && (
              <button
                onClick={() => void requestRematch({ gameId })}
                className="w-full px-6 py-3 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors"
              >
                Rematch
              </button>
            )}
            <button
              onClick={() => router.push('/profile')}
              className="w-full px-6 py-3 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors"
            >
              Back to Profile
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

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

  // Learn from finished games
  useOnlineGameLearning(gameId, onlineGame);

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
  const canInteract = isMyTurn || (isHost && isAITurn);

  // Compute local player's PlayerIndex for board rotation
  const localPlayerColor = myPlayerIndex >= 0 && gameState
    ? gameState.activePlayers[myPlayerIndex]
    : undefined;

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

        {/* Board - disable interaction when not your turn */}
        <div className="relative w-full bg-white rounded-lg shadow-lg p-2 sm:p-4">
          <SettingsButton />
          <div style={!canInteract && !isFinished ? { pointerEvents: 'none' } : undefined}>
            <Board
              fixedRotationPlayer={localPlayerColor as PlayerIndex | undefined}
              isLocalPlayerTurn={isMyTurn}
            />
          </div>
        </div>

        {/* Turn status banner - below board */}
        {!isFinished && !isMyTurn && !isAITurn && myPlayerIndex >= 0 && (
          <div className="mt-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-center">
            <p className="text-sm text-amber-800">
              Waiting for <span className="font-semibold">{currentPlayerName}</span>...
            </p>
          </div>
        )}

        {!isFinished && isAITurn && (
          <div className="mt-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-center">
            <p className="text-sm text-blue-800">AI is thinking...</p>
          </div>
        )}

        {/* Turn Indicator */}
        <div className="mt-2 sm:mt-4">
          <TurnIndicator />
        </div>

        {/* Move Confirmation - only show when it's your turn */}
        {isMyTurn && <MoveConfirmation />}
      </div>

      {/* Online Game Over Dialog - gated on server status, not local state */}
      <OnlineGameOverDialog gameId={gameId} />

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
