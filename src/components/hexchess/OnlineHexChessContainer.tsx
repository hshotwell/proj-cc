'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { useHexChessStore, selectHexChessBoardView } from '@/store/hexChessStore';
import { useSettingsStore } from '@/store/settingsStore';
import { Board } from '@/components/board/Board';
import { SettingsButton } from '@/components/SettingsButton';
import { SettingsPopup } from '@/components/SettingsPopup';
import { PromotionPicker } from '@/components/hexchess/PromotionPicker';
import { HexTurnIndicator } from '@/components/hexchess/HexTurnIndicator';
import { HexMoveIndicator } from '@/components/hexchess/HexMoveIndicator';
import { HexClearPreMovesButton } from '@/components/hexchess/HexClearPreMovesButton';
import type { CubeCoord } from '@/types/game';
import { cubeEquals } from '@/game/coordinates';
import { useOnlineHexChess } from '@/hooks/useOnlineHexChess';
import { useHexChessAITurn } from '@/hooks/useHexChessAITurn';
import { useHexChessPreMoveFiring } from '@/hooks/useHexChessPreMoveFiring';
import { saveHexChessGame } from '@/game/hexchess/persistence';
import { playGameOver, playYourTurn } from '@/audio/soundEffects';
import { useAuthStore } from '@/store/authStore';
import { ColorSwatch } from '@/components/ui/SpecialSwatch';
import type { HexPlayerIndex } from '@/game/hexchess';

function reasonLabel(reason: string): string {
  return reason === 'king-capture' ? 'last player standing' : reason;
}

interface OnlineHexGameOverDialogProps {
  gameId: Id<'onlineGames'>;
  // The live lobby doc; loosely typed like the sternhalma dialog.
  onlineGame: Record<string, unknown>;
}

