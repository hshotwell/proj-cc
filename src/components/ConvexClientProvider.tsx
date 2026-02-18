"use client";

import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { ReactNode } from "react";

// Use a placeholder URL during build/static generation when the env var isn't set.
// In production, NEXT_PUBLIC_CONVEX_URL is always set at build time.
const CONVEX_URL =
  process.env.NEXT_PUBLIC_CONVEX_URL || "https://placeholder.convex.cloud";

console.log('[ConvexClient] URL:', CONVEX_URL);

const convex = new ConvexReactClient(CONVEX_URL, { verbose: true });

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <ConvexAuthProvider client={convex}>{children}</ConvexAuthProvider>;
}
