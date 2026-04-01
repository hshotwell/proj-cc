'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useOpeningStore } from '@/store/openingStore';
import type { CustomOpening } from '@/store/openingStore';
import { OPENING_LINES } from '@/game/ai/openingBook';
import type { OpeningMove } from '@/game/ai/openingBook';
import type { PieceVariant, PlayerIndex } from '@/types/game';
import { generateBoardPositions, getTrianglePositions } from '@/game/board';
import { coordKey } from '@/game/coordinates';
import { createGame } from '@/game/setup';
import { applyMove } from '@/game/state';
import { getValidMoves } from '@/game/moves';

// ── Interactive Opening Board ─────────────────────────────────────────────────

const EDITOR_HEX_SIZE = 18;

// Computed once at module level — constant for the lifetime of the app
const ALL_BOARD_CELLS = generateBoardPositions();
const HOME_CELLS = getTrianglePositions(0);           // player 0 home (triangle 0)
const HOME_KEY_SET = new Set(HOME_CELLS.map(coordKey));
const GOAL_KEY_SET = new Set(getTrianglePositions(2).map(coordKey)); // player 0 goal

// 180° rotation: negate x,y so player 0 home triangle appears at the bottom
function rotatedPos(q: number, r: number): { x: number; y: number } {
  const x = EDITOR_HEX_SIZE * Math.sqrt(3) * (q + r / 2);
  const y = EDITOR_HEX_SIZE * 1.5 * r;
  return { x: -x, y: -y };
}

// Pointy-top hexagon points around (cx, cy)
function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30);
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(' ');
}

const PIECE_COLOR = '#ef4444'; // Red — player 0

interface InteractiveBoardProps {
  moves: OpeningMove[];
  onAddMove: (move: OpeningMove) => void;
  gameMode: PieceVariant;
}

