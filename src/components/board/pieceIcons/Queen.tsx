import React from 'react';
import { type PieceIconProps, TurnedGradient, outlineFor, detailFor, svgIdFor } from './shading';

// Queen: crown of 5 points on top, tapered body, wide base.
// Detailed mode: tall coronet with concave spikes and pearl tips, waisted body,
// torus base roll, flared plinth, cylindrical shading.
export function QueenIcon({ size, fill, className, detailed, outlined }: PieceIconProps){
  const gid = svgIdFor('qn', fill);
  if (!detailed) {
    return (
      <svg width={size} height={size} viewBox="-10 -10 20 20" className={className}>
        <g stroke={outlined ? outlineFor(fill) : undefined} strokeWidth={outlined ? 0.6 : undefined} strokeLinejoin="round">
        <path
          fill={fill}
          d={[
            // Crown: 5 points alternating high/low across top, then base of crown
            'M -7 -1 L -7 -3 L -5 -8 L -2.5 -3 L 0 -9 L 2.5 -3 L 5 -8 L 7 -3 L 7 -1 Z',
            // Ball on top center
            'M -1.5 -9 A 1.5 1.5 0 1 1 1.5 -9 A 1.5 1.5 0 1 1 -1.5 -9 Z',
            // Body
            'M -6 -1 L -5 5 L 5 5 L 6 -1 Z',
            // Base
            'M -7 5 L -7 8 L 7 8 L 7 5 Z',
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
        {/* Coronet — three tall spikes with concave edges */}
        <path d={[
          'M -6.6 -1.0',
          'Q -6.9 -4.4 -5.2 -7.5',
          'Q -4.4 -3.9 -2.7 -2.9',
          'Q -1.5 -3.9 0 -8.6',
          'Q 1.5 -3.9 2.7 -2.9',
          'Q 4.4 -3.9 5.2 -7.5',
          'Q 6.9 -4.4 6.6 -1.0',
          'Z',
        ].join(' ')} />
        {/* Pearls on spike tips */}
        <circle cx={-5.2} cy={-7.9} r={0.6} />
        <circle cx={0} cy={-9.0} r={0.6} />
        <circle cx={5.2} cy={-7.9} r={0.6} />
        {/* Waisted body */}
        <path d="M -5.6 -0.3 C -4.3 1.4 -4.1 3.4 -4.7 5.2 L 4.7 5.2 C 4.1 3.4 4.3 1.4 5.6 -0.3 Z" />
        {/* Coronet band */}
        <rect x={-6.3} y={-1.6} width={12.6} height={1.3} rx={0.65} />
        {/* Base roll + flared plinth */}
        <ellipse cx={0} cy={5.2} rx={5.3} ry={0.85} />
        <path d="M -7 8.4 C -7 6.7 -5.9 5.9 -4.9 5.9 L 4.9 5.9 C 5.9 5.9 7 6.7 7 8.4 Z" />
      </g>
      {/* Detail: shadow crease under coronet band */}
      <path d="M -5.1 0.5 Q 0 1.1 5.1 0.5" fill="none" stroke={dark} strokeWidth={0.3} opacity={0.55} />
      {/* Glints */}
      <rect x={-3.3} y={0.8} width={0.85} height={3.5} rx={0.42} fill="white" opacity={0.3} />
      <ellipse cx={-0.25} cy={-9.1} rx={0.28} ry={0.28} fill="white" opacity={0.45} />
    </svg>
  );
}
