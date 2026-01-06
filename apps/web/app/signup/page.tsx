'use client';

import { Button, Input } from '@/components/ui';
import { AlertCircle, Bot, CheckCircle2, Github, Mail, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useState, useMemo } from 'react';
import { getSupabaseClient } from '../../services/supabase';
import { validatePassword, getPasswordRequirementsText } from '@/lib/password-validator';

// Get the app URL for redirects - use env var for production, fallback to window for dev
const getAppUrl = () => {
  return (
    process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')
  );
};

export default function SignupPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);
  const [signupComplete, setSignupComplete] = useState(false);
  const [existingUser, setExistingUser] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendCount, setResendCount] = useState(0);

  const appUrl = useMemo(() => getAppUrl(), []);

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    const validation = validatePassword(value);
    setPasswordErrors(validation.errors);
  };

  // Resend verification email handler
  const handleResendVerification = async () => {
    if (resendCount >= 3) {
      setResendMessage(
        'Maximum resend attempts reached. Please wait a few minutes before trying again.',
      );
      return;
    }

    setResendLoading(true);
    setResendMessage(null);

    const supabase = getSupabaseClient();

    // Use the resend method for email verification
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: `${appUrl}/auth/callback`,
      },
    });

    if (resendError) {
      setResendMessage(`Failed to resend: ${resendError.message}`);
    } else {
      setResendCount((prev) => prev + 1);
      setResendMessage('Verification email sent! Please check your inbox.');
    }
    setResendLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setExistingUser(false);

    // Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      setPasswordErrors(passwordValidation.errors);
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    const supabase = getSupabaseClient();

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${appUrl}/auth/callback`,
        data: {
          full_name: fullName,
          display_name: fullName.split(' ')[0] || fullName,
        },
      },
    });

    if (signUpError) {
      if (
        signUpError.message.toLowerCase().includes('already registered') ||
        signUpError.message.toLowerCase().includes('user already exists')
      ) {
        setExistingUser(true);
        setError('An account with this email already exists. Please sign in instead.');
      } else {
        setError(signUpError.message);
      }
    } else if (data?.session) {
      // User is auto-confirmed or email confirmation is disabled
      window.location.href = '/dashboard';
    } else if (data?.user) {
      if (data.user.identities && data.user.identities.length === 0) {
        setExistingUser(true);
        setError('An account with this email already exists. Please sign in instead.');
      } else {
        setSignupComplete(true);
      }
    } else {
      setSignupComplete(true);
    }
    setLoading(false);
  };

  if (signupComplete) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4 py-12 text-white">
        <div className="w-full max-w-md space-y-8 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
          </div>

          <div className="space-y-2">
            <h2 className="text-3xl font-bold">Check your email</h2>
            <p className="text-zinc-400">We&apos;ve sent a confirmation link to</p>
            <p className="text-white font-medium text-lg">{email}</p>
          </div>

          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-left">
              <Mail className="h-5 w-5 text-blue-400 flex-shrink-0" />
              <p className="text-sm text-zinc-300">
                Click the link in the email to verify your account and complete signup.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm text-zinc-500">
              Didn&apos;t receive the email? Check your spam folder.
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleResendVerification}
              disabled={resendLoading || resendCount >= 3}
            >
              {resendLoading ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Resend Verification Email
                </>
              )}
            </Button>
            {resendMessage && (
              <p
                className={`text-sm ${resendMessage.includes('Failed') ? 'text-red-400' : 'text-green-400'}`}
              >
                {resendMessage}
              </p>
            )}
            <Link href="/login">
              <Button variant="outline" className="w-full">
                Back to Sign In
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4 py-12 text-white">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center text-center">
          <Link
            href="/"
            className="flex items-center gap-2 font-bold text-2xl tracking-tighter mb-6"
          >
            <Bot className="h-8 w-8 text-blue-500" />
            <span>AGI Workforce</span>
          </Link>
          <h2 className="text-3xl font-bold">Create an account</h2>
          <p className="mt-2 text-zinc-400">Start building your AI workforce today</p>
        </div>

        <div className="mt-8 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="h-12"
              onClick={async () => {
                const supabase = getSupabaseClient();
                await supabase.auth.signInWithOAuth({
                  provider: 'github',
                  options: {
                    redirectTo: `${appUrl}/auth/callback`,
                  },
                });
              }}
            >
              <Github className="mr-2 h-5 w-5" />
              GitHub
            </Button>
            <Button
              variant="outline"
              className="h-12"
              onClick={async () => {
                const supabase = getSupabaseClient();
                await supabase.auth.signInWithOAuth({
                  provider: 'google',
                  options: {
                    redirectTo: `${appUrl}/auth/callback`,
                  },
                });
              }}
            >
              <Mail className="mr-2 h-5 w-5" />
              Google
            </Button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-zinc-800" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-black px-2 text-zinc-500">Or sign up with email</span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <Input
              type="text"
              placeholder="Full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>
          <div>
            <Input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => handlePasswordChange(e.target.value)}
              required
            />
            {password && (
              <div className="text-xs space-y-1">
                {passwordErrors.length === 0 ? (
                  <div className="text-green-500 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Password meets requirements
                  </div>
                ) : (
                  passwordErrors.map((err, i) => (
                    <div key={i} className="text-amber-500 flex items-start gap-1">
                      <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                      <span>{err}</span>
                    </div>
                  ))
                )}
              </div>
            )}
            {!password && (
              <p className="text-xs text-slate-400">Requires: {getPasswordRequirementsText()}</p>
            )}
          </div>
          <div>
            <Input
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>

          {error && (
            <div
              className={`flex items-start gap-3 text-sm p-3 rounded border ${
                existingUser
                  ? 'text-amber-500 bg-amber-500/10 border-amber-500/20'
                  : 'text-red-500 bg-red-500/10 border-red-500/20'
              }`}
            >
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div>
                <p>{error}</p>
                {existingUser && (
                  <Link href="/login" className="text-blue-400 hover:underline mt-1 inline-block">
                    Go to Sign In →
                  </Link>
                )}
              </div>
            </div>
          )}

          <Button type="submit" className="w-full h-12" disabled={loading}>
            {loading ? 'Creating account...' : 'Sign Up'}
          </Button>
        </form>

        <div className="text-center text-sm">
          <p className="text-zinc-400">
            Already have an account?{' '}
            <Link href="/login" className="text-white hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
