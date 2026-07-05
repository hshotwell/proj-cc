'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SavedGameSummary, SavedGameData } from '@/types/replay';
import { getPlayerColor, getPlayerDisplayName } from '@/game/colors';
import { getSavedGamesList, deleteSavedGame, importSavedGame } from '@/game/persistence';

const GAME_MODE_LABELS: Record<string, string> = {
  turbo: 'Turbo mode',
  ghost: 'Spectral mode',
  big: 'Blockade mode',
};

function describeVariations(game: SavedGameSummary): string {
  const parts: string[] = [];
  if (game.gameMode && game.gameMode !== 'normal' && GAME_MODE_LABELS[game.gameMode]) {
    parts.push(GAME_MODE_LABELS[game.gameMode]);
  }
  if (game.teamMode) parts.push('Team mode');
  return parts.length === 0 ? 'Classic mode' : parts.join(' · ');
}

export default function ReplaysPage() {
  const router = useRouter();
  const [games, setGames] = useState<SavedGameSummary[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setGames(getSavedGamesList());
  }, []);

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSavedGame(id);
    setGames(getSavedGamesList());
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (files.length === 0) return;
    const errors: string[] = [];
    for (const file of files) {
      try {
        const text = await file.text();
        const data = JSON.parse(text) as SavedGameData;
        importSavedGame(data);
      } catch (err) {
        errors.push(`${file.name}: ${err instanceof Error ? err.message : 'parse error'}`);
      }
    }
    setGames(getSavedGamesList());
    if (errors.length > 0) setImportError(errors.join('; '));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Past Games</h1>
          <div className="flex items-center gap-4">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
              title="Load a replay JSON exported by the bake-off harness"
            >
              Import JSON
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              multiple
              className="hidden"
              onChange={handleImportFile}
            />
            <Link
              href="/home"
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Back to Home
            </Link>
          </div>
        </div>
        {importError && (
          <div className="mb-4 px-4 py-2 bg-red-50 text-red-700 text-sm rounded border border-red-200">
            Import failed: {importError}
          </div>
        )}

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
                      <div className="text-right mr-1">
                        <div className="text-sm text-gray-700 leading-tight">
                          {game.boardName ?? 'Standard Board'}
                        </div>
                        <div className="text-xs text-gray-400 leading-tight">
                          {describeVariations(game)}
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(`/review/${game.id}`); }}
                        className="text-xs px-2 py-1 rounded border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                        title="Review this game"
                      >
                        Review
                      </button>
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
