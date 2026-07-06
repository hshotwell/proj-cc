'use client';

import { useEffect } from 'react';
import { playClick } from '@/audio/soundEffects';

// Global delegator: play a UI click for any <button> or <a> activation
// anywhere in the app. Board pieces are SVG elements and don't match.
// Opt out by adding data-no-click-sound to the element (or an ancestor).
export function GlobalClickSound() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handler = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      const trigger = target.closest(
        'button, a, [role="button"], label, input[type="checkbox"], input[type="radio"]'
      );
      if (!trigger) return;
      if (trigger.closest('[data-no-click-sound]')) return;
      if (trigger instanceof HTMLButtonElement && trigger.disabled) return;
      playClick();
    };

    // Capture phase so we still fire even if a handler calls stopPropagation.
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, []);

  return null;
}
