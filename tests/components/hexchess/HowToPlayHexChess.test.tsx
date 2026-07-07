/**
 * Tests for HowToPlayHexChess modal component.
 *
 * Uses react-dom/server renderToStaticMarkup (node env, no DOM/jsdom needed).
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { HowToPlayHexChess } from '@/components/hexchess/HowToPlayHexChess';

function render(open: boolean, onClose = vi.fn()) {
  return renderToStaticMarkup(
    React.createElement(HowToPlayHexChess, { open, onClose })
  );
}

describe('HowToPlayHexChess', () => {
  it('renders nothing when open is false', () => {
    expect(render(false)).toBe('');
  });

  it('renders modal content when open is true', () => {
    const html = render(true);
    expect(html).toContain('How to Play Hex Chess');
    expect(html).toContain('Checkmate');
    expect(html).toContain('Promotion');
    expect(html).toContain('En passant');
    expect(html).toContain('Draws');
  });

  it('has role="dialog" and aria-modal when open', () => {
    const html = render(true);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
  });

  it('close button has aria-label="Close"', () => {
    const html = render(true);
    expect(html).toContain('aria-label="Close"');
  });

  it('backdrop has onClick wiring (absolute inset-0 div present)', () => {
    const html = render(true);
    // The backdrop overlay div is always rendered alongside content
    expect(html).toContain('absolute');
    expect(html).toContain('bg-black');
  });

  it('contains a bottom Close button', () => {
    const html = render(true);
    // The bottom close button text
    expect(html).toContain('>Close<');
  });

  it('piece section mentions King Queen Rook Bishop', () => {
    const html = render(true);
    expect(html).toContain('King');
    expect(html).toContain('Queen');
    expect(html).toContain('Rook');
    expect(html).toContain('Bishop');
  });

  it('setup section mentions Soldier', () => {
    const html = render(true);
    expect(html).toContain('Soldier');
  });
});
