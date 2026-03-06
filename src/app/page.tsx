'use client';

import { useEffect } from 'react';
import { useConvexAuth } from 'convex/react';
import { useRouter } from 'next/navigation';

export default function LandingPage() {
  const { isLoading } = useConvexAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    // Always go to home page regardless of auth state
    router.replace('/home');
  }, [isLoading, router]);

  // Show loading state while redirecting
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-4">STERNHALMA</h1>
        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    </div>
  );
}
