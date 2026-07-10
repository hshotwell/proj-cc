import React from 'react';

interface PieceIconProps {
  size: number;
  fill: string;
  className?: string;
}

// Knight: classic chess horse-head silhouette facing left, with defined
// forelock, muzzle, chest, and a wide base plinth. Traced clockwise from
// the tip of the forelock.
export function KnightIcon({ size, fill, className }: PieceIconProps) {
  return (
    <svg width={size} height={size} viewBox="-10 -10 20 20" className={className}>
      <path
        fill={fill}
        d={[
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
          // Base plinth
          'M -6 5.6 L -6 8 L 6 8 L 6 5.6 Z',
        ].join(' ')}
      />
      {/* Eye (small dark spot for character) */}
      <circle cx="-4.5" cy="-3.6" r="0.55" fill="rgba(0,0,0,0.55)" />
    </svg>
  );
}
