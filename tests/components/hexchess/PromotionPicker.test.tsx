/**
 * Tests for PromotionPicker component.
 *
 * Uses react-dom/server renderToStaticMarkup (node env, no DOM/jsdom needed).
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { PromotionPicker } from '@/components/hexchess/PromotionPicker';
import type { CubeCoord } from '@/types/game';
import type { HexPieceType } from '@/game/hexchess/state';

const pieceCell: CubeCoord = { q: 0, r: 0, s: 0 };

function renderPicker(props?: Partial<React.ComponentProps<typeof PromotionPicker>>) {
  const defaults: React.ComponentProps<typeof PromotionPicker> = {
    pieceCell,
    playerColor: '#3b82f6',
    onChoose: vi.fn(),
  };
  return renderToStaticMarkup(React.createElement(PromotionPicker, { ...defaults, ...props }));
}

describe('PromotionPicker', () => {
  it('renders all 4 promotion option buttons', () => {
    const html = renderPicker();
    // Should have buttons for queen, rook, bishop, knight
    expect(html).toContain('Promote to queen');
    expect(html).toContain('Promote to rook');
    expect(html).toContain('Promote to bishop');
    expect(html).toContain('Promote to knight');
  });

  it('renders the "Promote to:" heading', () => {
    const html = renderPicker();
    expect(html).toContain('Promote to:');
  });

  it('each button has a correct aria-label', () => {
    const html = renderPicker();
    const options: HexPieceType[] = ['queen', 'rook', 'bishop', 'knight'];
    for (const opt of options) {
      expect(html).toContain(`aria-label="Promote to ${opt}"`);
    }
  });

  it('renders an SVG chess icon inside each button', () => {
    const html = renderPicker();
    // Each button should contain an svg element (the piece icon)
    const svgCount = (html.match(/<svg/g) ?? []).length;
    // 4 piece icons
    expect(svgCount).toBeGreaterThanOrEqual(4);
  });

  it('includes a semi-transparent backdrop element', () => {
    const html = renderPicker();
    // The backdrop uses bg-black/40 or similar
    expect(html).toContain('bg-black');
  });

  it('applies the player color to piece icons via fill', () => {
    const html = renderPicker({ playerColor: '#ff0000' });
    expect(html).toContain('#ff0000');
  });

  it('handles sentinel colors via getCSSColor without crashing', () => {
    // 'rainbow' is a sentinel — getCSSColor maps it to a CSS color
    expect(() => renderPicker({ playerColor: 'rainbow' })).not.toThrow();
    const html = renderPicker({ playerColor: 'rainbow' });
    // Should render buttons still
    expect(html).toContain('Promote to queen');
  });

  // onClick behavior: since we're using server render we verify
  // the data-choice attribute or button type is present in markup.
  // For click handler verification we call the component function directly.
  it('onChoose is wired to each button onClick', () => {
    const onChoose = vi.fn();

    // Call component as a plain function to get React element tree
    const element = PromotionPicker({ pieceCell, playerColor: '#000', onChoose });

    // Traverse the React element tree to find buttons
    function findButtons(node: unknown): Array<React.ReactElement> {
      if (node === null || node === undefined || typeof node !== 'object') return [];
      const el = node as React.ReactElement;
      const results: Array<React.ReactElement> = [];
      if (el.type === 'button') {
        results.push(el);
      }
      const children = el.props?.children;
      if (Array.isArray(children)) {
        for (const child of children) {
          results.push(...findButtons(child));
        }
      } else if (children) {
        results.push(...findButtons(children));
      }
      return results;
    }

    const buttons = findButtons(element);
    // Should find 4 promotion buttons
    expect(buttons.length).toBeGreaterThanOrEqual(4);

    // Fire the onClick on the first button (queen)
    const queenBtn = buttons.find(
      (b) => (b.props as Record<string, unknown>)['aria-label'] === 'Promote to queen',
    );
    expect(queenBtn).toBeDefined();
    const onClick = (queenBtn!.props as Record<string, unknown>).onClick as () => void;
    onClick();
    expect(onChoose).toHaveBeenCalledWith('queen');
  });

  it('onCancel is called when backdrop is clicked', () => {
    const onCancel = vi.fn();
    const element = PromotionPicker({ pieceCell, playerColor: '#000', onChoose: vi.fn(), onCancel });

    // The outermost div has an onClick for onCancel
    const outer = element as React.ReactElement;
    const outerOnClick = (outer.props as Record<string, unknown>).onClick as (() => void) | undefined;
    expect(outerOnClick).toBeDefined();
    outerOnClick!();
    expect(onCancel).toHaveBeenCalled();
  });
});
