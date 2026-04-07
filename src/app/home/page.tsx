'use client';

import { useState, useEffect, useRef, memo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useTutorialStore } from '@/store/tutorialStore';
import { useSettingsStore } from '@/store/settingsStore';
import { HopParticles } from '@/components/board/HopParticles';
import type { HopParticle } from '@/components/board/HopParticles';

// Player colors cycling clockwise through the star points
const STAR_COLORS = [
  '#ef4444', // Red
  '#facc15', // Yellow
  '#22c55e', // Green
  '#22d3ee', // Cyan
  '#3b82f6', // Blue
  '#a855f7', // Purple
];

// 6 triangle points of the star
const STAR_TRIANGLES = [
  { points: '-17.5,-30.3 17.5,-30.3 0,-70', index: 0 },
  { points: '17.5,-30.3 35,0 60.6,-35', index: 1 },
  { points: '35,0 17.5,30.3 60.6,35', index: 2 },
  { points: '17.5,30.3 -17.5,30.3 0,70', index: 3 },
  { points: '-17.5,30.3 -35,0 -60.6,35', index: 4 },
  { points: '-35,0 -17.5,-30.3 -60.6,-35', index: 5 },
];

// ── Hex border geometry ──────────────────────────────────────────────────────

// NODE_SIZE is the pointy-top hex grid spacing used by both the debug grid and
// the wall ring, so wall pieces land exactly on grid nodes.
const NODE_SIZE = 35;         // px between adjacent hex grid nodes
const WALL_RING_RADIUS = 5;   // cube-coord distance of the wall ring (ring-5 = 30 pieces, 6 per side)
const WALL_SIZE = 15;         // wall piece hex radius (px)
const MARBLE_RADIUS = 9;      // marble radius (px)
const HOP_MS = 450;              // ms between marble hops
const HOP_TRANSITION = 340;      // ms for the position animation
const TRAIL_DURATION_MS = 2000;  // how long the trail persists
const TRAIL_MIN_DIST_SQ = 36;    // min squared px distance between trail samples (6px)

// Pointy-top hex grid: x = NODE_SIZE * √3 * (q + r/2),  y = NODE_SIZE * 3/2 * r
function hexToXY(q: number, r: number) {
  return {
    x: NODE_SIZE * Math.sqrt(3) * (q + r / 2),
    y: NODE_SIZE * (3 / 2) * r,
  };
}

// Wall ring: all hex-grid nodes at cube distance WALL_RING_RADIUS, sorted by angle,
// stored with cube coords for pairing with ring-7 outer nodes.
function computeWallNodes(): { q: number; r: number; x: number; y: number }[] {
  const ring: { q: number; r: number; x: number; y: number; angle: number }[] = [];
  for (let q = -WALL_RING_RADIUS; q <= WALL_RING_RADIUS; q++) {
    for (let r = -WALL_RING_RADIUS; r <= WALL_RING_RADIUS; r++) {
      const s = -q - r;
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) === WALL_RING_RADIUS) {
        const { x, y } = hexToXY(q, r);
        ring.push({ q, r, x, y, angle: Math.atan2(y, x) });
      }
    }
  }
  ring.sort((a, b) => a.angle - b.angle);
  return ring.map(({ q, r, x, y }) => ({ q, r, x, y }));
}

const WALL_NODES = computeWallNodes();
const WALL_POSITIONS = WALL_NODES.map(({ x, y }) => ({ x, y }));
const TOTAL_WALL = WALL_POSITIONS.length; // 30 (ring-5)

