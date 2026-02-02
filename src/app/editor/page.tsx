'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import type { PlayerIndex, BoardLayout } from '@/types/game';
import { PLAYER_COLORS, DEFAULT_PLAYER_NAMES, HEX_SIZE, BOARD_PADDING } from '@/game/constants';
import { cubeToPixel, cubeCoord, coordKey, rotateCube } from '@/game/coordinates';
import { useLayoutStore } from '@/store/layoutStore';

type EditorMode = 'cells' | 'starting';
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
  const [layoutName, setLayoutName] = useState('My Board');
  const [selectedLayoutId, setSelectedLayoutId] = useState<string | null>(null);
  const [symmetry, setSymmetry] = useState<SymmetryMode>('none');

  // Load layouts on mount
  useEffect(() => {
    loadLayouts();
  }, [loadLayouts]);

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

  const handleCellClick = (key: string) => {
    // Get all symmetric coordinates
    const symmetricKeys = getSymmetricCoords(key, symmetry);

    if (mode === 'cells') {
      // Toggle cell active state
      setActiveCells((prev) => {
        const newSet = new Set(prev);
        const isCurrentlyActive = newSet.has(key);

        for (const symKey of symmetricKeys) {
          if (isCurrentlyActive) {
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
          } else {
            newSet.add(symKey);
          }
        }
        return newSet;
      });
    } else {
      // Set starting position mode
      if (!activeCells.has(key)) return; // Can only place on active cells

      setStartingPositions((prev) => {
        const newPositions = { ...prev };

        // Check if clicked cell already has a piece from any player
        let hasExistingPiece = false;
        for (const player of ALL_PLAYERS) {
          if (newPositions[player].has(key)) {
            hasExistingPiece = true;
            break;
          }
        }

        for (const symKey of symmetricKeys) {
          // Skip if cell is not active
          if (!activeCells.has(symKey)) continue;

          if (hasExistingPiece) {
            // Remove pieces at symmetric positions
            for (const player of ALL_PLAYERS) {
              const newSet = new Set(newPositions[player]);
              newSet.delete(symKey);
              newPositions[player] = newSet;
            }
          } else {
            // Add piece for selected player
            const newSet = new Set(newPositions[selectedPlayer]);
            newSet.add(symKey);
            newPositions[selectedPlayer] = newSet;
          }
        }

        return newPositions;
      });
    }
  };

  const getCellColor = (key: string): string => {
    // Check if it's a starting position
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

  const getCellOpacity = (key: string): number => {
    if (activeCells.has(key)) return 1;
    return 0.6; // Visible inactive cells
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

  const handleSave = () => {
    const layout: BoardLayout = {
      id: selectedLayoutId || `layout-${Date.now()}`,
      name: layoutName,
      cells: Array.from(activeCells),
      startingPositions: Object.fromEntries(
        ALL_PLAYERS.map((p) => [p, Array.from(startingPositions[p])])
      ) as Record<PlayerIndex, string[]>,
      createdAt: Date.now(),
    };
    saveLayout(layout);
    setSelectedLayoutId(layout.id);
    alert('Layout saved!');
  };

  const handleLoad = (layout: BoardLayout) => {
    setActiveCells(new Set(layout.cells));
    setStartingPositions(
      Object.fromEntries(
        ALL_PLAYERS.map((p) => [p, new Set(layout.startingPositions[p] || [])])
      ) as Record<number, Set<string>>
    );
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
    setLayoutName('My Board');
    setSelectedLayoutId(null);
  };

  const handleFillAll = () => {
    setActiveCells(new Set(allPositions));
  };

  const handleExport = () => {
    const layout: BoardLayout = {
      id: selectedLayoutId || `layout-${Date.now()}`,
      name: layoutName,
      cells: Array.from(activeCells),
      startingPositions: Object.fromEntries(
        ALL_PLAYERS.map((p) => [p, Array.from(startingPositions[p])])
      ) as Record<PlayerIndex, string[]>,
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

  // Count pieces per player
  const pieceCounts = useMemo(() => {
    return ALL_PLAYERS.map((p) => startingPositions[p].size);
  }, [startingPositions]);

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
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

        <div className="flex gap-4">
          {/* Left panel - Tools */}
          <div className="w-64 bg-white rounded-lg shadow p-4 space-y-4">
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
              <div className="flex gap-2">
                <button
                  onClick={() => setMode('cells')}
                  className={`flex-1 px-3 py-2 text-sm rounded-lg transition-all ${
                    mode === 'cells'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Cells
                </button>
                <button
                  onClick={() => setMode('starting')}
                  className={`flex-1 px-3 py-2 text-sm rounded-lg transition-all ${
                    mode === 'starting'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Pieces
                </button>
              </div>
            </div>

            {/* Player selection (for starting positions mode) */}
            {mode === 'starting' && (
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
                        {pieceCounts[player]}
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

            {/* Stats */}
            <div className="text-sm text-gray-600">
              <p>Active cells: {activeCells.size}</p>
              <p>Total pieces: {pieceCounts.reduce((a, b) => a + b, 0)}</p>
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
              <p><strong>Symmetry:</strong> When enabled, edits are mirrored automatically</p>
            </div>
          </div>

          {/* Right panel - Board */}
          <div className="flex-1 bg-white rounded-lg shadow p-4">
            <svg
              viewBox={viewBox}
              className="w-full h-[70vh]"
              preserveAspectRatio="xMidYMid meet"
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
              {allPositions.map((key) => {
                const [q, r] = key.split(',').map(Number);
                const { x, y } = cubeToPixel(cubeCoord(q, r), HEX_SIZE);
                const isActive = activeCells.has(key);
                const hasStartingPiece = ALL_PLAYERS.some((p) =>
                  startingPositions[p].has(key)
                );

                return (
                  <g
                    key={key}
                    onClick={() => handleCellClick(key)}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* Cell background */}
                    <circle
                      cx={x}
                      cy={y}
                      r={HEX_SIZE * 0.45}
                      fill={getCellColor(key)}
                      stroke={isActive ? '#9ca3af' : '#e5e7eb'}
                      strokeWidth={1}
                      opacity={getCellOpacity(key)}
                    />
                    {/* Piece indicator */}
                    {hasStartingPiece && (
                      <circle
                        cx={x}
                        cy={y}
                        r={HEX_SIZE * 0.35}
                        fill={getCellColor(key)}
                        stroke="#374151"
                        strokeWidth={2}
                      />
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
