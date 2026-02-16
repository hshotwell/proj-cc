'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { validateUsernameFormat } from '@/services/auth/usernameValidation';

type AuthTab = 'signin' | 'register';

function AuthContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { signIn } = useAuthActions();
  const callbackUrl = searchParams.get('callbackUrl') || '/home';
  const error = searchParams.get('error');
  const initialTab = (searchParams.get('tab') as AuthTab) || 'signin';

  const [activeTab, setActiveTab] = useState<AuthTab>(initialTab);
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Sign in form state
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');

  // Register form state
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerUsername, setRegisterUsername] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');
  const [usernameToCheck, setUsernameToCheck] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<{
    checking: boolean;
    valid: boolean | null;
    error?: string;
  }>({ checking: false, valid: null });

  // Use Convex query for username checking
  const usernameResult = useQuery(
    api.authFunctions.checkUsername,
    usernameToCheck.length >= 3 ? { username: usernameToCheck } : 'skip'
  );

  // Update username status when query result changes
  useEffect(() => {
    if (usernameToCheck.length < 3) {
      setUsernameStatus({ checking: false, valid: null });
      return;
    }
    if (usernameResult === undefined) {
      setUsernameStatus({ checking: true, valid: null });
    } else {
      setUsernameStatus({
        checking: false,
        valid: usernameResult.valid,
        error: usernameResult.error,
      });
    }
  }, [usernameResult, usernameToCheck]);

  // Debounced username check
  const checkUsername = useCallback((username: string) => {
    if (username.length < 3) {
      setUsernameStatus({ checking: false, valid: null });
      return;
    }

    // First do client-side validation
    const clientResult = validateUsernameFormat(username);
    if (!clientResult.valid) {
      setUsernameStatus({ checking: false, valid: false, error: clientResult.error });
      return;
    }

    setUsernameStatus({ checking: true, valid: null });
    setUsernameToCheck(username);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (registerUsername) {
        checkUsername(registerUsername);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [registerUsername, checkUsername]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setFormError(null);

    try {
      await signIn('password', {
        email: signInEmail,
        password: signInPassword,
        flow: 'signIn',
      });
      router.push(callbackUrl);
    } catch {
      setFormError('Invalid email or password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setFormError(null);

    // Client-side validation
    if (registerPassword !== registerConfirmPassword) {
      setFormError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    if (registerPassword.length < 8) {
      setFormError('Password must be at least 8 characters');
      setIsLoading(false);
      return;
    }

    if (!usernameStatus.valid) {
      setFormError(usernameStatus.error || 'Please choose a valid username');
      setIsLoading(false);
      return;
    }

    try {
      // Register via Convex auth Password provider
      await signIn('password', {
        email: registerEmail,
        password: registerPassword,
        name: registerUsername,
        flow: 'signUp',
      });

      setSuccessMessage(
        'Account created! You can now sign in.'
      );
      setActiveTab('signin');
      setSignInEmail(registerEmail);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestPlay = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('sternhalma-guest', 'true');
    }
    router.push('/home');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white">STERNHALMA</h1>
          <p className="text-gray-400 italic">Chinese Checkers</p>
        </div>

        {/* Auth Card */}
        <div className="bg-white rounded-xl shadow-2xl overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => {
                setActiveTab('signin');
                setFormError(null);
              }}
              className={`flex-1 py-4 text-center font-medium transition-colors ${
                activeTab === 'signin'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setActiveTab('register');
                setFormError(null);
                setSuccessMessage(null);
              }}
              className={`flex-1 py-4 text-center font-medium transition-colors ${
                activeTab === 'register'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Create Account
            </button>
          </div>

          <div className="p-6">
            {/* Error/Success Messages */}
            {(error || formError) && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">
                  {formError ||
                    (error === 'OAuthAccountNotLinked'
                      ? 'This email is already associated with another account.'
                      : 'An error occurred. Please try again.')}
                </p>
              </div>
            )}

            {successMessage && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-600">{successMessage}</p>
              </div>
            )}

            {/* Sign In Form */}
            {activeTab === 'signin' && (
              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <label htmlFor="signin-email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    id="signin-email"
                    value={signInEmail}
                    onChange={(e) => setSignInEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="signin-password" className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    id="signin-password"
                    value={signInPassword}
                    onChange={(e) => setSignInPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-500 transition-colors disabled:opacity-50"
                >
                  {isLoading ? 'Signing in...' : 'Sign In'}
                </button>

                <div className="text-center">
                  <Link href="/auth/forgot-password" className="text-sm text-blue-600 hover:underline">
                    Forgot password?
                  </Link>
                </div>
              </form>
            )}

            {/* Register Form */}
            {activeTab === 'register' && (
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label htmlFor="register-email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    id="register-email"
                    value={registerEmail}
                    onChange={(e) => setRegisterEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="register-username" className="block text-sm font-medium text-gray-700 mb-1">
                    Username
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      id="register-username"
                      value={registerUsername}
                      onChange={(e) => setRegisterUsername(e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        usernameStatus.valid === false
                          ? 'border-red-300'
                          : usernameStatus.valid === true
                          ? 'border-green-300'
                          : 'border-gray-300'
                      }`}
                      required
                    />
                    {usernameStatus.checking && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                    {!usernameStatus.checking && usernameStatus.valid === true && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </div>
                  {usernameStatus.error && (
                    <p className="mt-1 text-sm text-red-600">{usernameStatus.error}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-500">
                    3-20 characters, letters, numbers, underscores, hyphens
                  </p>
                </div>

                <div>
                  <label htmlFor="register-password" className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    id="register-password"
                    value={registerPassword}
                    onChange={(e) => setRegisterPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Min 8 characters with uppercase, lowercase, and number
                  </p>
                </div>

                <div>
                  <label htmlFor="register-confirm" className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    id="register-confirm"
                    value={registerConfirmPassword}
                    onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      registerConfirmPassword && registerConfirmPassword !== registerPassword
                        ? 'border-red-300'
                        : 'border-gray-300'
                    }`}
                    required
                  />
                  {registerConfirmPassword && registerConfirmPassword !== registerPassword && (
                    <p className="mt-1 text-sm text-red-600">Passwords do not match</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !usernameStatus.valid}
                  className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-500 transition-colors disabled:opacity-50"
                >
                  {isLoading ? 'Creating account...' : 'Create Account'}
                </button>
              </form>
            )}

            {/* Divider */}
            <div className="my-6 flex items-center">
              <div className="flex-1 border-t border-gray-200" />
              <span className="px-4 text-sm text-gray-500">or continue with</span>
              <div className="flex-1 border-t border-gray-200" />
            </div>

            {/* OAuth Buttons */}
            <div className="space-y-3">
              <button
                onClick={() => void signIn('google')}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                <span className="text-gray-700 font-medium">Google</span>
              </button>

              <button
                onClick={() => void signIn('github')}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
                <span className="text-gray-700 font-medium">GitHub</span>
              </button>
            </div>

            {/* Guest Play Option */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <button
                onClick={handleGuestPlay}
                className="w-full py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                Play as Guest
              </button>
              <p className="mt-2 text-center text-xs text-gray-500">
                Guest progress is saved locally and cannot be synced across devices
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
        </div>
      }
    >
      <AuthContent />
    </Suspense>
  );
}
