'use client';

import { useState, useEffect, Fragment } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTutorialStore } from '@/store/tutorialStore';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { loadEndgamePuzzles } from '@/game/endgamePuzzles';
import type { EndgamePuzzle } from '@/game/endgamePuzzles';
import { getPuzzleCompletion, isTutorialComplete } from '@/game/puzzleProgress';
import type { PlayerIndex, PieceVariant } from '@/types/game';
import { DEFAULT_BOARD_LAYOUT } from '@/game/defaultLayout';
import {
  PLAYER_COLORS,
  COLOR_DISPLAY_ORDER,
  ROW3_DISPLAY_ORDER,
  ROW4_DISPLAY_ORDER,
  ROW5_DISPLAY_ORDER,
  GEM_COLORS,
  NEUTRAL_COLORS,
  getMetallicSwatchStyle,
  getGemSwatchStyle,
  getGemSimpleBackground,
  getColorName,
} from '@/game/constants';
import {
  ColorSwatch,
  SpecialSwatch,
  FlowerSwatch,
  EggSwatch,
  MetallicGemTwinkle,
} from '@/components/ui/SpecialSwatch';
import { ColorPicker } from '@/components/ui/ColorPicker';

// ── Board preview (same impl as in /play) ────────────────────────────────────

function BoardPreview({
  cells,
  startingPositions,
  size = 64,
  pieceColor,
}: {
  cells: string[];
  startingPositions: Partial<Record<PlayerIndex, string[]>>;
  size?: number;
  /** When set, all pieces render in this colour regardless of player index. */
  pieceColor?: string;
}) {
  if (cells.length === 0) return <div style={{ width: size, height: size }} />;

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
  const r = Math.max(0.8, scale * 0.44);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      {points.map(({ key, x, y }) => {
        const pi = playerAtCell[key];
        const fill = pi !== undefined ? (pieceColor ?? PLAYER_COLORS[pi]) : '#d1d5db';
        return <circle key={key} cx={px(x)} cy={py(y)} r={r} fill={fill} />;
      })}
    </svg>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Selection =
  | { type: 'tutorial' }
  | { type: 'puzzle'; puzzle: EndgamePuzzle };

const PIECE_MODES: { value: PieceVariant; label: string; desc: string }[] = [
  { value: 'normal',  label: 'Normal',   desc: 'Classic hop over adjacent piece' },
  { value: 'turbo',   label: 'Turbo',    desc: 'Hop any distance, land same distance away — smaller pieces' },
  { value: 'ghost',   label: 'Spectral', desc: 'Hop through a row of pieces, land after the run — translucent pieces' },
  { value: 'big',     label: 'Blockade', desc: 'Opponents cannot jump over your pieces' },
];

// Tutorial preview shows only the two players used in the tutorial (red + cyan)
const TUTORIAL_PREVIEW_STARTS: Partial<Record<PlayerIndex, string[]>> = {
  0: DEFAULT_BOARD_LAYOUT.startingPositions[0],
  2: DEFAULT_BOARD_LAYOUT.startingPositions[2],
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PracticePage() {
  const router = useRouter();
  const startTutorial = useTutorialStore((s) => s.startTutorial);
  const startGameFromLayout = useGameStore((s) => s.startGameFromLayout);
  const { favoriteColor } = useSettingsStore();

  const [selected, setSelected] = useState<Selection>({ type: 'tutorial' });
  const [showBoardSelector, setShowBoardSelector] = useState(false);
  const [puzzles, setPuzzles] = useState<EndgamePuzzle[]>([]);
  const [puzzlesLoaded, setPuzzlesLoaded] = useState(false);
  const [tutorialDone, setTutorialDone] = useState(false);
  const [pieceMode, setPieceMode] = useState<PieceVariant>('normal');

  // Human player index for the current selection
  const humanPlayer: PlayerIndex =
    selected.type === 'puzzle' ? selected.puzzle.humanPlayer : 0;

  // Default color for the current selection
  const defaultColor =
    selected.type === 'puzzle'
      ? (selected.puzzle.playerColor ?? PLAYER_COLORS[selected.puzzle.humanPlayer])
      : (favoriteColor ?? PLAYER_COLORS[0]);

  const [selectedColor, setSelectedColor] = useState<string>(defaultColor);

  // Sync color when board selection changes
  useEffect(() => {
    setSelectedColor(defaultColor);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.type === 'puzzle' ? (selected as { type: 'puzzle'; puzzle: EndgamePuzzle }).puzzle.layout.id : 'tutorial']);

  // Defer puzzle loading so it doesn't block first paint
  useEffect(() => {
    const id = setTimeout(() => {
      setPuzzles(loadEndgamePuzzles());
      setPuzzlesLoaded(true);
      setTutorialDone(isTutorialComplete());
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const handleStart = () => {
    if (selected.type === 'tutorial') {
      const gameId = startTutorial(selectedColor, pieceMode);
      router.push(`/game/${gameId}`);
    } else {
      const { puzzle } = selected;
      const effectivePieceTypes =
        pieceMode !== 'normal'
          ? ({ [humanPlayer]: pieceMode } as Partial<Record<PlayerIndex, PieceVariant>>)
          : undefined;
      const gameId = startGameFromLayout(
        puzzle.layout,
        { [humanPlayer]: selectedColor } as Partial<Record<PlayerIndex, string>>,
        undefined, // no AI opponent — single-player puzzle
        { [humanPlayer]: 'You' } as Partial<Record<PlayerIndex, string>>,
        undefined,
        effectivePieceTypes,
      );
      router.push(`/game/${gameId}`);
    }
  };

  // Board used for the main preview row
  const previewCells = DEFAULT_BOARD_LAYOUT.cells;
  const previewStarts = selected.type === 'puzzle'
    ? selected.puzzle.layout.startingPositions
    : TUTORIAL_PREVIEW_STARTS;
  const previewPieceColor = selected.type === 'puzzle' ? PLAYER_COLORS[0] : undefined;
  const selectionLabel =
    selected.type === 'tutorial' ? 'Tutorial' : selected.puzzle.layout.name;
  const selectionSubtext =
    selected.type === 'tutorial'
      ? 'Guided introduction to the game'
      : 'Endgame puzzle — finish from this position';

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="text-center mb-12">
          <Link href="/home" className="text-sm text-gray-500 hover:text-gray-700 mb-4 inline-block">
            &larr; Back to Home
          </Link>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Training</h1>
          <p className="text-gray-600">Choose a board to practice on</p>
        </div>

        {/* ── Board selector ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow p-4 mb-6">
          {/* Current selection row */}
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0 rounded overflow-hidden">
              <BoardPreview cells={previewCells} startingPositions={previewStarts} size={72} pieceColor={previewPieceColor} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-900">{selectionLabel}</div>
              <div className="text-sm text-gray-500">{selectionSubtext}</div>
            </div>
            <button
              onClick={() => setShowBoardSelector(v => !v)}
              className="px-3 py-2 text-sm font-medium bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex-shrink-0"
            >
              {showBoardSelector ? 'Close' : 'Change Board'}
            </button>
          </div>

          {/* Expandable board list */}
          {showBoardSelector && (
            <div className="mt-4 border-t border-gray-100 pt-4 space-y-2 max-h-80 overflow-y-auto">
              {/* Tutorial option */}
              <button
                onClick={() => { setSelected({ type: 'tutorial' }); setShowBoardSelector(false); }}
                className={`w-full p-3 rounded-lg border-2 text-left transition-all flex items-center gap-3 ${
                  selected.type === 'tutorial'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex-shrink-0">
                  <BoardPreview
                    cells={DEFAULT_BOARD_LAYOUT.cells}
                    startingPositions={TUTORIAL_PREVIEW_STARTS}
                    size={52}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900">Tutorial</div>
                  <div className="text-xs text-gray-500">Guided introduction to the game</div>
                </div>
                {tutorialDone && (
                  <span className="text-green-500 text-lg flex-shrink-0" title="Completed">✓</span>
                )}
              </button>

              {/* Endgame puzzles */}
              {!puzzlesLoaded ? (
                <p className="text-sm text-gray-400 px-2 py-1">Loading puzzles…</p>
              ) : puzzles.length === 0 ? (
                <p className="text-sm text-gray-400 px-2 py-1">
                  No endgame puzzles yet — complete some games to unlock them.
                </p>
              ) : (
                puzzles.map((puzzle) => {
                  const isSelected =
                    selected.type === 'puzzle' &&
                    selected.puzzle.layout.id === puzzle.layout.id;
                  const remaining = Object.values(puzzle.layout.startingPositions)
                    .reduce((n, p) => n + (p?.length ?? 0), 0);
                  const completion = getPuzzleCompletion(puzzle.layout.id);
                  return (
                    <button
                      key={puzzle.layout.id}
                      onClick={() => { setSelected({ type: 'puzzle', puzzle }); setShowBoardSelector(false); }}
                      className={`w-full p-3 rounded-lg border-2 text-left transition-all flex items-center gap-3 ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex-shrink-0">
                        <BoardPreview
                          cells={puzzle.layout.cells}
                          startingPositions={puzzle.layout.startingPositions}
                          pieceColor={PLAYER_COLORS[0]}
                          size={52}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-gray-900 truncate">{puzzle.layout.name}</div>
                        <div className="text-xs text-gray-500">
                          {remaining} pieces remaining
                          {puzzle.goalMoves > 0 && (
                            <span className="ml-2 text-gray-400">
                              · par {puzzle.goalMoves}
                              {completion && (
                                <span className="ml-1">
                                  · best {completion.bestMoves}
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                      {completion?.completedUnderPar && (
                        <span className="text-green-500 text-lg flex-shrink-0" title="Completed under par">✓</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* ── Game mode ───────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow p-4 mb-6">
          <div className="font-medium text-gray-900 mb-1">Piece Mode</div>
          <div className="text-sm text-gray-500 mb-3">Sets how your pieces move</div>
          <div className="flex gap-2 flex-wrap">
            {PIECE_MODES.map(({ value, label, desc }) => (
              <button
                key={value}
                onClick={() => setPieceMode(value)}
                title={desc}
                className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg border-2 transition-colors ${
                  pieceMode === value
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {pieceMode !== 'normal' && (
            <p className="mt-2 text-xs text-gray-500">
              {pieceMode === 'turbo'
                ? 'Pieces scan past empty cells and hop over the first piece/wall they find, landing the same distance on the other side.'
                : pieceMode === 'ghost'
                ? 'Pieces hop over the entire adjacent run of pieces/walls in one direction, landing in the first open cell after the run.'
                : 'Opponents cannot jump over your pieces — only you or your teammates can.'}
            </p>
          )}
        </div>

        {/* ── Your piece (color picker) ────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Piece</h2>

          <div className="flex flex-col gap-3 p-4 rounded-lg bg-gray-50">
            {/* Top row: swatch + label */}
            <div className="flex items-center gap-3">
              <ColorSwatch color={selectedColor} className="w-10 h-10 shadow flex-shrink-0" />
              <span className="font-medium text-gray-900">{getColorName(selectedColor)}</span>
            </div>

            {/* Row 1: standard colors + neutral + custom picker */}
            <div className="flex gap-x-2 gap-y-1 flex-wrap items-center">
              {COLOR_DISPLAY_ORDER.map((color, idx) => {
                const isCurrentColor = selectedColor.toLowerCase() === color.toLowerCase();
                return (
                  <Fragment key={color}>
                    {idx === 5 && <div className="w-full h-0 sm:hidden" />}
                    <button
                      onClick={() => setSelectedColor(color)}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${
                        isCurrentColor
                          ? 'border-gray-800 ring-2 ring-offset-1 ring-gray-400'
                          : 'border-white shadow hover:scale-110'
                      }`}
                      style={{ backgroundColor: color }}
                      title={getColorName(color)}
                    />
                  </Fragment>
                );
              })}
              {NEUTRAL_COLORS.map((color) => {
                const isCurrentColor = selectedColor.toLowerCase() === color.toLowerCase();
                return (
                  <button
                    key={color}
                    onClick={() => setSelectedColor(color)}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${
                      isCurrentColor
                        ? 'border-gray-800 ring-2 ring-offset-1 ring-gray-400'
                        : color === '#ffffff'
                        ? 'border-gray-400 shadow hover:scale-110'
                        : 'border-white shadow hover:scale-110'
                    }`}
                    style={{ backgroundColor: color }}
                    title={getColorName(color)}
                  />
                );
              })}
              <ColorPicker
                value={selectedColor}
                onChange={setSelectedColor}
                blockedColors={[]}
              />
            </div>

            {/* Row 2: metallics */}
            <div className="flex gap-x-2 gap-y-1 flex-wrap items-center">
              {ROW3_DISPLAY_ORDER.map((color, idx) => {
                if (color === null)
                  return (
                    <Fragment key={`blank-${idx}`}>
                      {idx === 5 && <div className="w-full h-0 sm:hidden" />}
                      <div className="w-7 h-7 flex-shrink-0" />
                    </Fragment>
                  );
                const isCurrentColor = selectedColor.toLowerCase() === color.toLowerCase();
                const metallicStyle = getMetallicSwatchStyle(color);
                const isRainbow = color === 'rainbow';
                const bgStyle = isRainbow ? {} : { backgroundColor: color, ...metallicStyle };
                return (
                  <Fragment key={color}>
                    {idx === 5 && <div className="w-full h-0 sm:hidden" />}
                    <button
                      onClick={() => setSelectedColor(color)}
                      className={`w-7 h-7 rounded-full transition-all overflow-hidden${metallicStyle ? ' metallic-swatch' : ''} ${
                        isCurrentColor
                          ? 'border-2 border-gray-800 ring-2 ring-offset-1 ring-gray-400'
                          : 'shadow hover:scale-110'
                      }`}
                      style={bgStyle}
                      title={getColorName(color)}
                    >
                      {isRainbow ? (
                        <SpecialSwatch color="rainbow" className="w-full h-full" />
                      ) : (
                        metallicStyle && <MetallicGemTwinkle swStyle={metallicStyle} />
                      )}
                    </button>
                  </Fragment>
                );
              })}
            </div>

            {/* Row 3: gems */}
            <div className="flex gap-x-2 gap-y-1 flex-wrap items-center mt-2 sm:mt-0">
              {GEM_COLORS.map((color, idx) => {
                const isCurrentColor = selectedColor.toLowerCase() === color.toLowerCase();
                const gemStyle = getGemSwatchStyle(color);
                const isOpal = color === 'opal';
                return (
                  <Fragment key={color}>
                    {idx === 5 && <div className="w-full h-0 sm:hidden" />}
                    <div
                      className={`relative w-7 h-7 flex items-center justify-center flex-shrink-0 transition-all ${!isCurrentColor ? 'hover:scale-110' : ''}`}
                    >
                      <div
                        className="absolute"
                        style={{
                          width: '32px',
                          height: '32px',
                          top: '-2px',
                          left: '-2px',
                          clipPath: 'polygon(50% 4%, 93% 27%, 93% 73%, 50% 96%, 7% 73%, 7% 27%)',
                          backgroundColor: isCurrentColor ? '#9ca3af' : 'transparent',
                        }}
                      />
                      <div
                        className="absolute"
                        style={{
                          inset: '1px',
                          clipPath: 'polygon(50% 4%, 93% 27%, 93% 73%, 50% 96%, 7% 73%, 7% 27%)',
                          backgroundColor: isCurrentColor ? 'white' : 'transparent',
                        }}
                      />
                      <button
                        onClick={() => setSelectedColor(color)}
                        className={`relative z-10 w-6 h-6 gem-swatch${isOpal ? ' opal-swatch' : ''}`}
                        style={isOpal ? {} : { background: getGemSimpleBackground(color) ?? color, ...gemStyle }}
                        title={getColorName(color)}
                      >
                        {isOpal ? (
                          <>
                            <SpecialSwatch color="opal" className="w-full h-full" />
                            {gemStyle && <MetallicGemTwinkle swStyle={gemStyle} />}
                          </>
                        ) : (
                          gemStyle && <MetallicGemTwinkle swStyle={gemStyle} />
                        )}
                      </button>
                    </div>
                  </Fragment>
                );
              })}
            </div>

            {/* Row 4: flowers */}
            <div className="flex gap-x-2 gap-y-1 flex-wrap items-center">
              {ROW4_DISPLAY_ORDER.map((color, idx) => {
                const isCurrentColor = selectedColor.toLowerCase() === color.toLowerCase();
                return (
                  <Fragment key={color}>
                    {idx === 5 && <div className="w-full h-0 sm:hidden" />}
                    <button
                      onClick={() => setSelectedColor(color)}
                      className={`w-7 h-7 transition-all flex items-center justify-center ${
                        isCurrentColor
                          ? 'ring-2 ring-gray-400 rounded-full'
                          : 'hover:scale-110'
                      }`}
                      title={getColorName(color)}
                    >
                      <FlowerSwatch color={color} className="w-full h-full" />
                    </button>
                  </Fragment>
                );
              })}
            </div>

            {/* Row 5: eggs */}
            <div className="flex gap-x-2 gap-y-1 flex-wrap items-center mt-2 sm:mt-0">
              {ROW5_DISPLAY_ORDER.map((color, idx) => {
                const isCurrentColor = selectedColor.toLowerCase() === color.toLowerCase();
                return (
                  <Fragment key={color}>
                    {idx === 5 && <div className="w-full h-0 sm:hidden" />}
                    <button
                      onClick={() => setSelectedColor(color)}
                      className={`w-7 h-7 transition-all flex items-center justify-center ${
                        isCurrentColor
                          ? 'ring-2 ring-gray-400 rounded-full'
                          : 'hover:scale-110'
                      }`}
                      title={getColorName(color)}
                    >
                      <EggSwatch color={color} className="w-full h-full" />
                    </button>
                  </Fragment>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Start button ─────────────────────────────────────────────────── */}
        <button
          onClick={handleStart}
          className="w-full py-4 text-xl font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-500 transition-colors shadow-lg"
        >
          Start
        </button>

      </div>
    </div>
  );
}
