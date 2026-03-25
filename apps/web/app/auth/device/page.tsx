'use client';

import { Button, Input } from '@/components/ui';
import { AlertCircle, Bot, CheckCircle2, Loader2, Terminal } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getSupabaseClient } from '../../../services/supabase';

const API_BASE_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001/api';

function DeviceAuthForm() {
  const searchParams = useSearchParams();
  const prefilled = useMemo(() => searchParams.get('code') ?? '', [searchParams]);

  const [userCode, setUserCode] = useState(prefilled);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check Supabase session on mount
  useEffect(() => {
    let mounted = true;
    const supabase = getSupabaseClient();

    const check = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) return;

      if (user) {
        setIsAuthenticated(true);
      } else {
        // Redirect to login with return URL
        const returnPath = `/auth/device${prefilled ? `?code=${encodeURIComponent(prefilled)}` : ''}`;
        window.location.href = `/login?redirectTo=${encodeURIComponent(returnPath)}`;
        return;
      }
      setCheckingSession(false);
    };

    check();

    return () => {
      mounted = false;
    };
  }, [prefilled]);

  /**
   * Format input as XXXX-XXXX while typing.
   * Strips non-alphanumeric chars, uppercases, inserts hyphen after 4th char.
   */
  const handleCodeChange = useCallback((raw: string) => {
    const stripped = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8);
    const formatted = stripped.length > 4 ? `${stripped.slice(0, 4)}-${stripped.slice(4)}` : stripped;
    setUserCode(formatted);
    setError(null);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate format
    const codePattern = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;
    if (!codePattern.test(userCode)) {
      setError('Please enter a valid code in XXXX-XXXX format.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const supabase = getSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setError('Session expired. Please log in again.');
        setLoading(false);
        return;
      }

      const res = await fetch(`${API_BASE_URL}/auth/device/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ user_code: userCode }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg =
          body?.error ??
          (res.status === 404
            ? 'Code not found or expired. Check your CLI and try again.'
            : 'Something went wrong. Please try again.');
        setError(msg);
        setLoading(false);
        return;
      }

      setSuccess(true);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // Loading spinner while checking auth
  if (checkingSession || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4 py-12 text-white">
        <div className="w-full max-w-md space-y-8 text-center">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-blue-500" />
          <p className="text-zinc-400">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4 py-12 text-white">
        <div className="w-full max-w-md space-y-8 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
          </div>

          <div className="space-y-2">
            <h2 className="text-3xl font-bold">CLI authorized</h2>
            <p className="text-zinc-400">
              Your CLI is now connected. You can close this page and return to your terminal.
            </p>
          </div>

          <div className="space-y-3 pt-4">
            <Link href="/chat">
              <Button variant="outline" className="w-full h-12">
                Go to Chat
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Main form
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
          <h2 className="text-3xl font-bold">Authorize CLI</h2>
          <p className="mt-2 text-zinc-400">
            Enter the code shown in your terminal to connect the CLI to your account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="user-code" className="block text-sm font-medium text-zinc-300 mb-2">
              Device code
            </label>
            <Input
              id="user-code"
              type="text"
              placeholder="XXXX-XXXX"
              value={userCode}
              onChange={(e) => handleCodeChange(e.target.value)}
              className="text-center text-2xl tracking-[0.3em] font-mono"
              maxLength={9}
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {error && (
            <div className="flex items-start gap-3 text-sm p-3 rounded border text-red-500 bg-red-500/10 border-red-500/20">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          <Button type="submit" className="w-full h-12" disabled={loading || userCode.length < 9}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Authorizing...
              </>
            ) : (
              <>
                <Terminal className="h-4 w-4 mr-2" />
                Authorize Device
              </>
            )}
          </Button>
        </form>

        <p className="text-center text-xs text-zinc-500">
          Run{' '}
          <code className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-xs">
            agiworkforce cloud login
          </code>{' '}
          in your terminal to get a device code.
        </p>
      </div>
    </div>
  );
}

export default function DeviceAuthPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-black text-white">
          <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
        </div>
      }
    >
      <DeviceAuthForm />
    </Suspense>
  );
}
