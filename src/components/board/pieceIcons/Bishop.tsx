import React from 'react';
import { type PieceIconProps, TurnedGradient, outlineFor, detailFor, svgIdFor } from './shading';

// Bishop: mitre-shaped top with a slit, tapered body, small collar, wide base.
// Detailed mode: smooth onion-dome mitre with carved slit, ball finial, collar
// ring, flaring body, torus base roll, flared plinth, cylindrical shading.
export function BishopIcon({ size, fill, className, detailed, outlined }: PieceIconProps){
  const gid = svgIdFor('bp', fill);
  if (!detailed) {
    return (
      <svg width={size} height={size} viewBox="-10 -10 20 20" className={className}>
        <g stroke={outlined ? outlineFor(fill) : undefined} strokeWidth={outlined ? 0.6 : undefined} strokeLinejoin="round">
        <path
          fill={fill}
          d={[
            // Mitre (pointy hat) — two lobes meeting at top point
            'M 0 -9 L -4 -2 L -1 -2 L -1 1 L 1 1 L 1 -2 L 4 -2 Z',
            // Small ball on tip
            'M -1 -9.5 A 1 1 0 1 1 1 -9.5 A 1 1 0 1 1 -1 -9.5 Z',
            // Collar band
            'M -5 1 L -5 3 L 5 3 L 5 1 Z',
            // Tapered body
            'M -4 3 L -5 7 L 5 7 L 4 3 Z',
            // Base
            'M -6 7 L -6 9 L 6 9 L 6 7 Z',
          ].join(' ')}
        />
      </g>
      </svg>
    );
  }
  const outline = outlineFor(fill);
  const dark = detailFor(fill);
  return (
    <svg width={size} height={size} viewBox="-10 -10 20 20" className={className}>
      <defs><TurnedGradient id={gid} fill={fill} /></defs>
      <g fill={`url(#${gid})`} stroke={outline} strokeWidth={0.3} strokeLinejoin="round">
        {/* Ball finial */}
        <circle cx={0} cy={-8.9} r={0.8} />
        {/* Onion-dome mitre */}
        <path d={[
          'M 0 -8.2',
          'C 1.8 -6.7 3.5 -4.5 3.5 -2.6',
          'C 3.5 -0.7 2.0 0.6 0 0.6',
          'C -2.0 0.6 -3.5 -0.7 -3.5 -2.6',
          'C -3.5 -4.5 -1.8 -6.7 0 -8.2',
          'Z',
        ].join(' ')} />
        {/* Collar ring */}
        <rect x={-3.3} y={0.9} width={6.6} height={1.3} rx={0.65} />
        {/* Flaring body */}
        <path d="M -2.7 2.2 C -3.5 3.9 -4.0 5.2 -4.2 6.6 L 4.2 6.6 C 4.0 5.2 3.5 3.9 2.7 2.2 Z" />
        {/* Base roll + flared plinth */}
        <ellipse cx={0} cy={6.6} rx={4.6} ry={0.75} />
        <path d="M -6 9 C -6 7.4 -5 6.9 -4.2 6.9 L 4.2 6.9 C 5 6.9 6 7.4 6 9 Z" />
      </g>
      {/* Carved mitre slit */}
      <path d="M -1.7 -1.2 L 1.4 -5.2" fill="none" stroke={dark} strokeWidth={0.8} strokeLinecap="round" opacity={0.8} />
      {/* Glints */}
      <ellipse cx={-1.4} cy={-4.2} rx={0.55} ry={1.2} fill="white" opacity={0.32} transform="rotate(18 -1.4 -4.2)" />
      <ellipse cx={-0.25} cy={-9.1} rx={0.26} ry={0.26} fill="white" opacity={0.45} />
    </svg>
  );
}
