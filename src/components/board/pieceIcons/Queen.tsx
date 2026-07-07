import React from 'react';

interface PieceIconProps {
  size: number;
  fill: string;
  className?: string;
}

// Queen: crown of 5 points on top, tapered body, wide base.
export function QueenIcon({ size, fill, className }: PieceIconProps){
  return (
    <svg width={size} height={size} viewBox="-10 -10 20 20" className={className}>
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
    </svg>
  );
}