// Explicit marble hop path: 24 positions alternating ring-4 (inner) / ring-6 (outer),
// tracing the wall ring with each hop crossing the ring-5 wall.
// Marble 1 starts at (4,0); Marble 2 starts at (-4,0), the antipodal position (index 12).
const HOP_PATH: { q: number; r: number }[] = [
  { q:  4, r:  0 }, { q:  4, r:  2 },
  { q:  2, r:  2 }, { q:  2, r:  4 },
  { q:  0, r:  4 }, { q: -2, r:  6 },
  { q: -2, r:  4 }, { q: -4, r:  6 },
  { q: -4, r:  4 }, { q: -6, r:  4 },
  { q: -4, r:  2 }, { q: -6, r:  2 },
  { q: -4, r:  0 }, { q: -4, r: -2 },
  { q: -2, r: -2 }, { q: -2, r: -4 },
  { q:  0, r: -4 }, { q:  2, r: -6 },
  { q:  2, r: -4 }, { q:  4, r: -6 },
  { q:  4, r: -4 }, { q:  6, r: -4 },
  { q:  4, r: -2 }, { q:  6, r: -2 },
];

const HOP_POSITIONS = HOP_PATH.map(({ q, r }) => hexToXY(q, r));
const TOTAL_HOP = HOP_POSITIONS.length; // 24
const MARBLE2_START = 12;              // (-4, 0) — antipodal starting corner

// Interpolate the marble's current color from elapsed seconds + delay offset.
// Mirrors the CSS colorRotate animation (12s linear through 6 colors).
function getMarbleColor(elapsedS: number, delayS: number = 0): string {
  const t = ((elapsedS + delayS) % 12 + 12) % 12;
  const phase = (t / 12) * 6;
  const idx = Math.floor(phase) % 6;
  const frac = phase - Math.floor(phase);
  const c1 = STAR_COLORS[idx];
  const c2 = STAR_COLORS[(idx + 1) % 6];
  const h = (hex: string) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const [r1, g1, b1] = h(c1);
  const [r2, g2, b2] = h(c2);
  return `rgb(${Math.round(r1 + (r2 - r1) * frac)},${Math.round(g1 + (g2 - g1) * frac)},${Math.round(b1 + (b2 - b1) * frac)})`;
}

// Pointy-top hex polygon points for wall pieces (matches board cell orientation)
function flatHexPoints(cx: number, cy: number, size: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    return `${cx + size * Math.cos(a)},${cy + size * Math.sin(a)}`;
  }).join(' ');
}

const SimpleWallHex = memo(function SimpleWallHex({ cx, cy }: { cx: number; cy: number }) {
  return (
    <polygon
      points={flatHexPoints(cx, cy, WALL_SIZE)}
      fill="#6b7280"
      stroke="#374151"
      strokeWidth={1.5}
    />
  );
});

const CobblestoneWallHex = memo(function CobblestoneWallHex({ cx, cy, idx }: { cx: number; cy: number; idx: number }) {
  const hexPoints = flatHexPoints(cx, cy, WALL_SIZE);
  const clipId = `hb-c-${idx}`;
  const mortarColor = '#585050';
  const seed = Math.abs(idx * 7 + (idx * 13) % 31);
  const rng = (n: number) => { const v = Math.sin(seed * 9301 + n * 4973) * 49297; return v - Math.floor(v); };

  type Stone = { x: number; y: number; w: number; h: number; rx: number; shade: number };
  const stones: Stone[] = [];
  const gap = 0.4;
  const r = WALL_SIZE * 0.9;
  let ry = -r, rowIdx = 0;
  while (ry < r) {
    const rowH = r * (0.22 + rng(rowIdx * 10 + 1) * 0.18);
    let rx = -r + (rowIdx % 2 === 1 ? r * (0.1 + rng(rowIdx * 10 + 50) * 0.15) : 0);
    let colIdx = 0;
    while (rx < r) {
      const sw = r * (0.28 + rng(rowIdx * 100 + colIdx * 7 + 2) * 0.32);
      const sh = rowH * (0.8 + rng(rowIdx * 100 + colIdx * 7 + 3) * 0.25);
      stones.push({ x: cx + rx, y: cy + ry, w: sw - gap, h: sh - gap, rx: Math.min(sw, sh) * 0.15, shade: rng(rowIdx * 100 + colIdx * 7 + 4) });
      rx += sw + gap; colIdx++;
    }
    ry += rowH + gap; rowIdx++;
  }

  return (
    <g>
      <defs><clipPath id={clipId}><polygon points={hexPoints} /></clipPath></defs>
      <polygon points={hexPoints} fill={mortarColor} />
      <g clipPath={`url(#${clipId})`}>
        {stones.map((s, i) => {
          const lum = Math.round(155 + (s.shade - 0.5) * 45);
          return <rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx} fill={`rgb(${lum},${Math.round(lum * 0.97)},${Math.round(lum * 0.94)})`} />;
        })}
      </g>
      <polygon points={hexPoints} fill="none" stroke="#4a4a4a" strokeWidth={0.8} strokeLinejoin="round" />
    </g>
  );
});

