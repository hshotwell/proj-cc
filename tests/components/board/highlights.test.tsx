/**
 * Tests for Board.tsx rendering of new highlight kinds:
 *   - legalMoveEmpty: filled dot on empty target cell
 *   - legalMoveCapture: hollow ring around capturable enemy piece
 *   - check: pulsing red ring on the checked king's cell
 *
 * Strategy: mock the three Zustand stores so Board renders without
 * a live game state, supply a `view` prop carrying the desired highlights,
 * and verify the resulting SVG markup via renderToStaticMarkup.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BoardView } from '@/types/boardView';
import type { CubeCoord } from '@/types/game';
import { createGame } from '@/game/setup';

// --- Store mocks -------------------------------------------------------
// Board.tsx imports useReplayStore, useGameStore, useSettingsStore at module
// level.  We replace them with minimal fakes that return stable defaults so
// the component doesn't throw during SSR rendering.

const minimalGameState = createGame(2);

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
  // The hook form
  useGameStore: Object.assign(() => gameStoreState, {
    // Zustand store static method used in Board.tsx useState lazy init
    getState: () => gameStoreState,
  }),
  // selectBoardView is used by deriveViewFromStore — return an empty view so
  // the store-fallback path doesn't collide with our view prop
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
// -----------------------------------------------------------------------

// Import Board AFTER mocks are set up
import { Board } from '@/components/board/Board';

// Minimal BoardView helper
function makeView(highlights: BoardView['highlights']): BoardView {
  return {
    cells: [],
    homeZones: new Map(),
    pieces: [],
    highlights,
    animatingMove: null,
    rotation: 0,
    activePlayerIndex: 0,
  };
}

const cell: CubeCoord = { q: 0, r: 0, s: 0 };

// Helper: render Board with a view prop, working around TS's createElement
// overload resolution by using an explicit any cast.
function renderBoard(view: BoardView): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToStaticMarkup(React.createElement(Board as any, { view }));
}

describe('Board highlight rendering', () => {
  it('renders a filled circle for legalMoveEmpty', () => {
    const html = renderBoard(makeView([{ kind: 'legalMoveEmpty', cell }]));
    // Expect a small filled green circle
    expect(html).toMatch(/fill="#22c55e"/);
    expect(html).toContain('<circle');
  });

  it('does NOT render a standalone highlight for legalMoveCapture (now on the piece)', () => {
    // legalMoveCapture is now rendered as a spike ring around the enemy piece
    // (via Piece.isCaptureTarget), not as a separate hollow circle in the
    // highlight layer. The board itself renders no capture-ring circle.
    const html = renderBoard(makeView([{ kind: 'legalMoveCapture', cell }]));
    expect(html).not.toMatch(/stroke="#ef4444"[^>]*>/);
  });

  it('renders a red pulsing ring for check', () => {
    const html = renderBoard(makeView([{ kind: 'check', cell }]));
    expect(html).toMatch(/stroke="#dc2626"/);
    expect(html).toMatch(/fill="none"/);
    expect(html).toContain('<circle');
    // The ring should carry the check-pulse animation class
    expect(html).toContain('check-pulse');
  });

  it('renders nothing extra when highlights array is empty', () => {
    const html = renderBoard(makeView([]));
    // Should not contain the new highlight-specific colors
    expect(html).not.toContain('#22c55e');  // legalMoveEmpty green
    expect(html).not.toContain('#dc2626');  // check red
    // check-pulse class should not appear
    expect(html).not.toContain('check-pulse');
  });

  it('renders a dashed violet ring for preMoveFrom', () => {
    const html = renderBoard(makeView([{ kind: 'preMoveFrom', cell }]));
    expect(html).toMatch(/stroke="#8b5cf6"/);
    expect(html).toContain('<circle');
  });

  it('renders a dashed violet dot for preMoveTo', () => {
    const html = renderBoard(makeView([{ kind: 'preMoveTo', cell }]));
    expect(html).toMatch(/stroke="#8b5cf6"/);
    expect(html).toContain('<circle');
  });
});
