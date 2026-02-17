'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useConvexAuth, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useLayoutStore } from '@/store/layoutStore';
import { MigrationDialog } from './MigrationDialog';
import { hasMigrated } from '@/services/migration';

export function AuthSync() {
  const { isAuthenticated: isConvexAuthed, isLoading: isConvexLoading } = useConvexAuth();
  const profile = useQuery(api.users.getProfile);
  const { setUser, setLoading, clearAuth, isAuthenticated } = useAuthStore();
  const { syncFromCloud: syncSettings } = useSettingsStore();
  const { syncFromCloud: syncLayouts } = useLayoutStore();
  const hasSynced = useRef(false);
  const [showMigration, setShowMigration] = useState(false);

  const handleMigrationComplete = useCallback(() => {
    setShowMigration(false);
    Promise.all([syncSettings(), syncLayouts()]).catch((e) => {
      console.error('Error syncing data from cloud:', e);
    });
  }, [syncSettings, syncLayouts]);

  useEffect(() => {
    if (isConvexLoading) {
      setLoading(true);
      return;
    }

    if (isConvexAuthed && profile) {
      const wasAuthenticated = isAuthenticated;
      setUser({
        id: profile.id,
        email: profile.email,
        name: profile.name,
        image: profile.image,
        username: profile.username ?? undefined,
        isEmailVerified: profile.isEmailVerified,
      });

      if (!wasAuthenticated && !hasSynced.current) {
        hasSynced.current = true;

        if (!hasMigrated()) {
          setShowMigration(true);
        } else {
          Promise.all([syncSettings(), syncLayouts()]).catch((e) => {
            console.error('Error syncing data from cloud:', e);
          });
        }
      }
    } else if (!isConvexAuthed && !isConvexLoading) {
      clearAuth();
      hasSynced.current = false;
    }
  }, [isConvexAuthed, isConvexLoading, profile, setUser, setLoading, clearAuth, isAuthenticated, syncSettings, syncLayouts]);

  if (showMigration) {
    return <MigrationDialog onComplete={handleMigrationComplete} />;
  }

  return null;
}
