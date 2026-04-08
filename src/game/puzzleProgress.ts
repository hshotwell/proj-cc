/**
 * Per-user local tracking of puzzle completions and tutorial status.
 * Stored in localStorage; can be migrated to Convex later.
 */

const COMPLETIONS_KEY = 'chinese-checkers-puzzle-completions';
const TUTORIAL_COMPLETE_KEY = 'chinese-checkers-tutorial-complete';

export interface PuzzleCompletion {
  /** Best (lowest) move count achieved */
  bestMoves: number;
  /** Whether the player has ever finished at or under par */
  completedUnderPar: boolean;
}

function loadCompletions(): Record<string, PuzzleCompletion> {
  try {
    const raw = localStorage.getItem(COMPLETIONS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) ?? {};
  } catch {
    return {};
  }
}

export function getPuzzleCompletion(puzzleId: string): PuzzleCompletion | null {
  if (typeof window === 'undefined') return null;
  return loadCompletions()[puzzleId] ?? null;
}

/**
 * Record a puzzle attempt. Saves if it improves the best score or sets
 * completedUnderPar for the first time.
 */
export function savePuzzleCompletion(
  puzzleId: string,
  moves: number,
  par: number
): void {
  if (typeof window === 'undefined') return;
  try {
    const all = loadCompletions();
    const prev = all[puzzleId];
    const completedUnderPar = moves <= par;
    all[puzzleId] = {
      bestMoves: prev ? Math.min(prev.bestMoves, moves) : moves,
      completedUnderPar: (prev?.completedUnderPar ?? false) || completedUnderPar,
    };
    localStorage.setItem(COMPLETIONS_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

export function isTutorialComplete(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(TUTORIAL_COMPLETE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setTutorialComplete(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TUTORIAL_COMPLETE_KEY, 'true');
  } catch {
    // ignore
  }
}
