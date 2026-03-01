'use client';

import { useMemo } from 'react';

export interface HopParticle {
  id: string;
  x: number;
  y: number;
  color: string;
  isFinal: boolean;
  isGoalEntry: boolean;
  createdAt: number;
}

interface ParticleDot {
  angle: number;
  radius: number;
  size: number;
  colorShift: number; // -1 to 1, used to lighten/darken
  duration: number;
}

function shiftColor(hex: string, shift: number): string {
  const cleaned = hex.replace('#', '');
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);

  // shift > 0 = lighten (blend toward white), shift < 0 = darken (blend toward black)
  const factor = shift * 0.15; // +-15% max
  const adjust = (c: number) => {
    if (factor > 0) return Math.round(c + (255 - c) * factor);
    return Math.round(c * (1 + factor));
  };

  const nr = Math.max(0, Math.min(255, adjust(r)));
  const ng = Math.max(0, Math.min(255, adjust(g)));
  const nb = Math.max(0, Math.min(255, adjust(b)));

  return `rgb(${nr}, ${ng}, ${nb})`;
}

// Seeded random for stable particle generation per burst ID
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function generateDots(id: string, isFinal: boolean, isGoalEntry: boolean): ParticleDot[] {
  const rand = seededRandom(hashString(id));
  const count = isGoalEntry
    ? 20 + Math.floor(rand() * 6)   // 20-25 particles
    : isFinal
      ? 14 + Math.floor(rand() * 5) // 14-18 particles
      : 8 + Math.floor(rand() * 5); // 8-12 particles
  const dots: ParticleDot[] = [];

  const angleStep = (Math.PI * 2) / count;
  const jitterRange = angleStep * 0.3; // +-30% of the spacing as jitter

  for (let i = 0; i < count; i++) {
    const baseAngle = angleStep * i;
    const angle = baseAngle + (rand() * 2 - 1) * jitterRange;
    const radius = isGoalEntry
      ? 14 + rand() * 8   // 14-22px
      : isFinal
        ? 10 + rand() * 6 // 10-16px
        : 6 + rand() * 4; // 6-10px
    const size = isGoalEntry
      ? 2 + rand() * 2    // 2-4px
      : isFinal
        ? 1.5 + rand() * 1.5 // 1.5-3px
        : 1 + rand() * 1;    // 1-2px
    const colorShift = (rand() * 2 - 1); // -1 to 1
    const duration = isGoalEntry
      ? 550 + rand() * 350   // 550-900ms
      : 450 + rand() * 300;  // 450-750ms

    dots.push({ angle, radius, size, colorShift, duration });
  }

  return dots;
}

export function HopParticles({ particles }: { particles: HopParticle[] }) {
  // Memoize dot layouts keyed on particle ids
  const dotLayouts = useMemo(() => {
    const layouts = new Map<string, ParticleDot[]>();
    for (const p of particles) {
      if (!layouts.has(p.id)) {
        layouts.set(p.id, generateDots(p.id, p.isFinal, p.isGoalEntry));
      }
    }
    return layouts;
  }, [particles]);

  if (particles.length === 0) return null;

  return (
    <g style={{ pointerEvents: 'none' }}>
      {particles.map((particle) => {
        const dots = dotLayouts.get(particle.id) ?? [];
        return (
          <g key={particle.id}>
            {dots.map((dot, i) => {
              const dx = Math.cos(dot.angle) * dot.radius;
              const dy = Math.sin(dot.angle) * dot.radius;
              const fill = shiftColor(particle.color, dot.colorShift);

              return (
                <circle
                  key={i}
                  cx={particle.x}
                  cy={particle.y}
                  r={dot.size}
                  fill={fill}
                  className="hop-particle"
                  style={{
                    '--dx': `${dx}px`,
                    '--dy': `${dy}px`,
                    '--duration': `${dot.duration}ms`,
                  } as React.CSSProperties}
                />
              );
            })}
          </g>
        );
      })}
    </g>
  );
}
