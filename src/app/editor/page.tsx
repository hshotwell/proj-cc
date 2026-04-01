'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import type { PlayerIndex, PlayerCount, BoardLayout } from '@/types/game';
import { PLAYER_COLORS, ACTIVE_PLAYERS, HEX_SIZE, BOARD_PADDING, TRIANGLE_ASSIGNMENTS } from '@/game/constants';
import { DEFAULT_BOARD_LAYOUT } from '@/game/defaultLayout';
import { cubeToPixel, cubeCoord, coordKey, parseCoordKey, rotateCube } from '@/game/coordinates';
import { lightenHex } from '@/game/colors';
import { findBoardTriangles, findBorderEdges } from '@/game/triangles';
import { useLayoutStore } from '@/store/layoutStore';
import { validateLayout } from '@/game/layoutValidation';
import { useSettingsStore } from '@/store/settingsStore';
import { SettingsPopup } from '@/components/SettingsPopup';
import { SettingsButton } from '@/components/SettingsButton';
import { BoardCell } from '@/components/board/BoardCell';
import { Piece } from '@/components/board/Piece';

type EditorMode = 'cells' | 'starting' | 'goals' | 'special';
type SpecialBrush = 'turbo' | 'ghost' | 'big';
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
// Display order: Red, Yellow, Green, Cyan, Blue, Purple — matches 6-player clockwise order
const PLAYER_DISPLAY_ORDER: PlayerIndex[] = [0, 4, 3, 2, 1, 5];
const GRID_RADIUS = 10; // Large enough for Chinese Checkers star

// Get the single mirrored position for "mirror goals" mode.
// Returns null when symmetry is 'none' (no mirroring).
// x  → reflect across the x-axis:  (-q-r,  r)
// y  → reflect across the y-axis:  ( q+r, -r)
// xy / 6way → 180° rotation:        (-q,  -r)
function getMirrorGoalKey(key: string, symmetry: SymmetryMode): string | null {
  if (symmetry === 'none') return null;
  const [q, r] = key.split(',').map(Number);
  if (symmetry === 'x') return coordKey(cubeCoord(-q - r, r));
  if (symmetry === 'y') return coordKey(cubeCoord(q + r, -r));
  return coordKey(cubeCoord(-q, -r)); // xy / 6way
}

