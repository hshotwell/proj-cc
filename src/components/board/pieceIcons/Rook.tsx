import React from 'react';

interface PieceIconProps {
  size: number;
  fill: string;
  className?: string;
}

// Rook: castle turret with 3 crenellations, straight body, wide base.
export function RookIcon({ size, fill, className }: PieceIconProps){
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
