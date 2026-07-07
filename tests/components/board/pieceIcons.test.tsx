import { describe, it, expect } from 'vitest';
import { KingIcon, QueenIcon, RookIcon, BishopIcon, KnightIcon, pieceIconFor } from '@/components/board/pieceIcons';

// We test the React elements as plain objects — no DOM renderer needed.

function renderIcon(Icon: (props: { size: number; fill: string }) => unknown, size = 24, fill = '#ff0000') {
  // Call the function component directly; in React 19 JSX, components are functions.
  return Icon({ size, fill });
}

function getSvgProps(element: unknown): Record<string, unknown> {
  // React element shape: { type, props }
  const el = element as { type: string; props: Record<string, unknown> };
  expect(el.type).toBe('svg');
  return el.props;
}

describe('chess piece icon components', () => {
  it('KingIcon renders an svg with correct viewBox and size', () => {
    const el = renderIcon(KingIcon);
    const props = getSvgProps(el);
    expect(props.viewBox).toBe('-10 -10 20 20');
    expect(props.width).toBe(24);
    expect(props.height).toBe(24);
  });

  it('QueenIcon renders an svg with correct viewBox and size', () => {
    const el = renderIcon(QueenIcon);
    const props = getSvgProps(el);
    expect(props.viewBox).toBe('-10 -10 20 20');
    expect(props.width).toBe(24);
    expect(props.height).toBe(24);
  });

  it('RookIcon renders an svg with correct viewBox and size', () => {
    const el = renderIcon(RookIcon);
    const props = getSvgProps(el);
    expect(props.viewBox).toBe('-10 -10 20 20');
    expect(props.width).toBe(24);
    expect(props.height).toBe(24);
  });

  it('BishopIcon renders an svg with correct viewBox and size', () => {
    const el = renderIcon(BishopIcon);
    const props = getSvgProps(el);
    expect(props.viewBox).toBe('-10 -10 20 20');
    expect(props.width).toBe(24);
    expect(props.height).toBe(24);
  });

  it('KnightIcon renders an svg with correct viewBox and size', () => {
    const el = renderIcon(KnightIcon);
    const props = getSvgProps(el);
    expect(props.viewBox).toBe('-10 -10 20 20');
    expect(props.width).toBe(24);
    expect(props.height).toBe(24);
  });

  it('all icons accept and forward a custom size', () => {
    const icons = [KingIcon, QueenIcon, RookIcon, BishopIcon, KnightIcon];
    for (const Icon of icons) {
      const el = renderIcon(Icon, 48, '#123456');
      const props = getSvgProps(el);
      expect(props.width).toBe(48);
      expect(props.height).toBe(48);
    }
  });

  it('all icons forward className to the svg', () => {
    function renderWithClass(
      Icon: (props: { size: number; fill: string; className?: string }) => unknown,
    ) {
      return Icon({ size: 24, fill: '#000', className: 'test-class' });
    }
    const icons = [KingIcon, QueenIcon, RookIcon, BishopIcon, KnightIcon];
    for (const Icon of icons) {
      const el = renderWithClass(Icon) as { props: Record<string, unknown> };
      expect(el.props.className).toContain('test-class');
    }
  });

  it('all icons contain at least one path child', () => {
    const icons = [KingIcon, QueenIcon, RookIcon, BishopIcon, KnightIcon];
    for (const Icon of icons) {
      const el = renderIcon(Icon) as { props: { children: unknown } };
      const children = el.props.children;
      const childArray = Array.isArray(children) ? children : [children];
      const hasPath = childArray.some(
        (c: unknown) => c !== null && typeof c === 'object' && (c as { type?: string }).type === 'path',
      );
      expect(hasPath, `${Icon.name} should have at least one path element`).toBe(true);
    }
  });
});

describe('pieceIconFor', () => {
  it('returns KingIcon for king', () => {
    expect(pieceIconFor('king')).toBe(KingIcon);
  });

  it('returns QueenIcon for queen', () => {
    expect(pieceIconFor('queen')).toBe(QueenIcon);
  });

  it('returns RookIcon for rook', () => {
    expect(pieceIconFor('rook')).toBe(RookIcon);
  });

  it('returns BishopIcon for bishop', () => {
    expect(pieceIconFor('bishop')).toBe(BishopIcon);
  });

  it('returns KnightIcon for knight', () => {
    expect(pieceIconFor('knight')).toBe(KnightIcon);
  });

  it('returns null for soldier', () => {
    expect(pieceIconFor('soldier')).toBeNull();
  });

  it('returns null for pawn', () => {
    expect(pieceIconFor('pawn')).toBeNull();
  });

  it('returns null for marble', () => {
    expect(pieceIconFor('marble')).toBeNull();
  });
});
