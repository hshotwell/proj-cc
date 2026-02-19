'use client';

import { useEffect } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuthStore } from '@/store/authStore';

const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds

export function usePresence() {
  const { isAuthenticated } = useAuthStore();
  const heartbeat = useMutation(api.presence.heartbeat);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Initial heartbeat
    void heartbeat();

    const interval = setInterval(() => {
      void heartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isAuthenticated, heartbeat]);
}
