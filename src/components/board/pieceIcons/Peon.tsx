import React from 'react';

interface PieceIconProps {
  size: number;
  fill: string;
  className?: string;
}

// Peon (Hex Chess soldier): traditional pawn silhouette — round head, narrow neck,
// tapered body, wide base. Distinguishes from the classical Pawn by having a
// simpler top and slightly beefier body.
export function PeonIcon({ size, fill, className }: PieceIconProps) {
  return (
    <svg width={size} height={size} viewBox="-10 -10 20 20" className={className}>
      <path
        fill={fill}
        d={[
          // Round head
          'M 0 -7 A 2.5 2.5 0 1 1 0 -2 A 2.5 2.5 0 1 1 0 -7 Z',
          // Neck collar
          'M -2.5 -2.5 L 2.5 -2.5 L 3 -1 L -3 -1 Z',
          // Body — tapered
          'M -3 -1 L -3.8 4 L 3.8 4 L 3 -1 Z',
          // Wide base
          'M -5.5 4 L -5.5 7.5 L 5.5 7.5 L 5.5 4 Z',
        ].join(' ')}
      />
    </svg>
  );
}
