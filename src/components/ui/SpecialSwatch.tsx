// Shared color swatch renderers used consistently across all UI.
// Use ColorSwatch for any player color indicator — it handles all color types.

import { useId } from 'react';
import { getMetallicSwatchStyle, getGemSwatchStyle, getGemSimpleBackground, FLOWER_CENTER_COLORS, isFlowerColor, ELEMENTAL_COLORS, isEggColor } from '@/game/constants';

// Shared version of flameStarPath for swatch rendering (no seed variation needed — fixed display)
function flameStarPath(
  r: number, nTips: number, outerR: number, innerR: number,
  seedA: number, seedB: number, rotation = 0,
): string {
  const total = nTips * 2;
  const pts = Array.from({ length: total }, (_, i) => {
    const isOuter = i % 2 === 0;
    const tipIdx = Math.floor(i / 2);
    const baseAngle = rotation + (i / total) * 2 * Math.PI - Math.PI / 2;
    const jitter = isOuter ? ((seedA * (tipIdx + 1) * 31 + seedB * (tipIdx + 2) * 17) % 40 - 20) * 0.009 : 0;
    const angle = baseAngle + jitter;
    const rVar = isOuter ? outerR + ((seedB * (tipIdx + 3) * 23) % 20 - 10) * 0.012 : innerR;
    return `${(r * rVar * Math.cos(angle)).toFixed(2)},${(r * rVar * Math.sin(angle)).toFixed(2)}`;
  });
  return `M ${pts[0]} L ${pts.slice(1).join(' L ')} Z`;
}

function hexVerts(r: number): { x: number; y: number }[] {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = -Math.PI / 2 + i * (Math.PI / 3);
    return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
  });
}

function ruffledPath(R: number, bumps: number, depth: number): string {
  const pts = Array.from({ length: 96 }, (_, i) => {
    const θ = (i / 96) * 2 * Math.PI;
    const rad = R * (1 - (depth / 2) * (1 - Math.cos(bumps * θ)));
    return `${(rad * Math.cos(θ)).toFixed(2)},${(rad * Math.sin(θ)).toFixed(2)}`;
  });
  return `M ${pts[0]} L ${pts.slice(1).join(' L ')} Z`;
}

// Bismuth interference colors matching Piece.tsx BC array
const BISMUTH_SWATCH_COLORS = ['#ffd040', '#ff7a00', '#cc1166', '#8800cc', '#0077cc', '#00aa66'];

interface SpecialSwatchProps {
  color: 'rainbow' | 'opal';
  className?: string;
  title?: string;
}

export function SpecialSwatch({ color, className = '', title }: SpecialSwatchProps) {
  const uid = useId();
  if (color === 'rainbow') {
    // Opal: soft iridescent color patches on pale base, hue-rotating for play-of-color
    const r = 10;
    return (
      <svg className={`${className} rainbow-ui-filter`} viewBox={`-${r} -${r} ${r * 2} ${r * 2}`} style={{ display: 'block', borderRadius: '50%', overflow: 'hidden' }}>
        {title && <title>{title}</title>}
        <circle cx={0} cy={0} r={r} fill="#f2eeff" />
        <ellipse cx={-2.2} cy={-2.8} rx={6.2} ry={4.4} fill="rgba(255,90,210,0.52)" />
        <ellipse cx={3.4} cy={-1.4} rx={5.4} ry={4.0} fill="rgba(70,230,160,0.46)" />
        <ellipse cx={0.8} cy={3.4} rx={5.0} ry={4.2} fill="rgba(70,155,255,0.43)" />
        <ellipse cx={-3.0} cy={2.4} rx={4.4} ry={5.0} fill="rgba(185,70,255,0.37)" />
        <ellipse cx={0.2} cy={-0.4} rx={3.8} ry={3.0} fill="rgba(255,215,75,0.40)" />
        <circle cx={0} cy={0} r={r} fill="rgba(245,242,255,0.28)" />
      </svg>
    );
  }
  // Bismuth: pointy-top hex with blended oxide-layer color gradient between each wedge
  const r = 10;
  const verts = hexVerts(r);
  return (
    <svg className={className} viewBox={`-${r} -${r} ${r * 2} ${r * 2}`} style={{ display: 'block' }}>
      {title && <title>{title}</title>}
      <defs>
        {verts.map((v, i) => {
          const next = verts[(i + 1) % 6];
          return (
            <linearGradient key={i} id={`${uid}bw${i}`} gradientUnits="userSpaceOnUse"
              x1={v.x} y1={v.y} x2={next.x} y2={next.y}>
              <stop offset="0%" stopColor={BISMUTH_SWATCH_COLORS[i]} />
              <stop offset="100%" stopColor={BISMUTH_SWATCH_COLORS[(i + 1) % 6]} />
            </linearGradient>
          );
        })}
      </defs>
      {verts.map((v, i) => {
        const next = verts[(i + 1) % 6];
        return (
          <polygon key={i} points={`0,0 ${v.x},${v.y} ${next.x},${next.y}`} fill={`url(#${uid}bw${i})`} />
        );
      })}
      {verts.map((v, i) => (
        <line key={`l${i}`} x1={0} y1={0} x2={v.x} y2={v.y} stroke="rgba(200,200,200,0.45)" strokeWidth={0.35} />
      ))}
      <polygon points={verts.map(v => `${v.x},${v.y}`).join(' ')} fill="none" stroke="#c8c8c8" strokeWidth={0.5} />
    </svg>
  );
}

// ─── FlowerSwatch ────────────────────────────────────────────────────────────
// Renders a miniature flower SVG for a flower color, or a leaf-bundle for 'bouquet'.

