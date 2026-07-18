import React from 'react';
import { type PieceIconProps, TurnedGradient, outlineFor, detailFor, svgIdFor } from './shading';

// King: small cross on top, wide crown base with 3 points, tapered body, flat base.
// Detailed mode: smooth-curved crown with pearl tips, waisted body, torus base
// roll, flared plinth, cylindrical shading.
export function KingIcon({ size, fill, className, detailed, outlined }: PieceIconProps){
  const gid = svgIdFor('kg', fill);
  if (!detailed) {
    return (
      <svg width={size} height={size} viewBox="-10 -10 20 20" className={className}>
        <g stroke={outlined ? outlineFor(fill) : undefined} strokeWidth={outlined ? 0.6 : undefined} strokeLinejoin="round">
        <path
          fill={fill}
          d={[
            // Cross on top
            'M -1.5 -9 L -1.5 -7 L -3.5 -7 L -3.5 -5 L -1.5 -5 L -1.5 -3 L 1.5 -3 L 1.5 -5 L 3.5 -5 L 3.5 -7 L 1.5 -7 L 1.5 -9 Z',
            // Crown base: 3 points
            'M -6 -1 L -6 -3 L -3 0 L 0 -3 L 3 0 L 6 -3 L 6 -1 Z',
            // Body
            'M -5 -1 L -4 5 L 4 5 L 5 -1 Z',
            // Base
            'M -6 5 L -6 8 L 6 8 L 6 5 Z',
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
        {/* Cross — rounded arms */}
        <rect x={-0.85} y={-9.7} width={1.7} height={4.2} rx={0.6} />
        <rect x={-2.5} y={-8.55} width={5} height={1.6} rx={0.6} />
        {/* Crown — three smooth peaks */}
        <path d={[
          'M -6.2 -0.9',
          'C -6.5 -1.9 -6.3 -3.1 -5.5 -4.1',
          'Q -4.1 -1.9 -2.7 -1.5',
          'Q -1.1 -1.9 0 -4.7',
          'Q 1.1 -1.9 2.7 -1.5',
          'Q 4.1 -1.9 5.5 -4.1',
          'C 6.3 -3.1 6.5 -1.9 6.2 -0.9',
          'Z',
        ].join(' ')} />
        {/* Pearls on crown tips */}
        <circle cx={-5.5} cy={-4.5} r={0.62} />
        <circle cx={0} cy={-5.2} r={0.62} />
        <circle cx={5.5} cy={-4.5} r={0.62} />
        {/* Waisted body */}
        <path d="M -5.0 0.1 C -3.9 1.5 -3.7 3.4 -4.3 5.2 L 4.3 5.2 C 3.7 3.4 3.9 1.5 5.0 0.1 Z" />
        {/* Crown band */}
        <rect x={-6.2} y={-1.2} width={12.4} height={1.3} rx={0.65} />
        {/* Base roll + flared plinth */}
        <ellipse cx={0} cy={5.2} rx={5.0} ry={0.85} />
        <path d="M -6.5 8.4 C -6.5 6.7 -5.4 5.9 -4.5 5.9 L 4.5 5.9 C 5.4 5.9 6.5 6.7 6.5 8.4 Z" />
      </g>
      {/* Detail: shadow crease under crown band */}
      <path d="M -4.7 0.9 Q 0 1.5 4.7 0.9" fill="none" stroke={dark} strokeWidth={0.3} opacity={0.55} />
      {/* Glints */}
      <rect x={-3.0} y={1.0} width={0.85} height={3.4} rx={0.42} fill="white" opacity={0.3} />
      <ellipse cx={-0.35} cy={-8.4} rx={0.45} ry={0.9} fill="white" opacity={0.35} />
    </svg>
  );
}
