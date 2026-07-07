import React from 'react';

interface PieceIconProps {
  size: number;
  fill: string;
  className?: string;
}

// Knight: horse head silhouette in profile view facing left, on a base.
export function KnightIcon({ size, fill, className }: PieceIconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="-10 -10 20 20" className={className}>
      <path
        fill={fill}
        d={[
          // Horse head profile (facing left):
          // Start from neck base bottom-right, trace outline clockwise
          'M 4 8',
          // Base bottom
          'L -4 8',
          // Neck left side up
          'L -4 2',
          // Chest / front of neck
          'L -6 -1',
          // Jaw
          'L -5 -3',
          // Mouth / muzzle
          'L -7 -4',
          'L -6 -6',
          // Nose
          'L -4 -5',
          // Forehead up to ear
          'L -3 -8',
          'L -1 -9',
          // Ear tip
          'L 1 -7',
          // Back of head down
          'L 2 -5',
          // Crest of neck
          'L 4 -3',
          'L 5 0',
          // Shoulder / withers
          'L 4 3',
          'Z',
        ].join(' ')}
      />
      {/* Base platform */}
      <path fill={fill} d="M -5 8 L -5 9.5 L 5 9.5 L 5 8 Z" />
    </svg>
  );
}
