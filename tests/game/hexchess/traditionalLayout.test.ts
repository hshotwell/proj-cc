import { describe, it, expect } from 'vitest';
import { TRADITIONAL_HEX_LAYOUT } from '@/game/hexchess/traditionalLayout';
import { validateLayout } from '@/game/layoutValidation';
import { snapshotFromLayout, hexSeatsOfSnapshot, buildGeometry, uprightRotationDeg } from '@/game/hexchess/geometry';
import { createInitialState } from '@/game/hexchess/starting';
import { cubeEquals, cubeCoord } from '@/game/coordinates';
import type { HexChessConfig } from '@/game/hexchess/state';

describe('Traditional Hex Chess built-in layout', () => {
  it('is a valid hex chess layout', () => {
    const r = validateLayout(TRADITIONAL_HEX_LAYOUT);
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it('is a 91-cell hexagon with white and black armies on seats [0, 4]', () => {
    expect(TRADITIONAL_HEX_LAYOUT.cells).toHaveLength(91);
    const snapshot = snapshotFromLayout(TRADITIONAL_HEX_LAYOUT);
    expect(hexSeatsOfSnapshot(snapshot)).toEqual([0, 4]);
    expect(TRADITIONAL_HEX_LAYOUT.defaultColors).toEqual({ 0: '#ffffff', 4: '#1a1a1a' });
    expect(TRADITIONAL_HEX_LAYOUT.rotated30).toBe(true);
  });

  it('derives opposite edge-forward directions (classic pawns) for both armies', () => {
    const geom = buildGeometry(snapshotFromLayout(TRADITIONAL_HEX_LAYOUT));
    const white = geom.forward[0]!;
    const black = geom.forward[4]!;
    expect(white.kind).toBe('edge');
    expect(black.kind).toBe('edge');
    // Exactly opposite directions
    expect(cubeEquals(cubeCoord(-black.dir.q, -black.dir.r), white.dir)).toBe(true);
    // White sits at positive r (screen bottom pre-rotation) and promotes at the
    // far side, so its forward is the up-left edge (0,-1) — which the 30-degree
    // board rotation turns into straight up on screen.
    expect(cubeEquals(white.dir, cubeCoord(0, -1))).toBe(true);
  });

  it('creates a playable initial state with 18 pieces per army, all pawns classic', () => {
    const snapshot = snapshotFromLayout(TRADITIONAL_HEX_LAYOUT);
    const config: HexChessConfig = {
      id: 't', seats: [0, 4],
      players: {
        0: { color: '#ffffff', name: 'White', isAI: false },
        4: { color: '#1a1a1a', name: 'Black', isAI: false },
      },
      layoutPreset: 'custom', ai: null, layout: snapshot,
    };
    const st = createInitialState(config);
    expect(st.pieces.filter(p => p.player === 0)).toHaveLength(18);
    expect(st.pieces.filter(p => p.player === 4)).toHaveLength(18);
    // Edge-forward armies -> engine type 'pawn' (classic chess pawn rules)
    expect(st.pieces.filter(p => p.type === 'pawn')).toHaveLength(18);
    expect(st.pieces.filter(p => p.type === 'soldier')).toHaveLength(0);
    expect(st.pieces.filter(p => p.type === 'king')).toHaveLength(2);
  });

  it('white forward becomes straight up after the 30-degree display rotation', () => {
    const geom = buildGeometry(snapshotFromLayout(TRADITIONAL_HEX_LAYOUT));
    // uprightRotationDeg = the display rotation putting the direction at -90deg
    // (screen up). For white's (0,-1) edge that is exactly the +30deg the
    // rotated30 flag already applies — so white needs no extra base rotation.
    expect(uprightRotationDeg(geom.forward[0]!.dir)).toBe(30);
    expect(uprightRotationDeg(geom.forward[4]!.dir)).toBe(-150);
  });
});
