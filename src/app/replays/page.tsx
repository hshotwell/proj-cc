'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SavedGameSummary } from '@/types/replay';
import { getPlayerColor, getPlayerDisplayName } from '@/game/colors';
import { getSavedGamesList, deleteSavedGame } from '@/game/persistence';

export default function ReplaysPage() {
  const router = useRouter();
  const [games, setGames] = useState<SavedGameSummary[]>([]);

  useEffect(() => {
    setGames(getSavedGamesList());
  }, []);

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSavedGame(id);
    setGames(getSavedGamesList());
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Past Games</h1>
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Back to Home
          </Link>
        </div>

        {games.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500 mb-4">No saved games yet</p>
            <Link
              href="/play"
              className="inline-block px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-500 transition-colors"
            >
              Play a Game
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {games.map((game) => {
              const winnerColor = getPlayerColor(game.winner, game.playerColors);
              const winnerName = getPlayerDisplayName(game.winner, game.activePlayers);
              const dateStr = new Date(game.dateSaved).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={game.id}
                  onClick={() => router.push(`/replay/${game.id}`)}
                  className="bg-white rounded-lg shadow p-4 cursor-pointer hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-5 h-5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: winnerColor }}
                      />
                      <div>
                        <div className="font-medium text-gray-900">
                          <span style={{ color: winnerColor }}>{winnerName}</span> won
                        </div>
                        <div className="text-xs text-gray-500">
                          {game.playerCount} players &middot; {game.totalMoves} moves &middot; {dateStr}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {game.longestHop > 0 && (
                        <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                          {game.longestHop}-jump hop
                        </span>
                      )}
                      <button
                        onClick={(e) => handleDelete(game.id, e)}
                        className="text-gray-400 hover:text-red-500 transition-colors p-1"
                        title="Delete"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
