'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useReplayStore } from '@/store/replayStore';
import { useAIReviewStore } from '@/store/aiReviewStore';
import { ReviewContainer } from '@/components/review/ReviewContainer';

export default function ReviewPage() {
  const router = useRouter();
  const params = useParams();
  const { isReplayActive, loadReplay, closeReplay } = useReplayStore();
  const { setActiveGameId } = useAIReviewStore();

  useEffect(() => {
    if (!isReplayActive) {
      const id = params.id as string;
      const success = loadReplay(id);
      if (!success) {
        router.replace('/replays');
      } else {
        setActiveGameId(id);
      }
    }
  }, [isReplayActive, params.id, loadReplay, router, setActiveGameId]);

  useEffect(() => {
    return () => {
      closeReplay();
      setActiveGameId(null);
    };
  }, [closeReplay, setActiveGameId]);

  if (!isReplayActive) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading review…</div>
      </div>
    );
  }

  return <ReviewContainer />;
}
