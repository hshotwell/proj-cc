'use client';

import { useParams } from 'next/navigation';
import { HexReplayContainer } from '@/components/hexchess/HexReplayContainer';

export default function HexChessReplayPage() {
  const params = useParams<{ id: string }>();
  const gameId = params?.id;
  if (!gameId) return null;
  return <HexReplayContainer gameId={gameId} />;
}
