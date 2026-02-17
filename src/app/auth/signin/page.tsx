'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { api } from '../../../../convex/_generated/api';
import { getConvexClient } from '@/lib/convex';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { validateUsernameFormat } from '@/services/auth/usernameValidation';

type AuthTab = 'signin' | 'register';
type RegisterStep = 'form' | 'verify';

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    );
  }
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  className,
  required,
}: {
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  required?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        id={id}
        value={value}
        onChange={onChange}
        className={className || 'w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500'}
        required={required}
      />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        tabIndex={-1}
      >
        <EyeIcon open={visible} />
      </button>
    </div>
  );
}

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
  const [signInIdentifier, setSignInIdentifier] = useState('');
  const [signInPassword, setSignInPassword] = useState('');

  // Register form state
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerUsername, setRegisterUsername] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<{
    checking: boolean;
    valid: boolean | null;
    error?: string;
  }>({ checking: false, valid: null });

  // OTP verification state
  const [registerStep, setRegisterStep] = useState<RegisterStep>('form');
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Debounced username check using manual query
  const checkUsername = useCallback(async (username: string) => {
    if (username.length < 3) {
      setUsernameStatus({ checking: false, valid: null });
      return;
    }

    // Client-side validation first
    const clientResult = validateUsernameFormat(username);
    if (!clientResult.valid) {
      setUsernameStatus({ checking: false, valid: false, error: clientResult.error });
      return;
    }

    setUsernameStatus({ checking: true, valid: null });

    try {
      const result = await getConvexClient().query(api.authFunctions.checkUsername, { username });
      setUsernameStatus({
        checking: false,
        valid: result.valid,
        error: result.error,
      });
    } catch (err) {
      console.error('Username check failed:', err);
      setUsernameStatus({ checking: false, valid: true });
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (registerUsername) {
        checkUsername(registerUsername);
      } else {
        setUsernameStatus({ checking: false, valid: null });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [registerUsername, checkUsername]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setFormError(null);

    try {
      let email = signInIdentifier;

      // If input doesn't contain @, treat as username and look up email
      if (!signInIdentifier.includes('@')) {
        const result = await getConvexClient().query(
          api.authFunctions.getEmailByUsername,
          { username: signInIdentifier }
        );
        if (!result.email) {
          setFormError('No account found with that username');
          setIsLoading(false);
          return;
        }
        email = result.email;
      }

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Sign in timed out. Please try again.')), 15000)
      );

      const result = await Promise.race([
        signIn('password', {
          email,
          password: signInPassword,
          flow: 'signIn',
        }),
        timeoutPromise,
      ]) as { signingIn: boolean };

      if (result.signingIn === false) {
        // Email not yet verified - need OTP
        setRegisterEmail(email);
        setActiveTab('register');
        setRegisterStep('verify');
        setFormError(null);
        setSuccessMessage('Please verify your email. A new code has been sent.');
      } else {
        router.push(callbackUrl);
      }
    } catch (err) {
      console.error('Sign in error:', err);
      setFormError(err instanceof Error ? err.message : 'Invalid email or password');
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
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Registration timed out. Please try again.')), 15000)
      );

      const result = await Promise.race([
        signIn('password', {
          email: registerEmail,
          password: registerPassword,
          name: registerUsername,
          flow: 'signUp',
        }),
        timeoutPromise,
      ]) as { signingIn: boolean };

      if (result.signingIn === false) {
        // OTP sent, show verification step
        setRegisterStep('verify');
        setSuccessMessage('A verification code has been sent to your email.');
      } else {
        // Signed in directly (shouldn't happen with verify configured, but handle it)
        router.push(callbackUrl);
      }
    } catch (err) {
      console.error('Registration error:', err);
      setFormError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setFormError(null);

    const code = otpCode.join('');
    if (code.length !== 6) {
      setFormError('Please enter the full 6-digit code');
      setIsLoading(false);
      return;
    }

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Verification timed out. Please try again.')), 15000)
      );

      await Promise.race([
        signIn('password', {
          email: registerEmail,
          code,
          flow: 'email-verification',
        }),
        timeoutPromise,
      ]);

      router.push(callbackUrl);
    } catch (err) {
      console.error('Verification error:', err);
      setFormError(err instanceof Error ? err.message : 'Invalid verification code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    setIsLoading(true);
    setFormError(null);

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Resend timed out. Please try again.')), 15000)
      );

      await Promise.race([
        signIn('password', {
          email: registerEmail,
          password: registerPassword,
          name: registerUsername,
          flow: 'signUp',
        }),
        timeoutPromise,
      ]);

      setSuccessMessage('A new verification code has been sent.');
      setOtpCode(['', '', '', '', '', '']);
    } catch (err) {
      console.error('Resend error:', err);
      setFormError(err instanceof Error ? err.message : 'Failed to resend code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) {
      // Handle paste
      const digits = value.replace(/\D/g, '').slice(0, 6);
      const newCode = [...otpCode];
      for (let i = 0; i < digits.length && index + i < 6; i++) {
        newCode[index + i] = digits[i];
      }
      setOtpCode(newCode);
      const nextIndex = Math.min(index + digits.length, 5);
      otpRefs.current[nextIndex]?.focus();
      return;
    }

    if (value && !/^\d$/.test(value)) return;

    const newCode = [...otpCode];
    newCode[index] = value;
    setOtpCode(newCode);

    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpCode[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
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
          {/* Tabs - hide when on OTP step */}
          {registerStep === 'form' && (
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
          )}

          <div className="p-6">
            {/* Error/Success Messages */}
            {(error || formError) && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">
                  {formError || 'An error occurred. Please try again.'}
                </p>
              </div>
            )}

            {successMessage && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-600">{successMessage}</p>
              </div>
            )}

            {/* Sign In Form */}
            {activeTab === 'signin' && registerStep === 'form' && (
              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <label htmlFor="signin-identifier" className="block text-sm font-medium text-gray-700 mb-1">
                    Email or Username
                  </label>
                  <input
                    type="text"
                    id="signin-identifier"
                    value={signInIdentifier}
                    onChange={(e) => setSignInIdentifier(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="you@example.com or username"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="signin-password" className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <PasswordInput
                    id="signin-password"
                    value={signInPassword}
                    onChange={(e) => setSignInPassword(e.target.value)}
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
            {activeTab === 'register' && registerStep === 'form' && (
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
                  <PasswordInput
                    id="register-password"
                    value={registerPassword}
                    onChange={(e) => setRegisterPassword(e.target.value)}
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
                  <PasswordInput
                    id="register-confirm"
                    value={registerConfirmPassword}
                    onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                    className={`w-full px-3 py-2 pr-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
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

            {/* OTP Verification Step */}
            {registerStep === 'verify' && (
              <form onSubmit={handleVerifyOTP} className="space-y-6">
                <div className="text-center">
                  <h2 className="text-lg font-semibold text-gray-900 mb-2">Verify your email</h2>
                  <p className="text-sm text-gray-600">
                    Enter the 6-digit code sent to<br />
                    <span className="font-medium">{registerEmail}</span>
                  </p>
                </div>

                <div className="flex justify-center gap-2">
                  {otpCode.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => { otpRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={digit}
                      onChange={(e) => handleOtpChange(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      className="w-12 h-14 text-center text-xl font-bold border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      autoFocus={i === 0}
                    />
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={isLoading || otpCode.join('').length !== 6}
                  className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-500 transition-colors disabled:opacity-50"
                >
                  {isLoading ? 'Verifying...' : 'Verify Email'}
                </button>

                <div className="text-center space-y-2">
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={isLoading}
                    className="text-sm text-blue-600 hover:underline disabled:opacity-50"
                  >
                    Resend code
                  </button>
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        setRegisterStep('form');
                        setOtpCode(['', '', '', '', '', '']);
                        setFormError(null);
                        setSuccessMessage(null);
                      }}
                      className="text-sm text-gray-500 hover:underline"
                    >
                      Back to registration
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Guest Play Option */}
            {registerStep === 'form' && (
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
            )}
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
