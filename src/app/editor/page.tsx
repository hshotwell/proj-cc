'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { PlayerIndex, BoardLayout } from '@/types/game';
import { PLAYER_COLORS, HEX_SIZE, BOARD_PADDING, TRIANGLE_ASSIGNMENTS } from '@/game/constants';
import { DEFAULT_BOARD_LAYOUT } from '@/game/defaultLayout';
import { cubeToPixel, cubeCoord, coordKey, parseCoordKey, rotateCube } from '@/game/coordinates';
import { hexToRgba, blendColorsRgba } from '@/game/colors';
import { findBoardTriangles, findBorderEdges } from '@/game/triangles';
import { useLayoutStore } from '@/store/layoutStore';
import { SettingsPopup } from '@/components/SettingsPopup';
import { SettingsButton } from '@/components/SettingsButton';

type EditorMode = 'cells' | 'starting' | 'goals' | 'walls';
type SymmetryMode = 'none' | 'x' | 'y' | 'xy' | '6way';

// Generate all possible hex positions within a radius
function generateAllPositions(radius: number): string[] {
  const positions: string[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      const s = -q - r;
      if (Math.abs(s) <= radius) {
        positions.push(coordKey(cubeCoord(q, r)));
      }
    }
  }
  return positions;
}

const ALL_PLAYERS: PlayerIndex[] = [0, 1, 2, 3, 4, 5];
const GRID_RADIUS = 9; // Large enough for Chinese Checkers star

// Get symmetric coordinates for a given position
function getSymmetricCoords(key: string, symmetry: SymmetryMode): string[] {
  const [q, r] = key.split(',').map(Number);
  const coord = cubeCoord(q, r);
  const results: Set<string> = new Set([key]);

  if (symmetry === 'x' || symmetry === 'xy') {
    // X-axis symmetry: reflect across vertical center line (negate x, keep y)
    // In cube coords: (q, r) -> (-q - r, r)
    results.add(coordKey(cubeCoord(-q - r, r)));
  }

  if (symmetry === 'y' || symmetry === 'xy') {
    // Y-axis symmetry: reflect across horizontal center line (keep x, negate y)
    // In cube coords: (q, r) -> (q + r, -r)
    results.add(coordKey(cubeCoord(q + r, -r)));
  }

  if (symmetry === 'xy') {
    // Both mirrors combined: (-q - r, r) then (q + r, -r) on that
    // Which is: ((-q - r) + r, -r) = (-q, -r)
    results.add(coordKey(cubeCoord(-q, -r)));
  }

  if (symmetry === '6way') {
    // All 6 rotations (60° increments)
    for (let i = 0; i < 6; i++) {
      const rotated = rotateCube(coord, i);
      results.add(coordKey(rotated));
    }
  }

  return Array.from(results);
}

// Helper to derive standard goal positions from the default layout
function getStandardGoalPositions(): Record<number, Set<string>> {
  const goalPositions: Record<number, Set<string>> = {
    0: new Set(),
    1: new Set(),
    2: new Set(),
    3: new Set(),
    4: new Set(),
    5: new Set(),
  };

  for (const player of ALL_PLAYERS) {
    const goalTriangle = TRIANGLE_ASSIGNMENTS[player].goal;
    // Find the player whose home triangle matches this goalTriangle
    let targetPlayer: PlayerIndex | undefined;
    for (const p of ALL_PLAYERS) {
      if (TRIANGLE_ASSIGNMENTS[p].home === goalTriangle) {
        targetPlayer = p;
        break;
      }
    }
    if (targetPlayer !== undefined && DEFAULT_BOARD_LAYOUT.startingPositions[targetPlayer]) {
      goalPositions[player] = new Set(DEFAULT_BOARD_LAYOUT.startingPositions[targetPlayer] || []);
    }
  }
  return goalPositions;
}

