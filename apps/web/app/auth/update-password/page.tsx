'use client';

import { Button, Input } from '@/components/ui';
import { AlertCircle, Bot, CheckCircle2 } from 'lucide-react';
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

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      const supabase = getSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session && mounted) {
        // Redirect to login if no session
        window.location.href = '/login';
      }
    };
    checkSession();

    return () => {
      mounted = false;
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
