import { getConvexClientOrNull } from '@/lib/convex';
import { api } from '../../convex/_generated/api';
import type { Genome } from '@/types/training';

// Module-level cache with TTL
let cachedGenome: Genome | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let fetchPromise: Promise<Genome | null> | null = null;

async function fetchEvolvedGenome(): Promise<Genome | null> {
  try {
    const client = getConvexClientOrNull();
    if (!client) return cachedGenome;

    const result = await client.query(api.training.getEvolvedGenome);
    if (result) {
      cachedGenome = result.genome as Genome;
      cacheTimestamp = Date.now();
    }
    return cachedGenome;
  } catch (e) {
    console.warn('[EvolvedGenome] Failed to fetch:', e);
    return cachedGenome; // Return stale cache on error
  }
}

/**
 * Get the server-evolved genome synchronously (for use in AI evaluation hot path).
 * Returns null if no cached data available.
 * Triggers async refresh in background if cache is stale.
 */
export function getServerEvolvedGenome(): Genome | null {
  const now = Date.now();
  if (now - cacheTimestamp > CACHE_TTL) {
    // Trigger background refresh (deduplicated)
    if (!fetchPromise) {
      fetchPromise = fetchEvolvedGenome().finally(() => {
        fetchPromise = null;
      });
    }
  }
  return cachedGenome;
}
