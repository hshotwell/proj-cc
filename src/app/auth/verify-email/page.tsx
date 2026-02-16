'use client';

import { useState, useEffect, Suspense } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const verifyEmail = useMutation(api.authFunctions.verifyEmail);

  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'no-token'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('no-token');
      setMessage('No verification token provided.');
      return;
    }

    async function verify() {
      try {
        const result = await verifyEmail({ token: token! });

        if (result.success) {
          setStatus('success');
          setMessage(result.message || 'Your email has been verified successfully!');
        } else {
          setStatus('error');
          setMessage('Verification failed. Please try again.');
        }
      } catch (err) {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'An error occurred. Please try again.');
      }
    }

    verify();
  }, [token, verifyEmail]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white">STERNHALMA</h1>
          <p className="text-gray-400 italic">Chinese Checkers</p>
        </div>

        <div className="bg-white rounded-xl shadow-2xl p-8 text-center">
          {status === 'loading' && (
            <>
              <div className="w-16 h-16 mx-auto mb-4">
                <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Verifying your email...
              </h2>
              <p className="text-gray-600">Please wait a moment.</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Email Verified!
              </h2>
              <p className="text-gray-600 mb-6">{message}</p>
              <Link
                href="/auth/signin"
                className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-500 transition-colors"
              >
                Sign In
              </Link>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Verification Failed
              </h2>
              <p className="text-gray-600 mb-6">{message}</p>
              <div className="space-y-3">
                <Link
                  href="/auth/signin"
                  className="block px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-500 transition-colors"
                >
                  Back to Sign In
                </Link>
                <p className="text-sm text-gray-500">
                  Need a new verification link?{' '}
                  <Link href="/auth/resend-verification" className="text-blue-600 hover:underline">
                    Resend verification email
                  </Link>
                </p>
              </div>
            </>
          )}

          {status === 'no-token' && (
            <>
              <div className="w-16 h-16 mx-auto mb-4 bg-yellow-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Invalid Link
              </h2>
              <p className="text-gray-600 mb-6">{message}</p>
              <Link
                href="/auth/signin"
                className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-500 transition-colors"
              >
                Back to Sign In
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
