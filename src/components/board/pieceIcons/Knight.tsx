import React from 'react';
import { type PieceIconProps, TurnedGradient, outlineFor, detailFor, svgIdFor } from './shading';

// Knight: classic chess horse-head silhouette facing left, with defined
// forelock, muzzle, chest, and a wide base plinth. Traced clockwise from
// the tip of the forelock.
// Detailed mode: same silhouette with cylindrical shading, mane strokes,
// nostril, mouth, ear detail, and a flared plinth.
const HEAD_PATH = [
  // Head silhouette (facing left)
  'M -3.4 -8.6',           // top of forelock
  'C -2.6 -8.4 -1.6 -8.8 -0.8 -8.4', // forelock curve
  'L 0.6 -7.4',             // ear back
  'C 1.6 -7.8 2.4 -7.4 2.8 -6.4',    // ear/skull top
  'C 3.6 -4.8 4.2 -3.4 4.6 -1.6',    // back of skull down neck
  'C 5.0 0.4 5.6 2.4 5.4 4.4',       // arched neck to withers
  'L 5.4 5.6',
  'L -5.4 5.6',
  'C -5.6 4.4 -5.2 3.2 -4.6 2.4',    // chest
  'C -4.0 1.4 -3.2 0.6 -3.6 -0.6',   // throat
  'C -4.4 -1.6 -5.8 -1.4 -6.8 -2.0', // jaw/chin
  'L -7.2 -3.2',            // muzzle tip
  'C -7.0 -4.2 -6.4 -4.6 -5.6 -4.8', // upper muzzle
  'L -4.8 -5.2',            // top of nose
  'C -4.4 -6.2 -4.0 -7.4 -3.4 -8.6', // forehead back to forelock
  'Z',
].join(' ');

export function KnightIcon({ size, fill, className, detailed }: PieceIconProps) {
  const gid = svgIdFor('kn', fill);
  if (!detailed) {
    return (
      <svg width={size} height={size} viewBox="-10 -10 20 20" className={className}>
        <path
          fill={fill}
          d={[
            HEAD_PATH,
            // Base plinth
            'M -6 5.6 L -6 8 L 6 8 L 6 5.6 Z',
          ].join(' ')}
        />
        {/* Eye (small dark spot for character) */}
        <circle cx="-4.5" cy="-3.6" r="0.55" fill="rgba(0,0,0,0.55)" />
      </svg>
    );
  }
  const outline = outlineFor(fill);
  const dark = detailFor(fill);
  return (
    <svg width={size} height={size} viewBox="-10 -10 20 20" className={className}>
      <defs><TurnedGradient id={gid} fill={fill} /></defs>
      <g fill={`url(#${gid})`} stroke={outline} strokeWidth={0.3} strokeLinejoin="round">
        <path d={HEAD_PATH} />
        {/* Flared plinth */}
        <path d="M -6.2 8.2 C -6.2 6.4 -5.2 5.5 -4.3 5.5 L 4.3 5.5 C 5.2 5.5 6.2 6.4 6.2 8.2 Z" />
      </g>
      {/* Mane — curved strokes along the back of the neck */}
      <path
        d={[
          'M 2.6 -5.6 C 3.6 -3.4 4.2 -1.0 4.4 1.6',
          'M 1.4 -6.4 C 2.4 -4.2 3.0 -1.8 3.2 0.8',
        ].join(' ')}
        fill="none" stroke={dark} strokeWidth={0.35} strokeLinecap="round" opacity={0.55}
      />
      {/* Cheek/jowl contour */}
      <path d="M -2.6 -1.6 C -1.8 -0.8 -1.6 0.2 -2.0 1.2" fill="none" stroke={dark} strokeWidth={0.32} strokeLinecap="round" opacity={0.4} />
      {/* Ear inner line */}
      <path d="M 1.2 -7.3 Q 1.9 -7.1 2.2 -6.5" fill="none" stroke={dark} strokeWidth={0.32} strokeLinecap="round" opacity={0.55} />
      {/* Mouth + nostril */}
      <path d="M -7.0 -2.6 C -6.6 -2.3 -6.1 -2.2 -5.7 -2.3" fill="none" stroke={dark} strokeWidth={0.3} strokeLinecap="round" opacity={0.6} />
      <circle cx={-6.3} cy={-3.5} r={0.32} fill={dark} opacity={0.7} />
      {/* Eye with glint */}
      <circle cx={-4.5} cy={-3.6} r={0.55} fill="rgba(0,0,0,0.6)" />
      <circle cx={-4.65} cy={-3.75} r={0.16} fill="white" opacity={0.8} />
      {/* Glint down the forehead */}
      <path d="M -4.0 -7.2 C -4.4 -6.2 -4.7 -5.4 -4.9 -4.6" fill="none" stroke="white" strokeWidth={0.5} strokeLinecap="round" opacity={0.3} />
    </svg>
  );
}
