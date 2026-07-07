import React from 'react';

interface PieceIconProps {
  size: number;
  fill: string;
  className?: string;
}

// Bishop: mitre-shaped top with a slit, tapered body, small collar, wide base.
export function BishopIcon({ size, fill, className }: PieceIconProps){
  return (
    <svg width={size} height={size} viewBox="-10 -10 20 20" className={className}>
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
    </svg>
  );
}
