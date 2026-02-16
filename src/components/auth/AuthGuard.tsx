'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';

interface AuthGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  redirectTo?: string;
}

export function AuthGuard({
  children,
  fallback,
  redirectTo = '/auth/signin',
}: AuthGuardProps) {
  const { isLoading, isAuthenticated } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated && redirectTo) {
      router.push(redirectTo);
    }
  }, [isLoading, isAuthenticated, redirectTo, router]);

  if (isLoading) {
    return (
      fallback || (
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      )
    );
  }

  if (!isAuthenticated) {
    return (
      fallback || (
        <div className="flex items-center justify-center min-h-screen">
          <p className="text-gray-500">Redirecting to sign in...</p>
        </div>
      )
    );
  }

  return <>{children}</>;
}
