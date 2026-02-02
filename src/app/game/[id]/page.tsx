'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { GameContainer } from '@/components/game';
import { useGameStore } from '@/store/gameStore';

export default function GamePage() {
  const router = useRouter();
  const params = useParams();
  const { gameState, gameId } = useGameStore();

  useEffect(() => {
    // If no game is loaded or the game ID doesn't match, redirect to play page
    if (!gameState || gameId !== params.id) {
      router.replace('/play');
    }
  }, [gameState, gameId, params.id, router]);

  // Show loading state while checking
  if (!gameState || gameId !== params.id) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading game...</div>
      </div>
    );
  }

  return <GameContainer />;
}
