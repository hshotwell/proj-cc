'use client';

import { useSettingsStore } from '@/store/settingsStore';

type WebkitWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

let ctx: AudioContext | null = null;
let ctxFailed = false;
let resumeListenerAttached = false;

function getContext(): AudioContext | null {
  if (ctxFailed) return null;
  if (ctx) return ctx;
  if (typeof window === 'undefined') return null;

  const w = window as WebkitWindow;
  const Ctor = window.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) {
    ctxFailed = true;
    return null;
  }

  try {
    ctx = new Ctor();
  } catch {
    ctxFailed = true;
    return null;
  }

  if (!resumeListenerAttached) {
    const resume = () => {
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    };
    window.addEventListener('pointerdown', resume, { passive: true });
    window.addEventListener('keydown', resume);
    resumeListenerAttached = true;
  }

  return ctx;
}

type Category = 'game' | 'ui';

function categoryGain(category: Category): number {
  const s = useSettingsStore.getState();
  const master = (s.masterVolume ?? 0) / 100;
  const cat = ((category === 'game' ? s.gameVolume : s.uiVolume) ?? 0) / 100;
  return master * cat;
}

// Coalesce identical rapid-fire calls (prevents overlapping same-sound spam).
const lastPlayedAt: Record<string, number> = {};
const COALESCE_MS = 8;

function shouldCoalesce(key: string): boolean {
  const now = performance.now();
  const prev = lastPlayedAt[key];
  if (prev !== undefined && now - prev < COALESCE_MS) return true;
  lastPlayedAt[key] = now;
  return false;
}

// Symmetric random factor in [1-pct, 1+pct].
function jitter(pct: number): number {
  return 1 + (Math.random() * 2 - 1) * pct;
}

interface ToneSpec {
  category: Category;
  key: string;
  freq: number;
  type: OscillatorType;
  duration: number;      // seconds
  peakGain: number;      // 0..1, multiplied by categoryGain
  freq2?: number;        // optional second oscillator
  type2?: OscillatorType;
  peakGain2?: number;
  noise?: { duration: number; filterFreq: number; peakGain: number };
  freqJitter?: number;   // fractional randomization on freq (default 0.03)
  gainJitter?: number;   // fractional randomization on peakGain (default 0.1)
  durationJitter?: number; // fractional randomization on duration (default 0.1)
}

function playTone(spec: ToneSpec): void {
  if (shouldCoalesce(spec.key)) return;

  const gain = categoryGain(spec.category);
  if (gain <= 0) return;

  const c = getContext();
  if (!c) return;

  const fJ = spec.freqJitter ?? 0.03;
  const gJ = spec.gainJitter ?? 0.1;
  const dJ = spec.durationJitter ?? 0.1;

  const freq = spec.freq * jitter(fJ);
  const duration = spec.duration * jitter(dJ);
  const peakGain = spec.peakGain * jitter(gJ);

  const now = c.currentTime;
  const master = c.createGain();
  master.gain.value = gain;
  master.connect(c.destination);

  // Primary oscillator
  const osc = c.createOscillator();
  osc.type = spec.type;
  osc.frequency.value = freq;
  const oscGain = c.createGain();
  oscGain.gain.setValueAtTime(peakGain, now);
  oscGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(oscGain).connect(master);
  osc.start(now);
  osc.stop(now + duration + 0.02);

  // Optional second oscillator (for thicker sounds like confirm)
  if (spec.freq2 !== undefined) {
    const freq2 = spec.freq2 * jitter(fJ);
    const peakGain2 = (spec.peakGain2 ?? spec.peakGain) * jitter(gJ);
    const osc2 = c.createOscillator();
    osc2.type = spec.type2 ?? spec.type;
    osc2.frequency.value = freq2;
    const osc2Gain = c.createGain();
    osc2Gain.gain.setValueAtTime(peakGain2, now);
    osc2Gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc2.connect(osc2Gain).connect(master);
    osc2.start(now);
    osc2.stop(now + duration + 0.02);
  }

  // Optional filtered noise burst (adds the "click" impact)
  if (spec.noise) {
    const nDur = spec.noise.duration * jitter(dJ);
    const filterFreq = spec.noise.filterFreq * jitter(fJ);
    const nPeak = spec.noise.peakGain * jitter(gJ);
    const bufferLen = Math.max(1, Math.floor(c.sampleRate * nDur));
    const buffer = c.createBuffer(1, bufferLen, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferLen; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferLen);
    }
    const src = c.createBufferSource();
    src.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const nGain = c.createGain();
    nGain.gain.setValueAtTime(nPeak, now);
    nGain.gain.exponentialRampToValueAtTime(0.0001, now + nDur);
    src.connect(filter).connect(nGain).connect(master);
    src.start(now);
    src.stop(now + nDur + 0.02);
  }
}

// Landing in the player's goal triangle plays a deeper variant of the marble sound.
const ENDZONE_FREQ_SCALE = 0.65;

export function playStep(inEndzone: boolean = false): void {
  const scale = inEndzone ? ENDZONE_FREQ_SCALE : 1;
  playTone({
    category: 'game',
    key: inEndzone ? 'step-goal' : 'step',
    type: 'sine',
    freq: 340 * scale,
    duration: inEndzone ? 0.09 : 0.06,
    peakGain: 0.22,
    noise: { duration: 0.012, filterFreq: 2000 * scale, peakGain: 0.32 },
  });
}

