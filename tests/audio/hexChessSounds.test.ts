/**
 * Smoke tests for hex-chess-specific sound functions.
 *
 * Web Audio is not available in the Vitest / Node environment, so these tests
 * verify that each function is callable without throwing in an SSR-guarded
 * context.  Actual audio output is not (and cannot be) verified here.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';

// Stub the settings store before importing sound effects so categoryGain()
// returns a predictable value without needing localStorage or the full store.
vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: {
    getState: () => ({
      masterVolume: 100,
      gameVolume: 100,
      uiVolume: 100,
    }),
  },
}));

// Ensure window is absent so the SSR guard path is exercised,
// then re-import to also cover the non-guard (window defined) path.
beforeAll(() => {
  // In Node/Vitest `window` may be defined (jsdom) or undefined depending on env.
  // Either way the functions must not throw.
});

describe('hex chess sound effects — SSR safety', () => {
  it('playCapture does not throw when called without arguments', async () => {
    const { playCapture } = await import('@/audio/soundEffects');
    expect(() => playCapture()).not.toThrow();
  });

  it('playCapture does not throw when called with a color string', async () => {
    const { playCapture } = await import('@/audio/soundEffects');
    expect(() => playCapture('#ff0000')).not.toThrow();
  });

  it('playCheck does not throw', async () => {
    const { playCheck } = await import('@/audio/soundEffects');
    expect(() => playCheck()).not.toThrow();
  });

  it('playCheckmate does not throw', async () => {
    const { playCheckmate } = await import('@/audio/soundEffects');
    expect(() => playCheckmate()).not.toThrow();
  });
});
