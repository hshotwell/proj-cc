import React from 'react';

export interface PieceIconProps {
  size: number;
  fill: string;
  className?: string;
  // Fancy board rendering (smooth curves, shading, detail lines) — enabled on
  // the board when simplified pieces are off. Swatches and UI icons stay simple.
  detailed?: boolean;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function lighten(hex: string, amount: number): string {
  if (!HEX_RE.test(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function darken(hex: string, amount: number): string {
  if (!HEX_RE.test(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c * (1 - amount));
  const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// Deterministic SVG def id per piece type + fill. Pieces sharing a fill emit
// identical gradients, so duplicate ids resolve to the same definition.
export function svgIdFor(prefix: string, fill: string): string {
  return prefix + fill.replace(/[^a-zA-Z0-9_-]/g, '');
}

function luminance(hex: string): number {
  if (!HEX_RE.test(hex)) return 128;
  const n = parseInt(hex.slice(1), 16);
  return (((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255)) / 3;
}

// Outline and detail-line colors flip direction for very dark fills so black
// pieces stay legible on dark board tiles.
export function outlineFor(fill: string): string {
  return luminance(fill) < 80 ? lighten(fill, 0.5) : darken(fill, 0.5);
}

export function detailFor(fill: string): string {
  return luminance(fill) < 80 ? lighten(fill, 0.35) : darken(fill, 0.42);
}

// Cylindrical "lathe-turned" shading: dark edges with a specular band left of
// center, matching the board's upper-left light source. Very dark fills get a
// stronger specular so the shape reads on dark tiles.
export function TurnedGradient({ id, fill }: { id: string; fill: string }) {
  const specular = luminance(fill) < 80 ? 0.55 : 0.42;
  return (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stopColor={darken(fill, 0.22)} />
      <stop offset="30%" stopColor={lighten(fill, specular)} />
      <stop offset="62%" stopColor={fill} />
      <stop offset="100%" stopColor={darken(fill, 0.38)} />
    </linearGradient>
  );
}