// Petal shape config per flower (for the swatch)
const FLOWER_SWATCH_SHAPES: Record<string, {
  rx: number; ry: number; dist: number;
  petalCount?: number;          // defaults to 6
  ruffleDepth?: number;
  ruffleR?: number;
  ruffleBumps?: number;         // defaults to 6
  ruffleRotation?: number;      // rotate entire flower
  innerLayer?: boolean;         // inner rotated ruffled layer instead of center dot
  centerAsRuffled?: boolean;    // render center as smaller ruffled shape
  petalTips?: boolean;          // small triangle tip at each ruffled petal peak
  petalPoints?: boolean;        // small pointed triangle tip at outer end of each ellipse petal
  darkLayerColor?: string;      // if set with petalTips: outer ring uses this color, inner uses key color
  cloverLeaf?: boolean;         // 4-leaf clover rendering
  innerPetals?: { count: number; rx: number; ry: number; dist: number };
}> = {
  '#d4364e': { rx: 0.25, ry: 0.38, dist: 0.44, ruffleDepth: 0.14, ruffleR: 0.86, innerLayer: true }, // Rose
  '#e8b800': { rx: 0.16, ry: 0.46, dist: 0.45, petalCount: 6, innerPetals: { count: 6, rx: 0.16, ry: 0.46, dist: 0.45 } }, // Sunflower — 12 equal petals
  '#5ba3d9': { rx: 0.22, ry: 0.37, dist: 0.50, petalCount: 5 }, // Forget-me-not — 5 petals
  '#5040cc': { rx: 0.24, ry: 0.36, dist: 0.44, petalCount: 5, ruffleDepth: 0.20, ruffleR: 0.88, ruffleBumps: 5, ruffleRotation: -90 }, // Violet
  '#f090b0': { rx: 0.27, ry: 0.41, dist: 0.49, petalCount: 5 }, // Cherry Blossom — 5 petals
  '#241848': { rx: 0.22, ry: 0.46, dist: 0.38, petalCount: 6, petalPoints: true, innerPetals: { count: 6, rx: 0.19, ry: 0.34, dist: 0.28 } }, // Black Lotus
  '#f4f0e8': { rx: 0.22, ry: 0.50, dist: 0.47 }, // White Lily
  '#4a9e60': { rx: 0.22, ry: 0.37, dist: 0.30, petalCount: 4, cloverLeaf: true }, // Clover — 4-leaf
  '#b4b8cc': { rx: 0.24, ry: 0.36, dist: 0.44, petalCount: 5, ruffleDepth: 0.12, ruffleR: 0.88, ruffleBumps: 5, centerAsRuffled: true, ruffleRotation: -90 }, // Grey Hibiscus — orange-red center
};

interface FlowerSwatchProps {
  color: string; // hex flower color or 'bouquet'
  className?: string;
  title?: string;
}

function renderSwatchFlower(key: string, r: number, miniS: number) {
  const s = FLOWER_SWATCH_SHAPES[key] ?? { rx: 0.24, ry: 0.37, dist: 0.43 };
  const cColor = FLOWER_CENTER_COLORS[key] ?? '#333';
  const cR = (key === '#e8b800' ? 0.30 : 0.22) * r * miniS;
  const petalCount = s.petalCount ?? 6;

  if (s.cloverLeaf) {
    const leafSize = r * miniS * 0.90;
    const leafDist = r * miniS * 0.47;
    return (
      <>
        {[45, 135, 225, 315].map(angle => (
          <g key={angle} transform={`rotate(${angle}) translate(0,${-leafDist})`}>
            <path d={heartPath(leafSize)} fill={key} />
          </g>
        ))}
        <circle r={r * miniS * 0.14} fill={FLOWER_CENTER_COLORS[key] ?? '#1a5228'} />
      </>
    );
  }
  if (s.ruffleDepth !== undefined) {
    const bumps = s.ruffleBumps ?? 6;
    const rR = (s.ruffleR ?? 0.78) * r * miniS;
    const rot = s.ruffleRotation !== undefined ? `rotate(${s.ruffleRotation})` : undefined;
    const innerRotation = `rotate(${(180 / bumps).toFixed(1)})`;
    const mkTips = (radius: number, fill: string) => Array.from({ length: bumps }, (_, i) => {
      const θ = i * 2 * Math.PI / bumps;
      const tipH = radius * 0.12, baseW = radius * 0.07;
      const baseR = radius * 0.94;
      const tx = (radius + tipH) * Math.cos(θ), ty = (radius + tipH) * Math.sin(θ);
      const lx = baseR * Math.cos(θ) - baseW * Math.sin(θ), ly = baseR * Math.sin(θ) + baseW * Math.cos(θ);
      const rx2 = baseR * Math.cos(θ) + baseW * Math.sin(θ), ry2 = baseR * Math.sin(θ) - baseW * Math.cos(θ);
      return <polygon key={i} points={`${tx.toFixed(2)},${ty.toFixed(2)} ${lx.toFixed(2)},${ly.toFixed(2)} ${rx2.toFixed(2)},${ry2.toFixed(2)}`} fill={fill} />;
    });
    const inner = s.innerLayer ? (
      <>
        <path d={ruffledPath(rR, bumps, s.ruffleDepth)} fill={key} />
        <path d={ruffledPath(rR * 0.58, bumps, s.ruffleDepth)} fill={darkenHex(key, 0.45)} transform={`rotate(${(180 / bumps).toFixed(1)})`} />
      </>
    ) : s.petalTips && s.darkLayerColor ? (
      // Lotus: dark outer ring + tips + circle center (no inner ring, matches simple mode)
      <>
        <path d={ruffledPath(rR, bumps, s.ruffleDepth)} fill={s.darkLayerColor} />
        {mkTips(rR, s.darkLayerColor)}
        <circle r={cR} fill={cColor} />
      </>
    ) : (
      <>
        <path d={ruffledPath(rR, bumps, s.ruffleDepth)} fill={key} />
        {s.petalTips && mkTips(rR, key)}
        {s.centerAsRuffled
          ? <path d={ruffledPath(rR * 0.28, bumps, s.ruffleDepth)} fill={cColor} />
          : <circle r={cR} fill={cColor} />
        }
      </>
    );
    return rot ? <g transform={rot}>{inner}</g> : inner;
  }
  return (
    <>
      {Array.from({ length: petalCount }, (_, j) => {
        const pRy = s.ry * r * miniS, pRx = s.rx * r * miniS, pDist = s.dist * r * miniS;
        return (
          <g key={j} transform={`rotate(${j * (360 / petalCount)})`}>
            <ellipse cx={0} cy={-pDist} rx={pRx} ry={pRy} fill={key} />
            {s.petalPoints && <polygon
              points={`0,${(-(pDist + pRy * 1.18)).toFixed(2)} ${(-pRx * 0.35).toFixed(2)},${(-(pDist + pRy * 0.92)).toFixed(2)} ${(pRx * 0.35).toFixed(2)},${(-(pDist + pRy * 0.92)).toFixed(2)}`}
              fill={key}
            />}
          </g>
        );
      })}
      {s.innerPetals && Array.from({ length: s.innerPetals.count }, (_, j) => {
        const iStep = 360 / s.innerPetals!.count;
        const iRy = s.innerPetals!.ry * r * miniS, iRx = s.innerPetals!.rx * r * miniS, iDist = s.innerPetals!.dist * r * miniS;
        return (
          <g key={`ip${j}`} transform={`rotate(${j * iStep + iStep / 2})`}>
            <ellipse cx={0} cy={-iDist} rx={iRx} ry={iRy} fill={key} />
            {s.petalPoints && <polygon
              points={`0,${(-(iDist + iRy * 1.18)).toFixed(2)} ${(-iRx * 0.35).toFixed(2)},${(-(iDist + iRy * 0.92)).toFixed(2)} ${(iRx * 0.35).toFixed(2)},${(-(iDist + iRy * 0.92)).toFixed(2)}`}
              fill={key}
            />}
          </g>
        );
      })}
      <circle r={cR} fill={cColor} />
    </>
  );
}

