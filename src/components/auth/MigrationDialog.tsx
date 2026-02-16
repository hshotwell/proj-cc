'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import {
  checkLocalData,
  hasMigrated,
  migrateToCloud,
  skipMigration,
  type LocalDataSummary,
  type MigrationOptions,
} from '@/services/migration';

interface MigrationDialogProps {
  onComplete: () => void;
}

export function MigrationDialog({ onComplete }: MigrationDialogProps) {
  const { isAuthenticated } = useAuthStore();
  const [localData, setLocalData] = useState<LocalDataSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMigrating, setIsMigrating] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Options state
  const [migrateSettings, setMigrateSettings] = useState(true);
  const [migrateLayouts, setMigrateLayouts] = useState(true);
  const [migrateGames, setMigrateGames] = useState(true);
  const [settingsConflict, setSettingsConflict] = useState<'local' | 'cloud'>('local');

  useEffect(() => {
    async function check() {
      if (!isAuthenticated) {
        setShowDialog(false);
        setIsLoading(false);
        return;
      }

      // Skip if already migrated
      if (hasMigrated()) {
        setShowDialog(false);
        setIsLoading(false);
        onComplete();
        return;
      }

      // Check for local data
      const data = await checkLocalData();
      setLocalData(data);

      // Show dialog if there's data to migrate
      const hasData = data.hasSettings || data.layoutCount > 0 || data.gameCount > 0;
      setShowDialog(hasData);
      setIsLoading(false);

      if (!hasData) {
        onComplete();
      }
    }

    check();
  }, [isAuthenticated, onComplete]);

  const handleMigrate = async () => {
    setIsMigrating(true);
    setError(null);

    try {
      const options: MigrationOptions = {
        migrateSettings,
        migrateLayouts,
        migrateGames,
        settingsConflict,
        layoutConflict: 'merge',
        gameConflict: 'merge',
      };

      const result = await migrateToCloud(options);

      if (!result.success) {
        setError(result.errors.join(', '));
      } else {
        setShowDialog(false);
        onComplete();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Migration failed');
    } finally {
      setIsMigrating(false);
    }
  };

  const handleSkip = () => {
    skipMigration();
    setShowDialog(false);
    onComplete();
  };

  if (isLoading || !showDialog || !localData) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Import Local Data
        </h2>

        <p className="text-gray-600 mb-4">
          We found existing data on this device. Would you like to import it to your account?
        </p>

        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <h3 className="font-medium text-gray-900 mb-2">Found on this device:</h3>
          <ul className="space-y-1 text-sm text-gray-600">
            {localData.hasSettings && (
              <li className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="settings"
                  checked={migrateSettings}
                  onChange={(e) => setMigrateSettings(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="settings">Settings preferences</label>
              </li>
            )}
            {localData.layoutCount > 0 && (
              <li className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="layouts"
                  checked={migrateLayouts}
                  onChange={(e) => setMigrateLayouts(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="layouts">
                  {localData.layoutCount} custom board{localData.layoutCount !== 1 ? 's' : ''}
                </label>
              </li>
            )}
            {localData.gameCount > 0 && (
              <li className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="games"
                  checked={migrateGames}
                  onChange={(e) => setMigrateGames(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="games">
                  {localData.gameCount} saved game{localData.gameCount !== 1 ? 's' : ''}
                </label>
              </li>
            )}
          </ul>
        </div>

        {localData.hasSettings && migrateSettings && (
          <div className="mb-4">
            <p className="text-sm text-gray-600 mb-2">
              If you have existing cloud settings, which should we keep?
            </p>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="settingsConflict"
                  value="local"
                  checked={settingsConflict === 'local'}
                  onChange={() => setSettingsConflict('local')}
                />
                Use local settings
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="settingsConflict"
                  value="cloud"
                  checked={settingsConflict === 'cloud'}
                  onChange={() => setSettingsConflict('cloud')}
                />
                Keep cloud settings
              </label>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleSkip}
            disabled={isMigrating}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Skip
          </button>
          <button
            onClick={handleMigrate}
            disabled={isMigrating || (!migrateSettings && !migrateLayouts && !migrateGames)}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-50"
          >
            {isMigrating ? 'Importing...' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
