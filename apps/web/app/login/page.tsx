'use client';

import { Button, Input } from '@/components/ui';
import { Bot, Github } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { getSupabaseClient } from '../../services/supabase';

function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/get-started';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const supabase = getSupabaseClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      if (error.message.includes('Email not confirmed')) {
        setMessage({
          type: 'error',
          text: 'Please confirm your email address before signing in. Check your inbox for the confirmation link.',
        });
      } else if (error.message.includes('Invalid login credentials')) {
        setMessage({
          type: 'error',
          text: 'Invalid email or password. Please try again.',
        });
      } else {
        setMessage({ type: 'error', text: error.message });
      }
    } else {
      window.location.href = redirectTo;
    }
    setLoading(false);
  };

  const handleMagicLink = async () => {
    if (!email) {
      setMessage({
        type: 'error',
        text: 'Please enter your email address to receive a magic link.',
      });
      return;
    }
    setMagicLinkLoading(true);
    setMessage(null);

    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
          redirectTo,
        )}`,
      },
    });

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({
        type: 'success',
        text: 'Magic link sent! Check your email to sign in.',
      });
    }
    setMagicLinkLoading(false);
  };

  const handleOAuth = async (provider: 'github' | 'google') => {
    const supabase = getSupabaseClient();
    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
      },
    });
  };

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
          <h2 className="text-3xl font-bold">Welcome back</h2>
          <p className="mt-2 text-zinc-400">Sign in to your account to continue</p>
        </div>

        <div className="mt-8 space-y-4">
          <Button variant="outline" className="w-full h-12" onClick={() => handleOAuth('github')}>
            <Github className="mr-2 h-5 w-5" />
            Continue with GitHub
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-zinc-800" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-black px-2 text-zinc-500">Or continue with email</span>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
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
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full h-12 border-dashed border-zinc-700 hover:border-zinc-500"
              onClick={handleMagicLink}
              disabled={magicLinkLoading || loading}
            >
              {magicLinkLoading ? 'Sending...' : 'Sign in with Magic Link'}
            </Button>

            {message && (
              <p
                className={`text-sm p-3 rounded border ${
                  message.type === 'error'
                    ? 'text-red-500 bg-red-500/10 border-red-500/20'
                    : 'text-green-500 bg-green-500/10 border-green-500/20'
                }`}
              >
                {message.text}
              </p>
            )}

            <div className="flex justify-end">
              <Link
                href="/forgot-password"
                className="text-sm text-zinc-400 hover:text-white transition-colors"
              >
                Forgot your password?
              </Link>
            </div>

            <Button type="submit" className="w-full h-12" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
        </div>

        <div className="text-center text-sm">
          <p className="text-zinc-400">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-white hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-black">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
