'use client';

import { useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { GameContainer } from '@/components/game';
import { useGameStore } from '@/store/gameStore';
import { useAuthStore } from '@/store/authStore';
import { reconstructGameStates } from '@/game/replay';
import type { SavedGameData } from '@/types/replay';
import type { CubeCoord } from '@/types/game';

function restoreCoords(data: SavedGameData): SavedGameData {
  return {
    ...data,
    moves: data.moves.map(m => ({
      ...m,
      from: { q: m.from.q, r: m.from.r, s: -m.from.q - m.from.r },
      to: { q: m.to.q, r: m.to.r, s: -m.to.q - m.to.r },
      ...(m.jumpPath ? {
        jumpPath: m.jumpPath.map((c: CubeCoord) => ({ q: c.q, r: c.r, s: -c.q - c.r })),
      } : {}),
    })),
  };
}

export default function GamePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const { gameState, gameId, loadGame } = useGameStore();
  const { isAuthenticated } = useAuthStore();

  const gameInStore = gameState && gameId === id;

  // Only query Convex when the game isn't in the local store
  const cloudData = useQuery(
    api.localGames.getInProgress,
    !gameInStore && isAuthenticated ? { gameId: id } : 'skip'
  );

  const loadedFromCloudRef = useRef(false);

  useEffect(() => {
    if (gameInStore) return;

    // Still waiting for cloud query
    if (!gameInStore && isAuthenticated && cloudData === undefined) return;

    if (cloudData) {
      if (loadedFromCloudRef.current) return;
      loadedFromCloudRef.current = true;
      try {
        const restored = restoreCoords(cloudData as SavedGameData);
        const states = reconstructGameStates(restored);
        const latestState = states[states.length - 1];
        loadGame(id, latestState);
      } catch {
        router.replace('/play');
      }
      return;
    }

    // No cloud data (or not authenticated) — redirect
    if (cloudData === null || !isAuthenticated) {
      router.replace('/play');
    }
  }, [gameInStore, cloudData, isAuthenticated, id, loadGame, router]);

  if (!gameInStore) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading game...</div>
      </div>
    );
  }

  return <GameContainer />;
}
