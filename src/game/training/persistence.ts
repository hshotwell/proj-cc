import type { Genome, Individual, TrainingConfig, GenerationResult } from '@/types/training';

const STORAGE_KEY = 'chinese-checkers-evolved-ai';
const SESSION_KEY = 'chinese-checkers-training-session';

export function saveEvolvedGenome(genome: Genome): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(genome));
  } catch {
    // ignore storage errors
  }
}

export function loadEvolvedGenome(): Genome | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Genome;
  } catch {
    return null;
  }
}

export function hasEvolvedGenome(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export function clearEvolvedGenome(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// Training session persistence
export interface TrainingSession {
  config: TrainingConfig;
  currentGeneration: number;
  population: Individual[];
  bestGenome: Genome | null;
  generationHistory: GenerationResult[];
  gamesCompleted: number;
  totalGamesToPlay: number;
  // Track where we are in the current generation's matchup schedule
  matchupIndex: number;
  gameWithinMatchup: number;
}

export function saveTrainingSession(session: TrainingSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
}

export function loadTrainingSession(): TrainingSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TrainingSession;
  } catch {
    return null;
  }
}

export function clearTrainingSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}
