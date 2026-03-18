'use client';

import { Button, Input } from '@/components/ui';
import { AlertCircle, Bot, CheckCircle2, Mail } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { getSupabaseClient } from '../../services/supabase';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = getSupabaseClient();

    // Use environment variable for production URL to ensure correct redirect
    const appUrl = process.env['NEXT_PUBLIC_APP_URL'] || window.location.origin;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/auth/update-password`,
    });

    if (resetError) {
      // Log the error for debugging but do not expose it to the user.
      // Showing different messages for existing vs non-existing emails
      // would allow user enumeration attacks.
      // Password reset error logged server-side; suppressed client-side to prevent enumeration
    }

    // Always show success to prevent user enumeration.
    // If the email exists, the user will receive the reset link.
    // If it doesn't, nothing happens but the attacker learns nothing.
    setSuccess(true);
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
            <h2 className="text-3xl font-bold">Check your email</h2>
            <p className="text-zinc-400">We&apos;ve sent a password reset link to</p>
            <p className="text-white font-medium text-lg">{email}</p>
          </div>

          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-left">
              <Mail className="h-5 w-5 text-blue-400 flex-shrink-0" />
              <p className="text-sm text-zinc-300">
                Click the link in the email to set a new password.
              </p>
            </div>
          </div>

          <div className="space-y-3">
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
          <h2 className="text-3xl font-bold">Reset your password</h2>
          <p className="mt-2 text-zinc-400">
            Enter your email address and we&apos;ll send you a link to reset your password.
          </p>
        </div>

        <form onSubmit={handleResetPassword} className="mt-8 space-y-4">
          <div>
            <Input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
            {loading ? 'Sending link...' : 'Send Reset Link'}
          </Button>
        </form>

        <div className="text-center text-sm">
          <Link href="/login" className="text-zinc-400 hover:text-white transition-colors">
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
