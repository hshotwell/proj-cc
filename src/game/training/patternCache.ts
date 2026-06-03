import type { Move, GameState, PlayerIndex } from '@/types/game';
import { countPiecesInGoal, getGoalPositionsForState } from '../state';
import { cubeDistance, centroid, coordKey } from '../coordinates';

const STORAGE_KEY = 'chinese-checkers-pattern-cache';
const CACHE_VERSION = 1;
const PATTERN_SCALE = 50;
const MIN_GAMES_FOR_SIGNAL = 5; // don't emit delta until we have enough data

export type PiecesInGoalBucket = '3-5' | '6-7' | '8';
export type ChainLengthBucket = '1' | '2' | '3+';
export type DistBucket = 'near' | 'mid' | 'far';

export interface MoveFeatures {
  piecesInGoalBucket: PiecesInGoalBucket;
  isChainJump: boolean;
  chainLengthBucket: ChainLengthBucket;
  isDirectGoalEntry: boolean;
  distBucket: DistBucket;
}

interface PatternEntry {
  wins: number;
  total: number;
  scoreDelta: number;
}

interface PatternCacheStore {
  version: number;
  gamesRecorded: number;
  entries: Record<string, PatternEntry>;
}

let cache: PatternCacheStore = { version: CACHE_VERSION, gamesRecorded: 0, entries: {} };
let loaded = false;

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const stored: PatternCacheStore = JSON.parse(raw);
    if (stored.version === CACHE_VERSION) cache = stored;
  } catch { /* ignore */ }
}

function piecesInGoalBucket(inGoal: number): PiecesInGoalBucket | null {
  if (inGoal >= 3 && inGoal <= 5) return '3-5';
  if (inGoal >= 6 && inGoal <= 7) return '6-7';
  if (inGoal === 8) return '8';
  return null;
}

function chainLengthBucket(len: number): ChainLengthBucket {
  if (len <= 1) return '1';
  if (len === 2) return '2';
  return '3+';
}

function distBucket(dist: number): DistBucket {
  if (dist <= 3) return 'near';
  if (dist <= 6) return 'mid';
  return 'far';
}

export function extractMoveFeatures(
  state: GameState,
  move: Move,
  player: PlayerIndex
): MoveFeatures | null {
  const inGoal = countPiecesInGoal(state, player);
  const bucket = piecesInGoalBucket(inGoal);
  if (bucket === null) return null;

  const goalPositions = getGoalPositionsForState(state, player);
  const goalKeys = new Set(goalPositions.map(coordKey));
  const goalCenter = centroid(goalPositions);
  const chainLen = move.jumpPath?.length ?? 1;

  return {
    piecesInGoalBucket: bucket,
    isChainJump: move.isJump && chainLen > 1,
    chainLengthBucket: chainLengthBucket(chainLen),
    isDirectGoalEntry: !goalKeys.has(coordKey(move.from)) && goalKeys.has(coordKey(move.to)),
    distBucket: distBucket(cubeDistance(move.from, goalCenter)),
  };
}

export function makePatternKey(f: MoveFeatures): string {
  return `${f.piecesInGoalBucket}_${f.isChainJump ? 'cj' : 'nj'}_${f.chainLengthBucket}_${f.isDirectGoalEntry ? 'dge' : 'ndge'}_${f.distBucket}`;
}

export function accumulatePattern(features: MoveFeatures, won: boolean): void {
  ensureLoaded();
  const key = makePatternKey(features);
  const entry = cache.entries[key] ?? { wins: 0, total: 0, scoreDelta: 0 };
  entry.total++;
  if (won) entry.wins++;
  entry.scoreDelta = entry.total >= MIN_GAMES_FOR_SIGNAL
    ? ((entry.wins / entry.total) - 0.5) * PATTERN_SCALE
    : 0;
  cache.entries[key] = entry;
}

export function incrementGamesRecorded(): void {
  ensureLoaded();
  cache.gamesRecorded++;
}

/** Returns a flat {key → scoreDelta} map for sending to the worker. */
export function getSerializedPatternCache(): Record<string, number> {
  ensureLoaded();
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(cache.entries)) {
    if (v.scoreDelta !== 0) out[k] = v.scoreDelta;
  }
  return out;
}

export function flushPatternCache(): void {
  ensureLoaded();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch { /* ignore quota errors */ }
}

/** Only for tests — resets in-memory state. */
export function resetPatternCacheForTesting(): void {
  cache = { version: CACHE_VERSION, gamesRecorded: 0, entries: {} };
  loaded = false;
}
