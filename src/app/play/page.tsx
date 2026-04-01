'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import type { PlayerCount, PlayerIndex, BoardLayout, ColorMapping, PlayerNameMapping, PieceVariant } from '@/types/game';
import type { AIPlayerMap, AIDifficulty, AIPersonality } from '@/types/ai';
import { PLAYER_COLORS, ROW3_DISPLAY_ORDER, ROW4_DISPLAY_ORDER, ROW5_DISPLAY_ORDER, GEM_COLORS, NEUTRAL_COLORS, ACTIVE_PLAYERS, getMetallicSwatchStyle, getGemSwatchStyle, getGemSimpleBackground, COLOR_DISPLAY_ORDER, getColorName, isFlowerColor, isEggColor } from '@/game/constants';
import { FlowerSwatch, EggSwatch, MetallicGemTwinkle } from '@/components/ui/SpecialSwatch';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useLayoutStore } from '@/store/layoutStore';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { hasEvolvedGenome } from '@/game/training/persistence';
import { areTooSimilar } from '@/game/colors';
import { validateLayout } from '@/game/layoutValidation';
import { DEFAULT_BOARD_LAYOUT } from '@/game/defaultLayout';

const DEFAULT_COLORS = COLOR_DISPLAY_ORDER;
const METALLIC_COLORS_LIST = ROW3_DISPLAY_ORDER;
const FLOWER_COLORS_LIST = ROW4_DISPLAY_ORDER;
const EGG_COLORS_LIST = ROW5_DISPLAY_ORDER;

const PLAYER_COUNT_OPTIONS: { count: PlayerCount; description: string }[] = [
  { count: 2, description: 'Head to head' },
  { count: 3, description: 'Three-way battle' },
  { count: 4, description: 'Two vs Two' },
  { count: 6, description: 'Full board chaos' },
];

// Small SVG preview of a board's cell layout
function BoardPreview({
  cells,
  startingPositions,
  walls = [],
  size = 64,
}: {
  cells: string[];
  startingPositions: Partial<Record<PlayerIndex, string[]>>;
  walls?: string[];
  size?: number;
}) {
  if (cells.length === 0) return <div style={{ width: size, height: size }} />;

  // Pointy-top hex: x = sqrt(3) * (q + r/2), y = 3/2 * r
  const toXY = (key: string) => {
    const [q, r] = key.split(',').map(Number);
    return { x: Math.sqrt(3) * (q + r / 2), y: 1.5 * r };
  };

  const points = cells.map(k => ({ key: k, ...toXY(k) }));
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const range = Math.max(rangeX, rangeY);
  const pad = 2;
  const inner = size - pad * 2;
  const scale = inner / range;
  const offX = (inner - rangeX * scale) / 2;
  const offY = (inner - rangeY * scale) / 2;

  const px = (x: number) => (x - minX) * scale + pad + offX;
  const py = (y: number) => (y - minY) * scale + pad + offY;

  const playerAtCell: Record<string, PlayerIndex> = {};
  for (const [pStr, positions] of Object.entries(startingPositions)) {
    if (positions) for (const pos of positions) playerAtCell[pos] = Number(pStr) as PlayerIndex;
  }
  const wallSet = new Set(walls);
  const r = Math.max(0.8, scale * 0.44);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      {points.map(({ key, x, y }) => {
        const pi = playerAtCell[key];
        const fill = wallSet.has(key) ? '#6b7280' : pi !== undefined ? PLAYER_COLORS[pi] : '#d1d5db';
        return <circle key={key} cx={px(x)} cy={py(y)} r={r} fill={fill} />;
      })}
    </svg>
  );
}