// Get symmetric coordinates for a given position
function getSymmetricCoords(key: string, symmetry: SymmetryMode): string[] {
  const [q, r] = key.split(',').map(Number);
  const coord = cubeCoord(q, r);
  const results: Set<string> = new Set([key]);

  if (symmetry === 'x' || symmetry === 'xy') {
    results.add(coordKey(cubeCoord(-q - r, r)));
  }

  if (symmetry === 'y' || symmetry === 'xy') {
    results.add(coordKey(cubeCoord(q + r, -r)));
  }

  if (symmetry === 'xy') {
    results.add(coordKey(cubeCoord(-q, -r)));
  }

  if (symmetry === '6way') {
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

// Pre-built default star layout — always the first entry, never deletable
const _defaultGoalSets = getStandardGoalPositions();
const DEFAULT_STAR_LAYOUT: BoardLayout = {
  id: '__default_star__',
  name: 'Default Star',
  cells: DEFAULT_BOARD_LAYOUT.cells,
  startingPositions: DEFAULT_BOARD_LAYOUT.startingPositions,
  goalPositions: Object.fromEntries(
    ALL_PLAYERS.map((p) => [p, Array.from(_defaultGoalSets[p])])
  ) as Record<PlayerIndex, string[]>,
  walls: [],
  createdAt: 0,
};

// 6-pointed star (hexagram) icon for the default star layout entry
function HexStar({ size = 12, className = '' }: { size?: number; className?: string }) {
  const R = 0.85, r = R * 0.577; // outer / inner radii (hexagram proportions)
  const pts = Array.from({ length: 12 }, (_, i) => {
    const angle = (i * Math.PI) / 6 - Math.PI / 2; // start at top, 30° steps
    const rad = i % 2 === 0 ? R : r;
    return `${rad * Math.cos(angle)},${rad * Math.sin(angle)}`;
  }).join(' ');
  return (
    <svg width={size} height={size} viewBox="-1 -1 2 2" className={`inline-block align-middle ${className}`}>
      <polygon points={pts} fill="currentColor" />
    </svg>
  );
}

const MODE_LABELS: Record<EditorMode, string> = {
  cells: 'Cells',
  starting: 'Pieces',
  goals: 'Goals',
  special: 'Special',
};

export default function EditorPage() {
  const { layouts, loadLayouts, saveLayout, deleteLayout } = useLayoutStore();
  const { darkMode, woodenBoard, glassPieces, showTriangleLines, hexCells } = useSettingsStore();

  const [mode, setMode] = useState<EditorMode>('cells');
  const [cellBrush, setCellBrush] = useState<'normal' | 'wall'>('normal');
  const [specialBrush, setSpecialBrush] = useState<SpecialBrush>('turbo');
  const [editorPowerups, setEditorPowerups] = useState<Map<string, SpecialBrush>>(new Map());
  const [pieceSpecialties, setPieceSpecialties] = useState<Map<string, SpecialBrush>>(new Map());
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerIndex>(0);
  const [activeCells, setActiveCells] = useState<Set<string>>(() => new Set(DEFAULT_BOARD_LAYOUT.cells));
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
  const [symmetry, setSymmetry] = useState<SymmetryMode>('6way');
  const [mirrorGoals, setMirrorGoals] = useState(true);
  const [playerCountConfig, setPlayerCountConfig] = useState<Partial<Record<PlayerCount, PlayerIndex[]>>>({});

  // Paint mode state for click-and-drag
  const [isPainting, setIsPainting] = useState(false);
  const [paintAction, setPaintAction] = useState<'add' | 'remove'>('add');
  // Guard: skip synthetic mousedown that fires after a touch
  const touchHandledRef = useRef(false);

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

  // Fixed viewBox from the full editing grid — never changes as board is edited
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

  // Helper: does any player have a starting piece at this key?
  const hasPieceAt = (key: string): boolean =>
    ALL_PLAYERS.some((p) => startingPositions[p].has(key));

  // Determine if a cell should be "added" or "removed" based on current state
  const getCellState = (key: string): boolean => {
    if (mode === 'cells') {
      if (cellBrush === 'wall') return walls.has(key);
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
    } else if (mode === 'special') {
      if (hasPieceAt(key)) return pieceSpecialties.get(key) === specialBrush;
      return editorPowerups.get(key) === specialBrush;
    }
    return false;
  };

  // Apply an action (add or remove) to a cell
  const applyActionToCell = (key: string, action: 'add' | 'remove') => {
    const symmetricKeys = getSymmetricCoords(key, symmetry);

    if (mode === 'cells' && cellBrush === 'normal') {
      setActiveCells((prev) => {
        const newSet = new Set(prev);
        for (const symKey of symmetricKeys) {
          if (action === 'remove') {
            newSet.delete(symKey);
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
            setWalls((w) => {
              const newWalls = new Set(w);
              newWalls.delete(symKey);
              return newWalls;
            });
          } else {
            newSet.add(symKey);
          }
        }
        return newSet;
      });
    } else if (mode === 'cells' && cellBrush === 'wall') {
      // Activate any inactive symmetric cells when adding a wall
      if (action === 'add') {
        setActiveCells((prev) => {
          const newSet = new Set(prev);
          for (const symKey of symmetricKeys) newSet.add(symKey);
          return newSet;
        });
        // Clear starting/goal positions where we placed walls
        setStartingPositions((prev) => {
          const newSp = { ...prev };
          for (const symKey of symmetricKeys) {
            for (const player of ALL_PLAYERS) {
              if (newSp[player].has(symKey)) {
                const ps = new Set(newSp[player]);
                ps.delete(symKey);
                newSp[player] = ps;
              }
            }
          }
          return newSp;
        });
        setGoalPositions((prev) => {
          const newGp = { ...prev };
          for (const symKey of symmetricKeys) {
            for (const player of ALL_PLAYERS) {
              if (newGp[player].has(symKey)) {
                const ps = new Set(newGp[player]);
                ps.delete(symKey);
                newGp[player] = ps;
              }
            }
          }
          return newGp;
        });
      }
      setWalls((prev) => {
        const newWalls = new Set(prev);
        for (const symKey of symmetricKeys) {
          if (action === 'remove') {
            newWalls.delete(symKey);
          } else {
            newWalls.add(symKey);
          }
        }
        return newWalls;
      });
    } else if (mode === 'starting') {
      if (!activeCells.has(key)) return;

      const pieceKeys = mirrorGoals ? [key] : symmetricKeys;

      setStartingPositions((prev) => {
        const newPositions = { ...prev };
        for (const symKey of pieceKeys) {
          if (!activeCells.has(symKey)) continue;

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

      if (action === 'add') {
        setWalls((prev) => {
          const newWalls = new Set(prev);
          for (const symKey of pieceKeys) {
            newWalls.delete(symKey);
          }
          return newWalls;
        });
        // If a powerup exists at a piece's cell, absorb it into the piece specialty
        setEditorPowerups((prev) => {
          const next = new Map(prev);
          for (const symKey of pieceKeys) {
            if (next.has(symKey)) {
              const variant = next.get(symKey)!;
              next.delete(symKey);
              setPieceSpecialties((sp) => {
                const ns = new Map(sp);
                ns.set(symKey, variant);
                return ns;
              });
            }
          }
          return next;
        });
      }

      if (mirrorGoals && symmetry !== 'none') {
        const mirrorKey = getMirrorGoalKey(key, symmetry);
        if (mirrorKey && activeCells.has(mirrorKey)) {
          setGoalPositions((prev) => {
            const newGoals = { ...prev };
            if (action === 'remove') {
              const goalSet = new Set(newGoals[selectedPlayer]);
              goalSet.delete(mirrorKey);
              newGoals[selectedPlayer] = goalSet;
            } else {
              // Clear all players' goals at the mirror cell first (exclusivity)
              for (const player of ALL_PLAYERS) {
                const gs = new Set(newGoals[player]);
                gs.delete(mirrorKey);
                newGoals[player] = gs;
              }
              const goalSet = new Set(newGoals[selectedPlayer]);
              goalSet.add(mirrorKey);
              newGoals[selectedPlayer] = goalSet;
            }
            return newGoals;
          });
        }
      }
    } else if (mode === 'goals') {
      if (!activeCells.has(key)) return;

      const useMirror = mirrorGoals && symmetry !== 'none';
      const goalKeys = useMirror ? [key] : symmetricKeys;

      setGoalPositions((prev) => {
        const newPositions = { ...prev };
        for (const symKey of goalKeys) {
          if (!activeCells.has(symKey)) continue;

          if (action === 'remove') {
            for (const player of ALL_PLAYERS) {
              const newSet = new Set(newPositions[player]);
              newSet.delete(symKey);
              newPositions[player] = newSet;
            }
          } else {
            // Clear all players' goals at this cell first (exclusivity)
            for (const player of ALL_PLAYERS) {
              const gs = new Set(newPositions[player]);
              gs.delete(symKey);
              newPositions[player] = gs;
            }
            const newSet = new Set(newPositions[selectedPlayer]);
            newSet.add(symKey);
            newPositions[selectedPlayer] = newSet;
          }
        }
        return newPositions;
      });

      if (action === 'add') {
        setWalls((prev) => {
          const newWalls = new Set(prev);
          for (const symKey of goalKeys) {
            newWalls.delete(symKey);
          }
          return newWalls;
        });
      }

      // Mirror goals mode: also place / remove a starting piece at the mirror position
      if (useMirror) {
        const mirrorKey = getMirrorGoalKey(key, symmetry);
        if (mirrorKey && activeCells.has(mirrorKey)) {
          setStartingPositions((prev) => {
            const newPositions = { ...prev };
            if (action === 'remove') {
              const ps = new Set(newPositions[selectedPlayer]);
              ps.delete(mirrorKey);
              newPositions[selectedPlayer] = ps;
            } else {
              // Clear all players' pieces at the mirror cell first (exclusivity)
              for (const player of ALL_PLAYERS) {
                const ps = new Set(newPositions[player]);
                ps.delete(mirrorKey);
                newPositions[player] = ps;
              }
              const ps = new Set(newPositions[selectedPlayer]);
              ps.add(mirrorKey);
              newPositions[selectedPlayer] = ps;
            }
            return newPositions;
          });
          if (action === 'add') {
            setWalls((prev) => {
              const nw = new Set(prev);
              nw.delete(mirrorKey);
              return nw;
            });
          }
        }
      }
    } else if (mode === 'special') {
      if (!activeCells.has(key)) return;
      for (const symKey of symmetricKeys) {
        if (!activeCells.has(symKey)) continue;
        if (hasPieceAt(symKey)) {
          // Piece at this cell: update piece specialty
          setPieceSpecialties((prev) => {
            const next = new Map(prev);
            if (action === 'remove') {
              next.delete(symKey);
            } else {
              next.set(symKey, specialBrush);
            }
            return next;
          });
        } else {
          // Empty cell: update powerup
          setEditorPowerups((prev) => {
            const next = new Map(prev);
            if (action === 'remove') {
              next.delete(symKey);
            } else {
              next.set(symKey, specialBrush);
            }
            return next;
          });
        }
      }
    }
  };

  // Start painting on mouse down (desktop only — skipped after touch)
  const handleCellMouseDown = (key: string) => {
    if (touchHandledRef.current) return;
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
  const handleCellTouchStart = (key: string) => {
    touchHandledRef.current = true;
    setTimeout(() => { touchHandledRef.current = false; }, 400);
    const currentState = getCellState(key);
    const action = currentState ? 'remove' : 'add';
    applyActionToCell(key, action);
  };

  // Stats calculation memo
  const pieceCounts = useMemo(() => {
    return ALL_PLAYERS.map((p) => startingPositions[p].size);
  }, [startingPositions]);

  const handleSave = () => {
    const existingLayout = layouts.find((l) => l.name === layoutName);
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
      powerups: editorPowerups.size > 0 ? Object.fromEntries(editorPowerups) : undefined,
      pieceSpecialties: pieceSpecialties.size > 0 ? Object.fromEntries(pieceSpecialties) : undefined,
      playerCountConfig: Object.keys(playerCountConfig).length > 0 ? playerCountConfig : undefined,
      createdAt: Date.now(),
    };
    saveLayout(layout);
    setSelectedLayoutId(layout.id);
    alert(existingLayout ? 'Layout updated!' : 'Layout saved!');
  };

  const handleLoad = (layout: BoardLayout) => {
    setActiveCells(new Set(layout.cells));
    setWalls(new Set(layout.walls || []));
    if (layout.id === DEFAULT_STAR_LAYOUT.id) {
      // Default Star: load shape only — clear pieces and goals so user starts fresh
      setStartingPositions({ 0: new Set(), 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set(), 5: new Set() });
      setGoalPositions({ 0: new Set(), 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set(), 5: new Set() });
      setEditorPowerups(new Map());
      setPieceSpecialties(new Map());
      setLayoutName('My Board');
      setSelectedLayoutId(null);
    } else {
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
      setEditorPowerups(new Map(Object.entries(layout.powerups || {})) as Map<string, SpecialBrush>);
      setPieceSpecialties(new Map(Object.entries(layout.pieceSpecialties || {})) as Map<string, SpecialBrush>);
      setPlayerCountConfig(layout.playerCountConfig ?? {});
      setLayoutName(layout.name);
      setSelectedLayoutId(layout.id);
    }
  };

  const handleClear = () => {
    setActiveCells(new Set());
    setStartingPositions({
      0: new Set(), 1: new Set(), 2: new Set(),
      3: new Set(), 4: new Set(), 5: new Set(),
    });
    setGoalPositions({
      0: new Set(), 1: new Set(), 2: new Set(),
      3: new Set(), 4: new Set(), 5: new Set(),
    });
    setWalls(new Set());
    setEditorPowerups(new Map());
    setPieceSpecialties(new Map());
    setPlayerCountConfig({});
    setLayoutName('My Board');
    setSelectedLayoutId(null);
  };

  const handleEditorRestart = useCallback(() => {
    const matchingLayout = layouts.find((l) => l.name === layoutName);
    if (matchingLayout) {
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
      setEditorPowerups(new Map(Object.entries(matchingLayout.powerups || {})) as Map<string, SpecialBrush>);
      setPieceSpecialties(new Map(Object.entries(matchingLayout.pieceSpecialties || {})) as Map<string, SpecialBrush>);
      setPlayerCountConfig(matchingLayout.playerCountConfig ?? {});
      setSelectedLayoutId(matchingLayout.id);
    } else {
      handleClear();
    }
  }, [layouts, layoutName]);

  const handleFillAll = () => {
    setActiveCells(new Set(allPositions));
  };

  const handleDeleteLayout = (id: string) => {
    if (!confirm('Delete this saved layout?')) return;
    deleteLayout(id);
    if (selectedLayoutId === id) setSelectedLayoutId(null);
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
      powerups: editorPowerups.size > 0 ? Object.fromEntries(editorPowerups) : undefined,
      pieceSpecialties: pieceSpecialties.size > 0 ? Object.fromEntries(pieceSpecialties) : undefined,
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
      lines.push({ x1: 0, y1: -lineLength, x2: 0, y2: lineLength });
    }

    if (symmetry === 'y' || symmetry === 'xy') {
      lines.push({ x1: -lineLength, y1: 0, x2: lineLength, y2: 0 });
    }

    if (symmetry === '6way') {
      for (let i = 0; i < 3; i++) {
        const angle = (i * Math.PI) / 3;
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

  const editorAdjacentPairs = useMemo(() => {
    const dirs = [{ q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 }] as const;
    const pairs: Array<[string, string]> = [];
    for (const key of activeCells) {
      const [q, r] = key.split(',').map(Number);
      for (const d of dirs) {
        const nb = `${q + d.q},${r + d.r}`;
        if (activeCells.has(nb)) pairs.push([key, nb]);
      }
    }
    return pairs;
  }, [activeCells]);

  const dm = (dark: string, light: string) => darkMode ? dark : light;

  return (
    <div className={`min-h-screen overflow-x-hidden ${dm('bg-gray-900', 'bg-gray-100')}`}>
      <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 py-2 sm:py-4">
        {/* Board preview — same size as the game view (max-w-2xl, matching Board.tsx) */}
        <div className="max-w-2xl mx-auto w-full">
          <Link href="/home" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-2 transition-colors">
            ← Home
          </Link>
          <div className={`rounded-lg shadow p-2 sm:p-4 relative ${dm('bg-gray-800', 'bg-white')}`}>
            <SettingsButton />
            <svg
              viewBox={viewBox}
              className="w-full h-auto max-h-[70vh] sm:max-h-[75vh] select-none"
            preserveAspectRatio="xMidYMid meet"
            onMouseLeave={() => setIsPainting(false)}
          >
            {/* Wooden board background */}
            {woodenBoard && (() => {
              const [, , vbW, vbH] = viewBox.split(' ').map(Number);
              const boardRadius = Math.max(vbW, vbH) / 2 - BOARD_PADDING / 2;
              const cx = 0, cy = 0; // viewBox is always centered at origin
              return (
                <g>
                  <defs>
                    <linearGradient id="editor-wood-base" x1="0%" y1="0%" x2="100%" y2="10%">
                      <stop offset="0%" stopColor={darkMode ? '#4a3018' : '#8b6038'} />
                      <stop offset="30%" stopColor={darkMode ? '#584020' : '#9a6d42'} />
                      <stop offset="70%" stopColor={darkMode ? '#4a3018' : '#7d5530'} />
                      <stop offset="100%" stopColor={darkMode ? '#3a2810' : '#6e4a28'} />
                    </linearGradient>
                    <filter id="editor-wood-grain-filter" x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
                      <feTurbulence type="fractalNoise" baseFrequency="0.004 0.035" numOctaves="3" seed="8" result="noise"/>
                      <feColorMatrix type="saturate" values="0" in="noise" result="grayNoise"/>
                      <feComponentTransfer in="grayNoise" result="grain">
                        <feFuncR type="linear" slope={darkMode ? 1.1 : 1.3} intercept={darkMode ? -0.1 : -0.15}/>
                        <feFuncG type="linear" slope={darkMode ? 1.1 : 1.3} intercept={darkMode ? -0.1 : -0.15}/>
                        <feFuncB type="linear" slope={darkMode ? 1.1 : 1.3} intercept={darkMode ? -0.1 : -0.15}/>
                        <feFuncA type="linear" slope="0" intercept="1"/>
                      </feComponentTransfer>
                      <feBlend mode="soft-light" in="SourceGraphic" in2="grain" result="blended"/>
                      <feComposite operator="in" in="blended" in2="SourceGraphic"/>
                    </filter>
                    <filter id="editor-wood-grain-subtle" x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
                      <feTurbulence type="fractalNoise" baseFrequency="0.004 0.035" numOctaves="3" seed="8" result="noise"/>
                      <feColorMatrix type="saturate" values="0" in="noise" result="grayNoise"/>
                      <feComponentTransfer in="grayNoise" result="grain">
                        <feFuncR type="linear" slope={darkMode ? 1.1 : 1.3} intercept={darkMode ? -0.1 : -0.15}/>
                        <feFuncG type="linear" slope={darkMode ? 1.1 : 1.3} intercept={darkMode ? -0.1 : -0.15}/>
                        <feFuncB type="linear" slope={darkMode ? 1.1 : 1.3} intercept={darkMode ? -0.1 : -0.15}/>
                        <feFuncA type="linear" slope="0" intercept="1"/>
                      </feComponentTransfer>
                      <feBlend mode="soft-light" in="SourceGraphic" in2="grain" result="blended"/>
                      <feColorMatrix type="matrix" in="SourceGraphic" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.5 0" result="srcFaded"/>
                      <feColorMatrix type="matrix" in="blended" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.5 0" result="grainFaded"/>
                      <feComposite operator="over" in="srcFaded" in2="grainFaded" result="mixed"/>
                      <feComposite operator="in" in="mixed" in2="SourceGraphic"/>
                    </filter>
                  </defs>
                  <circle cx={cx} cy={cy} r={boardRadius} fill="url(#editor-wood-base)" filter="url(#editor-wood-grain-filter)" />
                  {[0.15, 0.55, 1.05, 1.45, 1.95, 2.35, 2.85].map((angle, i) => (
                    <line
                      key={`grain-${i}`}
                      x1={cx} y1={cy}
                      x2={cx + Math.cos(angle) * boardRadius * 0.92}
                      y2={cy + Math.sin(angle) * boardRadius * 0.92}
                      stroke={darkMode ? 'rgba(90,65,20,0.05)' : 'rgba(80,50,20,0.05)'}
                      strokeWidth={0.8}
                    />
                  ))}
                  {[
                    { x: cx + boardRadius * -0.3, y: cy + boardRadius * 0.2, scale: 0.1 },
                    { x: cx + boardRadius * 0.35, y: cy + boardRadius * -0.25, scale: 0.07 },
                    { x: cx + boardRadius * 0.1, y: cy + boardRadius * 0.5, scale: 0.06 },
                  ].map((knot, ki) => (
                    <g key={`knot-${ki}`}>
                      {[1, 0.75, 0.5, 0.3, 0.15].map((s, ri) => (
                        <ellipse
                          key={ri}
                          cx={knot.x} cy={knot.y}
                          rx={boardRadius * knot.scale * s}
                          ry={boardRadius * knot.scale * s * 0.7}
                          fill="none"
                          stroke={darkMode ? `rgba(90,65,15,${0.12 + ri * 0.06})` : `rgba(80,50,20,${0.1 + ri * 0.05})`}
                          strokeWidth={0.8}
                        />
                      ))}
                      <ellipse
                        cx={knot.x} cy={knot.y}
                        rx={boardRadius * knot.scale * 0.12}
                        ry={boardRadius * knot.scale * 0.08}
                        fill={darkMode ? 'rgba(60,40,10,0.3)' : 'rgba(80,50,20,0.2)'}
                      />
                    </g>
                  ))}
                  <circle cx={cx} cy={cy} r={boardRadius - 1.5} fill="none" stroke={darkMode ? '#5a4020' : '#9a6d42'} strokeWidth={1.5} />
                  <circle cx={cx} cy={cy} r={boardRadius} fill="none" stroke={darkMode ? '#1a1008' : '#3a2510'} strokeWidth={2} />
                </g>
              );
            })()}
            {/* Symmetry lines */}
            {symmetryLines.map((line, index) => (
              <line
                key={`symmetry-${index}`}
                x1={line.x1} y1={line.y1}
                x2={line.x2} y2={line.y2}
                stroke="#3b82f6"
                strokeWidth={2}
                opacity={0.5}
              />
            ))}
            {/* Triangle fills */}
            <g filter={(!hexCells && woodenBoard) ? 'url(#editor-wood-grain-subtle)' : undefined}>
              {!hexCells && editorTriangles.map((tri) => {
                const points = tri.vertices.map((vkey) => {
                  const pos = parseCoordKey(vkey);
                  const px = cubeToPixel(pos, HEX_SIZE);
                  return `${px.x},${px.y}`;
                }).join(' ');

                let fill: string;
                let isRgbaFill = false;
                if (tri.playerOwners.length > 0) {
                  const colors = tri.playerOwners.map((p) => PLAYER_COLORS[p]);
                  if (woodenBoard) {
                    const woodBase = darkMode ? [0x4a, 0x30, 0x18] : [0x8b, 0x60, 0x38];
                    const n = colors.length;
                    const avg = colors.reduce((acc, c) => {
                      const [r, g, b] = c.replace('#', '').match(/.{2}/g)!.map(h => parseInt(h, 16));
                      return [acc[0] + r / n, acc[1] + g / n, acc[2] + b / n];
                    }, [0, 0, 0]);
                    const strength = 0.85;
                    const br = Math.round(woodBase[0] + (avg[0] - woodBase[0]) * strength);
                    const bg = Math.round(woodBase[1] + (avg[1] - woodBase[1]) * strength);
                    const bb = Math.round(woodBase[2] + (avg[2] - woodBase[2]) * strength);
                    fill = `#${br.toString(16).padStart(2, '0')}${bg.toString(16).padStart(2, '0')}${bb.toString(16).padStart(2, '0')}`;
                  } else if (darkMode) {
                    const lightened = colors.map((c) => lightenHex(c, 0.4));
                    const n = lightened.length;
                    const avg = lightened.reduce((acc, c) => {
                      const [r, g, b] = c.replace('#', '').match(/.{2}/g)!.map(h => parseInt(h, 16));
                      return [acc[0] + r / n, acc[1] + g / n, acc[2] + b / n];
                    }, [0, 0, 0]);
                    const br = Math.round(0x2a + (avg[0] - 0x2a) * 0.50);
                    const bg = Math.round(0x2a + (avg[1] - 0x2a) * 0.50);
                    const bb = Math.round(0x2a + (avg[2] - 0x2a) * 0.50);
                    fill = `#${br.toString(16).padStart(2, '0')}${bg.toString(16).padStart(2, '0')}${bb.toString(16).padStart(2, '0')}`;
                  } else {
                    const n = colors.length;
                    const avg = colors.reduce((acc, c) => {
                      const [r, g, b] = c.replace('#', '').match(/.{2}/g)!.map(h => parseInt(h, 16));
                      return [acc[0] + r / n, acc[1] + g / n, acc[2] + b / n];
                    }, [0, 0, 0]);
                    const br = Math.round(0xf8 + (avg[0] - 0xf8) * 0.25);
                    const bg = Math.round(0xf8 + (avg[1] - 0xf8) * 0.25);
                    const bb = Math.round(0xf8 + (avg[2] - 0xf8) * 0.25);
                    fill = `#${br.toString(16).padStart(2, '0')}${bg.toString(16).padStart(2, '0')}${bb.toString(16).padStart(2, '0')}`;
                  }
                } else {
                  fill = woodenBoard ? (darkMode ? 'rgba(80,80,80,0.65)' : 'rgba(140,140,140,0.6)') : (darkMode ? '#2a2a2a' : '#f8f8f8');
                  if (woodenBoard) isRgbaFill = true;
                }

                return (
                  <polygon
                    key={`tri-${tri.vertices.join('-')}`}
                    points={points}
                    fill={fill}
                    stroke={showTriangleLines ? (woodenBoard ? (darkMode ? '#5a4020' : '#6e5030') : (darkMode ? '#888' : 'black')) : (isRgbaFill ? 'none' : fill)}
                    strokeWidth={showTriangleLines ? 0.5 : (isRgbaFill ? 0 : 0.5)}
                    strokeLinejoin="round"
                  />
                );
              })}
              {/* Border edges */}
              {!hexCells && editorBorderEdges.map((edge) => {
                const pa = cubeToPixel(parseCoordKey(edge.a), HEX_SIZE);
                const pb = cubeToPixel(parseCoordKey(edge.b), HEX_SIZE);
                return (
                  <line
                    key={`border-${edge.a}-${edge.b}`}
                    x1={pa.x} y1={pa.y}
                    x2={pb.x} y2={pb.y}
                    stroke={woodenBoard ? (darkMode ? '#d4a040' : '#2a1808') : (darkMode ? 'white' : 'black')}
                    strokeWidth={woodenBoard ? 3 : 2.5}
                    strokeLinecap="round"
                  />
                );
              })}
            </g>
            {/* Hex connecting lines — drawn under cells */}
            {hexCells && showTriangleLines && (
              <g>
                {editorAdjacentPairs.map(([aKey, bKey], i) => {
                  const pa = cubeToPixel(parseCoordKey(aKey), HEX_SIZE);
                  const pb = cubeToPixel(parseCoordKey(bKey), HEX_SIZE);
                  const lineColor = woodenBoard
                    ? (darkMode ? '#3a2810' : '#5a4020')
                    : (darkMode ? '#6b7280' : '#9ca3af');
                  return (
                    <line key={i} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                      stroke={lineColor} strokeWidth={3} />
                  );
                })}
              </g>
            )}
            {/* Cells and pieces */}
            {allPositions.map((key) => {
              const [q, r] = key.split(',').map(Number);
              const { x, y } = cubeToPixel(cubeCoord(q, r), HEX_SIZE);
              const isActive = activeCells.has(key);

              let isGoalForAnyPlayer = false;
              let goalPlayerForThisCell: PlayerIndex | undefined = undefined;
              for (const player of ALL_PLAYERS) {
                if (goalPositions[player].has(key)) {
                  isGoalForAnyPlayer = true;
                  goalPlayerForThisCell = player;
                  break;
                }
              }

              let piecePlayer: PlayerIndex | undefined = undefined;
              for (const player of ALL_PLAYERS) {
                if (startingPositions[player].has(key)) {
                  piecePlayer = player;
                  break;
                }
              }

              return (
                <g
                  key={key}
                  onMouseDown={() => handleCellMouseDown(key)}
                  onMouseEnter={() => handleCellMouseEnter(key)}
                  onTouchStart={() => handleCellTouchStart(key)}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                >
                  {isActive ? (
                    <BoardCell
                      coord={cubeCoord(q, r)}
                      size={HEX_SIZE}
                      isCustomLayout={true}
                      customGoalPositions={{}}
                      darkMode={darkMode}
                      woodenBoard={woodenBoard}
                      glassPieces={glassPieces}
                      hexCells={hexCells}
                      showTriangleLines={showTriangleLines}
                    />
                  ) : hexCells ? (
                    <polygon
                      points={Array.from({ length: 6 }, (_, i) => {
                        const angle = (Math.PI / 180) * (60 * i - 30);
                        return `${x + HEX_SIZE * 0.855 * Math.cos(angle)},${y + HEX_SIZE * 0.855 * Math.sin(angle)}`;
                      }).join(' ')}
                      fill={darkMode ? '#4b5563' : '#e5e7eb'}
                      stroke={darkMode ? '#374151' : '#d1d5db'}
                      strokeWidth={0.6}
                      opacity={0.4}
                    />
                  ) : (
                    <circle
                      cx={x}
                      cy={y}
                      r={HEX_SIZE * 0.45}
                      fill={darkMode ? '#4b5563' : '#e5e7eb'}
                      stroke={darkMode ? '#374151' : '#d1d5db'}
                      strokeWidth={0.5}
                      opacity={0.4}
                    />
                  )}
                  {isGoalForAnyPlayer && goalPlayerForThisCell !== undefined && (
                    <circle
                      cx={x}
                      cy={y}
                      r={HEX_SIZE * 0.55}
                      fill={mode === 'goals' && goalPlayerForThisCell === selectedPlayer ? PLAYER_COLORS[selectedPlayer] : 'none'}
                      fillOpacity={mode === 'goals' && goalPlayerForThisCell === selectedPlayer ? 0.3 : 0}
                      stroke={PLAYER_COLORS[goalPlayerForThisCell]}
                      strokeWidth={2}
                    />
                  )}
                  {piecePlayer !== undefined && (
                    <Piece
                      coord={cubeCoord(q, r)}
                      player={piecePlayer}
                      isCurrentPlayer={false}
                      isSelected={false}
                      onClick={() => {}}
                      size={HEX_SIZE}
                      darkMode={darkMode}
                      glassPieces={glassPieces}
                      hexCells={hexCells}
                      variant={pieceSpecialties.get(coordKey(cubeCoord(q, r))) ?? 'normal'}
                    />
                  )}
                </g>
              );
            })}
            {/* Wall connecting lines */}
            <g style={{ pointerEvents: 'none' }}>
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
              if (glassPieces) {
                const stoneId = `stone-${wq}-${wr}`;
                const hexPoints = Array.from({ length: 6 }, (_, i) => {
                  const angle = (Math.PI / 3) * i - Math.PI / 6;
                  const px = x + hexSize * Math.cos(angle);
                  const py = y + hexSize * Math.sin(angle);
                  return `${px},${py}`;
                }).join(' ');
                const mortarColor = darkMode ? '#383838' : '#585050';
                const seed = Math.abs(wq * 7 + wr * 13);
                const rng = (i: number) => {
                  const v = Math.sin(seed * 9301 + i * 4973) * 49297;
                  return v - Math.floor(v);
                };
                const stones: Array<{ sx: number; sy: number; sw: number; sh: number; rx: number; shade: number }> = [];
                const gap = 0.7;
                const r = hexSize;
                let cy = -r * 0.9;
                let rowIdx = 0;
                while (cy < r * 0.9) {
                  const rowH = r * (0.22 + rng(rowIdx * 10 + 1) * 0.18);
                  let cx = -r * 0.9;
                  let colIdx = 0;
                  if (rowIdx % 2 === 1) cx += r * (0.1 + rng(rowIdx * 10 + 50) * 0.15);
                  while (cx < r * 0.9) {
                    const stoneW = r * (0.28 + rng(rowIdx * 100 + colIdx * 7 + 2) * 0.32);
                    const stoneH = rowH * (0.8 + rng(rowIdx * 100 + colIdx * 7 + 3) * 0.25);
                    const shade = rng(rowIdx * 100 + colIdx * 7 + 4);
                    stones.push({
                      sx: x + cx,
                      sy: y + cy,
                      sw: stoneW - gap,
                      sh: stoneH - gap,
                      rx: Math.min(stoneW, stoneH) * 0.15,
                      shade,
                    });
                    cx += stoneW + gap;
                    colIdx++;
                  }
                  cy += rowH + gap;
                  rowIdx++;
                }
                return (
                  <g key={`wall-hex-${wallKey}`}>
                    <defs>
                      <clipPath id={`${stoneId}-clip`}>
                        <polygon points={hexPoints} />
                      </clipPath>
                    </defs>
                    <polygon points={hexPoints} fill={mortarColor} />
                    <g clipPath={`url(#${stoneId}-clip)`}>
                      {stones.map((s, i) => {
                        const baseLight = darkMode ? 90 : 160;
                        const range = darkMode ? 50 : 45;
                        const lum = Math.round(baseLight + (s.shade - 0.5) * range);
                        const fill = `rgb(${lum},${Math.round(lum * 0.97)},${Math.round(lum * 0.94)})`;
                        return (
                          <rect key={i} x={s.sx} y={s.sy} width={s.sw} height={s.sh} rx={s.rx} fill={fill} />
                        );
                      })}
                    </g>
                    <polygon
                      points={hexPoints}
                      fill="none"
                      stroke={darkMode ? '#505050' : '#4a4a4a'}
                      strokeWidth={1.5}
                      strokeLinejoin="round"
                    />
                  </g>
                );
              } else {
                const hexPoints = Array.from({ length: 6 }, (_, i) => {
                  const angle = (Math.PI / 3) * i - Math.PI / 6;
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
              }
            })}
            {/* Powerup indicators */}
            {Array.from(editorPowerups.entries()).map(([key, variant]) => {
              const [pq, pr] = key.split(',').map(Number);
              const { x, y } = cubeToPixel(cubeCoord(pq, pr), HEX_SIZE);
              const label = variant === 'turbo' ? 'T' : variant === 'ghost' ? 'S' : 'B';
              const color = variant === 'turbo' ? '#ef4444' : variant === 'ghost' ? '#22c55e' : '#3b82f6';
              return (
                <g key={`pu-${key}`} style={{ pointerEvents: 'none' }}>
                  <circle cx={x} cy={y} r={HEX_SIZE * 0.38} fill={color} opacity={0.18} />
                  <circle cx={x} cy={y} r={HEX_SIZE * 0.38} fill="none" stroke={color} strokeWidth={1.5} opacity={0.75} />
                  <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
                    fontSize={HEX_SIZE * 0.52} fontWeight="bold" fill={color} opacity={0.9}>
                    {label}
                  </text>
                </g>
              );
            })}
            {/* Piece specialty badges */}
            {Array.from(pieceSpecialties.entries()).map(([key, variant]) => {
              const [pq, pr] = key.split(',').map(Number);
              const { x, y } = cubeToPixel(cubeCoord(pq, pr), HEX_SIZE);
              const label = variant === 'turbo' ? 'T' : variant === 'ghost' ? 'S' : 'B';
              const color = variant === 'turbo' ? '#ef4444' : variant === 'ghost' ? '#22c55e' : '#3b82f6';
              return (
                <g key={`ps-${key}`} style={{ pointerEvents: 'none' }}>
                  <circle cx={x + HEX_SIZE * 0.42} cy={y - HEX_SIZE * 0.42} r={HEX_SIZE * 0.28} fill={color} />
                  <text x={x + HEX_SIZE * 0.42} y={y - HEX_SIZE * 0.42} textAnchor="middle"
                    dominantBaseline="central" fontSize={HEX_SIZE * 0.32} fontWeight="bold" fill="white">
                    {label}
                  </text>
                </g>
              );
            })}
            </g>
            </svg>
          </div>
        </div>

        {/* Horizontal tools panel */}
        <div className={`max-w-2xl mx-auto w-full rounded-lg shadow mt-2 p-3 ${dm('bg-gray-800 text-gray-200', 'bg-white')}`}>
          <div className="flex gap-4 items-start">

            {/* Column 1: Layout management */}
            <div className="w-44 shrink-0 flex flex-col gap-2">
              <div>
                <label className={`block text-xs font-medium mb-1 ${dm('text-gray-300', 'text-gray-700')}`}>
                  Layout Name
                </label>
                <input
                  type="text"
                  value={layoutName}
                  onChange={(e) => setLayoutName(e.target.value)}
                  className={`w-full px-2 py-1.5 border rounded text-xs ${dm('bg-gray-700 border-gray-600 text-gray-100', 'bg-white border-gray-300')}`}
                />
              </div>
              <button
                onClick={handleSave}
                className="w-full py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-500"
              >
                Save Layout
              </button>
              <div>
                <div className={`text-xs font-medium mb-1 ${dm('text-gray-300', 'text-gray-600')}`}>
                  Saved Layouts
                </div>
                <div className="space-y-1 max-h-44 overflow-y-auto">
                  {/* Default Star — always first, never deletable */}
                  <div className={`flex items-center p-1.5 rounded text-xs cursor-pointer ${
                    selectedLayoutId === DEFAULT_STAR_LAYOUT.id
                      ? dm('bg-blue-900/30 border border-blue-700', 'bg-blue-50 border border-blue-200')
                      : dm('bg-gray-700 hover:bg-gray-600', 'bg-gray-50 hover:bg-gray-100')
                  }`}>
                    <button onClick={() => handleLoad(DEFAULT_STAR_LAYOUT)} className="flex-1 text-left truncate flex items-center gap-1">
                      Default Star <HexStar size={11} className={dm('text-yellow-400', 'text-yellow-500')} />
                    </button>
                  </div>
                  {/* User saved layouts */}
                  {layouts.map((layout) => (
                    <div
                      key={layout.id}
                      className={`flex items-center justify-between p-1.5 rounded text-xs ${
                        selectedLayoutId === layout.id
                          ? dm('bg-blue-900/30 border border-blue-700', 'bg-blue-50 border border-blue-200')
                          : dm('bg-gray-700 hover:bg-gray-600', 'bg-gray-50 hover:bg-gray-100')
                      }`}
                    >
                      <button onClick={() => handleLoad(layout)} className="flex-1 text-left truncate flex items-center gap-1 min-w-0">
                        <span className="truncate">{layout.name}</span>
                        {layout.isDefault && (
                          <span className="ml-1 text-xs text-green-600 shrink-0">(default)</span>
                        )}
                        {validateLayout(layout).valid && (
                          <span className="text-green-500 shrink-0" title="Board is valid">✓</span>
                        )}
                      </button>
                      <button
                        onClick={() => handleDeleteLayout(layout.id)}
                        className="text-red-500 hover:text-red-700 ml-1 shrink-0 leading-none"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className={`self-stretch w-px ${dm('bg-gray-700', 'bg-gray-200')}`} />

            {/* Column 2: Edit mode */}
            <div className="w-64 shrink-0 flex flex-col gap-2 min-w-0">
              <div className={`text-xs font-medium ${dm('text-gray-300', 'text-gray-600')}`}>Edit Mode</div>
              <div className="flex gap-1 flex-wrap">
                {(['cells', 'starting', 'goals', 'special'] as EditorMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-all ${
                      mode === m
                        ? 'bg-blue-600 text-white'
                        : dm('bg-gray-700 text-gray-200 hover:bg-gray-600', 'bg-gray-100 text-gray-700 hover:bg-gray-200')
                    }`}
                  >
                    {MODE_LABELS[m]}
                  </button>
                ))}
              </div>

              {/* Mode-specific controls */}
              {mode === 'cells' && (
                <div className="flex flex-col gap-2">
                  <div className="flex gap-1.5">
                    {(['normal', 'wall'] as const).map((brush) => (
                      <button
                        key={brush}
                        onClick={() => setCellBrush(brush)}
                        className={`flex flex-col items-center p-1.5 rounded-lg transition-all ${
                          cellBrush === brush
                            ? `ring-2 ring-blue-500 ${dm('ring-offset-gray-800', '')} ring-offset-1`
                            : ''
                        }`}
                      >
                        {brush === 'normal' ? (
                          <svg width="20" height="20" viewBox="0 0 20 20">
                            <circle cx="10" cy="10" r="7" fill="#9ca3af" />
                          </svg>
                        ) : (
                          <svg width="20" height="20" viewBox="0 0 20 20">
                            <polygon points="10,1 18.5,5.5 18.5,14.5 10,19 1.5,14.5 1.5,5.5"
                              fill="#9ca3af" />
                          </svg>
                        )}
                        <div className={`text-xs mt-0.5 ${dm('text-gray-400', 'text-gray-600')}`}>
                          {brush === 'normal' ? 'Nodes' : 'Wall'}
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleFillAll}
                      className={`px-3 py-1.5 text-xs rounded-lg ${dm('text-gray-200 bg-gray-700 hover:bg-gray-600', 'text-gray-700 bg-gray-100 hover:bg-gray-200')}`}
                    >
                      Fill All
                    </button>
                    <button
                      onClick={handleClear}
                      className={`px-3 py-1.5 text-xs rounded-lg ${dm('text-gray-200 bg-gray-700 hover:bg-gray-600', 'text-gray-700 bg-gray-100 hover:bg-gray-200')}`}
                    >
                      Clear All
                    </button>
                    <button
                      onClick={() => setWalls(new Set())}
                      className={`px-3 py-1.5 text-xs rounded-lg ${dm('text-gray-200 bg-gray-700 hover:bg-gray-600', 'text-gray-700 bg-gray-100 hover:bg-gray-200')}`}
                    >
                      Clear Walls
                    </button>
                  </div>
                </div>
              )}

              {(mode === 'starting' || mode === 'goals') && (
                <div className="flex flex-col gap-2">
                  <div className="flex gap-1.5 flex-wrap">
                    {PLAYER_DISPLAY_ORDER.map((player) => (
                      <button
                        key={player}
                        onClick={() => setSelectedPlayer(player)}
                        className={`flex flex-col items-center p-1.5 rounded-lg transition-all ${
                          selectedPlayer === player
                            ? `ring-2 ring-blue-500 ${dm('ring-offset-gray-800', '')} ring-offset-1`
                            : ''
                        }`}
                      >
                        <div className="w-5 h-5 rounded-full" style={
                          mode === 'goals'
                            ? { border: `2.5px solid ${PLAYER_COLORS[player]}` }
                            : { backgroundColor: PLAYER_COLORS[player] }
                        } />
                        <div className={`text-xs ${dm('text-gray-400', 'text-gray-600')}`}>
                          {mode === 'starting' ? startingPositions[player].size : goalPositions[player].size}
                        </div>
                      </button>
                    ))}
                  </div>
                  {mode === 'starting' && (
                    <button
                      onClick={() => setStartingPositions({ 0: new Set(), 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set(), 5: new Set() })}
                      className={`self-start px-3 py-1.5 text-xs rounded-lg ${dm('text-gray-200 bg-gray-700 hover:bg-gray-600', 'text-gray-700 bg-gray-100 hover:bg-gray-200')}`}
                    >
                      Clear Pieces
                    </button>
                  )}
                  {mode === 'goals' && (
                    <button
                      onClick={() => setGoalPositions({ 0: new Set(), 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set(), 5: new Set() })}
                      className={`self-start px-3 py-1.5 text-xs rounded-lg ${dm('text-gray-200 bg-gray-700 hover:bg-gray-600', 'text-gray-700 bg-gray-100 hover:bg-gray-200')}`}
                    >
                      Clear Goals
                    </button>
                  )}
                </div>
              )}

              {mode === 'special' && (
                <div className="flex flex-col gap-2">
                  <div className="flex gap-1.5">
                    {([
                      { brush: 'turbo' as SpecialBrush, label: 'T', name: 'Turbo', hex: '#ef4444' },
                      { brush: 'ghost' as SpecialBrush, label: 'S', name: 'Spectral', hex: '#22c55e' },
                      { brush: 'big' as SpecialBrush, label: 'B', name: 'Blocker', hex: '#3b82f6' },
                    ]).map(({ brush, label, name, hex }) => (
                      <button
                        key={brush}
                        onClick={() => setSpecialBrush(brush)}
                        className={`flex flex-col items-center p-1.5 rounded-lg transition-all ${
                          specialBrush === brush
                            ? `ring-2 ring-blue-500 ${dm('ring-offset-gray-800', '')} ring-offset-1`
                            : ''
                        }`}
                      >
                        <svg width="20" height="20" viewBox="0 0 20 20">
                          <circle cx="10" cy="10" r="8" fill={hex} opacity="0.85" />
                          <text x="10" y="10" textAnchor="middle" dominantBaseline="central"
                            fontSize="10" fontWeight="bold" fill="white">{label}</text>
                        </svg>
                        <div className={`text-xs mt-0.5 ${dm('text-gray-400', 'text-gray-600')}`}>{name}</div>
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <button
                      onClick={() => { setEditorPowerups(new Map()); setPieceSpecialties(new Map()); }}
                      className={`px-3 py-1.5 text-xs rounded-lg ${dm('text-gray-200 bg-gray-700 hover:bg-gray-600', 'text-gray-700 bg-gray-100 hover:bg-gray-200')}`}
                    >
                      Clear All
                    </button>
                    {(['turbo', 'ghost', 'big'] as SpecialBrush[]).map((b) => (
                      <button
                        key={b}
                        onClick={() => {
                          setEditorPowerups((p) => { const n = new Map(p); for (const [k, v] of n) if (v === b) n.delete(k); return n; });
                          setPieceSpecialties((p) => { const n = new Map(p); for (const [k, v] of n) if (v === b) n.delete(k); return n; });
                        }}
                        className={`px-3 py-1.5 text-xs rounded-lg ${dm('text-gray-200 bg-gray-700 hover:bg-gray-600', 'text-gray-700 bg-gray-100 hover:bg-gray-200')}`}
                      >
                        Clear {b === 'turbo' ? 'Turbo' : b === 'ghost' ? 'Spectral' : 'Blockers'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Cells mode help */}
              {mode === 'cells' && (
                <div className={`text-xs rounded p-2 space-y-1 ${dm('bg-gray-700/50 text-gray-400', 'bg-gray-50 text-gray-500')}`}>
                  <p><span className={`font-medium ${dm('text-gray-200', 'text-gray-700')}`}>Gaps</span> between cells cannot be entered or jumped over.</p>
                  <p><span className={`font-medium ${dm('text-gray-200', 'text-gray-700')}`}>Walls</span> block landing but can be jumped over as if they were pieces.</p>
                </div>
              )}

              {/* Special mode help */}
              {mode === 'special' && (
                <div className={`text-xs rounded p-2 space-y-1.5 ${dm('bg-gray-700/50 text-gray-400', 'bg-gray-50 text-gray-500')}`}>
                  <p><span className="font-medium text-red-400">T Turbo</span> — hops over the first piece/wall in a direction, landing the same distance beyond.</p>
                  <p><span className="font-medium text-green-400">S Spectral</span> — hops through an entire adjacent run of pieces/walls, landing in the first open cell after.</p>
                  <p><span className="font-medium text-blue-400">B Blocker</span> — opponents cannot jump over this piece.</p>
                  <p className={`pt-1 border-t ${dm('border-gray-600', 'border-gray-200')}`}><span className={`font-medium ${dm('text-gray-200', 'text-gray-700')}`}>Power-ups</span> on empty cells grant their variant to a piece that lands on them (applied at start of next turn).</p>
                </div>
              )}

              {/* Player sets config (starting / goals mode) */}
              {(mode === 'starting' || mode === 'goals') && (() => {
                const getCountConfig = (count: PlayerCount): PlayerIndex[] =>
                  playerCountConfig[count] ?? [...(ACTIVE_PLAYERS[count] as PlayerIndex[])];

                const togglePlayerInCount = (count: PlayerCount, player: PlayerIndex) => {
                  const current = getCountConfig(count);
                  if (current.includes(player)) {
                    if (current.length <= 1) return;
                    setPlayerCountConfig(prev => ({ ...prev, [count]: current.filter(p => p !== player) }));
                  } else {
                    if (current.length >= count) return;
                    setPlayerCountConfig(prev => ({ ...prev, [count]: [...current, player] }));
                  }
                };

                return (
                  <div className="flex flex-col gap-1.5">
                    <div className={`text-xs font-medium ${dm('text-gray-300', 'text-gray-600')}`}>Player Sets</div>
                    {([2, 3, 4, 6] as PlayerCount[]).map((count) => {
                      const config = getCountConfig(count);
                      const isFull = config.length >= count;
                      return (
                        <div key={count} className="flex items-center gap-2">
                          <span className={`text-xs w-5 shrink-0 ${dm('text-gray-400', 'text-gray-500')}`}>{count}P</span>
                          <div className="flex gap-1">
                            {PLAYER_DISPLAY_ORDER.map((player) => {
                              const isSelected = config.includes(player);
                              return (
                                <button
                                  key={player}
                                  onClick={() => togglePlayerInCount(count, player)}
                                  disabled={!isSelected && isFull}
                                  className={`w-4 h-4 rounded-full transition-all ${!isSelected && isFull ? 'opacity-25 cursor-not-allowed' : 'hover:scale-110'}`}
                                  style={isSelected
                                    ? { backgroundColor: PLAYER_COLORS[player], outline: `2px solid ${PLAYER_COLORS[player]}`, outlineOffset: '1px' }
                                    : { border: `1.5px solid ${PLAYER_COLORS[player]}` }
                                  }
                                  title={isSelected ? 'Click to remove' : isFull ? `Full (${count}/${count})` : 'Click to add'}
                                />
                              );
                            })}
                          </div>
                          <span className={`text-xs ${config.length === count ? dm('text-green-400', 'text-green-600') : dm('text-yellow-400', 'text-yellow-600')}`}>
                            {config.length}/{count}
                          </span>
                        </div>
                      );
                    })}
                    {Object.keys(playerCountConfig).length > 0 && (
                      <button
                        onClick={() => setPlayerCountConfig({})}
                        className={`self-start text-xs px-2 py-0.5 rounded ${dm('text-gray-500 hover:text-gray-300', 'text-gray-400 hover:text-gray-600')}`}
                      >
                        Reset defaults
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* Stats */}
              <div className={`text-xs flex gap-3 ${dm('text-gray-500', 'text-gray-500')}`}>
                <span>Cells: {activeCells.size}</span>
                <span>Pieces: {pieceCounts.reduce((a, b) => a + b, 0)}</span>
                <span>Goals: {ALL_PLAYERS.reduce((acc: number, p) => acc + goalPositions[p].size, 0)}</span>
                <span>Walls: {walls.size}</span>
              </div>
            </div>

            {/* Divider */}
            <div className={`self-stretch w-px ${dm('bg-gray-700', 'bg-gray-200')}`} />

            {/* Column 3: Symmetry */}
            <div className="w-[104px] shrink-0 flex flex-col gap-2">
              <div className={`text-xs font-medium ${dm('text-gray-300', 'text-gray-600')}`}>Symmetry</div>
              <div className="grid grid-cols-2 gap-1">
                {(['none', 'x', 'y', 'xy'] as SymmetryMode[]).map((s) => {
                  const labels: Record<string, string> = { none: 'None', x: 'X-Axis', y: 'Y-Axis', xy: 'X+Y' };
                  return (
                    <button
                      key={s}
                      onClick={() => setSymmetry(s)}
                      className={`px-2 py-1 text-xs rounded transition-all ${
                        symmetry === s
                          ? 'bg-blue-600 text-white'
                          : dm('bg-gray-700 text-gray-200 hover:bg-gray-600', 'bg-gray-100 text-gray-700 hover:bg-gray-200')
                      }`}
                    >
                      {labels[s]}
                    </button>
                  );
                })}
                <button
                  onClick={() => setSymmetry('6way')}
                  className={`col-span-2 px-2 py-1 text-xs rounded transition-all ${
                    symmetry === '6way'
                      ? 'bg-blue-600 text-white'
                      : dm('bg-gray-700 text-gray-200 hover:bg-gray-600', 'bg-gray-100 text-gray-700 hover:bg-gray-200')
                  }`}
                >
                  6-Way (60°)
                </button>
              </div>
              {symmetry !== 'none' && (
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className="relative shrink-0">
                    <input
                      type="checkbox"
                      checked={mirrorGoals}
                      onChange={() => setMirrorGoals((v) => !v)}
                      className="sr-only"
                    />
                    <div className={`w-8 h-4 rounded-full transition-colors ${mirrorGoals ? 'bg-blue-500' : dm('bg-gray-600', 'bg-gray-200')}`} />
                    <div className={`absolute left-0.5 top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${mirrorGoals ? 'translate-x-4' : ''}`} />
                  </div>
                  <div>
                    <div className={`text-xs font-medium ${dm('text-gray-300 group-hover:text-gray-100', 'text-gray-700 group-hover:text-gray-900')}`}>
                      Mirror goals
                    </div>
                    <div className={`text-xs ${dm('text-gray-500', 'text-gray-500')}`}>
                      Auto-place opposite goal
                    </div>
                  </div>
                </label>
              )}
            </div>

          </div>
        </div>

        {/* Import / Export */}
        <div className="max-w-2xl mx-auto w-full flex gap-2 mt-2">
          <button
            onClick={handleImport}
            className={`px-3 py-1 text-sm rounded ${dm('bg-gray-700 text-gray-200 hover:bg-gray-600', 'bg-gray-200 hover:bg-gray-300')}`}
          >
            Import
          </button>
          <button
            onClick={handleExport}
            className={`px-3 py-1 text-sm rounded ${dm('bg-gray-700 text-gray-200 hover:bg-gray-600', 'bg-gray-200 hover:bg-gray-300')}`}
          >
            Export
          </button>
        </div>
      </div>

      <SettingsPopup mode="editor" onRestart={handleEditorRestart} />
    </div>
  );
}
