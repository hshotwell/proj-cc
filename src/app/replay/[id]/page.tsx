'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ReplayContainer } from '@/components/replay';
import { useReplayStore } from '@/store/replayStore';

export default function ReplayPage() {
  const router = useRouter();
  const params = useParams();
  const { isReplayActive, loadReplay, closeReplay } = useReplayStore();

  useEffect(() => {
    // If replay not already loaded, try to load from persistence
    if (!isReplayActive) {
      const id = params.id as string;
      const success = loadReplay(id);
      if (!success) {
        router.replace('/replays');
      }
    }
  }, [isReplayActive, params.id, loadReplay, router]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      closeReplay();
    };
  }, [closeReplay]);

  if (!isReplayActive) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading replay...</div>
      </div>
    );
  }

  return <ReplayContainer />;
}