// Memoized static border layers — only re-renders when glassPieces setting changes.
const StaticBorderLayers = memo(function StaticBorderLayers({ glassPieces }: { glassPieces: boolean }) {
  return (
    <>
      {/* Connecting lines between consecutive wall pieces */}
      {WALL_POSITIONS.map((pos, i) => {
        const next = WALL_POSITIONS[(i + 1) % TOTAL_WALL];
        return (
          <line key={i} x1={pos.x} y1={pos.y} x2={next.x} y2={next.y}
            stroke="#9ca3af" strokeWidth={5} strokeLinecap="round" />
        );
      })}
      {/* Wall pieces */}
      {WALL_POSITIONS.map((pos, i) =>
        glassPieces
          ? <CobblestoneWallHex key={i} cx={pos.x} cy={pos.y} idx={i} />
          : <SimpleWallHex key={i} cx={pos.x} cy={pos.y} />
      )}
    </>
  );
});

const MARBLE_GRAD_ID = 'hb-marble-glass';

type TrailSample = { x: number; y: number; ts: number; color: string };

export default function HomePage() {
  const { user, isAuthenticated, isLoading } = useAuthStore();
  const { glassPieces, hopEffect, showLastMoves, animateMoves } = useSettingsStore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [showModes, setShowModes] = useState(false);
  const [borderVisible, setBorderVisible] = useState(true);
  const [hexScale, setHexScale] = useState(1);
  const [screenH, setScreenH] = useState(800);
  const [isPortrait, setIsPortrait] = useState(false);
  const router = useRouter();
  const startTutorial = useTutorialStore((s) => s.startTutorial);

  // Dynamic hex scale — ring (±316px at scale=1 = 632px wide) fills ~97% of viewport width.
  // Height constraint only fires on very short screens (< 560px, e.g. landscape phones):
  // the wall is ±277px tall at scale=1 = 554px, so it fits any screen ≥ 560px with no scaling.
  // Portrait phones (vh > vw) use a smaller divisor so the hex is larger and buttons fit inside.
  useEffect(() => {
    const update = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const portrait = vh > vw;
      // Width: portrait phones use a smaller divisor (~0.85 scale) so buttons sit inside the wall
      const sw = portrait ? vw / 458 : vw / 600;
      // Height: only constrain on very short screens where wall would overflow vertically
      const sh = vh < 560 ? (vh * 0.90) / 560 : 1.0;
      setHexScale(Math.min(1, Math.max(0.38, Math.min(sw, sh))));
      setScreenH(vh);
      setIsPortrait(portrait);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const startTimeRef = useRef(Date.now());
  const marble1Ref = useRef(0);
  const marble2Ref = useRef(MARBLE2_START);
  const hopEffectRef = useRef(hopEffect);
  const showLastMovesRef = useRef(showLastMoves);
  const animateMovesRef = useRef(animateMoves);
  useEffect(() => { hopEffectRef.current = hopEffect; }, [hopEffect]);
  useEffect(() => { showLastMovesRef.current = showLastMoves; }, [showLastMoves]);
  useEffect(() => { animateMovesRef.current = animateMoves; }, [animateMoves]);

  // Smoothly interpolated marble positions, driven by a rAF loop.
  const [m1Pos, setM1Pos] = useState(() => HOP_POSITIONS[0]);
  const [m2Pos, setM2Pos] = useState(() => HOP_POSITIONS[MARBLE2_START]);
  const m1PosRef = useRef(HOP_POSITIONS[0]);
  const m2PosRef = useRef(HOP_POSITIONS[MARBLE2_START]);
  const m1FromRef = useRef(HOP_POSITIONS[0]);
  const m1ToRef   = useRef(HOP_POSITIONS[0]);
  const m2FromRef = useRef(HOP_POSITIONS[MARBLE2_START]);
  const m2ToRef   = useRef(HOP_POSITIONS[MARBLE2_START]);
  const hopStartRef = useRef(0);

  // Continuous position-sample trail: new sample added only when marble moves >= 6px.
  const trail1SamplesRef = useRef<TrailSample[]>([]);
  const trail2SamplesRef = useRef<TrailSample[]>([]);

  const [hopParticles, setHopParticles] = useState<HopParticle[]>([]);
  const m1ColorRef = useRef<string>(getMarbleColor(0, 0));
  const m2ColorRef = useRef<string>(getMarbleColor(0, 6));
  const [m1Color, setM1Color] = useState<string>(() => getMarbleColor(0, 0));
  const [m2Color, setM2Color] = useState<string>(() => getMarbleColor(0, 6));

  useEffect(() => {
    const id = setInterval(() => {
      const next1 = (marble1Ref.current + 1) % TOTAL_HOP;
      const next2 = (marble2Ref.current + 1) % TOTAL_HOP;
      marble1Ref.current = next1;
      marble2Ref.current = next2;
      m1FromRef.current = m1PosRef.current;
      m1ToRef.current   = HOP_POSITIONS[next1];
      m2FromRef.current = m2PosRef.current;
      m2ToRef.current   = HOP_POSITIONS[next2];
      hopStartRef.current = Date.now();

      if (hopEffectRef.current) {
        // Fire particles when the marble actually arrives, computing color at arrival time.
        const delay = animateMovesRef.current ? HOP_TRANSITION : 0;
        const dest1 = HOP_POSITIONS[next1];
        const dest2 = HOP_POSITIONS[next2];
        setTimeout(() => {
          const now = Date.now();
          const c1 = m1ColorRef.current;
          const c2 = m2ColorRef.current;
          setHopParticles((prev) => [
            ...prev,
            { id: `m1-${now}`, x: dest1.x, y: dest1.y, color: c1, isFinal: true, isGoalEntry: false, createdAt: now },
            { id: `m2-${now}`, x: dest2.x, y: dest2.y, color: c2, isFinal: true, isGoalEntry: false, createdAt: now },
          ]);
        }, delay);
      }
    }, HOP_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!showLastMoves) {
      trail1SamplesRef.current = [];
      trail2SamplesRef.current = [];
    }
  }, [showLastMoves]);

  // rAF loop: interpolates marble positions and samples trail data every TRAIL_SAMPLE_MS.
  // Runs continuously so the trail fades out even when the marble is stationary.
  useEffect(() => {
    let rafId: number;
    function tick() {
      const nowMs = Date.now();
      const elapsed = nowMs - hopStartRef.current;
      const t = animateMovesRef.current ? Math.min(elapsed / HOP_TRANSITION, 1) : 1;
      const et = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // ease-in-out
      const f1 = m1FromRef.current, to1 = m1ToRef.current;
      const f2 = m2FromRef.current, to2 = m2ToRef.current;
      const p1 = { x: f1.x + (to1.x - f1.x) * et, y: f1.y + (to1.y - f1.y) * et };
      const p2 = { x: f2.x + (to2.x - f2.x) * et, y: f2.y + (to2.y - f2.y) * et };
      m1PosRef.current = p1;
      m2PosRef.current = p2;

      const elapsedS = (nowMs - startTimeRef.current) / 1000;
      const c1 = getMarbleColor(elapsedS, 0);
      const c2 = getMarbleColor(elapsedS, 6);
      m1ColorRef.current = c1;
      m2ColorRef.current = c2;

      // Update React state and reschedule first — these must always run.
      setM1Pos(p1);
      setM2Pos(p2);
      setM1Color(c1);
      setM2Color(c2);
      rafId = requestAnimationFrame(tick);

      // Sample trail: prune expired entries, add a new sample only when the
      // marble has moved at least 6px — prevents short segments whose round caps look like dots.
      if (showLastMovesRef.current) {
        const cutoff = nowMs - TRAIL_DURATION_MS;
        const s1 = trail1SamplesRef.current;
        const last1 = s1.length > 0 ? s1[s1.length - 1] : null;
        const d1sq = last1 ? (p1.x - last1.x) ** 2 + (p1.y - last1.y) ** 2 : Infinity;
        trail1SamplesRef.current = s1.filter(s => s.ts > cutoff);
        if (d1sq >= TRAIL_MIN_DIST_SQ) {
          trail1SamplesRef.current.push({ x: p1.x, y: p1.y, ts: nowMs, color: c1 });
        }
        const s2 = trail2SamplesRef.current;
        const last2 = s2.length > 0 ? s2[s2.length - 1] : null;
        const d2sq = last2 ? (p2.x - last2.x) ** 2 + (p2.y - last2.y) ** 2 : Infinity;
        trail2SamplesRef.current = s2.filter(s => s.ts > cutoff);
        if (d2sq >= TRAIL_MIN_DIST_SQ) {
          trail2SamplesRef.current.push({ x: p2.x, y: p2.y, ts: nowMs, color: c2 });
        }
      }
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  useEffect(() => {
    if (hopParticles.length === 0) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setHopParticles((prev) => prev.filter((p) => now - p.createdAt < 1000));
    }, 100);
    return () => clearInterval(timer);
  }, [hopParticles.length]);

  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      {/* User header */}
      <div className="absolute top-4 right-4 flex items-center gap-3 z-20">
        {isLoading ? (
          <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
        ) : isAuthenticated && user ? (
          <Link href="/profile" className="text-base font-semibold text-gray-700 hover:underline">
            {user.username || user.name || user.email}
          </Link>
        ) : (
          <Link href="/auth/signin" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors">
            Sign In
          </Link>
        )}
      </div>

      <style>{`
        @keyframes colorRotate {
          0%, 100% { fill: ${STAR_COLORS[0]}; }
          16.67%   { fill: ${STAR_COLORS[1]}; }
          33.33%   { fill: ${STAR_COLORS[2]}; }
          50%      { fill: ${STAR_COLORS[3]}; }
          66.67%   { fill: ${STAR_COLORS[4]}; }
          83.33%   { fill: ${STAR_COLORS[5]}; }
        }
      `}</style>

      {/* Hex border SVG — scaled to ~95% of viewport width via hexScale */}
      {mounted && <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true" style={{ visibility: borderVisible ? 'visible' : 'hidden' }}>
        <svg width={860} height={800} viewBox="-430 -400 860 800" style={{ transform: `scale(${hexScale})`, transformOrigin: 'center' }}>
          {glassPieces && (
            <defs>
              <radialGradient id={MARBLE_GRAD_ID} cx="35%" cy="35%" r="65%">
                <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
                <stop offset="60%" stopColor="rgba(255,255,255,0.08)" />
                <stop offset="100%" stopColor="rgba(0,0,0,0.12)" />
              </radialGradient>
            </defs>
          )}

          {/* Layers 1+2: static wall lines and pieces — memoized, never re-renders on animation frames */}
          <StaticBorderLayers glassPieces={glassPieces} />

          {/* Layer 3: continuous trail — sample-based, opacity fades with age like a Unity trail */}
          {showLastMoves && (() => {
            const nowMs = Date.now();
            const oldest = nowMs - TRAIL_DURATION_MS;
            const renderTrail = (samples: TrailSample[]) => {
              if (samples.length < 2) return null;
              return samples.slice(0, -1).map((s, i) => {
                const next = samples[i + 1];
                // age: 0 = fresh (head end), 1 = expired (tail end)
                const age = 1 - (s.ts - oldest) / TRAIL_DURATION_MS;
                const opacity = Math.max(0, (1 - age) * 0.75);
                const width = Math.max(0.8, (1 - age) * 4);
                return (
                  <line key={i} x1={s.x} y1={s.y} x2={next.x} y2={next.y}
                    stroke={s.color} strokeWidth={width}
                    strokeOpacity={opacity} />
                );
              });
            };
            return (
              <>
                {renderTrail(trail1SamplesRef.current)}
                {renderTrail(trail2SamplesRef.current)}
              </>
            );
          })()}

          {/* Layer 4: Marble 1 — position and color driven by rAF */}
          <g style={{ transform: `translate(${m1Pos.x}px, ${m1Pos.y}px)` }}>
            <circle r={MARBLE_RADIUS} cx={0} cy={1.5} fill="rgba(0,0,0,0.22)" />
            <circle r={MARBLE_RADIUS} cx={0} cy={0} fill={m1Color} />
            {glassPieces && <circle r={MARBLE_RADIUS} cx={0} cy={0} fill={`url(#${MARBLE_GRAD_ID})`} />}
          </g>

          {/* Layer 4: Marble 2 — position and color driven by rAF */}
          <g style={{ transform: `translate(${m2Pos.x}px, ${m2Pos.y}px)` }}>
            <circle r={MARBLE_RADIUS} cx={0} cy={1.5} fill="rgba(0,0,0,0.22)" />
            <circle r={MARBLE_RADIUS} cx={0} cy={0} fill={m2Color} />
            {glassPieces && <circle r={MARBLE_RADIUS} cx={0} cy={0} fill={`url(#${MARBLE_GRAD_ID})`} />}
          </g>

          {/* Layer 5: Hop particle bursts */}
          {hopParticles.length > 0 && <HopParticles particles={hopParticles} />}

        </svg>
      </div>}

      {/* ── Layout modes ────────────────────────────────────────────────────────
          normalMode  (hexScale ≥ 0.95): desktop — all inside hex at original positions
          titleAbove  (hexScale < 0.95, tall enough): portrait phone — title above wall ring,
                      top star + buttons centered inside hex
          compactMode (hexScale < 0.95, too short for title above): landscape/very short —
                      title hidden, compact button block centered inside hex, no bottom star
      */}
      {(() => {
        const normalMode = hexScale >= 0.95;
        // px from screen center to top edge of wall ring (wall node center + wall piece radius)
        const wallTopPx = Math.round(277 * hexScale);
        // px of room between screen top (below header ~56px) and wall top
        const roomAboveWall = Math.round(screenH / 2) - wallTopPx - 56;
        // title is ~84px tall (h1 48px + mb-2 8px + p ~28px)
        const TITLE_H = 84;
        // need room for title (84) + gap (8) + star (48) + gap (10) = 150 above wall
        const titleAbove = !normalMode && roomAboveWall >= 150;
        const compactMode = !normalMode && !titleAbove;

        // Title top: leave 56px below for star+gap before the wall top
        const titleTopPx = titleAbove
          ? Math.max(56, Math.round(screenH / 2) - wallTopPx - TITLE_H - 148)
          : 0;

        // Expanded buttons block height: play(56) + 3 modes(132) + editor(56) = 244, no bottom star
        const EXPANDED_H = 244;
        // Non-normal: play button starts 4px below the wall top ring
        const buttonsOffset = normalMode ? 91 : wallTopPx - 4;
        // Top star: 8px gap + 48px star above buttons → star bottom lands 4px above wall top
        const topStarOffset = normalMode ? 250 : (buttonsOffset + 8 + 48);

        const starSvg = (
          <svg viewBox="-100 -100 200 200" className="w-12 h-12">
            {STAR_TRIANGLES.map((t) => (
              <polygon key={t.index} points={t.points} style={{
                fill: STAR_COLORS[t.index],
                animation: 'colorRotate 12s linear infinite',
                animationDelay: `${-(t.index / 6) * 12}s`,
              }} />
            ))}
            <polygon points="-17.5,-30.3 17.5,-30.3 35,0 17.5,30.3 -17.5,30.3 -35,0" fill="#9ca3af" />
          </svg>
        );

        return (
          <>
            {/* Top star — shown in normalMode and titleAbove; also portrait compactMode (compact title shows above it) */}
            {mounted && (!compactMode || isPortrait) && (
              <button
                type="button"
                onClick={() => setBorderVisible(v => !v)}
                className="absolute z-10 cursor-pointer focus:outline-none"
                style={{
                  top: `calc(50% - ${topStarOffset}px)`,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  opacity: borderVisible ? 1 : 0.4,
                  background: 'none',
                  border: 'none',
                  padding: 0,
                }}
                aria-label={borderVisible ? 'Hide border animation' : 'Show border animation'}
              >
                {starSvg}
              </button>
            )}

            {/* Compact title — landscape/compactMode only, replaces top star */}
            {mounted && compactMode && (
              <div
                className="absolute z-10 text-center"
                style={{
                  top: `calc(50% - ${topStarOffset + 32}px)`,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 'min(90vw, 300px)',
                }}
              >
                <h1 className="text-lg font-bold text-gray-900" translate="no">STERNHALMA</h1>
              </div>
            )}

            {/* Logo / Title */}
            {!compactMode && (
              <div
                className="absolute z-10 text-center"
                style={{
                  ...(titleAbove
                    ? { top: `${titleTopPx}px` }
                    : { top: 'calc(50% - 195px)' }),
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: normalMode ? '300px' : 'min(90vw, 300px)',
                }}
              >
                <div className={normalMode ? 'mb-5' : ''}>
                  <h1 className="text-5xl font-bold text-gray-900 mb-2" translate="no">
                    STERNHALMA
                  </h1>
                  <p className="text-xl italic text-gray-600">
                    Chinese Checkers
                  </p>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <main
              className="absolute z-10 text-center"
              style={{
                top: `calc(50% - ${buttonsOffset}px)`,
                left: '50%',
                transform: 'translateX(-50%)',
                width: normalMode ? '300px' : 'min(75vw, 260px)',
              }}
            >
              <div className="flex flex-col items-center">
                <button
                  onClick={() => setShowModes(!showModes)}
                  className="w-full px-12 py-4 text-xl font-semibold text-gray-800 rounded-full hover:bg-gray-100 transition-colors"
                >
                  Play
                </button>

                {showModes && (
                  <div className="w-full flex flex-col animate-[fadeIn_0.15s_ease-in]">
                    <button
                      onClick={() => router.push('/play')}
                      className="w-full px-12 py-3 text-lg text-gray-700 rounded-full hover:bg-gray-100 transition-colors"
                    >
                      Local
                    </button>
                    <button
                      onClick={() => router.push('/profile')}
                      className="w-full px-12 py-3 text-lg text-gray-700 rounded-full hover:bg-gray-100 transition-colors"
                    >
                      Online
                    </button>
                    <button
                      onClick={() => {
                        const gameId = startTutorial();
                        router.push(`/game/${gameId}`);
                      }}
                      className="w-full px-12 py-3 text-lg text-gray-700 rounded-full hover:bg-gray-100 transition-colors"
                    >
                      Tutorial
                    </button>
                  </div>
                )}

                <Link
                  href="/editor"
                  className="w-full inline-block px-12 py-4 text-xl font-semibold text-gray-800 text-center rounded-full hover:bg-gray-100 transition-colors"
                >
                  Board Editor
                </Link>

                {/* Bottom star — shown in normalMode and portrait modes (buttons are high enough to fit it) */}
                {(normalMode || isPortrait) && (
                  <button
                    type="button"
                    onClick={() => setBorderVisible(v => !v)}
                    className="mt-3 cursor-pointer focus:outline-none"
                    style={{ opacity: borderVisible ? 1 : 0.4, background: 'none', border: 'none', padding: 0 }}
                    aria-label={borderVisible ? 'Hide border animation' : 'Show border animation'}
                  >
                    {starSvg}
                  </button>
                )}
              </div>
            </main>
          </>
        );
      })()}
    </div>
  );
}
