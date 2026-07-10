import React from 'react';

interface PieceIconProps {
  size: number;
  fill: string;
  className?: string;
}

// Pawn (classical): smaller round head, thin tapered body, narrower base than the Peon.
export function PawnIcon({ size, fill, className }: PieceIconProps) {
  return (
    <svg width={size} height={size} viewBox="-10 -10 20 20" className={className}>
      <path
        fill={fill}
        d={[
          // Small round head
          'M 0 -7.5 A 2 2 0 1 1 0 -3.5 A 2 2 0 1 1 0 -7.5 Z',
          // Neck
          'M -1.8 -3.7 L 1.8 -3.7 L 2.3 -2.4 L -2.3 -2.4 Z',
          // Slim body — tapered
          'M -2.3 -2.4 L -3 4 L 3 4 L 2.3 -2.4 Z',
          // Base — narrower than the Peon
          'M -4.5 4 L -4.5 7 L 4.5 7 L 4.5 4 Z',
        ].join(' ')}
      />
    </svg>
  );
}
