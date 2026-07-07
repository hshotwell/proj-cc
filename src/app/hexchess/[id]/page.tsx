'use client';

import { useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useHexChessStore } from '@/store/hexChessStore';
import { HexGameContainer } from '@/components/hexchess/HexGameContainer';

export default function HexChessGamePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const gameId = params?.id;
  const currentGameId = useHexChessStore((s) => s.gameId);

  // Guard against double-loading on StrictMode double-invoke
  const loadedRef = useRef(false);

  // If the store doesn't already have this game, try to restore it from localStorage.
  // If no saved game is found either, redirect to /play so the user isn't stuck.
  useEffect(() => {
    if (!gameId) return;
    if (currentGameId === gameId) return; // already loaded
    if (loadedRef.current) return;
    loadedRef.current = true;

    import('@/game/hexchess/persistence').then(({ loadHexChessGame }) => {
      const saved = loadHexChessGame(gameId);
      if (saved) {
        useHexChessStore.getState().loadGame(gameId, saved.state, saved.config);
      } else {
        // No game found — return to play setup
        router.replace('/play');
      }
    });
  }, [gameId, currentGameId, router]);

  // Show a loading placeholder while we attempt to hydrate the store
  const storeHasGame = useHexChessStore((s) => s.gameId === gameId && s.state !== null);
  if (!storeHasGame) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading game...</div>
      </div>
    );
  }

  return <HexGameContainer />;
}
