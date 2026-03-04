'use client';

import { Button, Input } from '@/components/ui';
import { getSafeRedirectUrl } from '@/lib/safe-redirect';
import { Bot, Building2, Github, Mail } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, useMemo, useRef } from 'react';
import { getSupabaseClient } from '../../services/supabase';

// Get the app URL for redirects - use env var for production, fallback to window for dev
const getAppUrl = () => {
  return (
    process.env['NEXT_PUBLIC_APP_URL'] ||
    (typeof window !== 'undefined' ? window.location.origin : '')
  );
};

function LoginForm() {
  const searchParams = useSearchParams();
  const appUrl = useMemo(() => getAppUrl(), []);

  // Validate and sanitize the redirect URL to prevent open redirect attacks
  const redirectTo = useMemo(() => {
    const rawRedirect = searchParams.get('redirectTo');
    return getSafeRedirectUrl(rawRedirect, appUrl, '/chat');
  }, [searchParams, appUrl]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);
  const [ssoMode, setSsoMode] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null);

  // Debounce SSO domain check — only fire after user stops typing
  const ssoCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Check whether the email's domain has SSO configured.
   * Called with a debounce delay on every email change so we avoid
   * flooding the API while the user is still typing.
   */
  const checkSsoDomain = (emailValue: string) => {
    if (ssoCheckTimerRef.current) {
      clearTimeout(ssoCheckTimerRef.current);
    }

    const domain = emailValue.split('@')[1];
    if (!domain || !domain.includes('.')) {
      setSsoMode(false);
      return;
    }

    ssoCheckTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/sso-check?domain=${encodeURIComponent(domain)}`, {
          method: 'GET',
        });
        if (res.ok) {
          const data = (await res.json()) as { ssoEnabled: boolean };
          setSsoMode(data.ssoEnabled);
        }
      } catch {
        // Ignore network errors — fall back to standard login
        setSsoMode(false);
      }
    }, 400);
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmail(value);
    // Reset SSO mode whenever email changes so stale state doesn't linger
    setSsoMode(false);
    checkSsoDomain(value);
  };

  /** Initiate SSO login via Supabase — redirects the browser to the IdP. */
  const handleSsoLogin = async () => {
    const domain = email.split('@')[1];
    if (!domain) {
      setMessage({ type: 'error', text: 'Please enter your work email address.' });
      return;
    }

    setSsoLoading(true);
    setMessage(null);

    try {
      const supabase = getSupabaseClient();

      const { error } = await supabase.auth.signInWithSSO({
        domain,
        options: {
          redirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
        },
      });

      if (error) {
        setMessage({ type: 'error', text: error.message });
        setSsoLoading(false);
      }
      // On success the browser is redirected to the IdP — no further action needed here.
    } catch {
      setMessage({ type: 'error', text: 'Something went wrong. Please try again.' });
      setSsoLoading(false);
    }
  };

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
        emailRedirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
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
        redirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
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
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="h-12" onClick={() => handleOAuth('github')}>
              <Github className="mr-2 h-5 w-5" />
              GitHub
            </Button>
            <Button variant="outline" className="h-12" onClick={() => handleOAuth('google')}>
              <Mail className="mr-2 h-5 w-5" />
              Google
            </Button>
          </div>

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
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="Email address"
                value={email}
                onChange={handleEmailChange}
                required
                autoComplete="email"
                aria-label="Email address"
              />
            </div>

            {/* SSO prompt: shown when the typed email domain has SSO configured */}
            {ssoMode && (
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm text-blue-400">
                  <Building2 className="h-4 w-4 shrink-0" />
                  <span>Your organization uses single sign-on (SSO).</span>
                </div>
                <Button
                  type="button"
                  className="w-full h-10 bg-blue-600 hover:bg-blue-500 text-white"
                  onClick={handleSsoLogin}
                  disabled={ssoLoading}
                >
                  {ssoLoading ? 'Redirecting to your identity provider...' : 'Continue with SSO'}
                </Button>
                <p className="text-xs text-zinc-500 text-center">
                  You will be redirected to your organization&apos;s login page.
                </p>
              </div>
            )}

            {/* Standard password + magic link fields — hidden when SSO is active */}
            {!ssoMode && (
              <>
                <div>
                  <label htmlFor="password" className="sr-only">
                    Password
                  </label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    aria-label="Password"
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
              </>
            )}

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

            {!ssoMode && (
              <>
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
              </>
            )}
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
