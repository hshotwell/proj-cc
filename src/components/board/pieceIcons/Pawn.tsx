import React from 'react';
import { type PieceIconProps, TurnedGradient, outlineFor, detailFor, svgIdFor } from './shading';

// Pawn (classical): smaller round head, thin tapered body, narrower base than the Peon.
// Detailed mode: smooth waisted body, collar roll, torus base roll, flared
// plinth, cylindrical shading.
export function PawnIcon({ size, fill, className, detailed, outlined }: PieceIconProps) {
  const gid = svgIdFor('pw', fill);
  if (!detailed) {
    return (
      <svg width={size} height={size} viewBox="-10 -10 20 20" className={className}>
        <path
          fill={fill}
          // Swatch contexts sit on themed backgrounds the fill can vanish
          // into (black pawn on a dark-mode card) — outline adaptively.
          stroke={outlined ? outlineFor(fill) : undefined}
          strokeWidth={outlined ? 0.6 : undefined}
          strokeLinejoin="round"
          d={[
            // Round head — large relative to the short body so the piece
            // reads squat, matching the detailed variant's proportions
            'M 0 -6.9 A 2.3 2.3 0 1 1 0 -2.3 A 2.3 2.3 0 1 1 0 -6.9 Z',
            // Neck
            'M -2 -2.5 L 2 -2.5 L 2.5 -1.2 L -2.5 -1.2 Z',
            // Slim body — tapered
            'M -2.5 -1.2 L -3.2 4 L 3.2 4 L 2.5 -1.2 Z',
            // Base — narrower than the Peon
            'M -4.5 4 L -4.5 7 L 4.5 7 L 4.5 4 Z',
          ].join(' ')}
        />
      </svg>
    );
  }
  const outline = outlineFor(fill);
  return (
    <svg width={size} height={size} viewBox="-10 -10 20 20" className={className}>
      <defs><TurnedGradient id={gid} fill={fill} /></defs>
      <g fill={`url(#${gid})`} stroke={outline} strokeWidth={0.3} strokeLinejoin="round">
        {/* Small round head */}
        <circle cx={0} cy={-5.4} r={2.05} />
        {/* Slim waisted body */}
        <path d="M -1.5 -2.9 C -2.2 -0.6 -2.7 1.6 -3.0 4.1 L 3.0 4.1 C 2.7 1.6 2.2 -0.6 1.5 -2.9 Z" />
        {/* Collar roll */}
        <ellipse cx={0} cy={-3.1} rx={2.0} ry={0.65} />
        {/* Base roll + flared plinth */}
        <ellipse cx={0} cy={4.2} rx={3.4} ry={0.7} />
        <path d="M -4.5 7.2 C -4.5 5.8 -3.7 5.0 -3.0 5.0 L 3.0 5.0 C 3.7 5.0 4.5 5.8 4.5 7.2 Z" />
      </g>
      {/* Glint on the head */}
      <ellipse cx={-0.7} cy={-6.1} rx={0.65} ry={0.5} fill="white" opacity={0.35} transform="rotate(-24 -0.7 -6.1)" />
    </svg>
  );
}
