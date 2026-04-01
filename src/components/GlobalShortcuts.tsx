'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useSettingsStore } from '@/store/settingsStore';
import { SettingsPopup } from './SettingsPopup';

// Global keyboard shortcuts and settings availability for all pages.
// Pages that render their own SettingsPopup (with game-specific controls) are excluded
// from the global SettingsPopup render to avoid duplicates.
const PAGES_WITH_OWN_SETTINGS = ['/game/', '/editor', '/replay/', '/online/'];

export function GlobalShortcuts() {
  const pathname = usePathname();
  const { toggleSettingsMenu, toggleDarkMode, toggleGlassPieces } = useSettingsStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        toggleSettingsMenu();
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        toggleDarkMode();
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        toggleGlassPieces();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSettingsMenu, toggleDarkMode, toggleGlassPieces]);

  const hasOwnSettings = PAGES_WITH_OWN_SETTINGS.some(p => pathname?.startsWith(p));
  if (hasOwnSettings) return null;

  return <SettingsPopup mode="game" />;
}