export default function PlayPage() {
  const router = useRouter();
  const { startGame, startGameFromLayout } = useGameStore();
  const { layouts, loadLayouts } = useLayoutStore();

  const [selectedCount, setSelectedCount] = useState<PlayerCount>(2);
  // null = standard board; non-null = custom layout
  const [selectedLayout, setSelectedLayout] = useState<BoardLayout | null>(null);
  const [showBoardSelector, setShowBoardSelector] = useState(false);
  const [customColors, setCustomColors] = useState<ColorMapping>({});
  const [playerNames, setPlayerNames] = useState<PlayerNameMapping>({});
  const [aiConfig, setAiConfig] = useState<AIPlayerMap>({});
  const [teamMode, setTeamMode] = useState(false);
  const [gameMode, setGameMode] = useState<PieceVariant>('normal');
  const [customPlayerCount, setCustomPlayerCount] = useState<number | null>(null);
  const [evolvedAvailable, setEvolvedAvailable] = useState(false);
  const [editingName, setEditingName] = useState<PlayerIndex | null>(null);

  const layoutKeyRef = useRef('');

  useEffect(() => { setEvolvedAvailable(hasEvolvedGenome()); }, []);
  useEffect(() => { loadLayouts(); }, [loadLayouts]);

  // Reset state on layout change; preserve colors when only player count changes
  useEffect(() => {
    const currentKey = selectedLayout?.id ?? 'standard';
    const isLayoutChange = currentKey !== layoutKeyRef.current;
    layoutKeyRef.current = currentKey;

    if (isLayoutChange) {
      setCustomPlayerCount(null);
      const { favoriteColor } = useSettingsStore.getState();
      const players = selectedLayout ? layoutPlayers : ACTIVE_PLAYERS[selectedCount];
      if (favoriteColor && players.length > 0) {
        const newColors: ColorMapping = { [players[0]]: favoriteColor };
        const taken = [favoriteColor];
        for (const p of players) {
          if (p === players[0]) continue;
          const def = PLAYER_COLORS[p];
          if (taken.some(t => areTooSimilar(t, def))) {
            const free = Object.values(PLAYER_COLORS).find(c => !taken.some(t => areTooSimilar(t, c)));
            if (free) { newColors[p] = free; taken.push(free); }
          } else {
            taken.push(def);
          }
        }
        setCustomColors(newColors);
      } else {
        setCustomColors({});
      }
      setTeamMode(false);
    }
    setPlayerNames({});
    setAiConfig({});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCount, selectedLayout?.id]);

  const handleColorSelect = (player: PlayerIndex, color: string) => {
    setCustomColors(prev => ({ ...prev, [player]: color }));
  };

  const handleResetColors = () => { setCustomColors({}); };

  const handleNameChange = (player: PlayerIndex, name: string) => {
    setPlayerNames(prev => {
      if (name.trim() === '') {
        const next = { ...prev };
        delete next[player];
        return next;
      }
      return { ...prev, [player]: name.trim() };
    });
  };

  const handleStartGame = () => {
    const hasCustomColors = Object.keys(customColors).length > 0;
    const hasCustomNames = Object.keys(playerNames).length > 0;
    const hasAI = Object.keys(aiConfig).length > 0;
    const players = selectedLayout ? effectiveLayoutPlayers : (ACTIVE_PLAYERS[selectedCount] as PlayerIndex[]);
    const effectivePlayerCount = players.length;
    const effectiveTeamMode = teamMode && (effectivePlayerCount === 4 || effectivePlayerCount === 6) ? true : undefined;
    const effectivePieceTypes = gameMode !== 'normal'
      ? Object.fromEntries(players.map(p => [p, gameMode])) as Partial<Record<PlayerIndex, PieceVariant>>
      : undefined;

    let gameId: string;
    if (selectedLayout) {
      const playerSet = new Set(effectiveLayoutPlayers);
      const trimmedLayout: BoardLayout = {
        ...selectedLayout,
        startingPositions: Object.fromEntries(
          Object.entries(selectedLayout.startingPositions)
            .filter(([k]) => playerSet.has(Number(k) as PlayerIndex))
        ) as Partial<Record<PlayerIndex, string[]>>,
        goalPositions: selectedLayout.goalPositions
          ? Object.fromEntries(
              Object.entries(selectedLayout.goalPositions)
                .filter(([k]) => playerSet.has(Number(k) as PlayerIndex))
            ) as Partial<Record<PlayerIndex, string[]>>
          : undefined,
      };
      gameId = startGameFromLayout(
        trimmedLayout,
        hasCustomColors ? customColors : undefined,
        hasAI ? aiConfig : undefined,
        hasCustomNames ? playerNames : undefined,
        effectiveTeamMode,
        effectivePieceTypes
      );
    } else {
      gameId = startGame(
        selectedCount,
        undefined,
        hasCustomColors ? customColors : undefined,
        hasAI ? aiConfig : undefined,
        hasCustomNames ? playerNames : undefined,
        effectiveTeamMode,
        effectivePieceTypes
      );
    }

    router.push(`/game/${gameId}`);
  };

  const getEffectiveColor = (player: PlayerIndex): string =>
    customColors[player] ?? PLAYER_COLORS[player];

  const getDefaultName = (player: PlayerIndex, players: PlayerIndex[]): string =>
    `Player ${players.indexOf(player) + 1}`;

  const isColorUsedByOther = (color: string, currentPlayer: PlayerIndex): boolean =>
    configPlayers.some(p => p !== currentPlayer && areTooSimilar(color, getEffectiveColor(p)));

  const getBlockedColors = (currentPlayer: PlayerIndex): string[] =>
    configPlayers.filter(p => p !== currentPlayer).map(getEffectiveColor);

  const handleColorSelectSafe = (player: PlayerIndex, color: string) => {
    if (!isColorUsedByOther(color, player)) handleColorSelect(player, color);
  };

  const activePlayers = ACTIVE_PLAYERS[selectedCount];

  const layoutPlayers: PlayerIndex[] = selectedLayout
    ? Object.entries(selectedLayout.startingPositions)
        .filter(([, positions]) => positions && positions.length > 0)
        .map(([index]) => Number(index) as PlayerIndex)
    : [];

  const availableCustomCounts = PLAYER_COUNT_OPTIONS.filter(({ count }) => count <= layoutPlayers.length);

  // Default to minimum available count (2) rather than all layout players
  const defaultCustomCount = availableCustomCounts[0]?.count ?? layoutPlayers.length;

  const effectiveLayoutPlayers: PlayerIndex[] = (() => {
    if (!selectedLayout) return layoutPlayers;
    const count = (customPlayerCount ?? defaultCustomCount) as PlayerCount;
    const available = new Set(layoutPlayers);
    const config = selectedLayout.playerCountConfig?.[count];
    if (config && config.length > 0) {
      const filtered = config.filter(p => available.has(p));
      if (filtered.length > 0) return filtered;
    }
    const activeForCount = ACTIVE_PLAYERS[count] as PlayerIndex[] | undefined;
    if (activeForCount) {
      const fromActive = activeForCount.filter(p => available.has(p));
      if (fromActive.length > 0) return fromActive;
    }
    return layoutPlayers.slice(0, count);
  })();

  const configPlayers = selectedLayout ? effectiveLayoutPlayers : activePlayers;
  const validLayouts = layouts.filter(l => validateLayout(l).valid);

  const renderPlayerRow = (playerIndex: PlayerIndex, players: PlayerIndex[]) => {
    const currentColor = getEffectiveColor(playerIndex);
    const isAI = aiConfig[playerIndex] != null;
    const currentName = playerNames[playerIndex] || getDefaultName(playerIndex, players);
    const isEditing = editingName === playerIndex;

    return (
      <div key={playerIndex} className="flex flex-col gap-3 p-4 rounded-lg bg-gray-50">
        {/* Top row: Color swatch, Name, Human/AI toggle */}
        <div className="flex items-center gap-3">
          {(() => {
            const isRainbow = currentColor === 'rainbow';
            const isOpal = currentColor === 'opal';
            const isFlower = isFlowerColor(currentColor) || currentColor === 'bouquet';
            const isEgg = isEggColor(currentColor);
            const gemSwatch = getGemSwatchStyle(currentColor);
            const metallicSwatch = getMetallicSwatchStyle(currentColor);
            const gemBg = getGemSimpleBackground(currentColor);
            const isGemShape = !!(gemSwatch || isOpal);
            if (isFlower) {
              return (
                <div className="w-10 h-10 shadow flex-shrink-0 rounded-full overflow-hidden">
                  <FlowerSwatch color={currentColor} className="w-full h-full" />
                </div>
              );
            }
            if (isEgg) {
              return (
                <div className="w-10 h-10 shadow flex-shrink-0">
                  <EggSwatch color={currentColor} className="w-full h-full" />
                </div>
              );
            }
            const bgStyle: React.CSSProperties = isRainbow
              ? { background: 'conic-gradient(from 0deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)' }
              : isOpal
              ? { background: 'conic-gradient(from 0deg, #ef4444 0deg 60deg, #facc15 60deg 120deg, #22c55e 120deg 180deg, #22d3ee 180deg 240deg, #3b82f6 240deg 300deg, #a855f7 300deg 360deg)', ...gemSwatch }
              : gemBg
              ? { background: gemBg, ...gemSwatch }
              : { backgroundColor: currentColor, ...metallicSwatch };
            return (
              <div
                className={`w-10 h-10 shadow flex-shrink-0${isGemShape ? ' gem-swatch' : ' rounded-full'}${!isGemShape && !metallicSwatch && !isRainbow ? (' border-2' + (currentColor === '#ffffff' ? ' border-gray-400' : ' border-white')) : ''}${metallicSwatch ? ' metallic-swatch' : ''}${isRainbow ? ' rainbow-swatch' : ''}${isOpal ? ' opal-swatch' : ''}`}
                style={bgStyle}
              />
            );
          })()}
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <input
                type="text"
                autoFocus
                defaultValue={currentName}
                placeholder={getDefaultName(playerIndex, players)}
                onBlur={(e) => { handleNameChange(playerIndex, e.target.value); setEditingName(null); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { handleNameChange(playerIndex, e.currentTarget.value); setEditingName(null); }
                  else if (e.key === 'Escape') { setEditingName(null); }
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
              setAiConfig(prev => {
                if (prev[playerIndex]) { const next = { ...prev }; delete next[playerIndex]; return next; }
                return { ...prev, [playerIndex]: { difficulty: 'medium' as AIDifficulty, personality: 'generalist' as AIPersonality } };
              });
            }}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex-shrink-0 ${
              isAI ? 'bg-purple-100 text-purple-700 hover:bg-purple-200' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
            }`}
          >
            {isAI ? 'AI' : 'Human'}
          </button>
        </div>

        {/* AI settings */}
        {isAI && (
          <div className="flex items-center gap-2 pl-13">
            <select
              value={aiConfig[playerIndex]!.difficulty}
              onChange={(e) => setAiConfig(prev => ({ ...prev, [playerIndex]: { ...prev[playerIndex]!, difficulty: e.target.value as AIDifficulty } }))}
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
              onChange={(e) => setAiConfig(prev => ({ ...prev, [playerIndex]: { ...prev[playerIndex]!, personality: e.target.value as AIPersonality } }))}
              className="text-sm border border-gray-300 rounded-lg px-2 py-1 bg-white"
            >
              <option value="generalist">Generalist</option>
              <option value="defensive">Defensive</option>
              <option value="aggressive">Aggressive</option>
            </select>
          </div>
        )}

        {/* Row 1: player colors + neutrals + custom picker */}
        <div className="flex gap-2 flex-wrap items-center">
          {DEFAULT_COLORS.map((color) => {
            const isCurrentColor = currentColor.toLowerCase() === color.toLowerCase();
            const isTaken = isColorUsedByOther(color, playerIndex);
            return (
              <button
                key={color}
                onClick={() => handleColorSelectSafe(playerIndex, color)}
                disabled={isTaken}
                className={`w-7 h-7 rounded-full border-2 transition-all ${
                  isCurrentColor ? 'border-gray-800 ring-2 ring-offset-1 ring-gray-400'
                  : isTaken ? 'border-gray-300 opacity-40 cursor-not-allowed'
                  : 'border-white shadow hover:scale-110'
                }`}
                style={{ backgroundColor: color }}
                title={isTaken ? "Too similar to another player's color" : `Select: ${getColorName(color)}`}
              />
            );
          })}
          {NEUTRAL_COLORS.map((color) => {
            const isCurrentColor = currentColor.toLowerCase() === color.toLowerCase();
            const isTaken = isColorUsedByOther(color, playerIndex);
            return (
              <button
                key={color}
                onClick={() => handleColorSelectSafe(playerIndex, color)}
                disabled={isTaken}
                className={`w-7 h-7 rounded-full border-2 transition-all ${
                  isCurrentColor ? 'border-gray-800 ring-2 ring-offset-1 ring-gray-400'
                  : isTaken ? 'border-gray-300 opacity-40 cursor-not-allowed'
                  : color === '#ffffff' ? 'border-gray-400 shadow hover:scale-110'
                  : 'border-white shadow hover:scale-110'
                }`}
                style={{ backgroundColor: color }}
                title={isTaken ? "Too similar to another player's color" : `Select: ${getColorName(color)}`}
              />
            );
          })}
          <ColorPicker
            value={currentColor}
            onChange={(newColor) => {
              if (!getBlockedColors(playerIndex).some(b => areTooSimilar(newColor, b))) {
                handleColorSelect(playerIndex, newColor);
              }
            }}
            blockedColors={getBlockedColors(playerIndex)}
          />
        </div>
        {/* Row 2: metallics + rainbow */}
        <div className="flex gap-2 flex-wrap items-center">
          {METALLIC_COLORS_LIST.map((color, idx) => {
            if (color === null) return <div key={`blank-${idx}`} className="w-7 h-7 flex-shrink-0" />;
            const isCurrentColor = currentColor.toLowerCase() === color.toLowerCase();
            const isTaken = isColorUsedByOther(color, playerIndex);
            const metallicStyle = getMetallicSwatchStyle(color);
            const isRainbow = color === 'rainbow';
            const bgStyle = isRainbow
              ? { background: 'conic-gradient(from 0deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)' }
              : { backgroundColor: color, ...metallicStyle };
            return (
              <button
                key={color}
                onClick={() => handleColorSelectSafe(playerIndex, color)}
                disabled={isTaken}
                className={`w-7 h-7 rounded-full transition-all${metallicStyle ? ' metallic-swatch' : ''}${isRainbow ? ' rainbow-swatch' : ''} ${
                  isCurrentColor ? 'border-2 border-gray-800 ring-2 ring-offset-1 ring-gray-400'
                  : isTaken ? 'opacity-40 cursor-not-allowed'
                  : 'shadow hover:scale-110'
                }`}
                style={bgStyle}
                title={isTaken ? "Too similar to another player's color" : `Select: ${getColorName(color)}`}
              >
                {metallicStyle && <MetallicGemTwinkle swStyle={metallicStyle} />}
              </button>
            );
          })}
        </div>
        {/* Row 3: gems */}
        <div className="flex gap-2 flex-wrap items-center">
          {GEM_COLORS.map((color) => {
            const isCurrentColor = currentColor.toLowerCase() === color.toLowerCase();
            const isTaken = isColorUsedByOther(color, playerIndex);
            const gemStyle = getGemSwatchStyle(color);
            const isOpal = color === 'opal';
            const opalBg = isOpal
              ? { background: 'conic-gradient(from 0deg, #ef4444 0deg 60deg, #facc15 60deg 120deg, #22c55e 120deg 180deg, #22d3ee 180deg 240deg, #3b82f6 240deg 300deg, #a855f7 300deg 360deg)' }
              : undefined;
            return (
              <div key={color} className={`relative w-7 h-7 flex items-center justify-center flex-shrink-0 transition-all ${!isTaken && !isCurrentColor ? 'hover:scale-110' : ''}`}>
                <div className="absolute" style={{ width: '32px', height: '32px', top: '-2px', left: '-2px', clipPath: 'polygon(50% 4%, 93% 27%, 93% 73%, 50% 96%, 7% 73%, 7% 27%)', backgroundColor: isCurrentColor ? '#9ca3af' : 'transparent' }} />
                <div className="absolute" style={{ inset: '1px', clipPath: 'polygon(50% 4%, 93% 27%, 93% 73%, 50% 96%, 7% 73%, 7% 27%)', backgroundColor: isCurrentColor ? 'white' : 'transparent' }} />
                <button
                  onClick={() => handleColorSelectSafe(playerIndex, color)}
                  disabled={isTaken}
                  className={`relative z-10 w-6 h-6 gem-swatch${isOpal ? ' opal-swatch' : ''} ${isTaken ? 'opacity-40 cursor-not-allowed' : ''}`}
                  style={isOpal ? { ...opalBg, ...gemStyle } : { background: getGemSimpleBackground(color) ?? color, ...gemStyle }}
                  title={isTaken ? "Too similar to another player's color" : `Select: ${getColorName(color)}`}
                >
                  {gemStyle && <MetallicGemTwinkle swStyle={gemStyle} />}
                </button>
              </div>
            );
          })}
        </div>
        {/* Row 4: flowers */}
        <div className="flex gap-2 flex-wrap items-center">
          {FLOWER_COLORS_LIST.map((color) => {
            const isCurrentColor = currentColor.toLowerCase() === color.toLowerCase();
            const isTaken = isColorUsedByOther(color, playerIndex);
            return (
              <button
                key={color}
                onClick={() => handleColorSelectSafe(playerIndex, color)}
                disabled={isTaken}
                className={`w-7 h-7 transition-all flex items-center justify-center ${
                  isCurrentColor ? 'ring-2 ring-gray-400 rounded-full'
                  : isTaken ? 'opacity-40 cursor-not-allowed'
                  : 'hover:scale-110'
                }`}
                title={isTaken ? "Too similar to another player's color" : `Select: ${getColorName(color)}`}
              >
                <FlowerSwatch color={color} className="w-full h-full" />
              </button>
            );
          })}
        </div>
        {/* Row 5: eggs */}
        <div className="flex gap-2 flex-wrap items-center">
          {EGG_COLORS_LIST.map((color) => {
            const isCurrentColor = currentColor.toLowerCase() === color.toLowerCase();
            const isTaken = isColorUsedByOther(color, playerIndex);
            return (
              <button
                key={color}
                onClick={() => handleColorSelectSafe(playerIndex, color)}
                disabled={isTaken}
                className={`w-7 h-7 transition-all flex items-center justify-center ${
                  isCurrentColor ? 'ring-2 ring-gray-400 rounded-full'
                  : isTaken ? 'opacity-40 cursor-not-allowed'
                  : 'hover:scale-110'
                }`}
                title={isTaken ? "Too similar to another player's color" : `Select: ${getColorName(color)}`}
              >
                <EggSwatch color={color} className="w-full h-full" />
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const previewCells = selectedLayout ? selectedLayout.cells : DEFAULT_BOARD_LAYOUT.cells;
  const previewStarts = selectedLayout ? selectedLayout.startingPositions : DEFAULT_BOARD_LAYOUT.startingPositions;
  const previewWalls = selectedLayout?.walls;

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <Link href="/home" className="text-sm text-gray-500 hover:text-gray-700 mb-4 inline-block">
            &larr; Back to Home
          </Link>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">New Game</h1>
          <p className="text-gray-600">Choose your game setup</p>
        </div>

        {/* Board selector */}
        <div className="bg-white rounded-xl shadow p-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0 rounded overflow-hidden">
              <BoardPreview cells={previewCells} startingPositions={previewStarts} walls={previewWalls} size={72} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-900">
                {selectedLayout ? selectedLayout.name : 'Standard Board'}
              </div>
              <div className="text-sm text-gray-500">
                {selectedLayout ? `${selectedLayout.cells.length} cells` : '121 cells · classic Chinese Checkers'}
              </div>
            </div>
            <button
              onClick={() => setShowBoardSelector(v => !v)}
              className="px-3 py-2 text-sm font-medium bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex-shrink-0"
            >
              {showBoardSelector ? 'Close' : 'Select Board'}
            </button>
          </div>

          {showBoardSelector && (
            <div className="mt-4 border-t border-gray-100 pt-4 space-y-2 max-h-80 overflow-y-auto">
              {/* Standard board option */}
              <button
                onClick={() => { setSelectedLayout(null); setShowBoardSelector(false); }}
                className={`w-full p-3 rounded-lg border-2 text-left transition-all flex items-center gap-3 ${
                  !selectedLayout ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex-shrink-0">
                  <BoardPreview cells={DEFAULT_BOARD_LAYOUT.cells} startingPositions={DEFAULT_BOARD_LAYOUT.startingPositions} size={52} />
                </div>
                <div>
                  <div className="font-medium text-gray-900">Standard Board</div>
                  <div className="text-xs text-gray-500">121 cells · 2–6 players</div>
                </div>
              </button>

              {/* Custom layouts */}
              {validLayouts.length === 0 ? (
                <p className="text-sm text-gray-400 px-2 py-1">No custom layouts yet.</p>
              ) : (
                validLayouts.map((layout) => (
                  <button
                    key={layout.id}
                    onClick={() => { setSelectedLayout(layout); setShowBoardSelector(false); }}
                    className={`w-full p-3 rounded-lg border-2 text-left transition-all flex items-center gap-3 ${
                      selectedLayout?.id === layout.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex-shrink-0">
                      <BoardPreview cells={layout.cells} startingPositions={layout.startingPositions} walls={layout.walls} size={52} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 truncate">
                        {layout.name}
                        {layout.isDefault && <span className="ml-1 text-xs text-green-600">(default)</span>}
                      </div>
                      <div className="text-xs text-gray-500">
                        {layout.cells.length} cells &middot; {Object.entries(layout.startingPositions).filter(([, p]) => p?.length).length} players
                      </div>
                    </div>
                  </button>
                ))
              )}

              <Link
                href="/editor"
                onClick={() => setShowBoardSelector(false)}
                className="block text-center text-sm text-blue-600 hover:text-blue-500 py-2"
              >
                + Create in Board Editor
              </Link>
            </div>
          )}
        </div>

        {/* Player count */}
        {!selectedLayout ? (
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
        ) : availableCustomCounts.length > 1 ? (
          <div className="bg-white rounded-xl shadow p-4 mb-8">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Player Count</h2>
            <div className="grid grid-cols-4 gap-2">
              {availableCustomCounts.map(({ count, description }) => (
                <button
                  key={count}
                  onClick={() => setCustomPlayerCount(count)}
                  className={`p-3 rounded-lg border-2 transition-all text-center ${
                    (customPlayerCount ?? defaultCustomCount) === count
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-2xl font-bold text-gray-900">{count}</div>
                  <div className="text-xs text-gray-500">{description}</div>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Game mode */}
        <div className="bg-white rounded-xl shadow p-4 mb-4">
          <div className="font-medium text-gray-900 mb-1">Game Mode</div>
          <div className="text-sm text-gray-500 mb-3">Sets the movement style for all players&apos; pieces</div>
          <div className="flex gap-2 flex-wrap">
            {([
              { value: 'normal', label: 'Normal',   desc: 'Classic hop over adjacent piece' },
              { value: 'turbo',  label: 'Turbo',    desc: 'Hop any distance, land same distance away — smaller pieces' },
              { value: 'ghost',  label: 'Spectral', desc: 'Hop through a row of pieces, land after the run — translucent pieces' },
              { value: 'big',    label: 'Blockade', desc: 'Opponents cannot jump over your pieces' },
            ] as { value: PieceVariant; label: string; desc: string }[]).map(({ value, label, desc }) => (
              <button
                key={value}
                onClick={() => setGameMode(value)}
                title={desc}
                className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg border-2 transition-colors ${
                  gameMode === value
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {gameMode !== 'normal' && (
            <p className="mt-2 text-xs text-gray-500">
              {gameMode === 'turbo'
                ? 'Pieces scan past empty cells and hop over the first piece/wall they find, landing the same distance on the other side.'
                : gameMode === 'ghost'
                ? 'Pieces hop over the entire adjacent run of pieces/walls in one direction, landing in the first open cell after the run.'
                : 'Opponents cannot jump over your pieces — only you or your teammates can.'}
            </p>
          )}
        </div>

        {/* Team mode */}
        {(configPlayers.length === 4 || configPlayers.length === 6) && (
          <div className="bg-white rounded-xl shadow p-4 mb-8">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={teamMode}
                onChange={(e) => setTeamMode(e.target.checked)}
                className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <div className="font-medium text-gray-900">Team Mode</div>
                <div className="text-sm text-gray-500">Opposite players are teammates — both must finish to win</div>
              </div>
            </label>
          </div>
        )}

        {/* Players */}
        <div className="bg-white rounded-xl shadow p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Players</h2>
            {Object.keys(customColors).length > 0 && (
              <button onClick={handleResetColors} className="text-sm text-blue-600 hover:text-blue-500">
                Reset Colors
              </button>
            )}
          </div>
          <div className="space-y-3">
            {configPlayers.map(playerIndex => renderPlayerRow(playerIndex, configPlayers))}
          </div>
          <p className="mt-4 text-xs text-gray-500">
            Click a name to edit it. Toggle Human/AI and choose colors for each player.
          </p>
        </div>

        {/* Editor link for custom boards */}
        {selectedLayout && (
          <Link href="/editor" className="block text-center text-sm text-blue-600 hover:text-blue-500 mb-4">
            Create or edit layouts in the Board Editor &rarr;
          </Link>
        )}

        {/* Start button */}
        <button
          onClick={handleStartGame}
          className="w-full py-4 text-xl font-semibold text-white rounded-xl transition-colors shadow-lg bg-blue-600 hover:bg-blue-500"
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