// Simple hex color lightener / darkener for layer effects
function lightenHex(hex: string, amt: number): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const nr = Math.round(r + (255 - r) * amt);
  const ng = Math.round(g + (255 - g) * amt);
  const nb = Math.round(b + (255 - b) * amt);
  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
}
function darkenHex(hex: string, amt: number): string {
  const c = hex.replace('#', '');
  const r = Math.round(parseInt(c.substring(0, 2), 16) * (1 - amt));
  const g = Math.round(parseInt(c.substring(2, 4), 16) * (1 - amt));
  const b = Math.round(parseInt(c.substring(4, 6), 16) * (1 - amt));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Smooth clover leaf path (mirrors Piece.tsx heartLeafPath)
function heartPath(s: number): string {
  const tipY = s * 0.52;
  const topY = -s * 0.50;
  const w = s * 0.60;
  return [
    `M 0,${tipY.toFixed(2)}`,
    `C ${(-w * 1.05).toFixed(2)},${(s * 0.25).toFixed(2)} ${(-w).toFixed(2)},${topY.toFixed(2)} ${(-w * 0.28).toFixed(2)},${topY.toFixed(2)}`,
    `C ${(-w * 0.06).toFixed(2)},${(topY + s * 0.05).toFixed(2)} ${(w * 0.06).toFixed(2)},${(topY + s * 0.05).toFixed(2)} ${(w * 0.28).toFixed(2)},${topY.toFixed(2)}`,
    `C ${w.toFixed(2)},${topY.toFixed(2)} ${(w * 1.05).toFixed(2)},${(s * 0.25).toFixed(2)} 0,${tipY.toFixed(2)}`,
    `Z`,
  ].join(' ');
}

export function FlowerSwatch({ color, className = '', title }: FlowerSwatchProps) {
  const r = 9; // SVG radius units (viewBox -10 -10 20 20)

  if (color === 'bouquet') {
    // Sunflower top, then clockwise: violet, cherry blossom, forget-me-not, rose
    const BOUQUET_MINIS = [
      { cx:  0.000, cy: -0.360, key: '#e8b800' }, // Sunflower — top
      { cx:  0.342, cy: -0.111, key: '#5040cc' }, // Violet — upper-right
      { cx:  0.212, cy:  0.291, key: '#f090b0' }, // Cherry Blossom — lower-right
      { cx: -0.212, cy:  0.291, key: '#5ba3d9' }, // Forget-me-not — lower-left
      { cx: -0.342, cy: -0.111, key: '#d4364e' }, // Rose — upper-left
    ];
    const miniS = 0.40;
    return (
      <svg className={className} viewBox="-10 -10 20 20" style={{ display: 'block' }}>
        {title && <title>{title}</title>}
        <g transform="scale(1.35)">
          {/* Center green fill */}
          <circle r={r * 0.16} fill="#133816" />
          {/* Outer 5 longer leaves — between flower positions */}
          {[0, 1, 2, 3, 4].map(i => (
            <g key={`lfo${i}`} transform={`rotate(${i * 72 + 36})`}>
              <polygon points={`0,${(-r * 0.72).toFixed(2)} ${(r * 0.17).toFixed(2)},${(-r * 0.15).toFixed(2)} ${(-r * 0.17).toFixed(2)},${(-r * 0.15).toFixed(2)}`} fill="#1a4f1e" />
            </g>
          ))}
          {/* Inner 5 shorter leaves — at flower positions */}
          {[0, 1, 2, 3, 4].map(i => (
            <g key={`lfi${i}`} transform={`rotate(${i * 72})`}>
              <polygon points={`0,${(-r * 0.50).toFixed(2)} ${(r * 0.13).toFixed(2)},${(-r * 0.12).toFixed(2)} ${(-r * 0.13).toFixed(2)},${(-r * 0.12).toFixed(2)}`} fill="#133816" />
            </g>
          ))}
          {BOUQUET_MINIS.map(({ cx: dx, cy: dy, key }, i) => (
            <g key={i} transform={`translate(${(dx * r).toFixed(2)},${(dy * r).toFixed(2)})`}>
              {renderSwatchFlower(key, r, miniS)}
            </g>
          ))}
        </g>
      </svg>
    );
  }

  const shape = FLOWER_SWATCH_SHAPES[color.toLowerCase()] ?? { rx: 0.24, ry: 0.37, dist: 0.43 };
  const centerColor = FLOWER_CENTER_COLORS[color.toLowerCase()] ?? '#333';
  const petalCount = shape.petalCount ?? 6;
  const centerR = color === '#e8b800' ? r * 0.30 : r * 0.22;

  if (shape.cloverLeaf) {
    const leafSize = r * 0.90;
    const leafDist = r * 0.47;
    return (
      <svg className={className} viewBox="-10 -10 20 20" style={{ display: 'block' }}>
        {title && <title>{title}</title>}
        {[45, 135, 225, 315].map(angle => (
          <g key={angle} transform={`rotate(${angle}) translate(0,${-leafDist})`}>
            <path d={heartPath(leafSize)} fill={color} />
          </g>
        ))}
        <circle r={r * 0.14} fill={centerColor} />
      </svg>
    );
  }

  if (shape.ruffleDepth !== undefined) {
    const bumps = shape.ruffleBumps ?? 6;
    const rR = (shape.ruffleR ?? 0.78) * r;
    const innerRotation = `rotate(${(180 / bumps).toFixed(1)})`;
    const wrapRot = shape.ruffleRotation !== undefined ? `rotate(${shape.ruffleRotation})` : undefined;
    const mkTips2 = (radius: number, fill: string) => Array.from({ length: bumps }, (_, i) => {
      const θ = i * 2 * Math.PI / bumps;
      const tipH = radius * 0.12, baseW = radius * 0.07;
      const baseR = radius * 0.94;
      const tx = (radius + tipH) * Math.cos(θ), ty = (radius + tipH) * Math.sin(θ);
      const lx = baseR * Math.cos(θ) - baseW * Math.sin(θ), ly = baseR * Math.sin(θ) + baseW * Math.cos(θ);
      const rx2 = baseR * Math.cos(θ) + baseW * Math.sin(θ), ry2 = baseR * Math.sin(θ) - baseW * Math.cos(θ);
      return <polygon key={i} points={`${tx.toFixed(2)},${ty.toFixed(2)} ${lx.toFixed(2)},${ly.toFixed(2)} ${rx2.toFixed(2)},${ry2.toFixed(2)}`} fill={fill} />;
    });
    const content = shape.petalTips && shape.darkLayerColor ? (
      // Lotus: dark outer ring + tips + circle center (no inner ring, matches simple mode)
      <>
        <path d={ruffledPath(rR, bumps, shape.ruffleDepth)} fill={shape.darkLayerColor} />
        {mkTips2(rR, shape.darkLayerColor)}
        <circle r={centerR} fill={centerColor} />
      </>
    ) : (
      <>
        <path d={ruffledPath(rR, bumps, shape.ruffleDepth)} fill={color} />
        {shape.innerLayer ? (
          <path d={ruffledPath(rR * 0.58, bumps, shape.ruffleDepth)} fill={darkenHex(color, 0.45)} transform={innerRotation} />
        ) : shape.centerAsRuffled ? (
          <path d={ruffledPath(rR * 0.28, bumps, shape.ruffleDepth)} fill={centerColor} />
        ) : (
          <>
            {shape.petalTips && mkTips2(rR, color)}
            <circle r={centerR} fill={centerColor} />
          </>
        )}
      </>
    );
    return (
      <svg className={className} viewBox="-10 -10 20 20" style={{ display: 'block' }}>
        {title && <title>{title}</title>}
        {wrapRot ? <g transform={wrapRot}>{content}</g> : content}
      </svg>
    );
  }

  return (
    <svg className={className} viewBox="-10 -10 20 20" style={{ display: 'block' }}>
      {title && <title>{title}</title>}
      {Array.from({ length: petalCount }, (_, i) => {
        const pRy = shape.ry * r, pRx = shape.rx * r, pDist = shape.dist * r;
        return (
          <g key={i} transform={`rotate(${i * (360 / petalCount)})`}>
            <ellipse cx={0} cy={-pDist} rx={pRx} ry={pRy} fill={color} />
            {shape.petalPoints && <polygon
              points={`0,${(-(pDist + pRy * 1.18)).toFixed(2)} ${(-pRx * 0.35).toFixed(2)},${(-(pDist + pRy * 0.92)).toFixed(2)} ${(pRx * 0.35).toFixed(2)},${(-(pDist + pRy * 0.92)).toFixed(2)}`}
              fill={color}
            />}
          </g>
        );
      })}
      {shape.innerPetals && Array.from({ length: shape.innerPetals.count }, (_, i) => {
        const iStep = 360 / shape.innerPetals!.count;
        const iRy = shape.innerPetals!.ry * r, iRx = shape.innerPetals!.rx * r, iDist = shape.innerPetals!.dist * r;
        return (
          <g key={`ip${i}`} transform={`rotate(${i * iStep + iStep / 2})`}>
            <ellipse cx={0} cy={-iDist} rx={iRx} ry={iRy} fill={color} />
            {shape.petalPoints && <polygon
              points={`0,${(-(iDist + iRy * 1.18)).toFixed(2)} ${(-iRx * 0.35).toFixed(2)},${(-(iDist + iRy * 0.92)).toFixed(2)} ${(iRx * 0.35).toFixed(2)},${(-(iDist + iRy * 0.92)).toFixed(2)}`}
              fill={color}
            />}
          </g>
        );
      })}
      <circle r={centerR} fill={centerColor} />
    </svg>
  );
}

// Pre-computed emu dot path for swatch (rx=6.8, ryTop=8.8). Single path = no per-render work.
const EMU_DOT_PATH_SW: string = (() => {
  const step = 1.36, dotR = step * 0.44, jAmp = step * 0.20;
  const segs: string[] = [];
  for (let row = -7; row <= 6; row++) {
    for (let col = -8; col <= 8; col++) {
      const bx = (col + (Math.abs(row) % 2 === 0 ? 0 : 0.5)) * step * 0.95;
      const by = row * step * 0.82;
      const h = Math.abs(row * 1327 + col * 863) & 0x7fff;
      const jx = ((h * 37 + 7) % 200 - 100) / 100 * jAmp;
      const jy = ((h * 53 + 13) % 200 - 100) / 100 * jAmp;
      const x = bx + jx, y = by + jy;
      if (Math.sqrt((x / 6.8) ** 2 + (y / 8.8) ** 2) < 1.07)
        segs.push(`M${(x - dotR).toFixed(2)},${y.toFixed(2)}a${dotR.toFixed(2)},${dotR.toFixed(2)} 0 1,0 ${(2 * dotR).toFixed(2)},0a${dotR.toFixed(2)},${dotR.toFixed(2)} 0 1,0 ${(-2 * dotR).toFixed(2)},0`);
    }
  }
  return segs.join('');
})();

// Same crack network as VOLCANIC_CRACK_D in Piece.tsx — normalized to pieceRadius=1.
// In swatch context use <g transform="scale(9.19)"> (rx=6.8 / ERX=0.74).
const VOLCANIC_CRACK_D_SW: string = (() => {
  const nodes: Record<string, [number, number]> = {
    n0: [0.02, -0.64], n1: [-0.34, -0.22], n2: [0.38, -0.18],
    n3: [-0.46, 0.14], n4: [0.12,  0.08],  n5: [0.50,  0.20],
    n6: [-0.14, 0.52], n7: [0.36,  0.52],
    et:  [0.02, -1.0], eul: [-0.64, -0.60], el:  [-0.80,  0.12],
    eur: [0.66, -0.50], er: [0.80,   0.22],
    ebl: [-0.38, 1.0], ebr: [0.36,   1.0],
  };
  const edges: [string, string][] = [
    ['et', 'n0'], ['n0', 'n1'], ['n0', 'n2'],
    ['n1', 'eul'], ['n1', 'n3'], ['n3', 'el'],
    ['n2', 'eur'], ['n2', 'n5'], ['n5', 'er'],
    ['n3', 'n4'], ['n4', 'n5'],
    ['n4', 'n6'], ['n6', 'ebl'],
    ['n6', 'n7'], ['n7', 'ebr'],
    ['n5', 'n7'],
  ];
  return edges.map(([a, b]) => {
    const [x1, y1] = nodes[a], [x2, y2] = nodes[b];
    return `M${x1.toFixed(2)},${y1.toFixed(2)}L${x2.toFixed(2)},${y2.toFixed(2)}`;
  }).join('');
})();

// ─── EggSwatch ───────────────────────────────────────────────────────────────
// Animated SVG swatch for egg colors.

const EGG_COLOR_SET_SW = new Set([
  '#8a1818', '#d4a020', '#b8d890', '#50c0b0', '#4878c0',
  '#7030a0', '#181010', '#b8b8b8', '#f4f4f0', '#f0c8e8',
]);

function eggPath(rx: number, ryTop: number, ryBot: number): string {
  const magic = 0.5523;
  return [
    `M 0,${(-ryTop).toFixed(2)}`,
    `C ${(rx * 0.55).toFixed(2)},${(-ryTop).toFixed(2)} ${rx.toFixed(2)},${(-ryTop * 0.45).toFixed(2)} ${rx.toFixed(2)},0`,
    `C ${rx.toFixed(2)},${(ryBot * magic).toFixed(2)} ${(rx * magic).toFixed(2)},${ryBot.toFixed(2)} 0,${ryBot.toFixed(2)}`,
    `C ${(-rx * magic).toFixed(2)},${ryBot.toFixed(2)} ${(-rx).toFixed(2)},${(ryBot * magic).toFixed(2)} ${(-rx).toFixed(2)},0`,
    `C ${(-rx).toFixed(2)},${(-ryTop * 0.45).toFixed(2)} ${(-rx * 0.55).toFixed(2)},${(-ryTop).toFixed(2)} 0,${(-ryTop).toFixed(2)}`,
    `Z`,
  ].join(' ');
}

interface EggSwatchProps {
  color: string;
  className?: string;
  title?: string;
}

export function EggSwatch({ color, className = '', title }: EggSwatchProps) {
  const rx = 6.8, ryTop = 8.8, ryBot = 8.0;
  const ep = eggPath(rx, ryTop, ryBot);
  const bc = color.toLowerCase();
  let inner: React.ReactNode = null;

  if (bc === '#8a1818') { // Dragon Egg — full coverage overlapping scales
    const ss = rx * 0.32;
    const scales: { x: number; y: number; row: number }[] = [];
    for (let row = -7; row <= 4; row++) {
      for (let col = -5; col <= 5; col++) {
        const x = col * ss * 0.88 + (row % 2 === 0 ? 0 : ss * 0.44);
        const y = row * ss * 0.68;
        if (Math.sqrt((x / rx) ** 2 + (y / ryTop) ** 2) < 1.1) scales.push({ x, y, row });
      }
    }
    scales.sort((a, b) => a.row - b.row);
    const getScaleColor = (row: number) => {
      const t = Math.max(0, Math.min(1, (row + 8) / 13));
      const r = Math.round(232 - t * 168).toString(16).padStart(2, '0');
      const g = Math.round(56 - t * 52).toString(16).padStart(2, '0');
      const b = Math.round(56 - t * 52).toString(16).padStart(2, '0');
      return `#${r}${g}${b}`;
    };
    inner = (
      <>
        <defs><clipPath id="eggsw-dragon-clip"><path d={ep} /></clipPath></defs>
        <path d={ep} fill="#3a0404" />
        <g clipPath="url(#eggsw-dragon-clip)">
          {scales.map((s, i) => {
            const scaleColor = getScaleColor(s.row);
            return (
              <polygon key={i}
                points={`${s.x.toFixed(1)},${(s.y - ss * 0.75).toFixed(1)} ${(s.x + ss * 0.48).toFixed(1)},${s.y.toFixed(1)} ${s.x.toFixed(1)},${(s.y + ss * 0.25).toFixed(1)} ${(s.x - ss * 0.48).toFixed(1)},${s.y.toFixed(1)}`}
                fill={scaleColor} stroke={scaleColor} strokeWidth={0.12}
              />
            );
          })}
        </g>
      </>
    );
  } else if (bc === '#d4a020') { // Golden Egg — metallic gold style sheen + twinkles
    const sheenW = rx * 0.55;
    inner = (
      <>
        <defs>
          <clipPath id="eggsw-gold-clip"><path d={ep} /></clipPath>
          <linearGradient id="eggsw-gold-sh" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(255,255,200,0)" />
            <stop offset="20%" stopColor="rgba(255,255,200,0.10)" />
            <stop offset="45%" stopColor="rgba(255,255,200,0.40)" />
            <stop offset="55%" stopColor="rgba(255,255,200,0.40)" />
            <stop offset="80%" stopColor="rgba(255,255,200,0.10)" />
            <stop offset="100%" stopColor="rgba(255,255,200,0)" />
          </linearGradient>
          <linearGradient id="eggsw-gold-sh2" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(255,255,200,0)" />
            <stop offset="30%" stopColor="rgba(255,255,200,0.35)" />
            <stop offset="50%" stopColor="rgba(255,255,200,0.70)" />
            <stop offset="70%" stopColor="rgba(255,255,200,0.35)" />
            <stop offset="100%" stopColor="rgba(255,255,200,0)" />
          </linearGradient>
        </defs>
        <path d={ep} fill="#d4a020" />
        {[
          { cx: -rx * 0.30, cy: -ryTop * 0.25, s: 0.8, delay: 0, dur: 5 },
          { cx: rx * 0.28, cy: -ryTop * 0.38, s: 0.6, delay: 0.9, dur: 6 },
          { cx: rx * 0.08, cy: ryTop * 0.32, s: 0.7, delay: 1.8, dur: 7 },
        ].map((t, i) => (
          <g key={i} className="metallic-twinkle" style={{ '--twinkle-delay': `${t.delay}s`, '--twinkle-dur': `${t.dur}s`, transformOrigin: `${t.cx}px ${t.cy}px` } as React.CSSProperties}>
            <line x1={t.cx - rx * 0.2 * t.s} y1={t.cy} x2={t.cx + rx * 0.2 * t.s} y2={t.cy} stroke="rgba(255,255,200,1)" strokeWidth={0.5} strokeLinecap="round" />
            <line x1={t.cx} y1={t.cy - rx * 0.2 * t.s} x2={t.cx} y2={t.cy + rx * 0.2 * t.s} stroke="rgba(255,255,200,1)" strokeWidth={0.5} strokeLinecap="round" />
          </g>
        ))}
        <g clipPath="url(#eggsw-gold-clip)">
          <rect x={-sheenW / 2} y={-ryTop * 1.4} width={sheenW} height={(ryTop + ryBot) * 2.8}
            fill="url(#eggsw-gold-sh)"
            style={{ transform: `rotate(35deg) translateX(${(rx * 0.6).toFixed(1)}px)` }} />
          <g transform="rotate(35)">
            <rect x={-sheenW * 0.35} y={-ryTop * 1.4} width={sheenW * 0.7} height={(ryTop + ryBot) * 2.8}
              fill="url(#eggsw-gold-sh2)">
              <animateTransform attributeName="transform" type="translate"
                from={`${(rx * 2.5).toFixed(1)} 0`} to={`${(-rx * 2.5).toFixed(1)} 0`}
                dur="2.2s" repeatCount="indefinite" />
            </rect>
          </g>
        </g>
      </>
    );
  } else if (bc === '#b8d890') { // Dino Egg — 3 fixed spots: circle, tall egg, wide oval
    // Proportional to swatch dims: rx=6.8, ryTop=8.8
    // Proportional to swatch dims (rx=6.8, ryTop=8.8, ryBot=8.0) — mirrors Piece.tsx layout
    const dinoSpots: [number, number, number, number, number][] = [
      // Interior
      [ 2.2, -3.3, 1.2, 1.9,  5],  // upper-right teardrop
      [ 0.5, -1.6, 0.5, 0.7,  0],  // small upper-center dot
      [-1.7,  0.4, 1.5, 1.5, -8],  // large left-center oval
      [-1.2,  2.3, 0.5, 0.5,  0],  // small dot below left
      [ 1.5,  2.1, 1.6, 1.6, 10],  // large right-center oval
      [-2.0,  4.4, 1.2, 1.1, -5],  // lower-left oval
      // Edge-clipping
      [-7.3,  0.0, 2.0, 2.1,  5],  // left edge
      [ 7.1,  0.7, 1.9, 1.9,-10],  // right edge
      [ 1.5, -8.4, 1.4, 1.8, 15],  // top edge
      [ 2.6,  7.4, 1.8, 1.6, -5],  // bottom-right edge
    ];
    inner = (
      <>
        <defs><clipPath id="eggsw-dino"><path d={ep} /></clipPath></defs>
        <path d={ep} fill="#b8d890" />
        <g clipPath="url(#eggsw-dino)">
          {dinoSpots.map(([cx, cy, rxb, ryb, rot], i) => (
            <g key={i} transform={`rotate(${rot}, ${cx}, ${cy})`}>
              <ellipse cx={cx} cy={cy} rx={rxb} ry={ryb}
                fill="#6a8040" opacity={0.85} />
            </g>
          ))}
        </g>
      </>
    );
  } else if (bc === '#50c0b0') { // Robin Egg — light blue + brown spots
    const robinSpots: [number, number, number, number, number][] = [
      // Interior
      [-1.5, -4.6, 0.9, 1.5,  -5],
      [ 2.6, -1.8, 0.6, 0.6,   0],
      [-2.6,  0.9, 1.2, 0.9,  12],
      [ 1.0,  3.5, 0.5, 0.9,   0],
      [-0.7, -1.3, 0.4, 0.4,   0],
      [ 2.4,  4.8, 0.7, 0.7,   0],
      [-2.0, -6.2, 0.4, 0.4,   0],
      [ 1.3, -2.6, 0.4, 0.7,   8],
      [-1.3,  6.0, 0.6, 0.6,   0],
      [ 3.5, -4.4, 0.5, 0.5,   0],
      [-3.6,  3.7, 0.4, 0.4,   0],
      // Edge-clipping
      [ 7.2, -2.2, 1.4, 1.6,   5],
      [-0.3, -8.6, 1.3, 1.4,   0],
      [-7.1,  2.6, 1.5, 1.4,  -5],
    ];
    inner = (
      <>
        <defs><clipPath id="eggsw-robin-clip"><path d={ep} /></clipPath></defs>
        <path d={ep} fill="#70c0d8" />
        <g clipPath="url(#eggsw-robin-clip)">
          {robinSpots.map(([cx, cy, rxb, ryb, rot], i) => (
            <g key={i} transform={`rotate(${rot}, ${cx}, ${cy})`}>
              <ellipse cx={cx} cy={cy} rx={rxb} ry={ryb} fill="#1a4898" opacity={0.85} />
            </g>
          ))}
        </g>
      </>
    );
  } else if (bc === '#4878c0') { // Emu Egg — deep blue base, lighter blue dots
    inner = (
      <>
        <defs><clipPath id="eggsw-emu-clip"><path d={ep} /></clipPath></defs>
        <path d={ep} fill="#1040a8" />
        <g clipPath="url(#eggsw-emu-clip)">
          <path d={EMU_DOT_PATH_SW} fill="#20b8a0" opacity={0.62} />
        </g>
      </>
    );
  } else if (bc === '#7030a0') { // Kraken Egg — bottom fill + mid stripe + tentacle nub
    const sc = '#c040e8';
    const ox = rx * 1.5;
    const fillPath = [
      `M ${(-ox).toFixed(1)},${(ryBot*0.58).toFixed(1)}`,
      `C ${(-rx*0.22).toFixed(1)},${(ryBot*0.68).toFixed(1)} ${(rx*0.28).toFixed(1)},${(ryBot*0.36).toFixed(1)} ${ox.toFixed(1)},${(ryBot*0.28).toFixed(1)}`,
      `L ${ox.toFixed(1)},${(ryBot*1.5).toFixed(1)}`,
      `L ${(-ox).toFixed(1)},${(ryBot*1.5).toFixed(1)} Z`,
    ].join(' ');
    const stripePath = `M ${(-ox).toFixed(1)},${(ryBot*0.10).toFixed(1)} C ${(-rx*0.20).toFixed(1)},${(ryBot*0.36).toFixed(1)} ${(rx*0.20).toFixed(1)},${(-ryTop*0.16).toFixed(1)} ${ox.toFixed(1)},${(ryBot*0.04).toFixed(1)}`;
    const tentaclePath = `M ${(-ox).toFixed(1)},${(-ryTop*0.28).toFixed(1)} C ${(-rx*0.08).toFixed(1)},${(-ryTop*0.22).toFixed(1)} ${(rx*0.10).toFixed(1)},${(-ryTop*0.48).toFixed(1)} ${(rx*0.06).toFixed(1)},${(-ryTop*0.64).toFixed(1)}`;
    inner = (
      <>
        <defs><clipPath id="eggsw-kraken-clip"><path d={ep} /></clipPath></defs>
        <path d={ep} fill="#7030a0" />
        <g clipPath="url(#eggsw-kraken-clip)">
          <path d={fillPath} fill={sc} opacity={0.75} />
          <path d={stripePath} fill="none" stroke={sc} strokeWidth={1.6} strokeLinecap="round" opacity={0.75} />
          <path d={tentaclePath} fill="none" stroke={sc} strokeWidth={1.6} strokeLinecap="round" opacity={0.75} />
        </g>
      </>
    );
  } else if (bc === '#181010') { // Volcanic Egg — Voronoi lava crack network
    inner = (
      <>
        <defs><clipPath id="eggsw-volcanic"><path d={ep} /></clipPath></defs>
        <path d={ep} fill="#181010" />
        <g clipPath="url(#eggsw-volcanic)">
          <g transform="scale(9.19)">
            <path d={VOLCANIC_CRACK_D_SW} fill="none" stroke="#ff8800" strokeWidth={0.030} strokeLinecap="round" />
          </g>
        </g>
      </>
    );
  } else if (bc === '#b8b8b8') { // Penguin Egg — grey with dark grey spots
    const penguinSpots: [number, number, number, number, number][] = [
      // Interior — [cx, cy, rx, ry, rotation]
      [ 1.4, -4.8,  0.8, 1.4,  10],
      [-2.7, -1.9,  0.7, 0.7,   0],
      [ 2.9,  1.1,  1.0, 1.0,  -8],
      [-0.8,  3.9,  0.5, 1.1,   0],
      [ 0.5, -1.6,  0.5, 0.5,   0],
      [-2.2,  5.1,  0.7, 0.7,   0],
      [ 1.9, -5.8,  0.5, 0.5,   0],
      [-1.4, -2.8,  0.4, 0.8,  -6],
      [ 1.1,  6.2,  0.6, 0.6,   0],
      [-3.4, -4.8,  0.5, 0.5,   0],
      [ 3.4,  3.9,  0.5, 0.5,   0],
      // Edge-clipping
      [-7.2, -1.9,  1.4, 1.6,   5],
      [ 0.4, -8.6,  1.2, 1.3,   0],
      [ 7.1,  2.5,  1.5, 1.4,  -5],
    ];
    inner = (
      <>
        <defs><clipPath id="eggsw-penguin-clip"><path d={ep} /></clipPath></defs>
        <path d={ep} fill="#b8b8b8" />
        <g clipPath="url(#eggsw-penguin-clip)">
          {penguinSpots.map(([cx, cy, rxb, ryb, rot], i) => (
            <g key={i} transform={`rotate(${rot}, ${cx}, ${cy})`}>
              <ellipse cx={cx} cy={cy} rx={rxb} ry={ryb} fill="#505050" opacity={0.80} />
            </g>
          ))}
        </g>
      </>
    );
  } else if (bc === '#f4f4f0') { // Egg — flat fill
    inner = <path d={ep} fill="#f4f4f0" />;
  } else if (bc === '#f0c8e8') { // Easter Egg — flat fill + stripes
    const stripeColors = ['#c050e8', '#4080e8', '#30c870', '#f0e030', '#f09020', '#e83030'];
    const totalH = ryTop + ryBot;
    const stripeH = totalH * 0.11;
    const stripeSpacing = totalH * 0.16;
    const startY = -ryTop * 0.75;
    inner = (
      <>
        <defs><clipPath id="eggsw-easter"><path d={ep} /></clipPath></defs>
        <path d={ep} fill="#f0c8e8" />
        <g clipPath="url(#eggsw-easter)">
          {stripeColors.map((sc, i) => (
            <rect key={i} x={-rx * 1.2} y={startY + i * stripeSpacing - stripeH * 0.5}
              width={rx * 2.4} height={stripeH} fill={sc} opacity={0.70} />
          ))}
        </g>
      </>
    );
  }

  return (
    <svg className={className} viewBox="-10 -10 20 20" style={{ display: 'block' }}>
      {title && <title>{title}</title>}
      {inner}
    </svg>
  );
}

// ─── ElementalSwatch ─────────────────────────────────────────────────────────
// Animated SVG swatch for elemental colors (fire, lightning, grass, etc.)

const ELEMENTAL_SET = new Set(ELEMENTAL_COLORS);

interface ElementalSwatchProps {
  color: string;
  className?: string;
  title?: string;
}

export function ElementalSwatch({ color, className = '', title }: ElementalSwatchProps) {
  const r = 9;
  let inner: React.ReactNode = null;
  if (color === 'fire') {
    // Fixed seeds for consistent swatch appearance
    const s1 = 42, s2 = 17, s3 = 31;
    inner = (
      <>
        <path d={flameStarPath(r, 8, 1.30, 0.62, s1, s2, 0)} fill="#cc1800">
          <animate attributeName="opacity" values="0.7;1.0;0.8;1.0;0.7" dur="1.1s" repeatCount="indefinite" />
        </path>
        <path d={flameStarPath(r, 7, 1.05, 0.55, s2, s3, 0.45)} fill="#ff5500">
          <animate attributeName="opacity" values="0.8;1.0;0.85;1.0;0.8" dur="0.9s" repeatCount="indefinite" begin="-0.3s" />
        </path>
        <path d={flameStarPath(r, 6, 0.80, 0.42, s3, s1, 0.90)} fill="#ffaa00">
          <animate attributeName="opacity" values="0.85;1.0;0.9;1.0;0.85" dur="0.75s" repeatCount="indefinite" begin="-0.2s" />
        </path>
        <circle r={r * 0.28} fill="#ffe060">
          <animate attributeName="r" values={`${(r*0.22).toFixed(1)};${(r*0.34).toFixed(1)};${(r*0.24).toFixed(1)};${(r*0.34).toFixed(1)};${(r*0.22).toFixed(1)}`} dur="0.65s" repeatCount="indefinite" begin="-0.15s" />
        </circle>
      </>
    );
  } else if (color === 'lightning') {
    inner = (
      <>
        <circle r={r} fill="#181e50" />
        <circle r={r * 0.68} fill="#2040b0" opacity={0.7}>
          <animate attributeName="fill" values="#2040b0;#80a0ff;#ffffff;#80a0ff;#2040b0" dur="0.8s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.7;1.0;1.0;1.0;0.7" dur="0.8s" repeatCount="indefinite" />
        </circle>
        <circle r={r * 0.32} fill="#b0c8ff">
          <animate attributeName="fill" values="#b0c8ff;#ffffff;#b0c8ff" dur="0.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.6;1.0;0.6" dur="0.5s" repeatCount="indefinite" />
        </circle>
      </>
    );
  } else if (color === 'grass') {
    inner = (
      <>
        <circle r={r} fill="#0d2e14" />
        <circle r={r * 0.70} fill="#1a6030">
          <animate attributeName="fill" values="#1a6030;#30a850;#1a6030" dur="2.8s" repeatCount="indefinite" />
        </circle>
        <circle r={r * 0.35} fill="#50c060">
          <animate attributeName="r" values={`${(r*0.28).toFixed(1)};${(r*0.42).toFixed(1)};${(r*0.28).toFixed(1)}`} dur="3.2s" repeatCount="indefinite" />
          <animate attributeName="fill" values="#50c060;#90e070;#50c060" dur="3.2s" repeatCount="indefinite" />
        </circle>
      </>
    );
  } else if (color === 'air') {
    inner = (
      <>
        <circle r={r} fill="#a8c8e0" />
        <circle r={r * 0.72} fill="#c8e0f4">
          <animate attributeName="fill" values="#c8e0f4;#e8f4ff;#c8e0f4" dur="4.0s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.6;0.9;0.6" dur="4.0s" repeatCount="indefinite" />
        </circle>
        <circle r={r * 0.38} fill="#e8f4ff">
          <animate attributeName="opacity" values="0.4;0.8;0.4" dur="3.0s" repeatCount="indefinite" />
        </circle>
      </>
    );
  } else if (color === 'water') {
    inner = (
      <>
        <circle r={r} fill="#0c2e60" />
        <circle r={r * 0.70} fill="#1454a8">
          <animate attributeName="fill" values="#1454a8;#2878d8;#1454a8" dur="2.2s" repeatCount="indefinite" />
          <animate attributeName="r" values={`${(r*0.70).toFixed(1)};${(r*0.80).toFixed(1)};${(r*0.70).toFixed(1)}`} dur="2.2s" repeatCount="indefinite" />
        </circle>
        <circle r={r * 0.38} fill="#4898e8">
          <animate attributeName="fill" values="#4898e8;#90c8f8;#4898e8" dur="1.6s" repeatCount="indefinite" />
        </circle>
      </>
    );
  } else if (color === 'magic') {
    inner = (
      <>
        <circle r={r} fill="#2a0850" />
        <circle r={r * 0.70} fill="#6820b8" opacity={0.8}>
          <animate attributeName="fill" values="#6820b8;#c050ff;#6820b8" dur="1.8s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.8;1.0;0.8" dur="1.8s" repeatCount="indefinite" />
        </circle>
        <circle r={r * 0.35} fill="#d880ff">
          <animate attributeName="fill" values="#d880ff;#ffffff;#d880ff" dur="1.2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.7;1.0;0.7" dur="1.2s" repeatCount="indefinite" />
        </circle>
      </>
    );
  } else if (color === 'shadow') {
    inner = (
      <>
        <circle r={r} fill="#080810" />
        <circle r={r * 0.68} fill="#181028">
          <animate attributeName="fill" values="#181028;#302050;#181028" dur="3.0s" repeatCount="indefinite" />
        </circle>
        <circle r={r * 0.38} fill="#281840">
          <animate attributeName="fill" values="#281840;#481860;#281840" dur="2.2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.5;0.9;0.5" dur="2.2s" repeatCount="indefinite" />
        </circle>
      </>
    );
  } else if (color === 'smoke') {
    inner = (
      <>
        <circle r={r} fill="#282828" />
        <circle r={r * 0.72} fill="#484848">
          <animate attributeName="fill" values="#484848;#707070;#484848" dur="3.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.5;0.8;0.5" dur="3.5s" repeatCount="indefinite" />
        </circle>
        <circle r={r * 0.40} fill="#686868">
          <animate attributeName="opacity" values="0.4;0.7;0.4" dur="4.5s" repeatCount="indefinite" />
        </circle>
      </>
    );
  } else if (color === 'cloud') {
    inner = (
      <>
        <circle r={r} fill="#a8b8c8" />
        <circle r={r * 0.72} fill="#c8d8e8">
          <animate attributeName="fill" values="#c8d8e8;#e8f0f8;#c8d8e8" dur="4.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.6;0.9;0.6" dur="4.5s" repeatCount="indefinite" />
        </circle>
        <circle r={r * 0.38} fill="#e8f0f8">
          <animate attributeName="fill" values="#e8f0f8;#ffffff;#e8f0f8" dur="3.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.5;0.85;0.5" dur="3.5s" repeatCount="indefinite" />
        </circle>
      </>
    );
  }
  return (
    <svg className={`${className} rounded-full`} viewBox="-10 -10 20 20" style={{ display: 'block' }}>
      {title && <title>{title}</title>}
      {inner}
    </svg>
  );
}

// ─── MetallicGemTwinkle ───────────────────────────────────────────────────────
// SVG cross-twinkle overlay for metallic and gem swatches.
// Renders 3 staggered cross twinkles using the metallic-twinkle CSS animation.
// Must be inside a position:relative container (metallic-swatch / gem-swatch already are).
// Also used directly in raw <button> color pickers in play/lobby/profile pages.

export function MetallicGemTwinkle({ swStyle }: { swStyle: React.CSSProperties }) {
  const sv = swStyle as Record<string, string>;
  const pp = (k: string) => parseFloat(sv[k] ?? '50');
  const baseDur = parseFloat(sv['--tw-dur'] ?? '4') * 1.5;
  const baseDelay = parseFloat(sv['--tw-delay'] ?? '0');
  const twinkles = [
    { x: pp('--tw-x1'), y: pp('--tw-y1'), sc: 1.0,  dur: baseDur,        delay: baseDelay },
    { x: pp('--tw-x2'), y: pp('--tw-y2'), sc: 0.75, dur: baseDur * 0.85, delay: baseDelay + baseDur * 0.4 },
    { x: pp('--tw-x3'), y: pp('--tw-y3'), sc: 0.85, dur: baseDur * 1.1,  delay: baseDelay + baseDur * 0.75 },
  ];
  return (
    <svg viewBox="0 0 100 100"
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1, pointerEvents: 'none' }}
    >
      {twinkles.map((t, i) => (
        <g key={i} className="metallic-twinkle"
          style={{ '--twinkle-delay': `${t.delay}s`, '--twinkle-dur': `${t.dur}s`, transformOrigin: `${t.x}px ${t.y}px` } as React.CSSProperties}>
          <line x1={t.x - 10 * t.sc} y1={t.y} x2={t.x + 10 * t.sc} y2={t.y}
            stroke="white" strokeWidth={3.5} strokeLinecap="round" />
          <line x1={t.x} y1={t.y - 10 * t.sc} x2={t.x} y2={t.y + 10 * t.sc}
            stroke="white" strokeWidth={3.5} strokeLinecap="round" />
        </g>
      ))}
    </svg>
  );
}

