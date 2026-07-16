import React from 'react';
import { type PieceIconProps, TurnedGradient, outlineFor, detailFor, svgIdFor } from './shading';

// Peon (Hex Chess soldier): traditional pawn silhouette — round head, narrow neck,
// tapered body, wide base. Distinguishes from the classical Pawn by having a
// simpler top and slightly beefier body.
// Detailed mode: smooth waisted body, collar roll, torus base roll, flared
// plinth, cylindrical shading.
export function PeonIcon({ size, fill, className, detailed }: PieceIconProps) {
  const gid = svgIdFor('pe', fill);
  if (!detailed) {
    return (
      <svg width={size} height={size} viewBox="-10 -10 20 20" className={className}>
        <path
          fill={fill}
          d={[
            // Round head
            'M 0 -7 A 2.5 2.5 0 1 1 0 -2 A 2.5 2.5 0 1 1 0 -7 Z',
            // Neck collar
            'M -2.5 -2.5 L 2.5 -2.5 L 3 -1 L -3 -1 Z',
            // Body — tapered
            'M -3 -1 L -3.8 4 L 3.8 4 L 3 -1 Z',
            // Wide base
            'M -5.5 4 L -5.5 7.5 L 5.5 7.5 L 5.5 4 Z',
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
        {/* Round head */}
        <circle cx={0} cy={-4.6} r={2.6} />
        {/* Waisted body */}
        <path d="M -1.9 -1.7 C -2.9 0.6 -3.5 2.4 -3.8 4.4 L 3.8 4.4 C 3.5 2.4 2.9 0.6 1.9 -1.7 Z" />
        {/* Collar roll */}
        <ellipse cx={0} cy={-1.9} rx={2.5} ry={0.8} />
        {/* Base roll + flared plinth */}
        <ellipse cx={0} cy={4.5} rx={4.2} ry={0.8} />
        <path d="M -5.5 7.7 C -5.5 6.1 -4.6 5.3 -3.8 5.3 L 3.8 5.3 C 4.6 5.3 5.5 6.1 5.5 7.7 Z" />
      </g>
      {/* Glint on the head */}
      <ellipse cx={-0.9} cy={-5.5} rx={0.8} ry={0.6} fill="white" opacity={0.35} transform="rotate(-24 -0.9 -5.5)" />
    </svg>
  );
}
