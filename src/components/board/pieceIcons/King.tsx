import React from 'react';

interface PieceIconProps {
  size: number;
  fill: string;
  className?: string;
}

// King: small cross on top, wide crown base with 3 points, tapered body, flat base.
export function KingIcon({ size, fill, className }: PieceIconProps){
  return (
    <svg width={size} height={size} viewBox="-10 -10 20 20" className={className}>
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
    </svg>
  );
}
