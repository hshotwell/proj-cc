'use client';

import { useEffect } from 'react';
import { playClick, playHover } from '@/audio/soundEffects';

// Global UI-sound delegator.
//
// - Click on any button / link / checkbox / native select change → playClick (deep).
// - Mouseenter on elements marked [data-hover-sound] → playHover (light ping).
//
// Opt out of the click sound with data-no-click-sound on the element or an ancestor.
// Board pieces are SVG elements (not buttons), so piece selection stays silent.
export function GlobalClickSound() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const clickHandler = (e: MouseEvent) => {
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

    const changeHandler = (e: Event) => {
      const target = e.target as Element | null;
      if (!target) return;
      if (target instanceof HTMLSelectElement) {
        if (target.closest('[data-no-click-sound]')) return;
        playClick();
      }
    };

    // Fire once per distinct hover "unit" (button/link/label) inside a
    // data-hover-sound container. Marking a button directly counts as a unit
    // by itself; marking a container makes each child button ping on entry.
    let lastHoverUnit: Element | null = null;
    const hoverHandler = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) {
        lastHoverUnit = null;
        return;
      }
      const unit = target.closest('button, a, [role="button"], label');
      if (!unit || !unit.closest('[data-hover-sound]')) {
        lastHoverUnit = null;
        return;
      }
      if (unit === lastHoverUnit) return;
      lastHoverUnit = unit;
      if (unit instanceof HTMLButtonElement && unit.disabled) return;
      playHover();
    };

    document.addEventListener('click', clickHandler, true);
    document.addEventListener('change', changeHandler, true);
    document.addEventListener('mouseover', hoverHandler, true);
    return () => {
      document.removeEventListener('click', clickHandler, true);
      document.removeEventListener('change', changeHandler, true);
      document.removeEventListener('mouseover', hoverHandler, true);
    };
  }, []);

  return null;
}