function OnlineHexGameOverDialog({ gameId, onlineGame }: OnlineHexGameOverDialogProps) {
  const { state, config } = useHexChessStore();
  const { user } = useAuthStore();
  const router = useRouter();

  const requestRematch = useMutation(api.onlineGames.requestRematch);
  const acceptRematch = useMutation(api.onlineGames.acceptRematch);
  const declineRematch = useMutation(api.onlineGames.declineRematch);

  // Redirect to the new game when a rematch is created.
  const rematchGameId = onlineGame.rematchGameId as Id<'onlineGames'> | undefined;
  useEffect(() => {
    if (rematchGameId) router.replace(`/online/${rematchGameId}`);
  }, [rematchGameId, router]);

  if (onlineGame.status !== 'finished' || !state?.result || !config) return null;

  const { winner, reason } = state.result;
  const isDraw = winner === 'draw';
  const winnerConfig = isDraw ? null : config.players[winner];

  const isMultiplayer = state.activePlayers.length > 2;
  const finishOrder = isMultiplayer && !isDraw
    ? [winner as number, ...[...state.eliminated].reverse()]
    : null;

  const myUserId = user?.id;
  const players = (onlineGame.players as { userId?: string; username?: string }[]) ?? [];
  const rematchRequestedBy = onlineGame.rematchRequestedBy as string | undefined;
  const rematchAcceptedBy = (onlineGame.rematchAcceptedBy as string[] | undefined) ?? [];
  const rematchDeclinedBy = onlineGame.rematchDeclinedBy as string | undefined;

  const iRequested = rematchRequestedBy === myUserId;
  const iAlreadyAccepted = rematchAcceptedBy.includes(myUserId ?? '');
  const someoneRequestedRematch = !!rematchRequestedBy;
  const rematchWasDeclined = !!rematchDeclinedBy;
  const requesterName = players.find((p) => p.userId === rematchRequestedBy)?.username ?? 'Someone';
  const declinerName = players.find((p) => p.userId === rematchDeclinedBy)?.username ?? 'Someone';

  return (
    <div
      className="fixed left-0 right-0 top-4 sm:top-8 z-50 flex justify-center pointer-events-none px-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative bg-white rounded-lg shadow-xl border border-gray-200 p-4 sm:p-5 max-w-sm w-full pointer-events-auto">
        <div className="flex items-start gap-3">
          {!isDraw && winnerConfig && (
            <ColorSwatch color={winnerConfig.color} className="w-8 h-8 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold leading-tight">
              {isDraw ? 'Draw' : `${winnerConfig!.name} wins`}
            </h2>
            <p className="text-sm text-gray-600">{reasonLabel(reason)}</p>
          </div>
        </div>
        {finishOrder && (
          <ol className="mt-3 space-y-1">
            {finishOrder.map((seat, i) => {
              const seatConfig = config.players[seat as HexPlayerIndex]!;
              return (
                <li key={seat} className="flex items-center gap-2 text-sm">
                  <span className="w-8 text-gray-500">{i + 1}.</span>
                  <ColorSwatch color={seatConfig.color} className="w-4 h-4" />
                  <span className={i === 0 ? 'font-medium' : 'text-gray-600'}>
                    {seatConfig.name}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {/* Rematch state */}
        {rematchWasDeclined && (
          <p className="mt-3 text-sm text-red-500">
            {declinerName} declined the rematch.
          </p>
        )}
        {someoneRequestedRematch && !rematchWasDeclined && (iRequested || iAlreadyAccepted) && (
          <p className="mt-3 text-sm text-blue-600">Waiting for others to accept...</p>
        )}
        {someoneRequestedRematch && !rematchWasDeclined && !iRequested && !iAlreadyAccepted && (
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800 mb-2">
              <span className="font-semibold">{requesterName}</span> wants a rematch!
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => void acceptRematch({ gameId })}
                className="flex-1 px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-500 transition-colors"
              >
                Accept
              </button>
              <button
                onClick={() => void declineRematch({ gameId })}
                className="flex-1 px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-500 transition-colors"
              >
                Decline
              </button>
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            className="px-3 py-1 text-sm rounded bg-gray-200 hover:bg-gray-300"
            onClick={() => router.push('/profile')}
          >
            Profile
          </button>
          <Link
            href={`/hexchess/replay/${config.id}`}
            className="px-3 py-1 text-sm rounded bg-amber-500 text-white hover:bg-amber-400"
          >
            Replay
          </Link>
          <Link
            href={`/hexchess/review/${config.id}`}
            className="px-3 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            Review
          </Link>
          {!someoneRequestedRematch && (
            <button
              type="button"
              className="px-3 py-1 text-sm rounded bg-gray-900 text-white hover:bg-gray-800"
              onClick={() => void requestRematch({ gameId })}
            >
              Rematch
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function OnlineHexChessContainer({ gameId }: { gameId: Id<'onlineGames'> }) {
  const router = useRouter();
  const {
    onlineGame, isMyTurn, isHost, isAITurn, isSubmitting, mySlotIndex, mySeat, submitResign,
  } = useOnlineHexChess(gameId);
  const abandonGame = useMutation(api.onlineGames.abandonGame);

  // AI turns run only on the host's client.
  useHexChessAITurn(isHost && isAITurn);

  const store = useHexChessStore();
  const view = selectHexChessBoardView(store);
  const preMovesSetting = useSettingsStore((s) => s.preMoves);

  const preMovesAllowed = !!(
    preMovesSetting &&
    mySeat !== undefined &&
    store.state &&
    store.state.result === null &&
    !isMyTurn &&
    store.state.pendingPromotion === null
  );

  useHexChessPreMoveFiring(mySeat, preMovesSetting && mySeat !== undefined);

  // Drop queued pre-moves when the setting turns off or the game ends.
  useEffect(() => {
    if (!preMovesSetting) useHexChessStore.getState().clearAllPreMoves();
  }, [preMovesSetting]);
  useEffect(() => {
    if (store.state?.result) useHexChessStore.getState().clearAllPreMoves();
  }, [store.state?.result]);
  useEffect(() => {
    if (!preMovesAllowed) useHexChessStore.getState().cancelPreMovePromotion();
  }, [preMovesAllowed]);

  // Ping when it becomes my turn (skip initial mount).
  const wasMyTurnRef = useRef<boolean | null>(null);
  useEffect(() => {
    const prev = wasMyTurnRef.current;
    wasMyTurnRef.current = isMyTurn;
    if (prev === null) return;
    if (!prev && isMyTurn && onlineGame?.status === 'playing') {
      playYourTurn();
    }
  }, [isMyTurn, onlineGame?.status]);

  // Save the finished game to local persistence (enables replay/review).
  const savedRef = useRef(false);
  useEffect(() => {
    if (onlineGame?.status === 'finished' && store.state && store.config && !savedRef.current) {
      savedRef.current = true;
      saveHexChessGame(store.config, store.state);
      playGameOver();
    }
  }, [onlineGame?.status, store.state, store.config]);

  // Redirects
  useEffect(() => {
    if (onlineGame?.status === 'abandoned') router.replace('/profile');
    if (onlineGame?.status === 'lobby') router.replace(`/lobby/${gameId}`);
  }, [onlineGame?.status, router, gameId]);

  const handleCellClick = (cell: CubeCoord) => {
    const s = useHexChessStore.getState();
    const state = s.state;
    if (!state) return;

    // Pre-move mode: divert clicks away from the normal move flow entirely.
    if (preMovesAllowed) {
      const virtualPieces = s.getVirtualPieces();
      const hit = virtualPieces.find((p) => cubeEquals(p.cell, cell));
      if (hit && mySeat !== undefined && hit.player === mySeat) {
        s.selectPreMovePiece(hit.id);
      } else if (s.preMoveSelectedPieceId !== null) {
        s.queuePreMove(cell);
      }
      return;
    }

    // Only the current player may interact, and not while a submit is in flight.
    if (!isMyTurn || isSubmitting) return;

    const isLegal = s.legalMoveTargets.some((m) => cubeEquals(m.to, cell));
    if (isLegal) {
      s.attemptMove(cell);
      return;
    }

    // En passant: clicking the doomed piece performs the capture.
    const epMove = s.legalMoveTargets.find(
      (m) => m.capture !== null && cubeEquals(m.capture.cell, cell),
    );
    if (epMove) {
      s.attemptMove(epMove.to);
      return;
    }

    const piece = state.pieces.find(
      (p) => p.player === state.currentPlayer && cubeEquals(p.cell, cell),
    );
    if (piece) {
      if (s.selectedPieceId === piece.id) {
        s.selectPiece(null);
      } else {
        s.selectPiece(piece.id);
      }
      return;
    }

    s.selectPiece(null);
  };

  const handleCellRightClick = (cell: CubeCoord): boolean => {
    if (!preMovesAllowed) return false;
    const s = useHexChessStore.getState();

    const idx = s.preMoves.findIndex((pm) => cubeEquals(pm.to, cell));
    if (idx >= 0) {
      s.cancelPreMoveAt(idx);
      return true;
    }

    if (s.preMoveSelectedPieceId !== null) {
      const virtualPieces = s.getVirtualPieces();
      const selected = virtualPieces.find((p) => p.id === s.preMoveSelectedPieceId);
      if (selected && cubeEquals(selected.cell, cell)) {
        s.selectPreMovePiece(null);
        return true;
      }
    }

    return false;
  };

  const handleResign = () => {
    if (window.confirm('Really resign?')) {
      void submitResign();
    }
  };

  const handleAbandon = async () => {
    try {
      await abandonGame({ gameId });
      router.push('/profile');
    } catch (e) {
      console.error('Failed to abandon game:', e);
    }
  };

  if (!onlineGame || !store.state || !store.config) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  const isFinished = onlineGame.status === 'finished';
  const currentColor = store.config.players[store.state.currentPlayer]!.color;
  const players = onlineGame.players as { username?: string }[];
  const currentPlayerName =
    players[onlineGame.currentPlayerIndex ?? 0]?.username ?? 'AI';
  const canResign =
    store.state.result === null &&
    mySeat !== undefined &&
    !store.state.eliminated.includes(mySeat);

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

        {/* Board card */}
        <div className="relative w-full bg-white rounded-lg shadow-lg p-2 sm:p-4">
          <SettingsButton />
          {view && (
            <Board
              view={view}
              onCellClick={handleCellClick}
              onCellRightClick={handleCellRightClick}
              localPlayer={mySeat}
            />
          )}
          {store.state.pendingPromotion && isMyTurn && (
            <PromotionPicker
              pieceCell={store.state.pendingPromotion.targetCell}
              playerColor={currentColor}
              onChoose={(choice) => store.confirmPromotion(choice)}
            />
          )}
          {!store.state.pendingPromotion &&
            store.pendingPreMovePromotion &&
            mySeat !== undefined &&
            preMovesAllowed && (
            <PromotionPicker
              pieceCell={store.pendingPreMovePromotion.to}
              playerColor={store.config.players[mySeat]!.color}
              onChoose={(choice) => store.confirmPreMovePromotion(choice)}
              onCancel={() => store.cancelPreMovePromotion()}
            />
          )}
        </div>

        {/* Turn status banners */}
        {!isFinished && !isMyTurn && !isAITurn && mySlotIndex >= 0 && (
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

        {/* Last-move summary + resign */}
        <div className="mt-2 sm:mt-3">
          <HexMoveIndicator
            lastMove={store.lastMove}
            canResign={canResign}
            onResign={handleResign}
          />
        </div>

        {preMovesAllowed && <HexClearPreMovesButton localPlayer={mySeat} />}

        {/* Turn indicator */}
        <div className="mt-2 sm:mt-3">
          <HexTurnIndicator state={store.state} config={store.config} />
        </div>
      </div>

      {/* Online game-over: rematch + review/replay (gated on server status) */}
      <OnlineHexGameOverDialog gameId={gameId} onlineGame={onlineGame as unknown as Record<string, unknown>} />

      <SettingsPopup mode="hexchess" />
    </div>
  );
}
