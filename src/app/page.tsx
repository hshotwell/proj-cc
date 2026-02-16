'use client';

import { useEffect, useState } from 'react';
import { useConvexAuth } from 'convex/react';
import { useRouter } from 'next/navigation';

export default function LandingPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    if (isLoading) return;

    if (isAuthenticated) {
      router.replace('/home');
      return;
    }

    // Check if user is playing as guest
    if (typeof window !== 'undefined') {
      const isGuest = localStorage.getItem('sternhalma-guest') === 'true';
      if (isGuest) {
        router.replace('/home');
        return;
      }
    }

    // Not authenticated and not a guest - redirect to sign in
    router.replace('/auth/signin');
    setIsChecking(false);
  }, [isAuthenticated, isLoading, router]);

  // Show loading state while checking auth
  if (isChecking || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-4">STERNHALMA</h1>
          <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  return null;
}
