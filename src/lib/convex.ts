import { ConvexHttpClient } from "convex/browser";

// Lazy-initialized HTTP client for use outside of React components (Zustand stores, storage providers)
let _client: ConvexHttpClient | null = null;

export function getConvexClient(): ConvexHttpClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) {
      throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
    }
    _client = new ConvexHttpClient(url);
  }
  return _client;
}

// Convenience getter that returns null if not configured (for graceful degradation)
export function getConvexClientOrNull(): ConvexHttpClient | null {
  try {
    return getConvexClient();
  } catch {
    return null;
  }
}
