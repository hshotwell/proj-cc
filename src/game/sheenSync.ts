// Global sheen synchronization via CSS custom properties on :root.
// A single requestAnimationFrame loop drives all metallic sheens,
// ensuring they stay in sync regardless of React re-renders.

let started = false;

const DURATIONS: Record<string, number> = {
  copper: 3.5,
  silver: 2.8,
  gold: 2.2,
};

function update() {
  const t = performance.now() / 1000;
  const root = document.documentElement;
  for (const [key, dur] of Object.entries(DURATIONS)) {
    // Phase cycles from -2.5 to 2.5 (maps to translateX range)
    const phase = ((t % dur) / dur) * 5 - 2.5;
    root.style.setProperty(`--sheen-phase-${key}`, `${phase}`);
  }
  requestAnimationFrame(update);
}

export function startSheenSync() {
  if (started || typeof window === 'undefined') return;
  started = true;
  requestAnimationFrame(update);
}

// Map metallic hex colors to sheen key names
export const METALLIC_SHEEN_KEY: Record<string, string> = {
  '#b87333': 'copper',
  '#c0c0c0': 'silver',
  '#ffd700': 'gold',
};
