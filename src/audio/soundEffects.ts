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

// Coalesce identical rapid-fire calls (prevents overlapping same-sound chains).
const lastPlayedAt: Record<string, number> = {};
const COALESCE_MS = 8;

function shouldCoalesce(key: string): boolean {
  const now = performance.now();
  const prev = lastPlayedAt[key];
  if (prev !== undefined && now - prev < COALESCE_MS) return true;
  lastPlayedAt[key] = now;
  return false;
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
}

function playTone(spec: ToneSpec): void {
  if (shouldCoalesce(spec.key)) return;

  const gain = categoryGain(spec.category);
  if (gain <= 0) return;

  const c = getContext();
  if (!c) return;

  const now = c.currentTime;
  const master = c.createGain();
  master.gain.value = gain;
  master.connect(c.destination);

  // Primary oscillator
  const osc = c.createOscillator();
  osc.type = spec.type;
  osc.frequency.value = spec.freq;
  const oscGain = c.createGain();
  oscGain.gain.setValueAtTime(spec.peakGain, now);
  oscGain.gain.exponentialRampToValueAtTime(0.0001, now + spec.duration);
  osc.connect(oscGain).connect(master);
  osc.start(now);
  osc.stop(now + spec.duration + 0.02);

  // Optional second oscillator (for thicker sounds like confirm)
  if (spec.freq2 !== undefined) {
    const osc2 = c.createOscillator();
    osc2.type = spec.type2 ?? spec.type;
    osc2.frequency.value = spec.freq2;
    const osc2Gain = c.createGain();
    osc2Gain.gain.setValueAtTime(spec.peakGain2 ?? spec.peakGain, now);
    osc2Gain.gain.exponentialRampToValueAtTime(0.0001, now + spec.duration);
    osc2.connect(osc2Gain).connect(master);
    osc2.start(now);
    osc2.stop(now + spec.duration + 0.02);
  }

  // Optional filtered noise burst (adds the "click" impact)
  if (spec.noise) {
    const { duration: nDur, filterFreq, peakGain: nPeak } = spec.noise;
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

export function playStep(): void {
  playTone({
    category: 'game',
    key: 'step',
    type: 'sine',
    freq: 220,
    duration: 0.08,
    peakGain: 0.35,
    noise: { duration: 0.02, filterFreq: 1800, peakGain: 0.5 },
  });
}

export function playJump(chainIndex: number = 0): void {
  const detune = Math.min(chainIndex, 8) * 8;
  playTone({
    category: 'game',
    key: 'jump',
    type: 'sine',
    freq: 380 + detune,
    duration: 0.065,
    peakGain: 0.32,
    noise: { duration: 0.015, filterFreq: 4000, peakGain: 0.45 },
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

export function playSelect(): void {
  playTone({
    category: 'ui',
    key: 'select',
    type: 'triangle',
    freq: 900,
    duration: 0.03,
    peakGain: 0.28,
  });
}

export function playDeselect(): void {
  playTone({
    category: 'ui',
    key: 'deselect',
    type: 'triangle',
    freq: 600,
    duration: 0.03,
    peakGain: 0.28,
  });
}

export function playClick(): void {
  playTone({
    category: 'ui',
    key: 'click',
    type: 'triangle',
    freq: 1200,
    duration: 0.02,
    peakGain: 0.22,
  });
}