function InteractiveOpeningBoard({ moves, onAddMove, gameMode }: InteractiveBoardProps) {
  const [selected, setSelected] = useState<string | null>(null);

  // Build a real GameState so we can call getValidMoves for proper validation
  const gameState = useMemo(() => {
    const playerPieceTypes = gameMode !== 'normal'
      ? { 0: gameMode } as Partial<Record<PlayerIndex, PieceVariant>>
      : undefined;
    let state = createGame(2, [0, 2], undefined, undefined, undefined, undefined, playerPieceTypes);
    for (const m of moves) {
      try {
        const toKey = coordKey(m.to);
        const validMove = getValidMoves(state, m.from).find(v => coordKey(v.to) === toKey);
        if (!validMove) break;
        state = { ...applyMove(state, validMove), currentPlayer: 0 as PlayerIndex };
      } catch { break; }
    }
    return state;
  }, [moves, gameMode]);

  // Player 0 piece positions from the game state
  const pieceKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const [key, content] of gameState.board) {
      if (content.type === 'piece' && content.player === 0) keys.add(key);
    }
    return keys;
  }, [gameState]);

  // Valid destination cells for the selected piece
  const validDestKeys = useMemo(() => {
    if (!selected) return new Set<string>();
    const [q, r] = selected.split(',').map(Number);
    const from = { q, r, s: -q - r };
    return new Set(getValidMoves(gameState, from).map(m => coordKey(m.to)));
  }, [selected, gameState]);

  // Deselect if selected piece was removed by an undo
  useEffect(() => {
    if (selected && !pieceKeys.has(selected)) setSelected(null);
  }, [pieceKeys, selected]);

  const lastMove = moves.length > 0 ? moves[moves.length - 1] : null;
  const lastFromKey = lastMove ? coordKey(lastMove.from) : null;
  const lastToKey   = lastMove ? coordKey(lastMove.to)   : null;

  const handleClick = (q: number, r: number, key: string) => {
    const hasPiece = pieceKeys.has(key);
    if (!selected) {
      if (hasPiece) setSelected(key);
    } else if (selected === key) {
      setSelected(null);
    } else if (hasPiece) {
      setSelected(key); // switch selection to a different piece
    } else if (validDestKeys.has(key)) {
      // Only commit valid moves
      const [fq, fr] = selected.split(',').map(Number);
      onAddMove({ from: { q: fq, r: fr, s: -fq - fr }, to: { q, r, s: -q - r } });
      setSelected(null);
    }
  };

  return (
    <div>
      <p className="text-xs text-gray-400 mb-1 text-center">
        Click a piece, then click a destination cell
      </p>
      {/* viewBox covers ±190px x, ±220px y (full star board) plus padding */}
      <svg viewBox="-215 -248 430 496" className="w-full">
        {ALL_BOARD_CELLS.map((cell) => {
          const key = coordKey(cell);
          const { x, y } = rotatedPos(cell.q, cell.r);
          const hasPiece  = pieceKeys.has(key);
          const isSelected = key === selected;
          const isLastFrom = key === lastFromKey;
          const isLastTo   = key === lastToKey;
          const isValidDest = !hasPiece && validDestKeys.has(key);

          // Cell background color
          let fill   = '#f3f4f6';
          let stroke = '#d1d5db';
          if (GOAL_KEY_SET.has(key)) { fill = '#fee2e2'; stroke = '#fca5a5'; }
          if (HOME_KEY_SET.has(key)) { fill = '#dbeafe'; stroke = '#93c5fd'; }
          if (isLastFrom)            { fill = '#fde68a'; stroke = '#d97706'; }
          if (isLastTo)              { fill = '#bbf7d0'; stroke = '#16a34a'; }
          if (isValidDest)           { fill = '#d1fae5'; stroke = '#6ee7b7'; }

          const clickable = hasPiece || (!!selected && validDestKeys.has(key));

          return (
            <g
              key={key}
              onClick={() => handleClick(cell.q, cell.r, key)}
              style={{ cursor: clickable ? 'pointer' : 'default' }}
            >
              <polygon
                points={hexPoints(x, y, EDITOR_HEX_SIZE - 1.5)}
                fill={fill}
                stroke={stroke}
                strokeWidth={1}
              />
              {hasPiece && (
                <circle
                  cx={x} cy={y}
                  r={EDITOR_HEX_SIZE * 0.55}
                  fill={isSelected ? '#fbbf24' : PIECE_COLOR}
                  stroke="white"
                  strokeWidth={1.5}
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Opening Editor Panel ───────────────────────────────────────────────────────

interface EditorState {
  name: string;
  description: string;
  moves: OpeningMove[];
  gameMode: PieceVariant;
}

const EMPTY_EDITOR: EditorState = { name: '', description: '', moves: [], gameMode: 'normal' };

interface EditorPanelProps {
  initial?: CustomOpening;
  onSave: (data: { name: string; description: string; moves: OpeningMove[]; gameMode: PieceVariant }) => void;
  onCancel: () => void;
}

function EditorPanel({ initial, onSave, onCancel }: EditorPanelProps) {
  const [jsonCopied, setJsonCopied] = useState(false);
  const [state, setState] = useState<EditorState>(() =>
    initial
      ? { name: initial.name, description: initial.description ?? '', moves: [...initial.moves], gameMode: initial.gameMode ?? 'normal' }
      : EMPTY_EDITOR
  );

  const set = (updates: Partial<EditorState>) =>
    setState((prev) => ({ ...prev, ...updates }));

  const handleAddMove = (move: OpeningMove) => set({ moves: [...state.moves, move] });
  const handleRemoveMove = (i: number) => set({ moves: state.moves.filter((_, j) => j !== i) });

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(state.moves, null, 2));
    setJsonCopied(true);
    setTimeout(() => setJsonCopied(false), 2000);
  };

  const handleSave = () => {
    if (!state.name.trim()) return;
    onSave({ name: state.name.trim(), description: state.description.trim(), moves: state.moves, gameMode: state.gameMode });
  };

  return (
    <div className="bg-white rounded-xl shadow p-6 border-2 border-blue-200">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        {initial ? `Edit "${initial.name}"` : 'New Opening'}
      </h3>

      <div className="flex flex-col gap-4">
        {/* Name & Description */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={state.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="e.g. My Opening"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              value={state.description}
              onChange={(e) => set({ description: e.target.value })}
              placeholder="Optional description"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Game Mode */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Game Mode</label>
          <div className="flex gap-2">
            {([
              { value: 'normal', label: 'Normal'   },
              { value: 'turbo',  label: 'Turbo'    },
              { value: 'ghost',  label: 'Spectral' },
              { value: 'big',    label: 'Blockade' },
            ] as { value: PieceVariant; label: string }[]).map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => set({ gameMode: value })}
                className={`px-4 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                  state.gameMode === value
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {state.gameMode !== 'normal' && (
            <p className="text-xs text-gray-400 mt-1.5">
              This opening will only be played when the game is in {state.gameMode === 'ghost' ? 'Spectral' : state.gameMode === 'big' ? 'Blockade' : state.gameMode} mode.
            </p>
          )}
        </div>

        {/* Board + move list */}
        <div className="flex gap-6">
          {/* Move list + JSON export */}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-700 mb-2">
              Moves <span className="text-gray-400 font-normal">(auto-rotated for each player)</span>
            </div>

            {state.moves.length === 0 ? (
              <p className="text-sm text-gray-400 italic mb-3">
                No moves yet — use the board to record them.
              </p>
            ) : (
              <ul className="space-y-1 mb-3 max-h-64 overflow-y-auto">
                {state.moves.map((m, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between text-sm bg-gray-50 rounded px-3 py-1.5"
                  >
                    <span className="font-mono text-xs text-gray-700">
                      {i + 1}. ({m.from.q},{m.from.r}) &rarr; ({m.to.q},{m.to.r})
                    </span>
                    {i === state.moves.length - 1 && (
                      <button
                        onClick={() => handleRemoveMove(i)}
                        className="ml-2 text-red-500 hover:text-red-700 font-medium"
                        title="Remove last move"
                      >
                        &times;
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* JSON export */}
            {state.moves.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-500">Export JSON</span>
                  <button
                    onClick={handleCopyJson}
                    className="px-2 py-0.5 text-xs font-medium bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                  >
                    {jsonCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <pre className="text-xs bg-gray-50 rounded p-2 overflow-x-auto border border-gray-200 max-h-32 text-gray-600">
                  {JSON.stringify(state.moves, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* Interactive board */}
          <div className="flex-shrink-0" style={{ width: 260 }}>
            <InteractiveOpeningBoard moves={state.moves} onAddMove={handleAddMove} gameMode={state.gameMode} />
          </div>
        </div>

        {/* Save / Cancel */}
        <div className="flex gap-3 pt-2 border-t border-gray-100">
          <button
            onClick={handleSave}
            disabled={!state.name.trim()}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type EditorMode = 'none' | 'new' | { id: string };

export default function OpeningsPage() {
  const {
    customOpenings,
    playerOpeningId,
    addOpening,
    updateOpening,
    deleteOpening,
    setPlayerOpeningId,
  } = useOpeningStore();

  const [editorMode, setEditorMode] = useState<EditorMode>('none');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyCardJson = (opening: CustomOpening) => {
    navigator.clipboard.writeText(JSON.stringify(opening.moves, null, 2));
    setCopiedId(opening.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // All selectable openings for the favored opening dropdown
  const favoredOptions = [
    { id: 'none', name: 'None' },
    { id: 'standard', name: 'Standard' },
    ...customOpenings.map((o) => ({ id: o.id, name: o.name })),
  ];

  const handleSaveNew = (data: { name: string; description: string; moves: OpeningMove[]; gameMode: PieceVariant }) => {
    addOpening(data);
    setEditorMode('none');
  };

  const handleSaveEdit = (id: string, data: { name: string; description: string; moves: OpeningMove[]; gameMode: PieceVariant }) => {
    updateOpening(id, data);
    setEditorMode('none');
  };

  const handleDelete = (id: string) => {
    if (deleteConfirm === id) {
      deleteOpening(id);
      setDeleteConfirm(null);
      if (typeof editorMode === 'object' && editorMode.id === id) setEditorMode('none');
    } else {
      setDeleteConfirm(id);
    }
  };

  const editingOpening =
    typeof editorMode === 'object'
      ? customOpenings.find((o) => o.id === editorMode.id)
      : undefined;

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <Link href="/home" className="text-sm text-gray-500 hover:text-gray-700 mb-4 inline-block">
            &larr; Back to Home
          </Link>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Opening Manager</h1>
          <p className="text-gray-600">Assign openings to AI personalities and create custom lines.</p>
        </div>

        {/* Favored Opening */}
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Your Favored Opening</h2>
          <p className="text-sm text-gray-500 mb-4">
            When &ldquo;Use favored opening&rdquo; is enabled in the gameplay settings, the game will
            automatically play these moves for you at the start.
          </p>
          <div className="flex items-center gap-4">
            <select
              value={playerOpeningId ?? 'none'}
              onChange={(e) => {
                const val = e.target.value;
                setPlayerOpeningId(val === 'none' ? null : val);
              }}
              className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {favoredOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.name}</option>
              ))}
            </select>
            <span className={`text-sm font-medium ${playerOpeningId && playerOpeningId !== 'none' ? 'text-green-600' : 'text-gray-400'}`}>
              {playerOpeningId && playerOpeningId !== 'none' ? 'Set' : 'Not set'}
            </span>
          </div>
        </div>

        {/* Custom Openings */}
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Custom Openings</h2>
            <button
              onClick={() => { setEditorMode('new'); setDeleteConfirm(null); }}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-500"
            >
              + New Opening
            </button>
          </div>

          {customOpenings.length === 0 ? (
            <p className="text-sm text-gray-400 italic py-4 text-center">
              No custom openings yet. Click &quot;+ New Opening&quot; to create one.
            </p>
          ) : (
            <div className="space-y-3">
              {customOpenings.map((opening) => {
                const isEditing = typeof editorMode === 'object' && editorMode.id === opening.id;
                const isDeletePending = deleteConfirm === opening.id;
                return (
                  <div
                    key={opening.id}
                    className={`flex items-start gap-4 p-4 rounded-lg border-2 transition-colors ${
                      isEditing ? 'border-blue-300 bg-blue-50' : 'border-gray-100 bg-gray-50'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900">{opening.name}</div>
                      {opening.description && (
                        <div className="text-sm text-gray-500 mt-0.5">{opening.description}</div>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-400">
                          {opening.moves.length} move{opening.moves.length !== 1 ? 's' : ''}
                        </span>
                        {opening.gameMode && opening.gameMode !== 'normal' && (
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                            opening.gameMode === 'turbo'
                              ? 'bg-red-100 text-red-700'
                              : opening.gameMode === 'ghost'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {opening.gameMode === 'ghost' ? 'Spectral' : opening.gameMode === 'big' ? 'Blockade' : opening.gameMode.charAt(0).toUpperCase() + opening.gameMode.slice(1)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleCopyCardJson(opening)}
                        className="px-3 py-1.5 text-sm font-medium bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                      >
                        {copiedId === opening.id ? 'Copied!' : 'Copy JSON'}
                      </button>
                      <button
                        onClick={() => { setEditorMode(isEditing ? 'none' : { id: opening.id }); setDeleteConfirm(null); }}
                        className="px-3 py-1.5 text-sm font-medium bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                      >
                        {isEditing ? 'Close' : 'Edit'}
                      </button>
                      {isDeletePending ? (
                        <>
                          <button
                            onClick={() => handleDelete(opening.id)}
                            className="px-3 py-1.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="px-3 py-1.5 text-sm font-medium bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(opening.id)}
                          className="px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Editor panel */}
        {editorMode === 'new' && (
          <EditorPanel
            onSave={handleSaveNew}
            onCancel={() => setEditorMode('none')}
          />
        )}
        {typeof editorMode === 'object' && editingOpening && (
          <EditorPanel
            key={editingOpening.id}
            initial={editingOpening}
            onSave={(data) => handleSaveEdit(editingOpening.id, data)}
            onCancel={() => setEditorMode('none')}
          />
        )}

        {/* Built-in reference */}
        <div className="bg-white rounded-xl shadow p-6 mt-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Built-in Openings</h2>
          <div className="space-y-2">
            {OPENING_LINES.filter((l) => l.id !== 'none').map((line) => (
              <div key={line.id} className="flex items-start gap-3 text-sm">
                <span className="font-medium text-gray-700 w-20">{line.name}</span>
                <span className="text-gray-500">{line.description}</span>
                <span className="ml-auto text-gray-400 whitespace-nowrap">{line.moves.length} moves</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
