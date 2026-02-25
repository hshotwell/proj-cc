import { getConvexClientOrNull } from '@/lib/convex';
import { api } from '../../convex/_generated/api';
import type { LearnedWeights, EndgameInsights } from '@/game/learning/types';

interface SharedInsightsData {
  gamesAnalyzed: number;
  weights: LearnedWeights;
  endgameStats: EndgameInsights;
  lastUpdated: number;
}

// Module-level cache with TTL
let cachedInsights: SharedInsightsData | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let fetchPromise: Promise<SharedInsightsData | null> | null = null;

/**
 * Get shared insights from server with module-level caching.
 * Safe to call from any context (React components, AI workers, etc).
 * Returns null if server is unavailable.
 */
export async function getSharedInsights(): Promise<SharedInsightsData | null> {
  const now = Date.now();

  // Return cache if still fresh
  if (cachedInsights && now - cacheTimestamp < CACHE_TTL) {
    return cachedInsights;
  }

  // Deduplicate concurrent fetches
  if (fetchPromise) {
    return fetchPromise;
  }

  fetchPromise = fetchInsights();
  try {
    const result = await fetchPromise;
    return result;
  } finally {
    fetchPromise = null;
  }
}

async function fetchInsights(): Promise<SharedInsightsData | null> {
  try {
    const client = getConvexClientOrNull();
    if (!client) return cachedInsights;

    const result = await client.query(api.learning.getSharedInsights);
    if (result) {
      cachedInsights = {
        gamesAnalyzed: result.gamesAnalyzed,
        weights: result.weights as LearnedWeights,
        endgameStats: result.endgameStats as EndgameInsights,
        lastUpdated: result.lastUpdated,
      };
      cacheTimestamp = Date.now();
    }
    return cachedInsights;
  } catch (e) {
    console.warn('[SharedInsights] Failed to fetch:', e);
    return cachedInsights; // Return stale cache on error
  }
}

/**
 * Get cached shared weights synchronously (for use in AI evaluation hot path).
 * Returns null if no cached data available.
 * Triggers async refresh in background if cache is stale.
 */
export function getCachedSharedWeights(): LearnedWeights | null {
  const now = Date.now();
  if (now - cacheTimestamp > CACHE_TTL) {
    // Trigger background refresh
    void getSharedInsights();
  }
  return cachedInsights?.weights ?? null;
}

/**
 * Get cached endgame insights synchronously.
 * Returns null if no cached data available.
 */
export function getCachedEndgameInsights(): EndgameInsights | null {
  const now = Date.now();
  if (now - cacheTimestamp > CACHE_TTL) {
    void getSharedInsights();
  }
  return cachedInsights?.endgameStats ?? null;
}

/**
 * Clear the shared insights cache (e.g. after submitting new data).
 */
export function clearSharedInsightsCache(): void {
  cachedInsights = null;
  cacheTimestamp = 0;
}