// ─── ColorSwatch ─────────────────────────────────────────────────────────────
// Universal player color swatch. Handles all color types:
//   rainbow → smooth conic-gradient circle
//   opal    → multicolored hex SVG
//   gem     → hex clip-path with twinkle (gem-swatch class)
//   metallic → rounded circle with sheen (metallic-swatch class)
//   regular  → plain rounded circle
//
// Pass sizing via className (e.g. "w-4 h-4"). Add border classes here too if
// needed by the caller — ColorSwatch does NOT add borders internally.
//
// IMPORTANT: Always use ColorSwatch for any new piece/player color indicator.
// Never render a raw div with backgroundColor for player colors.

interface ColorSwatchProps {
  color: string;
  className?: string;
  title?: string;
}

export function ColorSwatch({ color, className = '', title }: ColorSwatchProps) {
  if (color === 'rainbow' || color === 'opal') {
    return (
      <SpecialSwatch
        color={color}
        className={`${className}${color === 'rainbow' ? ' rounded-full' : ''}`}
        title={title}
      />
    );
  }
  if (color === 'bouquet' || isFlowerColor(color)) {
    return <FlowerSwatch color={color} className={className} title={title} />;
  }
  if (ELEMENTAL_SET.has(color)) {
    return <ElementalSwatch color={color} className={className} title={title} />;
  }
  if (isEggColor(color)) {
    return <EggSwatch color={color} className={className} title={title} />;
  }
  const metallicStyle = getMetallicSwatchStyle(color);
  const gemStyle = getGemSwatchStyle(color);

  if (metallicStyle || gemStyle) {
    const gemBg = gemStyle ? getGemSimpleBackground(color) : undefined;
    return (
      <div
        className={`${className}${gemStyle ? ' gem-swatch' : ' rounded-full'}${metallicStyle ? ' metallic-swatch' : ''}`}
        style={{ ...(gemBg ? { background: gemBg } : { backgroundColor: color }), ...metallicStyle, ...gemStyle }}
        title={title}
      >
        <MetallicGemTwinkle swStyle={(metallicStyle ?? gemStyle)!} />
      </div>
    );
  }

  return (
    <div
      className={`${className} rounded-full`}
      style={{ backgroundColor: color }}
      title={title}
    />
  );
}