export function playJump(chainIndex: number = 0, inEndzone: boolean = false): void {
  const detune = Math.min(chainIndex, 8) * 8;
  const scale = inEndzone ? ENDZONE_FREQ_SCALE : 1;
  playTone({
    category: 'game',
    key: inEndzone ? 'jump-goal' : 'jump',
    type: 'sine',
    freq: (270 + detune) * scale,
    duration: inEndzone ? 0.09 : 0.07,
    peakGain: 0.36,
    freq2: (540 + detune * 2) * scale,
    type2: 'sine',
    peakGain2: 0.12,
    noise: { duration: 0.018, filterFreq: 3200 * scale, peakGain: 0.5 },
  });
}

export function playConfirm(): void {
  playTone({
    category: 'game',
    key: 'confirm',
    type: 'sine',
    freq: 150,
    duration: 0.1,
    peakGain: 0.22,
    freq2: 300,
    type2: 'sine',
    peakGain2: 0.14,
  });
}

// Deep, satisfying "select" click for actual button activation.
export function playClick(): void {
  playTone({
    category: 'ui',
    key: 'click',
    type: 'triangle',
    freq: 480,
    duration: 0.05,
    peakGain: 0.28,
    freq2: 240,
    type2: 'sine',
    peakGain2: 0.14,
    noise: { duration: 0.01, filterFreq: 2200, peakGain: 0.18 },
  });
}

// Light, brighter ping used for hover / focus feedback on primary controls.
export function playHover(): void {
  playTone({
    category: 'ui',
    key: 'hover',
    type: 'triangle',
    freq: 1000,
    duration: 0.04,
    peakGain: 0.18,
    freq2: 2000,
    type2: 'triangle',
    peakGain2: 0.08,
    freqJitter: 0.05,
  });
}

// Notification sounds — simple pitched sequences scheduled inline.
function playSequence(
  category: Category,
  key: string,
  notes: { freq: number; delay: number; duration: number; peakGain: number; type?: OscillatorType }[]
): void {
  if (shouldCoalesce(key)) return;
  const gain = categoryGain(category);
  if (gain <= 0) return;
  const c = getContext();
  if (!c) return;
  const start = c.currentTime;
  const master = c.createGain();
  master.gain.value = gain;
  master.connect(c.destination);
  for (const n of notes) {
    const osc = c.createOscillator();
    osc.type = n.type ?? 'triangle';
    osc.frequency.value = n.freq * jitter(0.02);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, start + n.delay);
    g.gain.exponentialRampToValueAtTime(n.peakGain * jitter(0.08), start + n.delay + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, start + n.delay + n.duration);
    osc.connect(g).connect(master);
    osc.start(start + n.delay);
    osc.stop(start + n.delay + n.duration + 0.02);
  }
}

// Cheerful two-note rising chime for a friend's game invite.
export function playInvite(): void {
  playSequence('ui', 'invite', [
    { freq: 660, delay: 0,    duration: 0.13, peakGain: 0.28 },
    { freq: 990, delay: 0.12, duration: 0.18, peakGain: 0.28 },
  ]);
}

// Soft double-tap alert when it becomes your turn.
export function playYourTurn(): void {
  playSequence('ui', 'your-turn', [
    { freq: 620, delay: 0,    duration: 0.12, peakGain: 0.22 },
    { freq: 830, delay: 0.11, duration: 0.16, peakGain: 0.22 },
  ]);
}

// Falling three-note resolution when the game ends.
export function playGameOver(): void {
  playSequence('ui', 'game-over', [
    { freq: 880, delay: 0,    duration: 0.18, peakGain: 0.26, type: 'sine' },
    { freq: 660, delay: 0.16, duration: 0.22, peakGain: 0.26, type: 'sine' },
    { freq: 440, delay: 0.34, duration: 0.34, peakGain: 0.28, type: 'sine' },
  ]);
}

// --- Hex chess sound effects ---

// Percussive marble-collision sound for a piece capture.
// Lower pitch and shorter envelope than playJump — conveys impact rather than travel.
// The optional color parameter is accepted for future tonal variation per piece color
// but currently has no effect on the synthesis.
export function playCapture(_color?: string): void {
  playTone({
    category: 'game',
    key: 'capture',
    type: 'sine',
    freq: 180,
    duration: 0.055,
    peakGain: 0.42,
    freq2: 360,
    type2: 'sine',
    peakGain2: 0.15,
    noise: { duration: 0.025, filterFreq: 2400, peakGain: 0.65 },
    freqJitter: 0.04,
    gainJitter: 0.08,
  });
}

// Short bell-like chime signalling that the opponent's king is in check.
export function playCheck(): void {
  playSequence('game', 'check', [
    { freq: 1320, delay: 0,    duration: 0.25, peakGain: 0.3,  type: 'sine' },
    { freq: 1760, delay: 0.04, duration: 0.18, peakGain: 0.18, type: 'triangle' },
  ]);
}

// Descending 3-note motif signalling checkmate — ~800 ms total.
export function playCheckmate(): void {
  playSequence('game', 'checkmate', [
    { freq: 880, delay: 0,    duration: 0.28, peakGain: 0.34, type: 'sine' },
    { freq: 660, delay: 0.26, duration: 0.28, peakGain: 0.32, type: 'sine' },
    { freq: 440, delay: 0.54, duration: 0.38, peakGain: 0.36, type: 'sine' },
  ]);
}
