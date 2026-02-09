'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import type { PlayerCount, PlayerIndex, BoardLayout, ColorMapping, PlayerNameMapping } from '@/types/game';
import type { AIPlayerMap, AIDifficulty, AIPersonality } from '@/types/ai';
import { PLAYER_COLORS, ACTIVE_PLAYERS } from '@/game/constants';
import { useGameStore } from '@/store/gameStore';
import { useLayoutStore } from '@/store/layoutStore';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { hasEvolvedGenome } from '@/game/training/persistence';

// All available colors for selection
const AVAILABLE_COLORS = Object.values(PLAYER_COLORS);

const PLAYER_COUNT_OPTIONS: { count: PlayerCount; description: string }[] = [
  { count: 2, description: 'Head to head' },
  { count: 3, description: 'Three-way battle' },
  { count: 4, description: 'Two vs Two' },
  { count: 6, description: 'Full board chaos' },
];

export default function PlayPage() {
  const router = useRouter();
  const { startGame, startGameFromLayout } = useGameStore();
  const { layouts, loadLayouts, getDefaultLayout } = useLayoutStore();

  const [selectedCount, setSelectedCount] = useState<PlayerCount>(2);
  const [useCustomLayout, setUseCustomLayout] = useState(false);
  const [selectedLayout, setSelectedLayout] = useState<BoardLayout | null>(null);
  const [customColors, setCustomColors] = useState<ColorMapping>({});
  const [playerNames, setPlayerNames] = useState<PlayerNameMapping>({});
  const [aiConfig, setAiConfig] = useState<AIPlayerMap>({});
  const [evolvedAvailable, setEvolvedAvailable] = useState(false);
  const [editingName, setEditingName] = useState<PlayerIndex | null>(null);

  // Check for evolved genome on mount
  useEffect(() => {
    setEvolvedAvailable(hasEvolvedGenome());
  }, []);

  // Load layouts on mount
  useEffect(() => {
    loadLayouts();
  }, [loadLayouts]);

  // Check for default layout
  useEffect(() => {
    const defaultLayout = getDefaultLayout();
    if (defaultLayout) {
      setSelectedLayout(defaultLayout);
    }
  }, [layouts, getDefaultLayout]);

  // Reset custom colors, names, and AI config when player count or layout changes
  useEffect(() => {
    setCustomColors({});
    setPlayerNames({});
    setAiConfig({});
  }, [selectedCount, selectedLayout?.id]);

  const handleColorSelect = (player: PlayerIndex, color: string) => {
    setCustomColors((prev) => ({
      ...prev,
      [player]: color,
    }));
  };

  const handleResetColors = () => {
    setCustomColors({});
  };

  const handleNameChange = (player: PlayerIndex, name: string) => {
    setPlayerNames((prev) => {
      if (name.trim() === '') {
        const next = { ...prev };
        delete next[player];
        return next;
      }
      return { ...prev, [player]: name.trim() };
    });
  };

  const handleStartGame = () => {
    let gameId: string;

    const hasCustomColors = Object.keys(customColors).length > 0;
    const hasCustomNames = Object.keys(playerNames).length > 0;
    const hasAI = Object.keys(aiConfig).length > 0;

    if (useCustomLayout && selectedLayout) {
      gameId = startGameFromLayout(
        selectedLayout,
        hasCustomColors ? customColors : undefined,
        hasAI ? aiConfig : undefined,
        hasCustomNames ? playerNames : undefined
      );
    } else {
      gameId = startGame(
        selectedCount,
        undefined,
        hasCustomColors ? customColors : undefined,
        hasAI ? aiConfig : undefined,
        hasCustomNames ? playerNames : undefined
      );
    }

    router.push(`/game/${gameId}`);
  };

  // Get the effective color for a player (custom or default)
  const getEffectiveColor = (player: PlayerIndex): string => {
    return customColors[player] ?? PLAYER_COLORS[player];
  };

  // Get default player name
  const getDefaultName = (player: PlayerIndex, players: PlayerIndex[]): string => {
    const index = players.indexOf(player);
    return `Player ${index + 1}`;
  };

  // Check if a color is already used by another player
  const isColorUsedByOther = (color: string, currentPlayer: PlayerIndex): boolean => {
    for (const player of configPlayers) {
      if (player !== currentPlayer) {
        const playerColor = getEffectiveColor(player);
        if (playerColor.toLowerCase() === color.toLowerCase()) {
          return true;
        }
      }
    }
    return false;
  };

  // Handle color selection with duplicate check
  const handleColorSelectSafe = (player: PlayerIndex, color: string) => {
    if (!isColorUsedByOther(color, player)) {
      handleColorSelect(player, color);
    }
  };

  const activePlayers = ACTIVE_PLAYERS[selectedCount];

  // Get players from selected layout
  const layoutPlayers: PlayerIndex[] = selectedLayout
    ? Object.entries(selectedLayout.startingPositions)
        .filter(([_, positions]) => positions && positions.length > 0)
        .map(([index]) => Number(index) as PlayerIndex)
    : [];

  // The players to use for color/AI config (differs based on mode)
  const configPlayers = useCustomLayout ? layoutPlayers : activePlayers;

  // Render a player row with name, color, and AI toggle
  const renderPlayerRow = (playerIndex: PlayerIndex, players: PlayerIndex[]) => {
    const currentColor = getEffectiveColor(playerIndex);
    const isAI = aiConfig[playerIndex] != null;
    const currentName = playerNames[playerIndex] || getDefaultName(playerIndex, players);
    const isEditing = editingName === playerIndex;

    return (
      <div
        key={playerIndex}
        className="flex flex-col gap-3 p-4 rounded-lg bg-gray-50"
      >
        {/* Top row: Color, Name, Human/AI toggle */}
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full shadow flex-shrink-0 border-2 border-white"
            style={{ backgroundColor: currentColor }}
          />
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <input
                type="text"
                autoFocus
                defaultValue={currentName}
                placeholder={getDefaultName(playerIndex, players)}
                onBlur={(e) => {
                  handleNameChange(playerIndex, e.target.value);
                  setEditingName(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleNameChange(playerIndex, e.currentTarget.value);
                    setEditingName(null);
                  } else if (e.key === 'Escape') {
                    setEditingName(null);
                  }
                }}
                className="w-full px-2 py-1 text-sm font-medium border border-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            ) : (
              <button
                onClick={() => setEditingName(playerIndex)}
                className="text-left font-medium text-gray-900 hover:text-blue-600 transition-colors"
                title="Click to edit name"
              >
                {currentName}
                {isAI && <span className="ml-1 text-xs text-purple-600">(AI)</span>}
              </button>
            )}
          </div>
          <button
            onClick={() => {
              setAiConfig((prev) => {
                if (prev[playerIndex]) {
                  const next = { ...prev };
                  delete next[playerIndex];
                  return next;
                }
                return { ...prev, [playerIndex]: { difficulty: 'medium' as AIDifficulty, personality: 'generalist' as AIPersonality } };
              });
            }}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex-shrink-0 ${
              isAI
                ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
            }`}
          >
            {isAI ? 'AI' : 'Human'}
          </button>
        </div>

        {/* AI settings row */}
        {isAI && (
          <div className="flex items-center gap-2 pl-13">
            <select
              value={aiConfig[playerIndex]!.difficulty}
              onChange={(e) => {
                const difficulty = e.target.value as AIDifficulty;
                setAiConfig((prev) => ({
                  ...prev,
                  [playerIndex]: { ...prev[playerIndex]!, difficulty },
                }));
              }}
              className="text-sm border border-gray-300 rounded-lg px-2 py-1 bg-white"
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
              <option value="evolved" disabled={!evolvedAvailable}>
                Evolved{!evolvedAvailable ? ' (train first)' : ''}
              </option>
            </select>
            <select
              value={aiConfig[playerIndex]!.personality}
              onChange={(e) => {
                const personality = e.target.value as AIPersonality;
                setAiConfig((prev) => ({
                  ...prev,
                  [playerIndex]: { ...prev[playerIndex]!, personality },
                }));
              }}
              className="text-sm border border-gray-300 rounded-lg px-2 py-1 bg-white"
            >
              <option value="generalist">Generalist</option>
              <option value="defensive">Defensive</option>
              <option value="aggressive">Aggressive</option>
            </select>
          </div>
        )}

        {/* Color selection row */}
        <div className="flex gap-2 flex-wrap items-center">
          {AVAILABLE_COLORS.map((color) => {
            const isCurrentColor = currentColor.toLowerCase() === color.toLowerCase();
            const isTaken = isColorUsedByOther(color, playerIndex);
            return (
              <button
                key={color}
                onClick={() => handleColorSelectSafe(playerIndex, color)}
                disabled={isTaken}
                className={`w-7 h-7 rounded-full border-2 transition-all ${
                  isCurrentColor
                    ? 'border-gray-800 ring-2 ring-offset-1 ring-gray-400'
                    : isTaken
                    ? 'border-gray-300 opacity-40 cursor-not-allowed'
                    : 'border-white shadow hover:scale-110'
                }`}
                style={{ backgroundColor: color }}
                title={isTaken ? 'Color already in use' : `Select ${color}`}
              />
            );
          })}
          <ColorPicker
            value={currentColor}
            onChange={(newColor) => {
              if (!isColorUsedByOther(newColor, playerIndex)) {
                handleColorSelect(playerIndex, newColor);
              }
            }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-gray-700 mb-4 inline-block"
          >
            &larr; Back to Home
          </Link>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">New Game</h1>
          <p className="text-gray-600">Choose your game setup</p>
        </div>

        {/* Board type toggle */}
        <div className="flex items-center justify-center gap-4 mb-8">
          <button
            onClick={() => setUseCustomLayout(false)}
            className={`px-4 py-2 rounded-lg transition-all ${
              !useCustomLayout
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Standard Board
          </button>
          <button
            onClick={() => setUseCustomLayout(true)}
            className={`px-4 py-2 rounded-lg transition-all ${
              useCustomLayout
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Custom Layout
          </button>
        </div>

        {!useCustomLayout ? (
          <>
            {/* Player count selection */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {PLAYER_COUNT_OPTIONS.map(({ count, description }) => (
                <button
                  key={count}
                  onClick={() => setSelectedCount(count)}
                  className={`p-6 rounded-xl border-2 transition-all ${
                    selectedCount === count
                      ? 'border-blue-500 bg-blue-50 shadow-lg'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="text-4xl font-bold text-gray-900 mb-1">{count}</div>
                  <div className="text-sm text-gray-500">{description}</div>
                </button>
              ))}
            </div>

            {/* Players section (combined colors, names, and AI) */}
            <div className="bg-white rounded-xl shadow p-6 mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Players</h2>
                {Object.keys(customColors).length > 0 && (
                  <button
                    onClick={handleResetColors}
                    className="text-sm text-blue-600 hover:text-blue-500"
                  >
                    Reset Colors
                  </button>
                )}
              </div>
              <div className="space-y-3">
                {activePlayers.map((playerIndex) => renderPlayerRow(playerIndex, activePlayers))}
              </div>
              <p className="mt-4 text-xs text-gray-500">
                Click a name to edit it. Toggle Human/AI and choose colors for each player.
              </p>
            </div>
          </>
        ) : (
          <>
            {/* Custom layout selection */}
            <div className="bg-white rounded-xl shadow p-6 mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Layout</h2>

              {layouts.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p className="mb-4">No custom layouts saved yet.</p>
                  <Link
                    href="/editor"
                    className="text-blue-600 hover:text-blue-500"
                  >
                    Create one in the Board Editor &rarr;
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {layouts.map((layout) => (
                    <button
                      key={layout.id}
                      onClick={() => setSelectedLayout(layout)}
                      className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                        selectedLayout?.id === layout.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-gray-900">
                            {layout.name}
                            {layout.isDefault && (
                              <span className="ml-2 text-xs text-green-600">(default)</span>
                            )}
                          </div>
                          <div className="text-sm text-gray-500">
                            {layout.cells.length} cells
                          </div>
                        </div>
                        <div className="flex gap-1">
                          {Object.entries(layout.startingPositions)
                            .filter(([_, positions]) => positions && positions.length > 0)
                            .map(([index]) => (
                              <div
                                key={index}
                                className="w-6 h-6 rounded-full"
                                style={{ backgroundColor: PLAYER_COLORS[Number(index) as keyof typeof PLAYER_COLORS] }}
                              />
                            ))}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Players section for custom layouts */}
            {selectedLayout && layoutPlayers.length > 0 && (
              <div className="bg-white rounded-xl shadow p-6 mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">Players</h2>
                  {Object.keys(customColors).length > 0 && (
                    <button
                      onClick={handleResetColors}
                      className="text-sm text-blue-600 hover:text-blue-500"
                    >
                      Reset Colors
                    </button>
                  )}
                </div>
                <div className="space-y-3">
                  {layoutPlayers.map((playerIndex) => renderPlayerRow(playerIndex, layoutPlayers))}
                </div>
                <p className="mt-4 text-xs text-gray-500">
                  Click a name to edit it. Toggle Human/AI and choose colors for each player.
                </p>
              </div>
            )}

            <Link
              href="/editor"
              className="block text-center text-sm text-blue-600 hover:text-blue-500 mb-4"
            >
              Create or edit layouts in the Board Editor &rarr;
            </Link>
          </>
        )}

        {/* Start button */}
        <button
          onClick={handleStartGame}
          disabled={useCustomLayout && !selectedLayout}
          className={`w-full py-4 text-xl font-semibold text-white rounded-xl transition-colors shadow-lg ${
            useCustomLayout && !selectedLayout
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-500'
          }`}
        >
          Start Game
        </button>

        {/* Rules hint */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p className="mb-2">
            <strong>How to play:</strong> Move all your pieces to the opposite triangle.
          </p>
          <p>
            Pieces can move to adjacent spaces or jump over other pieces (chain jumps allowed!).
          </p>
        </div>
      </div>
    </div>
  );
}
