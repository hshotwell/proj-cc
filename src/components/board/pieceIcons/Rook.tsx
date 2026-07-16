import React from 'react';
import { type PieceIconProps, TurnedGradient, darken, svgIdFor } from './shading';

// Rook: castle turret with 3 crenellations, straight body, wide base.
// Detailed mode: rounded merlons, cornice band, brickwork lines, torus base
// roll, flared plinth, cylindrical shading.
export function RookIcon({ size, fill, className, detailed }: PieceIconProps){
  const gid = svgIdFor('rk', fill);
  if (!detailed) {
    return (
      <svg width={size} height={size} viewBox="-10 -10 20 20" className={className}>
        <path
          fill={fill}
          d={[
            // Crenellations (3 merlons with 2 gaps): start bottom-left of battlements
            'M -6 -2',
            'L -6 -9 L -3 -9 L -3 -5',
            'L -1 -5 L -1 -9 L 1 -9 L 1 -5',
            'L 3 -5 L 3 -9 L 6 -9 L 6 -2 Z',
            // Body
            'M -5 -2 L -4 5 L 4 5 L 5 -2 Z',
            // Base
            'M -7 5 L -7 9 L 7 9 L 7 5 Z',
          ].join(' ')}
        />
      </svg>
    );
  }
  const outline = darken(fill, 0.5);
  const dark = darken(fill, 0.42);
  return (
    <svg width={size} height={size} viewBox="-10 -10 20 20" className={className}>
      <defs><TurnedGradient id={gid} fill={fill} /></defs>
      <g fill={`url(#${gid})`} stroke={outline} strokeWidth={0.3} strokeLinejoin="round">
        {/* Battlement head — three merlons with rounded corners */}
        <path d={[
          'M -6.2 -4.4',
          'L -6.2 -8.35 Q -6.2 -8.9 -5.65 -8.9 L -3.85 -8.9 Q -3.3 -8.9 -3.3 -8.35',
          'L -3.3 -7.0 Q -3.3 -6.5 -2.8 -6.5 L -1.95 -6.5 Q -1.45 -6.5 -1.45 -7.0',
          'L -1.45 -8.35 Q -1.45 -8.9 -0.9 -8.9 L 0.9 -8.9 Q 1.45 -8.9 1.45 -8.35',
          'L 1.45 -7.0 Q 1.45 -6.5 1.95 -6.5 L 2.8 -6.5 Q 3.3 -6.5 3.3 -7.0',
          'L 3.3 -8.35 Q 3.3 -8.9 3.85 -8.9 L 5.65 -8.9 Q 6.2 -8.9 6.2 -8.35',
          'L 6.2 -4.4 Z',
        ].join(' ')} />
        {/* Slightly waisted tower body */}
        <path d="M -4.6 -3.6 C -4.0 -1.0 -4.0 2.0 -4.4 5.6 L 4.4 5.6 C 4.0 2.0 4.0 -1.0 4.6 -3.6 Z" />
        {/* Cornice band under battlements */}
        <rect x={-5.6} y={-4.7} width={11.2} height={1.3} rx={0.55} />
        {/* Base roll + flared plinth */}
        <ellipse cx={0} cy={5.7} rx={5.0} ry={0.8} />
        <path d="M -7 9 C -7 7.2 -5.8 6.3 -4.8 6.3 L 4.8 6.3 C 5.8 6.3 7 7.2 7 9 Z" />
      </g>
      {/* Brickwork: mortar courses plus offset joints */}
      <path
        d={[
          'M -4.1 -1.6 L 4.1 -1.6',
          'M -4.0 0.6 L 4.0 0.6',
          'M -4.1 2.8 L 4.1 2.8',
          'M -1.2 -3.4 L -1.2 -1.6',
          'M 1.5 -1.6 L 1.5 0.6',
          'M -1.0 0.6 L -1.0 2.8',
          'M 1.2 2.8 L 1.2 4.9',
        ].join(' ')}
        fill="none" stroke={dark} strokeWidth={0.28} opacity={0.55}
      />
      {/* Glint */}
      <rect x={-3.2} y={-2.8} width={0.85} height={6.6} rx={0.42} fill="white" opacity={0.26} />
    </svg>
  );
}
