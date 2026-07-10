/**
 * Tests that Piece.tsx wires pieceIconFor() correctly:
 * - pieceType='king' renders a KingIcon (SVG with path data, not a text letter)
 * - pieceType='marble' renders no icon
 * - no pieceType renders no icon
 *
 * We use react-dom/server renderToStaticMarkup so no DOM or jsdom is needed.
 * useEffect is a no-op in server rendering.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { Piece } from '@/components/board/Piece';
import type { CubeCoord } from '@/types/game';

// Minimal props required by Piece
const coord: CubeCoord = { q: 0, r: 0, s: 0 };
const baseProps = {
  coord,
  player: 0 as const,
  isCurrentPlayer: false,
  isSelected: false,
  onClick: () => {},
};

function renderPiece(extra: Parameters<typeof Piece>[0]) {
  return renderToStaticMarkup(React.createElement(Piece, extra));
}

describe('Piece chess glyph integration', () => {
  it('renders KingIcon SVG path when pieceType is king', () => {
    const html = renderPiece({ ...baseProps, pieceType: 'king' });
    // The KingIcon contains a cross path starting with 'M -1.5 -9'
    // The placeholder text would have contained 'K' as a text node.
    expect(html).toContain('<path');
    // Should NOT fall back to a <text> element with a letter
    expect(html).not.toContain('<text');
    // Should contain a nested svg (the icon's own svg viewport)
    expect(html).toContain('<svg');
  });

  it('renders no icon when pieceType is marble', () => {
    const html = renderPiece({ ...baseProps, pieceType: 'marble' });
    // marble is excluded from icon rendering; no extra svg from the icon block
    // The base piece circle renders but no icon SVG wrapper with a chess path
    // We check that no text fallback and no extra <svg> from the icon group appear.
    // The board SVG is the outer context; piece itself is a <g> — check no nested <svg>
    expect(html).not.toContain('<text');
    // The icon branch is skipped entirely for marble
    // (no nested svg x/y positioned icon wrapper)
    expect(html).not.toMatch(/<svg[^>]+x="/);
  });

  it('renders no icon when pieceType is undefined', () => {
    const html = renderPiece({ ...baseProps });
    expect(html).not.toContain('<text');
    expect(html).not.toMatch(/<svg[^>]+x="/);
  });

  it('renders a Peon icon when pieceType is soldier', () => {
    const html = renderPiece({ ...baseProps, pieceType: 'soldier' });
    expect(html).toContain('<path');
    expect(html).toContain('<svg');
  });

  it('renders a queen icon when pieceType is queen', () => {
    const html = renderPiece({ ...baseProps, pieceType: 'queen' });
    expect(html).toContain('<path');
    expect(html).not.toContain('<text');
    expect(html).toContain('<svg');
  });
});
