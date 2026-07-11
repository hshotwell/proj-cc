/**
 * Tests for Board.tsx rendering of board annotations (circles/arrows) from
 * annotationStore state. Mirrors tests/components/board/highlights.test.tsx's
 * store-mocking approach.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BoardView } from '@/types/boardView';
import type { CubeCoord } from '@/types/game';
import { createGame } from '@/game/setup';

const minimalGameState = createGame(2);

// zustand v5's React binding wires useSyncExternalStore's getServerSnapshot to
// api.getInitialState(), which is a snapshot frozen at store-creation time.
// renderToStaticMarkup is treated by React as a server render, so a real
// useAnnotationStore() hook call would always see the pre-mutation (empty)
// state no matter what toggleCircle/toggleArrow do. Mock the hook to read
// getState() directly on every render, while keeping the store's real
// vanilla implementation (imported below) so toggleCircle/toggleArrow/clearAll
// behave exactly as in production — only the React subscription is bypassed.
vi.mock('@/store/annotationStore', async () => {
  const actual = await vi.importActual<typeof import('@/store/annotationStore')>('@/store/annotationStore');
  return {
    ...actual,
    useAnnotationStore: Object.assign(
      () => actual.useAnnotationStore.getState(),
      actual.useAnnotationStore,
    ),
  };
});

import { useAnnotationStore } from '@/store/annotationStore';

vi.mock('@/store/replayStore', () => ({
  useReplayStore: () => ({
    isReplayActive: false,
    displayState: null,
    states: [],
    currentStep: 0,
    moves: [],
  }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({
    showAllMoves: true,
    animateMoves: false,
    rotateBoard: false,
    showTriangleLines: false,
    showLastMoves: false,
    showCoordinates: false,
    darkMode: false,
    woodenBoard: false,
    glassPieces: false,
    hopEffect: false,
    hexCells: false,
    activePlayerRing: false,
  }),
}));

const gameStoreState = {
  gameState: minimalGameState,
  selectedPiece: null,
  validMovesForSelected: [],
  pendingConfirmation: false,
  stateBeforeMove: null,
  originalPiecePosition: null,
  animatingPiece: null,
  animationPath: null,
  animationStep: 0,
  isSwapAnimation: false,
  lastMoveInfo: null,
  selectPiece: () => {},
  makeMove: () => {},
  clearSelection: () => {},
  confirmMove: () => {},
  undoLastMove: () => {},
  preMoves: [],
  preMoveSelectedFrom: null,
  selectPreMovePiece: () => {},
  queuePreMove: () => {},
  cancelPreMoveSelection: () => {},
  cancelPreMoveAt: () => {},
  getVirtualBoard: () => new Map(),
  clearAnimation: () => {},
  advanceAnimation: () => {},
};

vi.mock('@/store/gameStore', () => ({
  useGameStore: Object.assign(() => gameStoreState, {
    getState: () => gameStoreState,
  }),
  selectBoardView: () => ({
    cells: [],
    homeZones: new Map(),
    pieces: [],
    highlights: [],
    animatingMove: null,
    rotation: 0,
    activePlayerIndex: 0,
  }),
}));

import { Board } from '@/components/board/Board';

function makeView(overrides: Partial<BoardView> = {}): BoardView {
  return {
    cells: [],
    homeZones: new Map(),
    pieces: [],
    highlights: [],
    animatingMove: null,
    rotation: 0,
    activePlayerIndex: 0,
    ...overrides,
  };
}

function renderBoard(view: BoardView): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToStaticMarkup(React.createElement(Board as any, { view }));
}

const cell: CubeCoord = { q: 0, r: 0, s: 0 };
const other: CubeCoord = { q: 2, r: -1, s: -1 };

describe('Board annotation rendering', () => {
  beforeEach(() => {
    useAnnotationStore.getState().clearAll();
  });

  it('renders nothing extra when there are no annotations', () => {
    const html = renderBoard(makeView());
    expect(html).not.toContain('annotation-circle');
    expect(html).not.toContain('annotation-arrow');
  });

  it('renders a circle for a queued annotation', () => {
    useAnnotationStore.getState().toggleCircle(cell, '#ff0000');
    const html = renderBoard(makeView());
    expect(html).toContain('annotation-circle');
    expect(html).toMatch(/stroke="#ff0000"/);
  });

  it('renders a straight arrow (polyline + arrowhead) when no bending applies', () => {
    useAnnotationStore.getState().toggleArrow(cell, other, '#22c55e');
    const html = renderBoard(makeView());
    expect(html).toContain('annotation-arrow');
    expect(html).toContain('annotation-arrowhead');
    expect(html).toMatch(/stroke="#22c55e"/);
  });
});
