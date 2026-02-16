'use client';

import { useState, Suspense } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const resetPassword = useMutation(api.authFunctions.resetPassword);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      setIsLoading(false);
      return;
    }

    try {
      await resetPassword({ token: token!, password });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-xl shadow-2xl p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-yellow-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Invalid Link</h2>
            <p className="text-gray-600 mb-6">This password reset link is invalid or missing.</p>
            <Link
              href="/auth/forgot-password"
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-500 transition-colors"
            >
              Request New Link
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white">STERNHALMA</h1>
          <p className="text-gray-400 italic">Chinese Checkers</p>
        </div>

        <div className="bg-white rounded-xl shadow-2xl p-8">
          {success ? (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Password Reset!</h2>
              <p className="text-gray-600 mb-6">
                Your password has been reset successfully. You can now sign in with your new password.
              </p>
              <Link
                href="/auth/signin"
                className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-500 transition-colors"
              >
                Sign In
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-semibold text-gray-900 text-center mb-2">
                Reset Password
              </h2>
              <p className="text-gray-600 text-center mb-6">
                Enter your new password below.
              </p>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                    New Password
                  </label>
                  <input
                    type="password"
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Min 8 characters with uppercase, lowercase, and number
                  </p>
                </div>

                <div>
                  <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    id="confirm"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      confirmPassword && confirmPassword !== password
                        ? 'border-red-300'
                        : 'border-gray-300'
                    }`}
                    required
                  />
                  {confirmPassword && confirmPassword !== password && (
                    <p className="mt-1 text-sm text-red-600">Passwords do not match</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-500 transition-colors disabled:opacity-50"
                >
                  {isLoading ? 'Resetting...' : 'Reset Password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
