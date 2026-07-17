'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SavedGameSummary } from '@/types/replay';
import { getPlayerColor, getPlayerDisplayName } from '@/game/colors';
import {
  getSavedGamesList,
  deleteSavedGame,
  listAllSavedGames,
} from '@/game/persistence';
import type { UnifiedSavedGameSummary } from '@/game/persistence';
import { deleteHexChessGame } from '@/game/hexchess/persistence';

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
  const [unified, setUnified] = useState<UnifiedSavedGameSummary[]>([]);
  // Keep the full Sternhalma summaries for enriched display (winner color, moves, board name, etc.)
  const [sternhalmaMap, setSternhalmaMap] = useState<Map<string, SavedGameSummary>>(new Map());

  function refresh() {
    setUnified(listAllSavedGames());
    const list = getSavedGamesList();
    setSternhalmaMap(new Map(list.map((g) => [g.id, g])));
  }

  useEffect(() => {
    refresh();
  }, []);

  const handleDelete = (entry: UnifiedSavedGameSummary, e: React.MouseEvent) => {
    e.stopPropagation();
    if (entry.mode === 'hexchess') {
      deleteHexChessGame(entry.id);
    } else {
      deleteSavedGame(entry.id);
    }
    refresh();
  };

  const handleClick = (entry: UnifiedSavedGameSummary) => {
    if (entry.mode === 'hexchess') {
      router.push(`/hexchess/replay/${entry.id}`);
    } else {
      router.push(`/replay/${entry.id}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Past Games</h1>
          <div className="flex items-center gap-4">
            <Link
              href="/home"
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Back to Home
            </Link>
          </div>
        </div>

        {unified.length === 0 ? (
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
            {unified.map((entry) => {
              if (entry.mode === 'sternhalma') {
                // Use the full SavedGameSummary from the Sternhalma index for rich display
                const game = sternhalmaMap.get(entry.id);
                if (!game) {
                  // Fallback: render minimal row using unified shape
                  const dateStr = new Date(entry.updatedAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  return (
                    <div
                      key={entry.id}
                      onClick={() => handleClick(entry)}
                      className="bg-white rounded-lg shadow p-4 cursor-pointer hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 flex-shrink-0">
                            CC
                          </span>
                          <div>
                            <div className="font-medium text-gray-900">
                              {entry.players.length} players
                            </div>
                            <div className="text-xs text-gray-500">{dateStr}</div>
                          </div>
                        </div>
                        <button
                          onClick={(e) => handleDelete(entry, e)}
                          className="text-gray-400 hover:text-red-500 transition-colors p-1"
                          title="Delete"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                }

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
                    key={entry.id}
                    onClick={() => handleClick(entry)}
                    className="bg-white rounded-lg shadow p-4 cursor-pointer hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 flex-shrink-0">
                          CC
                        </span>
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
                          onClick={(e) => { e.stopPropagation(); router.push(`/review/${entry.id}`); }}
                          className="text-xs px-2 py-1 rounded border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                          title="Review this game"
                        >
                          Review
                        </button>
                        <button
                          onClick={(e) => handleDelete(entry, e)}
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
              }

              // Hex chess row
              const dateStr = new Date(entry.updatedAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });
              const winner = entry.result?.winnerLabel ?? null;
              const winnerPlayer = entry.players.find(
                (p) => winner && (p.name === winner || p.color === winner),
              );
              const winnerColor = winnerPlayer?.color ?? null;

              return (
                <div
                  key={entry.id}
                  onClick={() => handleClick(entry)}
                  className="bg-white rounded-lg shadow p-4 cursor-pointer hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 flex-shrink-0">
                        Hex
                      </span>
                      {winnerColor && (
                        <div
                          className="w-5 h-5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: winnerColor }}
                        />
                      )}
                      <div>
                        <div className="font-medium text-gray-900">
                          {entry.result ? (
                            winnerColor ? (
                              <span style={{ color: winnerColor }}>{winner}</span>
                            ) : (
                              <span>{winner}</span>
                            )
                          ) : (
                            <span className="text-gray-500">In progress</span>
                          )}
                          {entry.result && ' won'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {entry.players.length} players &middot; {dateStr}
                          {entry.result?.reason ? ` · ${entry.result.reason}` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right mr-1">
                        <div className="text-sm text-gray-700 leading-tight">Hex Chess</div>
                        <div className="text-xs text-gray-400 leading-tight">
                          {entry.players.map((p) => p.name).join(' vs ')}
                        </div>
                      </div>
                      <button
                        onClick={(e) => handleDelete(entry, e)}
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
