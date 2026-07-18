import { describe, it, expect } from 'vitest';
import { validateLayout } from '@/game/layoutValidation';
import type { BoardLayout } from '@/types/game';

function hexLayout(over: Partial<BoardLayout>): BoardLayout {
  const cells: string[] = [];
  for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) {
    if (Math.abs(-q - r) <= 3) cells.push(`${q},${r}`);
  }
  return {
    id: 'h1', name: 'Hex', cells, startingPositions: {}, createdAt: 0,
    gameMode: 'hexchess',
    hexPieces: {
      '-3,0': { player: 0, type: 'king' }, '-2,0': { player: 0, type: 'pawn' },
      '3,0': { player: 2, type: 'king' }, '2,0': { player: 2, type: 'pawn' },
    },
    promotionPositions: { 0: ['3,-1'], 2: ['-3,1'] },
    promotionOptions: ['queen'],
    ...over,
  };
}

describe('validateHexChessLayout (via validateLayout dispatch)', () => {
  it('accepts a well-formed layout', () => {
    expect(validateLayout(hexLayout({})).valid).toBe(true);
  });

  it('rejects fewer than 2 armies', () => {
    const r = validateLayout(hexLayout({ hexPieces: { '0,0': { player: 0, type: 'king' } } }));
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/2 armies/i);
  });

  it('rejects an army with zero or two kings', () => {
    const noKing = hexLayout({});
    delete noKing.hexPieces!['-3,0'];
    noKing.hexPieces!['-3,1'] = { player: 0, type: 'rook' };
    expect(validateLayout(noKing).valid).toBe(false);
    const twoKings = hexLayout({});
    twoKings.hexPieces!['-3,1'] = { player: 0, type: 'king' };
    expect(validateLayout(twoKings).valid).toBe(false);
  });

  it('rejects pawns without promotion tiles', () => {
    expect(validateLayout(hexLayout({ promotionPositions: { 2: ['-3,1'] } })).valid).toBe(false);
  });

  it('rejects when all promote-to options are off and pawns exist', () => {
    expect(validateLayout(hexLayout({ promotionOptions: [] })).valid).toBe(false);
  });

  it('rejects pieces or promotion tiles on walls / off-board cells', () => {
    expect(validateLayout(hexLayout({ walls: ['-2,0'] })).valid).toBe(false);
    expect(validateLayout(hexLayout({ promotionPositions: { 0: ['9,9'], 2: ['-3,1'] } })).valid).toBe(false);
  });

  it('does not disturb sternhalma validation', () => {
    const stern: BoardLayout = {
      id: 's', name: 's', cells: ['0,0', '1,0'], createdAt: 0,
      startingPositions: { 0: ['0,0'] }, goalPositions: { 0: ['1,0'] },
    };
    expect(validateLayout(stern).valid).toBe(true);
  });
});
