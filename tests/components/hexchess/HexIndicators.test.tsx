/**
 * Tests for HexTurnIndicator, HexMoveIndicator, and HexGameOverDialog components.
 *
 * Uses react-dom/server renderToStaticMarkup (node env, no DOM/jsdom needed)
 * and direct React element tree inspection for click handler tests.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { HexTurnIndicator } from '@/components/hexchess/HexTurnIndicator';
import { HexMoveIndicator } from '@/components/hexchess/HexMoveIndicator';
import { HexGameOverDialog } from '@/components/hexchess/HexGameOverDialog';
import type { HexChessState, HexChessConfig, HexMove } from '@/game/hexchess';
import type { HexPiece } from '@/game/hexchess/state';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makePiece(id: string, player: 0 | 1 | 2, q = 0, r = 0): HexPiece {
  return { id, player, type: 'king', cell: { q, r, s: -q - r }, hasMoved: false };
}

const baseState: HexChessState = {
  mode: 'hexchess',
  pieces: [
    makePiece('K0', 0, 0, -4),
    makePiece('K1', 1, 0, 4),
  ],
  currentPlayer: 0,
  turnNumber: 1,
    activePlayers: [0, 2],
    eliminated: [],
  enPassantTarget: null,
  pendingPromotion: null,
  moveHistory: [],
  positionHashes: {},
  result: null,
};

const baseConfig: HexChessConfig = {
  id: 'test-game',
  seats: [0, 2],
  players: {
    0: { color: '#ff0000', name: 'Alice', isAI: false },
    2: { color: '#0000ff', name: 'Bob', isAI: false },
  },
  layoutPreset: 'v1-default',
  soldierVariant: 'pawn',
  ai: null,
};

const lastMove: HexMove = {
  pieceId: 'R0',
  from: { q: 0, r: 1, s: -1 },
  to: { q: 0, r: 3, s: -3 },
  capture: null,
  promotion: null,
  isEnPassant: false,
  isDoubleStep: false,
  player: 0,
  turnNumber: 1,
};

// Helper to traverse React element tree and collect nodes by type
function findByType(node: unknown, type: string): Array<React.ReactElement> {
  if (node === null || node === undefined || typeof node !== 'object') return [];
  const el = node as React.ReactElement;
  const results: Array<React.ReactElement> = [];
  if ((el as { type?: unknown }).type === type) results.push(el);
  const children = (el.props as Record<string, unknown>)?.children;
  if (Array.isArray(children)) {
    for (const child of children) results.push(...findByType(child, type));
  } else if (children) {
    results.push(...findByType(children, type));
  }
  return results;
}

// ---------------------------------------------------------------------------
// HexTurnIndicator
// ---------------------------------------------------------------------------

describe('HexTurnIndicator', () => {
  it('renders current player name', () => {
    const html = renderToStaticMarkup(
      React.createElement(HexTurnIndicator, { state: baseState, config: baseConfig }),
    );
    expect(html).toContain("Alice");
  });

  it("renders \"turn\" indicator text", () => {
    const html = renderToStaticMarkup(
      React.createElement(HexTurnIndicator, { state: baseState, config: baseConfig }),
    );
    expect(html.toLowerCase()).toContain('turn');
  });

  it('includes player color in rendered output', () => {
    const html = renderToStaticMarkup(
      React.createElement(HexTurnIndicator, { state: baseState, config: baseConfig }),
    );
    // ColorSwatch should render the color somewhere
    expect(html).toContain('ff0000');
  });

  it('does NOT show in-check badge when not in check', () => {
    const html = renderToStaticMarkup(
      React.createElement(HexTurnIndicator, { state: baseState, config: baseConfig }),
    );
    expect(html.toLowerCase()).not.toContain('in check');
    expect(html.toLowerCase()).not.toContain('check');
  });

  it('shows in-check badge when king is in check', () => {
    // Place the opponent rook on the same file as the king to create check.
    // Player 0 king at (0,-4,4). Place player 1 rook at (0,-3,3) so they are on
    // same column with no pieces between them (q=0 edge direction r=-1 step).
    // Actually for a simple in-check: player 1 queen at (0,-3,3) attacks king at (0,-4,4).
    // We'll place player 1 queen directly adjacent to the king so pseudo-moves hit it.
    const checkState: HexChessState = {
      ...baseState,
      pieces: [
        makePiece('K0', 0, 0, -4),  // player 0 king at (0,-4,4)
        makePiece('K1', 1, 0, 4),   // player 1 king at (0,4,-4) (far away)
        { id: 'Q1', player: 2, type: 'queen', cell: { q: 0, r: -3, s: 3 }, hasMoved: true },
      ],
    };
    const html = renderToStaticMarkup(
      React.createElement(HexTurnIndicator, { state: checkState, config: baseConfig }),
    );
    expect(html.toLowerCase()).toContain('check');
  });

  it('shows draw result banner when game is drawn', () => {
    const drawState: HexChessState = {
      ...baseState,
      result: { winner: 'draw', reason: 'stalemate' },
    };
    const html = renderToStaticMarkup(
      React.createElement(HexTurnIndicator, { state: drawState, config: baseConfig }),
    );
    expect(html.toLowerCase()).toContain('draw');
    expect(html.toLowerCase()).toContain('stalemate');
  });

  it('shows winner name and color in result banner', () => {
    const winState: HexChessState = {
      ...baseState,
      result: { winner: 2, reason: 'checkmate' },
    };
    const html = renderToStaticMarkup(
      React.createElement(HexTurnIndicator, { state: winState, config: baseConfig }),
    );
    expect(html).toContain('Bob');
    expect(html.toLowerCase()).toContain('win');
  });

  it('shows the end reason in the winner banner', () => {
    const winState: HexChessState = {
      ...baseState,
      result: { winner: 0, reason: 'checkmate' },
    };
    const html = renderToStaticMarkup(
      React.createElement(HexTurnIndicator, { state: winState, config: baseConfig }),
    );
    expect(html.toLowerCase()).toContain('checkmate');
  });
});

// ---------------------------------------------------------------------------
// HexMoveIndicator
// ---------------------------------------------------------------------------

describe('HexMoveIndicator', () => {
  it('shows waiting message when there is no last move', () => {
    const html = renderToStaticMarkup(
      React.createElement(HexMoveIndicator, {
        lastMove: null,
        canResign: false,
        onResign: vi.fn(),
      }),
    );
    expect(html.toLowerCase()).toContain('wait');
  });

  it('renders move summary with from/to coordinates', () => {
    const html = renderToStaticMarkup(
      React.createElement(HexMoveIndicator, {
        lastMove,
        canResign: false,
        onResign: vi.fn(),
      }),
    );
    // Should contain the origin and destination coords
    expect(html).toContain('0,1');
    expect(html).toContain('0,3');
  });

  it('renders capture indicator when move has a capture', () => {
    const captureMove: HexMove = {
      ...lastMove,
      capture: { pieceId: 'P1', cell: { q: 0, r: 3, s: -3 } },
    };
    const html = renderToStaticMarkup(
      React.createElement(HexMoveIndicator, {
        lastMove: captureMove,
        canResign: false,
        onResign: vi.fn(),
      }),
    );
    expect(html).toContain('x');
  });

  it('does NOT render resign button when canResign is false', () => {
    const html = renderToStaticMarkup(
      React.createElement(HexMoveIndicator, {
        lastMove: null,
        canResign: false,
        onResign: vi.fn(),
      }),
    );
    expect(html.toLowerCase()).not.toContain('resign');
  });

  it('renders resign button when canResign is true', () => {
    const html = renderToStaticMarkup(
      React.createElement(HexMoveIndicator, {
        lastMove: null,
        canResign: true,
        onResign: vi.fn(),
      }),
    );
    expect(html.toLowerCase()).toContain('resign');
  });

  it('onResign fires when resign button is clicked', () => {
    const onResign = vi.fn();
    const element = HexMoveIndicator({ lastMove: null, canResign: true, onResign });
    const buttons = findByType(element, 'button');
    const resignBtn = buttons.find(
      (b) => String((b.props as Record<string, unknown>).children ?? '').toLowerCase().includes('resign'),
    );
    expect(resignBtn).toBeDefined();
    const onClick = (resignBtn!.props as Record<string, unknown>).onClick as () => void;
    onClick();
    expect(onResign).toHaveBeenCalledOnce();
  });

  it('shows promotion notation when move has promotion', () => {
    const promoMove: HexMove = {
      ...lastMove,
      promotion: 'queen',
    };
    const html = renderToStaticMarkup(
      React.createElement(HexMoveIndicator, {
        lastMove: promoMove,
        canResign: false,
        onResign: vi.fn(),
      }),
    );
    expect(html).toContain('=Q');
  });
});

// ---------------------------------------------------------------------------
// HexGameOverDialog
// ---------------------------------------------------------------------------

describe('HexGameOverDialog', () => {
  it('renders nothing when result is null', () => {
    const html = renderToStaticMarkup(
      React.createElement(HexGameOverDialog, {
        state: baseState,
        config: baseConfig,
        onNewGame: vi.fn(),
        onHome: vi.fn(),
      }),
    );
    expect(html).toBe('');
  });

  it('shows winner name when game has a winner', () => {
    const winState: HexChessState = {
      ...baseState,
      result: { winner: 0, reason: 'checkmate' },
    };
    const html = renderToStaticMarkup(
      React.createElement(HexGameOverDialog, {
        state: winState,
        config: baseConfig,
        onNewGame: vi.fn(),
        onHome: vi.fn(),
      }),
    );
    expect(html).toContain('Alice');
    expect(html.toLowerCase()).toContain('win');
  });

  it('shows draw text when result is draw', () => {
    const drawState: HexChessState = {
      ...baseState,
      result: { winner: 'draw', reason: 'stalemate' },
    };
    const html = renderToStaticMarkup(
      React.createElement(HexGameOverDialog, {
        state: drawState,
        config: baseConfig,
        onNewGame: vi.fn(),
        onHome: vi.fn(),
      }),
    );
    expect(html.toLowerCase()).toContain('draw');
  });

  it('shows the end reason', () => {
    const winState: HexChessState = {
      ...baseState,
      result: { winner: 2, reason: 'checkmate' },
    };
    const html = renderToStaticMarkup(
      React.createElement(HexGameOverDialog, {
        state: winState,
        config: baseConfig,
        onNewGame: vi.fn(),
        onHome: vi.fn(),
      }),
    );
    expect(html.toLowerCase()).toContain('checkmate');
  });

  it('renders New Game and Home buttons', () => {
    const winState: HexChessState = {
      ...baseState,
      result: { winner: 0, reason: 'resignation' },
    };
    const html = renderToStaticMarkup(
      React.createElement(HexGameOverDialog, {
        state: winState,
        config: baseConfig,
        onNewGame: vi.fn(),
        onHome: vi.fn(),
      }),
    );
    expect(html.toLowerCase()).toContain('new game');
    expect(html.toLowerCase()).toContain('home');
  });

  it('onNewGame fires when New Game button is clicked', () => {
    const onNewGame = vi.fn();
    const winState: HexChessState = {
      ...baseState,
      result: { winner: 0, reason: 'checkmate' },
    };
    const element = HexGameOverDialog({ state: winState, config: baseConfig, onNewGame, onHome: vi.fn() });
    const buttons = findByType(element, 'button');
    const btn = buttons.find(
      (b) => {
        const ch = (b.props as Record<string, unknown>).children;
        return typeof ch === 'string' && ch.toLowerCase().includes('new game');
      },
    );
    expect(btn).toBeDefined();
    const onClick = (btn!.props as Record<string, unknown>).onClick as () => void;
    onClick();
    expect(onNewGame).toHaveBeenCalledOnce();
  });

  it('onHome fires when Home button is clicked', () => {
    const onHome = vi.fn();
    const winState: HexChessState = {
      ...baseState,
      result: { winner: 2, reason: 'resignation' },
    };
    const element = HexGameOverDialog({ state: winState, config: baseConfig, onNewGame: vi.fn(), onHome });
    const buttons = findByType(element, 'button');
    const btn = buttons.find(
      (b) => {
        const ch = (b.props as Record<string, unknown>).children;
        return typeof ch === 'string' && ch.toLowerCase().includes('home');
      },
    );
    expect(btn).toBeDefined();
    const onClick = (btn!.props as Record<string, unknown>).onClick as () => void;
    onClick();
    expect(onHome).toHaveBeenCalledOnce();
  });

  it('renders a modal backdrop element', () => {
    const winState: HexChessState = {
      ...baseState,
      result: { winner: 0, reason: 'checkmate' },
    };
    const html = renderToStaticMarkup(
      React.createElement(HexGameOverDialog, {
        state: winState,
        config: baseConfig,
        onNewGame: vi.fn(),
        onHome: vi.fn(),
      }),
    );
    // The outer fixed overlay and inner white card should both be present
    expect(html).toContain('fixed');
    expect(html).toContain('bg-white');
  });
});

// ---------------------------------------------------------------------------
// Multiplayer indicator and game-over dialog
// ---------------------------------------------------------------------------

const mpConfig: HexChessConfig = {
  id: 'mp-game',
  seats: [0, 3, 1],
  players: {
    0: { color: '#ff0000', name: 'Red', isAI: false },
    3: { color: '#00ff00', name: 'Green', isAI: false },
    1: { color: '#0000ff', name: 'Blue', isAI: false },
  },
  layoutPreset: 'v1-default',
  soldierVariant: 'soldier',
  ai: null,
};

function makeMpPiece(id: string, player: 0 | 1 | 3, q = 0, r = 0): HexPiece {
  return { id, player, type: 'king', cell: { q, r, s: -q - r }, hasMoved: false };
}

const mpState: HexChessState = {
  mode: 'hexchess',
  pieces: [
    makeMpPiece('K0', 0, 4, -8),
    makeMpPiece('K3', 3, 4, 4),
    makeMpPiece('K1', 1, -8, 4),
  ],
  currentPlayer: 0,
  turnNumber: 7,
  activePlayers: [0, 3, 1],
  eliminated: [3],
  enPassantTarget: null,
  pendingPromotion: null,
  moveHistory: [],
  positionHashes: {},
  result: null,
};

describe('HexTurnIndicator — multiplayer', () => {
  it('lists all seats, marks the current one, and greys the eliminated one', () => {
    const html = renderToStaticMarkup(
      <HexTurnIndicator state={mpState} config={mpConfig} />
    );
    expect(html).toContain('Red');
    expect(html).toContain('Green');
    expect(html).toContain('Blue');
    expect(html).toContain('to move');
    expect(html).toContain('line-through');
    expect(html).toContain('opacity-50');
  });

  it('labels a king-capture result as last player standing', () => {
    const finished: HexChessState = {
      ...mpState,
      eliminated: [3, 1],
      result: { winner: 0, reason: 'king-capture' },
    };
    const html = renderToStaticMarkup(
      <HexTurnIndicator state={finished} config={mpConfig} />
    );
    expect(html).toContain('Red wins');
    expect(html).toContain('last player standing');
  });
});

describe('HexGameOverDialog — multiplayer finish order', () => {
  it('shows winner first, then eliminated seats latest-out first', () => {
    const finished: HexChessState = {
      ...mpState,
      eliminated: [3, 1],
      result: { winner: 0, reason: 'king-capture' },
    };
    const html = renderToStaticMarkup(
      <HexGameOverDialog
        state={finished}
        config={mpConfig}
        onNewGame={() => {}}
        onHome={() => {}}
      />
    );
    expect(html).toContain('Red wins');
    // Finish order: Red (winner), Blue (eliminated last), Green (first out).
    const redIdx = html.indexOf('>Red<');
    const blueIdx = html.indexOf('>Blue<');
    const greenIdx = html.indexOf('>Green<');
    expect(redIdx).toBeGreaterThan(-1);
    expect(blueIdx).toBeGreaterThan(redIdx);
    expect(greenIdx).toBeGreaterThan(blueIdx);
  });
});