export default function EditorPage() {
  const { layouts, loadLayouts, saveLayout, deleteLayout } = useLayoutStore();

  const [mode, setMode] = useState<EditorMode>('cells');
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerIndex>(0);
  const [activeCells, setActiveCells] = useState<Set<string>>(new Set());
  const [startingPositions, setStartingPositions] = useState<Record<number, Set<string>>>({
    0: new Set(),
    1: new Set(),
    2: new Set(),
    3: new Set(),
    4: new Set(),
    5: new Set(),
  });
  const [goalPositions, setGoalPositions] = useState<Record<number, Set<string>>>({
    0: new Set(),
    1: new Set(),
    2: new Set(),
    3: new Set(),
    4: new Set(),
    5: new Set(),
  });
  const [walls, setWalls] = useState<Set<string>>(new Set());
  const [layoutName, setLayoutName] = useState('My Board');
  const [selectedLayoutId, setSelectedLayoutId] = useState<string | null>(null);
  const [symmetry, setSymmetry] = useState<SymmetryMode>('none');
  const [mirrorGoals, setMirrorGoals] = useState(false);

  // Paint mode state for click-and-drag
  const [isPainting, setIsPainting] = useState(false);
  const [paintAction, setPaintAction] = useState<'add' | 'remove'>('add');

  // Load layouts on mount
  useEffect(() => {
    loadLayouts();
  }, [loadLayouts]);

  // Global mouseup listener to stop painting
  useEffect(() => {
    const handleMouseUp = () => setIsPainting(false);
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  // All possible positions
  const allPositions = useMemo(() => generateAllPositions(GRID_RADIUS), []);

  // Calculate viewBox
  const viewBox = useMemo(() => {
    const positions = allPositions.map((key) => {
      const [q, r] = key.split(',').map(Number);
      return cubeToPixel(cubeCoord(q, r), HEX_SIZE);
    });
    const xs = positions.map((p) => p.x);
    const ys = positions.map((p) => p.y);
    const minX = Math.min(...xs) - BOARD_PADDING;
    const maxX = Math.max(...xs) + BOARD_PADDING;
    const minY = Math.min(...ys) - BOARD_PADDING;
    const maxY = Math.max(...ys) + BOARD_PADDING;
    return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
  }, [allPositions]);

  // Determine if a cell should be "added" or "removed" based on current state
  const getCellState = (key: string): boolean => {
    if (mode === 'cells') {
      return activeCells.has(key);
    } else if (mode === 'starting') {
      for (const player of ALL_PLAYERS) {
        if (startingPositions[player].has(key)) return true;
      }
      return false;
    } else if (mode === 'goals') {
      for (const player of ALL_PLAYERS) {
        if (goalPositions[player].has(key)) return true;
      }
      return false;
    } else if (mode === 'walls') {
      return walls.has(key);
    }
    return false;
  };

  // Apply an action (add or remove) to a cell
  const applyActionToCell = (key: string, action: 'add' | 'remove') => {
    const symmetricKeys = getSymmetricCoords(key, symmetry);

    if (mode === 'cells') {
      setActiveCells((prev) => {
        const newSet = new Set(prev);
        for (const symKey of symmetricKeys) {
          if (action === 'remove') {
            newSet.delete(symKey);
            // Also remove any starting positions on this cell
            setStartingPositions((sp) => {
              const newSp = { ...sp };
              for (const player of ALL_PLAYERS) {
                const playerSet = new Set(newSp[player]);
                playerSet.delete(symKey);
                newSp[player] = playerSet;
              }
              return newSp;
            });
            setGoalPositions((gp) => {
              const newGp = { ...gp };
              for (const player of ALL_PLAYERS) {
                const playerSet = new Set(newGp[player]);
                playerSet.delete(symKey);
                newGp[player] = playerSet;
              }
              return newGp;
            });
          } else {
            newSet.add(symKey);
          }
        }
        return newSet;
      });
    } else if (mode === 'starting') {
      if (!activeCells.has(key)) return;
      if (walls.has(key)) return;

      const pieceKeys = mirrorGoals ? [key] : symmetricKeys;

      setStartingPositions((prev) => {
        const newPositions = { ...prev };
        for (const symKey of pieceKeys) {
          if (!activeCells.has(symKey)) continue;
          if (walls.has(symKey)) continue;

          if (action === 'remove') {
            for (const player of ALL_PLAYERS) {
              const newSet = new Set(newPositions[player]);
              newSet.delete(symKey);
              newPositions[player] = newSet;
            }
          } else {
            const newSet = new Set(newPositions[selectedPlayer]);
            newSet.add(symKey);
            newPositions[selectedPlayer] = newSet;
          }
        }
        return newPositions;
      });

      if (mirrorGoals) {
        const [cq, cr] = key.split(',').map(Number);
        const oppositeKey = coordKey(cubeCoord(-cq, -cr));

        if (activeCells.has(oppositeKey)) {
          setGoalPositions((prev) => {
            const newGoals = { ...prev };
            const goalSet = new Set(newGoals[selectedPlayer]);
            if (action === 'remove') {
              goalSet.delete(oppositeKey);
            } else {
              goalSet.add(oppositeKey);
            }
            newGoals[selectedPlayer] = goalSet;
            return newGoals;
          });
        }
      }
    } else if (mode === 'goals') {
      if (!activeCells.has(key)) return;
      if (walls.has(key)) return;

      setGoalPositions((prev) => {
        const newPositions = { ...prev };
        for (const symKey of symmetricKeys) {
          if (!activeCells.has(symKey)) continue;
          if (walls.has(symKey)) continue;

          if (action === 'remove') {
            for (const player of ALL_PLAYERS) {
              const newSet = new Set(newPositions[player]);
              newSet.delete(symKey);
              newPositions[player] = newSet;
            }
          } else {
            const newSet = new Set(newPositions[selectedPlayer]);
            newSet.add(symKey);
            newPositions[selectedPlayer] = newSet;
          }
        }
        return newPositions;
      });
    } else if (mode === 'walls') {
      if (!activeCells.has(key)) return;

      // Check if there's a piece or goal here
      let hasExistingPieceOrGoal = false;
      for (const player of ALL_PLAYERS) {
        if (startingPositions[player].has(key) || goalPositions[player].has(key)) {
          hasExistingPieceOrGoal = true;
          break;
        }
      }
      if (hasExistingPieceOrGoal) return;

      setWalls((prev) => {
        const newWalls = new Set(prev);
        for (const symKey of symmetricKeys) {
          if (!activeCells.has(symKey)) continue;

          let symHasPieceOrGoal = false;
          for (const player of ALL_PLAYERS) {
            if (startingPositions[player].has(symKey) || goalPositions[player].has(symKey)) {
              symHasPieceOrGoal = true;
              break;
            }
          }
          if (symHasPieceOrGoal) continue;

          if (action === 'remove') {
            newWalls.delete(symKey);
          } else {
            newWalls.add(symKey);
          }
        }
        return newWalls;
      });
    }
  };

  // Start painting on mouse down
  const handleCellMouseDown = (key: string) => {
    const currentState = getCellState(key);
    const action = currentState ? 'remove' : 'add';
    setPaintAction(action);
    setIsPainting(true);
    applyActionToCell(key, action);
  };

  // Continue painting on mouse enter while button is held
  const handleCellMouseEnter = (key: string) => {
    if (!isPainting) return;
    applyActionToCell(key, paintAction);
  };

  // Touch handler - treat touch as a single toggle (no drag painting)
  const handleCellTouchStart = (key: string, e: React.TouchEvent) => {
    e.preventDefault(); // Prevent synthetic mousedown from firing (double-toggle)
    const currentState = getCellState(key);
    const action = currentState ? 'remove' : 'add';
    applyActionToCell(key, action);
  };

  // Stats calculation memo
  const pieceCounts = useMemo(() => {
    return ALL_PLAYERS.map((p) => startingPositions[p].size);
  }, [startingPositions]);

  const handleSave = () => {
    // Check if a layout with the same name already exists
    const existingLayout = layouts.find((l) => l.name === layoutName);

    // Use existing layout's ID if name matches, otherwise generate new ID
    const layoutId = existingLayout ? existingLayout.id : `layout-${Date.now()}`;

    const layout: BoardLayout = {
      id: layoutId,
      name: layoutName,
      cells: Array.from(activeCells),
      startingPositions: Object.fromEntries(
        ALL_PLAYERS.map((p) => [p, Array.from(startingPositions[p])])
      ) as Record<PlayerIndex, string[]>,
      goalPositions: Object.fromEntries(
        ALL_PLAYERS.map((p) => [p, Array.from(goalPositions[p])])
      ) as Record<PlayerIndex, string[]>,
      walls: Array.from(walls),
      createdAt: Date.now(),
    };
    saveLayout(layout);
    setSelectedLayoutId(layout.id);
    alert(existingLayout ? 'Layout updated!' : 'Layout saved!');
  };

  const handleLoad = (layout: BoardLayout) => {
    setActiveCells(new Set(layout.cells));
    setStartingPositions(
      Object.fromEntries(
        ALL_PLAYERS.map((p) => [p, new Set(layout.startingPositions[p] || [])])
      ) as Record<number, Set<string>>
    );
    setGoalPositions(
      Object.fromEntries(
        ALL_PLAYERS.map((p) => [p, new Set(layout.goalPositions?.[p] || [])])
      ) as Record<number, Set<string>>
    );
    setWalls(new Set(layout.walls || []));
    setLayoutName(layout.name);
    setSelectedLayoutId(layout.id);
  };

  const handleClear = () => {
    setActiveCells(new Set());
    setStartingPositions({
      0: new Set(),
      1: new Set(),
      2: new Set(),
      3: new Set(),
      4: new Set(),
      5: new Set(),
    });
    setGoalPositions({
      0: new Set(),
      1: new Set(),
      2: new Set(),
      3: new Set(),
      4: new Set(),
      5: new Set(),
    });
    setWalls(new Set());
    setLayoutName('My Board');
    setSelectedLayoutId(null);
  };

  // Restart handler for settings popup - reload saved layout if name matches, otherwise clear
  const handleEditorRestart = useCallback(() => {
    const matchingLayout = layouts.find((l) => l.name === layoutName);
    if (matchingLayout) {
      // Reload the saved layout
      setActiveCells(new Set(matchingLayout.cells));
      setStartingPositions(
        Object.fromEntries(
          ALL_PLAYERS.map((p) => [p, new Set(matchingLayout.startingPositions[p] || [])])
        ) as Record<number, Set<string>>
      );
      setGoalPositions(
        Object.fromEntries(
          ALL_PLAYERS.map((p) => [p, new Set(matchingLayout.goalPositions?.[p] || [])])
        ) as Record<number, Set<string>>
      );
      setWalls(new Set(matchingLayout.walls || []));
      setSelectedLayoutId(matchingLayout.id);
    } else {
      // Clear the board
      handleClear();
    }
  }, [layouts, layoutName]);

  const handleFillAll = () => {
    setActiveCells(new Set(allPositions));
  };

  const handleLoadStandardLayout = () => {
    setActiveCells(new Set(DEFAULT_BOARD_LAYOUT.cells));
    setStartingPositions({
      0: new Set(), 1: new Set(), 2: new Set(),
      3: new Set(), 4: new Set(), 5: new Set(),
    });
    setGoalPositions({
      0: new Set(), 1: new Set(), 2: new Set(),
      3: new Set(), 4: new Set(), 5: new Set(),
    });
    setWalls(new Set());
    setLayoutName('My Custom Board');
    // Don't set selectedLayoutId - this is a template, not a saved layout
    setSelectedLayoutId(null);
  };

  const handleExport = () => {
    const layout: BoardLayout = {
      id: selectedLayoutId || `layout-${Date.now()}`,
      name: layoutName,
      cells: Array.from(activeCells),
      startingPositions: Object.fromEntries(
        ALL_PLAYERS.map((p) => [p, Array.from(startingPositions[p])])
      ) as Record<PlayerIndex, string[]>,
      goalPositions: Object.fromEntries(
        ALL_PLAYERS.map((p) => [p, Array.from(goalPositions[p])])
      ) as Record<PlayerIndex, string[]>,
      walls: Array.from(walls),
      createdAt: Date.now(),
    };
    const json = JSON.stringify(layout, null, 2);
    console.log('Exported layout:', json);
    navigator.clipboard.writeText(json);
    alert('Layout JSON copied to clipboard!');
  };

  const handleImport = () => {
    const json = prompt('Paste layout JSON:');
    if (json) {
      try {
        const layout = JSON.parse(json) as BoardLayout;
        handleLoad(layout);
        alert('Layout imported!');
      } catch (e) {
        alert('Invalid JSON');
      }
    }
  };

  // Calculate symmetry lines for visualization
  const symmetryLines = useMemo(() => {
    const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
    const lineLength = GRID_RADIUS * HEX_SIZE * 2.5;

    if (symmetry === 'x' || symmetry === 'xy') {
      // X-axis symmetry: vertical line through center (reflects left/right)
      lines.push({ x1: 0, y1: -lineLength, x2: 0, y2: lineLength });
    }

    if (symmetry === 'y' || symmetry === 'xy') {
      // Y-axis symmetry: horizontal line through center (reflects top/bottom)
      lines.push({ x1: -lineLength, y1: 0, x2: lineLength, y2: 0 });
    }

    if (symmetry === '6way') {
      // 6-way symmetry: 3 lines at 60° intervals through center
      for (let i = 0; i < 3; i++) {
        const angle = (i * Math.PI) / 3; // 0°, 60°, 120°
        const dx = Math.cos(angle) * lineLength;
        const dy = Math.sin(angle) * lineLength;
        lines.push({ x1: -dx, y1: -dy, x2: dx, y2: dy });
      }
    }

    return lines;
  }, [symmetry]);

  // Compute triangles and border edges for the active cells
  const editorTriangles = useMemo(() => {
    if (activeCells.size === 0) return [];
    const sp: Partial<Record<PlayerIndex, string[]>> = {};
    for (const player of ALL_PLAYERS) {
      const arr = Array.from(startingPositions[player]);
      if (arr.length > 0) sp[player as PlayerIndex] = arr;
    }
    return findBoardTriangles(activeCells, sp);
  }, [activeCells, startingPositions]);

  const editorBorderEdges = useMemo(() => findBorderEdges(editorTriangles, activeCells), [editorTriangles, activeCells]);

  return (
    <div className="min-h-screen bg-gray-100 overflow-x-hidden">
      <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 py-2 sm:py-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <Link href="/home" className="text-sm text-gray-500 hover:text-gray-700">
              ← Back to Home
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Board Editor</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleImport}
              className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
            >
              Import
            </button>
            <button
              onClick={handleExport}
              className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
            >
              Export
            </button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-2 sm:gap-4">
          {/* Left panel - Tools */}
          <div className="w-full lg:w-64 bg-white rounded-lg shadow p-2 sm:p-4 space-y-4 order-2 lg:order-1">
            {/* Layout name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Layout Name
              </label>
              <input
                type="text"
                value={layoutName}
                onChange={(e) => setLayoutName(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>

            {/* Mode selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Edit Mode
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setMode('cells')}
                  className={`px-3 py-2 text-sm rounded-lg transition-all ${
                    mode === 'cells'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Cells
                </button>
                <button
                  onClick={() => setMode('starting')}
                  className={`px-3 py-2 text-sm rounded-lg transition-all ${
                    mode === 'starting'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Pieces
                </button>
                <button
                  onClick={() => setMode('goals')}
                  className={`px-3 py-2 text-sm rounded-lg transition-all ${
                    mode === 'goals'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Goals
                </button>
                <button
                  onClick={() => setMode('walls')}
                  className={`px-3 py-2 text-sm rounded-lg transition-all ${
                    mode === 'walls'
                      ? 'bg-gray-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Walls
                </button>
              </div>
            </div>

            {/* Player selection (for starting positions and goals mode) */}
            {(mode === 'starting' || mode === 'goals') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Player
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {ALL_PLAYERS.map((player) => (
                    <button
                      key={player}
                      onClick={() => setSelectedPlayer(player)}
                      className={`p-2 rounded-lg transition-all ${
                        selectedPlayer === player
                          ? 'ring-2 ring-blue-500 ring-offset-2'
                          : ''
                      }`}
                    >
                      <div
                        className="w-8 h-8 rounded-full mx-auto mb-1"
                        style={{ backgroundColor: PLAYER_COLORS[player] }}
                      />
                      <div className="text-xs text-center text-gray-600">
                        {mode === 'starting' ? startingPositions[player].size : goalPositions[player].size}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Symmetry options */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Symmetry
              </label>
              <div className="grid grid-cols-2 gap-1">
                <button
                  onClick={() => setSymmetry('none')}
                  className={`px-2 py-1 text-xs rounded transition-all ${
                    symmetry === 'none'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  None
                </button>
                <button
                  onClick={() => setSymmetry('x')}
                  className={`px-2 py-1 text-xs rounded transition-all ${
                    symmetry === 'x'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  X-Axis
                </button>
                <button
                  onClick={() => setSymmetry('y')}
                  className={`px-2 py-1 text-xs rounded transition-all ${
                    symmetry === 'y'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Y-Axis
                </button>
                <button
                  onClick={() => setSymmetry('xy')}
                  className={`px-2 py-1 text-xs rounded transition-all ${
                    symmetry === 'xy'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  X+Y
                </button>
                <button
                  onClick={() => setSymmetry('6way')}
                  className={`col-span-2 px-2 py-1 text-xs rounded transition-all ${
                    symmetry === '6way'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  6-Way (60°)
                </button>
              </div>
            </div>

            {/* Mirror goals option (only when symmetry is active) */}
            {symmetry !== 'none' && (
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={mirrorGoals}
                    onChange={() => setMirrorGoals((v) => !v)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-6 bg-gray-200 rounded-full peer-checked:bg-blue-500 transition-colors" />
                  <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
                    Mirror goals
                  </div>
                  <div className="text-xs text-gray-500">
                    Place goal at opposite side when placing a piece
                  </div>
                </div>
              </label>
            )}

            {/* Stats */}
            <div className="text-sm text-gray-600">
              <p>Active cells: {activeCells.size}</p>
              <p>Total pieces: {pieceCounts.reduce((a, b) => a + b, 0)}</p>
              <p>Total goals: {ALL_PLAYERS.reduce((acc: number, p) => acc + goalPositions[p].size, 0)}</p>
              <p>Walls: {walls.size}</p>
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <button
                onClick={handleSave}
                className="w-full py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-500"
              >
                Save Layout
              </button>
              <div className="flex gap-2">
                <button
                  onClick={handleFillAll}
                  className="flex-1 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
                >
                  Fill All
                </button>
                <button
                  onClick={handleClear}
                  className="flex-1 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
                >
                  Clear All
                </button>
                <button
                  onClick={handleLoadStandardLayout}
                  className="flex-1 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
                >
                  Load Standard
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setStartingPositions({
                    0: new Set(), 1: new Set(), 2: new Set(),
                    3: new Set(), 4: new Set(), 5: new Set(),
                  })}
                  className="flex-1 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
                >
                  Clear Pieces
                </button>
                <button
                  onClick={() => setGoalPositions({
                    0: new Set(), 1: new Set(), 2: new Set(),
                    3: new Set(), 4: new Set(), 5: new Set(),
                  })}
                  className="flex-1 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
                >
                  Clear Goals
                </button>
                <button
                  onClick={() => setWalls(new Set())}
                  className="flex-1 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
                >
                  Clear Walls
                </button>
              </div>
            </div>

            {/* Saved layouts */}
            {layouts.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Saved Layouts
                </label>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {layouts.map((layout) => (
                    <div
                      key={layout.id}
                      className={`flex items-center justify-between p-2 rounded text-sm ${
                        selectedLayoutId === layout.id
                          ? 'bg-blue-50 border border-blue-200'
                          : 'bg-gray-50 hover:bg-gray-100'
                      }`}
                    >
                      <button
                        onClick={() => handleLoad(layout)}
                        className="flex-1 text-left truncate"
                      >
                        {layout.name}
                        {layout.isDefault && (
                          <span className="ml-1 text-xs text-green-600">(default)</span>
                        )}
                      </button>
                      <button
                        onClick={() => deleteLayout(layout.id)}
                        className="text-red-500 hover:text-red-700 ml-2"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Instructions */}
            <div className="text-xs text-gray-500 space-y-1">
              <p><strong>Cells mode:</strong> Click to toggle cells on/off</p>
              <p><strong>Pieces mode:</strong> Select a player color, then click active cells to place/remove pieces</p>
              <p><strong>Goals mode:</strong> Select a player color, then click active cells to set/unset goal positions for that player</p>
              <p><strong>Walls mode:</strong> Click to place/remove walls (can be jumped over but not landed on)</p>
              <p><strong>Symmetry:</strong> When enabled, edits are mirrored automatically</p>
            </div>
          </div>

          {/* Right panel - Board (shows first on mobile) */}
          <div className="flex-1 bg-white rounded-lg shadow p-2 sm:p-4 relative order-1 lg:order-2">
            <SettingsButton />
            <svg
              viewBox={viewBox}
              className="w-full h-[70vh] select-none"
              preserveAspectRatio="xMidYMid meet"
              onMouseLeave={() => setIsPainting(false)}
            >
              {/* Symmetry lines */}
              {symmetryLines.map((line, index) => (
                <line
                  key={`symmetry-${index}`}
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  stroke="#3b82f6"
                  strokeWidth={2}
                  strokeDasharray="8,4"
                  opacity={0.5}
                />
              ))}
              {/* Triangle fills */}
              {editorTriangles.map((tri) => {
                const points = tri.vertices.map((vkey) => {
                  const pos = parseCoordKey(vkey);
                  const px = cubeToPixel(pos, HEX_SIZE);
                  return `${px.x},${px.y}`;
                }).join(' ');

                const fill = tri.playerOwners.length > 0
                  ? blendColorsRgba(tri.playerOwners.map((p) => PLAYER_COLORS[p]), 0.15)
                  : '#f8f8f8';

                return (
                  <polygon
                    key={`tri-${tri.vertices.join('-')}`}
                    points={points}
                    fill={fill}
                    stroke="black"
                    strokeWidth={0.5}
                  />
                );
              })}
              {/* Border edges */}
              {editorBorderEdges.map((edge) => {
                const pa = cubeToPixel(parseCoordKey(edge.a), HEX_SIZE);
                const pb = cubeToPixel(parseCoordKey(edge.b), HEX_SIZE);
                return (
                  <line
                    key={`border-${edge.a}-${edge.b}`}
                    x1={pa.x} y1={pa.y}
                    x2={pb.x} y2={pb.y}
                    stroke="black"
                    strokeWidth={1.5}
                  />
                );
              })}
              {/* Wall connecting lines */}
              {(() => {
                const directions = [
                  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
                  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
                ];
                const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
                for (const wallKey of walls) {
                  const [wq, wr] = wallKey.split(',').map(Number);
                  for (const dir of directions) {
                    const neighborKey = `${wq + dir.q},${wr + dir.r}`;
                    if (walls.has(neighborKey) && neighborKey > wallKey) {
                      const { x: x1, y: y1 } = cubeToPixel(cubeCoord(wq, wr), HEX_SIZE);
                      const { x: x2, y: y2 } = cubeToPixel(cubeCoord(wq + dir.q, wr + dir.r), HEX_SIZE);
                      lines.push({ x1, y1, x2, y2 });
                    }
                  }
                }
                return lines.map((line, i) => (
                  <line
                    key={`wall-line-${i}`}
                    x1={line.x1} y1={line.y1}
                    x2={line.x2} y2={line.y2}
                    stroke="#4b5563"
                    strokeWidth={HEX_SIZE * 0.4}
                    strokeLinecap="round"
                  />
                ));
              })()}
              {/* Wall hexagons */}
              {Array.from(walls).map((wallKey) => {
                const [wq, wr] = wallKey.split(',').map(Number);
                const { x, y } = cubeToPixel(cubeCoord(wq, wr), HEX_SIZE);
                const hexSize = HEX_SIZE * 0.7;
                const hexPoints = Array.from({ length: 6 }, (_, i) => {
                  const angle = (Math.PI / 3) * i;
                  const px = x + hexSize * Math.cos(angle);
                  const py = y + hexSize * Math.sin(angle);
                  return `${px},${py}`;
                }).join(' ');
                return (
                  <polygon
                    key={`wall-hex-${wallKey}`}
                    points={hexPoints}
                    fill="#6b7280"
                    stroke="#374151"
                    strokeWidth={2}
                  />
                );
              })}
              {allPositions.map((key) => {
                const [q, r] = key.split(',').map(Number);
                const { x, y } = cubeToPixel(cubeCoord(q, r), HEX_SIZE);
                const isActive = activeCells.has(key);

                let isGoalForAnyPlayer = false;
                let goalPlayerForThisCell: PlayerIndex | undefined = undefined; // Declare here
                for (const player of ALL_PLAYERS) {
                  if (goalPositions[player].has(key)) {
                    isGoalForAnyPlayer = true;
                    goalPlayerForThisCell = player; // Assign here
                    break;
                  }
                }

                return (
                  <g
                    key={key}
                    onMouseDown={() => handleCellMouseDown(key)}
                    onMouseEnter={() => handleCellMouseEnter(key)}
                    onTouchStart={(e) => handleCellTouchStart(key, e)}
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                  >
                    {/* Cell background */}
                    <circle
                      cx={x}
                      cy={y}
                      r={HEX_SIZE * 0.45}
                      fill={getCellColor(key, mode, selectedPlayer, activeCells, startingPositions, goalPositions)}
                      stroke={isActive ? '#9ca3af' : '#e5e7eb'}
                      strokeWidth={1}
                      opacity={getCellOpacity(key, activeCells, goalPositions)}
                    />
                    {/* Goal indicator (separate circle) */}
                    {isGoalForAnyPlayer && goalPlayerForThisCell !== undefined && (
                      <circle
                        cx={x}
                        cy={y}
                        r={HEX_SIZE * 0.55} // New larger radius
                        fill={mode === 'goals' && goalPlayerForThisCell === selectedPlayer ? PLAYER_COLORS[selectedPlayer] : 'none'}
                        fillOpacity={mode === 'goals' && goalPlayerForThisCell === selectedPlayer ? 0.3 : 0}
                        stroke={PLAYER_COLORS[goalPlayerForThisCell]} // Player's color for stroke
                        strokeWidth={2} // Consistent stroke width for goal highlight
                        className={'pulse-opacity'}
                      />
                    )}
                    {/* Piece indicator */}
                    {(ALL_PLAYERS.some((p) => startingPositions[p].has(key))) && (
                      <circle
                        cx={x}
                        cy={y}
                        r={HEX_SIZE * 0.35}
                        fill={getCellColor(key, mode, selectedPlayer, activeCells, startingPositions, goalPositions)}
                      />
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>

      {/* Settings Popup (Esc to toggle) */}
      <SettingsPopup mode="editor" onRestart={handleEditorRestart} />
    </div>
  );
}

const getCellColor = (
  key: string,
  mode: EditorMode,
  selectedPlayer: PlayerIndex,
  activeCells: Set<string>,
  startingPositions: Record<number, Set<string>>,
  goalPositions: Record<number, Set<string>>
): string => {
  // Check if it's a starting position (takes precedence over general goals if not in goals mode)
  for (const player of ALL_PLAYERS) {
    if (startingPositions[player].has(key)) {
      return PLAYER_COLORS[player];
    }
  }

  // Check if cell is active
  if (activeCells.has(key)) {
    return '#d1d5db'; // Medium gray for active cells
  }

  return '#e5e7eb'; // Light gray for inactive (visible but distinct)
};

const getCellOpacity = (key: string, activeCells: Set<string>, goalPositions: Record<number, Set<string>>): number => {
  // If it's an active cell, make it fully opaque
  if (activeCells.has(key)) return 1;
  // Otherwise, if it's an inactive cell, reduce opacity
  return 0.6; // Visible inactive cells
};

