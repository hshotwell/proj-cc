import { getConvexClientOrNull } from '@/lib/convex';
import { api } from '../../convex/_generated/api';
import type { ChampionGenomeSet } from '@/types/ai';
import { USE_TRAINED_GENOMES } from '@/types/ai';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const LS_KEY = 'champion-genomes-v2';

let cached: ChampionGenomeSet | null = null;
let cacheTimestamp = 0;
let fetchPromise: Promise<ChampionGenomeSet | null> | null = null;

// Bootstrap from localStorage on module load (browser only).
if (typeof window !== 'undefined') {
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (raw) {
      cached = JSON.parse(raw) as ChampionGenomeSet;
      // Do not set cacheTimestamp — stale-on-load forces a refresh.
    }
  } catch {
    // localStorage may be blocked; ignore.
  }
}

async function fetchChampions(): Promise<ChampionGenomeSet | null> {
  try {
    const client = getConvexClientOrNull();
    if (!client) return cached;
    const result = await client.query(api.trainingV2.getAllChampions);
    if (result) {
      cached = result as ChampionGenomeSet;
      cacheTimestamp = Date.now();
      if (typeof window !== 'undefined') {
        try { window.localStorage.setItem(LS_KEY, JSON.stringify(cached)); } catch { /* ignore */ }
      }
    }
    return cached;
  } catch (e) {
    console.warn('[ChampionGenomes] Failed to fetch:', e);
    return cached;
  }
}

/**
 * Synchronous read from module cache. Returns null if we've never fetched
 * successfully AND localStorage was empty. Triggers a background refresh
 * if the cache is stale.
 */
export function getServerChampionGenomes(): ChampionGenomeSet | null {
  if (!USE_TRAINED_GENOMES) return null;
  const now = Date.now();
  if (now - cacheTimestamp > CACHE_TTL) {
    if (!fetchPromise) {
      fetchPromise = fetchChampions().finally(() => { fetchPromise = null; });
    }
  }
  return cached;
}
