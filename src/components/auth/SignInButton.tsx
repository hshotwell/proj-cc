'use client';

import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

interface SignInButtonProps {
  className?: string;
}

export function SignInButton({ className }: SignInButtonProps) {
  const { isLoading, isAuthenticated } = useAuthStore();
  const router = useRouter();

  if (isLoading) {
    return (
      <button
        disabled
        className={`opacity-50 cursor-not-allowed ${className}`}
      >
        Loading...
      </button>
    );
  }

  if (isAuthenticated) {
    return null;
  }

  return (
    <button
      onClick={() => router.push('/auth/signin')}
      className={className}
    >
      Sign In
    </button>
  );
}
