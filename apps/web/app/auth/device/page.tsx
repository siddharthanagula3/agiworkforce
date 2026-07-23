'use client';

import { useAuth } from '@clerk/nextjs';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';

function formatUserCode(value: string): string {
  const clean = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

function getErrorMessage(body: unknown): string {
  if (!body || typeof body !== 'object') return 'Approval failed';
  const error = (body as { error?: unknown }).error;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'Approval failed';
}

function DeviceForm() {
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn } = useAuth();
  const [code, setCode] = useState(formatUserCode(searchParams.get('user_code') || ''));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'info' } | null>(null);
  const redirectPath = `/auth/device${code ? `?user_code=${encodeURIComponent(code)}` : ''}`;
  const signInHref = `/login?redirectTo=${encodeURIComponent(redirectPath)}`;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;
    if (!isSignedIn) {
      setMessage({
        text: 'Sign in before approving this device request.',
        type: 'error',
      });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const csrfRes = await fetch('/api/csrf', { method: 'GET', credentials: 'include' });
      const csrfJson = (await csrfRes.json().catch(() => null)) as { token?: string } | null;
      if (!csrfRes.ok || !csrfJson?.token) {
        throw new Error('Failed to acquire CSRF token');
      }

      const res = await fetch('/api/auth/device/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfJson.token },
        credentials: 'include',
        body: JSON.stringify({ user_code: code.trim().toUpperCase() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(getErrorMessage(body));
      }
      setMessage({
        text: 'Device approved. Return to the app that opened this page; sign-in will finish automatically.',
        type: 'info',
      });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Approval failed', type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="agi-device-auth-card" aria-labelledby="device-auth-title">
      <p className="agi-section-eyebrow">Authorize a device</p>
      <h1 id="device-auth-title" className="agi-device-auth-title">
        Connect a device.
      </h1>
      <p className="agi-device-auth-lede">
        Confirm the code shown in AGI Desktop, VS Code, Chrome, or the AGI CLI.{' '}
        <strong>
          Only approve a request you started. This device will be able to use your AGI account.
        </strong>
      </p>
      {isLoaded && !isSignedIn ? (
        <div role="alert" className="agi-device-auth-alert agi-device-auth-alert--error">
          Sign in before approving this device request. <Link href={signInHref}>Sign in</Link>
        </div>
      ) : null}
      <form onSubmit={onSubmit} className="agi-device-auth-form">
        <label htmlFor="device-code">Device code</label>
        <input
          id="device-code"
          name="user_code"
          type="text"
          value={code}
          onChange={(e) => setCode(formatUserCode(e.target.value))}
          required
          placeholder="ABCD-1234"
          autoComplete="off"
          inputMode="text"
          pattern="[A-Z0-9]{4}-[A-Z0-9]{4}"
          maxLength={9}
          className="agi-device-auth-code"
        />
        {message && (
          <p role={message.type === 'error' ? 'alert' : 'status'} data-message-type={message.type}>
            {message.text}
          </p>
        )}
        <button
          type="submit"
          disabled={loading || !code || !isLoaded || (isLoaded && !isSignedIn)}
          className="agi-cta-primary agi-device-auth-submit"
        >
          {!isLoaded
            ? 'Checking...'
            : isSignedIn
              ? loading
                ? 'Approving...'
                : 'Approve device'
              : 'Sign in required'}
        </button>
      </form>
      <div className="agi-device-auth-note">
        <strong>Using AGI Cloud models?</strong> Approval signs this device into your account. Local
        Mode remains local and does not require account access.{' '}
        <Link href="/pricing">Compare plans &rarr;</Link>
      </div>
      <p className="agi-device-auth-cancel">
        <Link href="/">Cancel</Link>
      </p>
    </section>
  );
}

export default function AuthDevicePage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header minimal />
        <div className="agi-device-auth-stage">
          <Suspense fallback={null}>
            <DeviceForm />
          </Suspense>
        </div>
        <MarketingFooter />
      </main>
    </div>
  );
}
