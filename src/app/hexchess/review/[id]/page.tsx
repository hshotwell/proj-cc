'use client';

import { useParams } from 'next/navigation';
import { HexReviewContainer } from '@/components/hexchess/HexReviewContainer';

export default function HexChessReviewPage() {
  const params = useParams<{ id: string }>();
  const gameId = params?.id;
  if (!gameId) return null;
  return <HexReviewContainer gameId={gameId} />;
}
