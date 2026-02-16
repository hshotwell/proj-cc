'use client';

import { useState } from 'react';
import { useAction } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const forgotPassword = useAction(api.authFunctions.forgotPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await forgotPassword({ email });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <Link href="/auth/signin">
            <h1 className="text-4xl font-bold text-white">STERNHALMA</h1>
            <p className="text-gray-400 italic">Chinese Checkers</p>
          </Link>
        </div>

        <div className="bg-white rounded-xl shadow-2xl p-8">
          {submitted ? (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                  <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Check your email</h2>
              <p className="text-gray-600 mb-6">
                If an account exists with {email}, we've sent a password reset link.
              </p>
              <Link
                href="/auth/signin"
                className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-500 transition-colors"
              >
                Back to Sign In
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-semibold text-gray-900 text-center mb-2">
                Forgot Password
              </h2>
              <p className="text-gray-600 text-center mb-6">
                Enter your email and we'll send you a reset link.
              </p>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-500 transition-colors disabled:opacity-50"
                >
                  {isLoading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </form>

              <div className="mt-6 text-center">
                <Link href="/auth/signin" className="text-sm text-blue-600 hover:underline">
                  Back to Sign In
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
