'use client';

import { Button, Input } from '@/components/ui';
import { AlertCircle, Bot, CheckCircle2, Mail } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { getSupabaseClient } from '../../services/supabase';

export default function SignupPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupComplete, setSignupComplete] = useState(false);
  const [existingUser, setExistingUser] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setExistingUser(false);

    const supabase = getSupabaseClient();

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          full_name: fullName,
          display_name: fullName.split(' ')[0] || fullName,
        },
      },
    });

    if (signUpError) {
      // Handle specific error messages
      if (
        signUpError.message.toLowerCase().includes('already registered') ||
        signUpError.message.toLowerCase().includes('user already exists')
      ) {
        setExistingUser(true);
        setError('An account with this email already exists. Please sign in instead.');
      } else {
        setError(signUpError.message);
      }
    } else if (data?.user) {
      // Check if user already exists (Supabase returns user with identities = [] for existing users)
      // This is a security feature to prevent email enumeration
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

  // Show success screen after signup
  if (signupComplete) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4 py-12 text-white">
        <div className="w-full max-w-md space-y-8 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
          </div>

          <div className="space-y-2">
            <h2 className="text-3xl font-bold">Check your email</h2>
            <p className="text-zinc-400">We've sent a confirmation link to</p>
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
              Didn't receive the email? Check your spam folder.
            </p>
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

        <form onSubmit={handleSignup} className="mt-8 space-y-4">
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
          <div>
            <Input
              type="password"
              placeholder="Password (min 6 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
