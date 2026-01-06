'use client';

import { Button, Input } from '@/components/ui';
import { AlertCircle, Bot, CheckCircle2, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { getSupabaseClient } from '../../../services/supabase';
import { validatePassword, PASSWORD_REQUIREMENTS } from '@/lib/password-validator';

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [_isRecoveryMode, setIsRecoveryMode] = useState(false);

  useEffect(() => {
    let mounted = true;
    const supabase = getSupabaseClient();

    // Listen for auth state changes - Supabase will automatically process
    // the recovery token from the URL hash fragment
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (event === 'PASSWORD_RECOVERY') {
        // User clicked password reset link - session is now established
        setIsRecoveryMode(true);
        setIsInitializing(false);
      } else if (event === 'SIGNED_IN' && session) {
        // Check if this is a recovery flow by checking URL hash
        const hash = window.location.hash;
        if (hash.includes('type=recovery')) {
          setIsRecoveryMode(true);
        }
        setIsInitializing(false);
      } else if (event === 'INITIAL_SESSION') {
        // Initial session check complete
        if (!session) {
          // Check if we have recovery params in the hash
          const hash = window.location.hash;
          if (hash.includes('type=recovery') || hash.includes('access_token')) {
            // Wait a bit for Supabase to process the recovery token
            setTimeout(async () => {
              if (!mounted) return;
              const {
                data: { session: retrySession },
              } = await supabase.auth.getSession();
              if (retrySession) {
                setIsRecoveryMode(true);
                setIsInitializing(false);
              } else {
                // Still no session, redirect to login
                setError('Invalid or expired password reset link. Please request a new one.');
                setIsInitializing(false);
              }
            }, 1000);
          } else {
            // No recovery params, redirect to login
            window.location.href = '/login';
          }
        } else {
          setIsInitializing(false);
        }
      }
    });

    // Also check immediately for existing session
    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session && mounted) {
        setIsInitializing(false);
      }
    };
    checkSession();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Validate password on change
  const handlePasswordChange = (value: string) => {
    setPassword(value);
    if (value) {
      const validation = validatePassword(value);
      setPasswordErrors(validation.errors);
    } else {
      setPasswordErrors([]);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate password strength
    const validation = validatePassword(password);
    if (!validation.valid) {
      setError(`Password requirements not met: ${validation.errors.join(', ')}`);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = getSupabaseClient();

    const { error: updateError } = await supabase.auth.updateUser({
      password: password,
    });

    if (updateError) {
      setError(updateError.message);
    } else {
      setSuccess(true);
    }
    setLoading(false);
  };

  // Show loading state while initializing
  if (isInitializing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4 py-12 text-white">
        <div className="w-full max-w-md space-y-8 text-center">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-blue-500" />
          <p className="text-zinc-400">Verifying your reset link...</p>
        </div>
      </div>
    );
  }

  // Show error state for invalid/expired links
  if (error && !password && !confirmPassword) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4 py-12 text-white">
        <div className="w-full max-w-md space-y-8 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
            <AlertCircle className="h-8 w-8 text-red-500" />
          </div>

          <div className="space-y-2">
            <h2 className="text-3xl font-bold">Link expired</h2>
            <p className="text-zinc-400">{error}</p>
          </div>

          <div className="space-y-3 pt-4">
            <Link href="/forgot-password">
              <Button className="w-full h-12">Request New Reset Link</Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" className="w-full h-12">
                Back to Sign In
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4 py-12 text-white">
        <div className="w-full max-w-md space-y-8 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
          </div>

          <div className="space-y-2">
            <h2 className="text-3xl font-bold">Password updated</h2>
            <p className="text-zinc-400">Your password has been changed successfully.</p>
          </div>

          <div className="space-y-3 pt-4">
            <Link href="/login">
              <Button className="w-full h-12">Sign In with new Password</Button>
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
          <h2 className="text-3xl font-bold">Set new password</h2>
          <p className="mt-2 text-zinc-400">Please enter your new password below.</p>
        </div>

        <form onSubmit={handleUpdatePassword} className="mt-8 space-y-4">
          <div>
            <Input
              type="password"
              placeholder={`New password (min ${PASSWORD_REQUIREMENTS.minLength} characters)`}
              value={password}
              onChange={(e) => handlePasswordChange(e.target.value)}
              minLength={PASSWORD_REQUIREMENTS.minLength}
              required
            />
            {passwordErrors.length > 0 && password && (
              <ul className="mt-2 text-xs text-zinc-400 space-y-1">
                {passwordErrors.map((err, i) => (
                  <li key={i} className="flex items-center gap-1">
                    <span className="text-red-400">•</span> {err}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <Input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={PASSWORD_REQUIREMENTS.minLength}
              required
            />
          </div>

          {error && (
            <div className="flex items-start gap-3 text-sm p-3 rounded border text-red-500 bg-red-500/10 border-red-500/20">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          <Button type="submit" className="w-full h-12" disabled={loading}>
            {loading ? 'Updating...' : 'Update Password'}
          </Button>
        </form>
      </div>
    </div>
  );
}
