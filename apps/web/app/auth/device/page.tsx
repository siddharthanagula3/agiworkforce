'use client';

import { useAuth } from '@clerk/nextjs';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Header } from '../../../components/layout/Header';
import { MarketingFooter } from '../../../components/marketing/MarketingFooter';

const inputStyle: React.CSSProperties = {
  background: 'var(--agi-bg-2)',
  border: '1px solid var(--agi-rule)',
  color: 'var(--agi-ink)',
  padding: '12px 16px',
  borderRadius: 6,
  fontSize: 18,
  fontFamily: 'var(--agi-font-mono)',
  letterSpacing: 0,
  textAlign: 'center',
  width: '100%',
};

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
      setMessage({ text: 'Device approved. You can close this tab.', type: 'info' });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Approval failed', type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      className="agi-section"
      style={{ borderBottom: 'none', maxWidth: 460, margin: '0 auto' }}
    >
      <p className="agi-section-eyebrow">Authorize a device</p>
      <h1 className="agi-page-h1" style={{ marginBottom: 16 }}>
        Connect a device.
      </h1>
      <p className="agi-page-lede" style={{ marginBottom: 24 }}>
        Enter the code shown on your CLI or other surface.{' '}
        <strong>
          You&rsquo;re authorizing that device to act as you. If you didn&rsquo;t initiate this,
          close the tab.
        </strong>
      </p>
      {isLoaded && !isSignedIn ? (
        <div
          role="alert"
          style={{
            border: '1px solid var(--agi-rule)',
            borderRadius: 8,
            color: 'var(--agi-error)',
            padding: '12px 14px',
            fontSize: 14,
            marginBottom: 16,
          }}
        >
          Sign in before approving this device request.{' '}
          <Link href={signInHref} style={{ color: 'var(--agi-ink)' }}>
            Sign in
          </Link>
        </div>
      ) : null}
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <label htmlFor="device-code" style={{ fontSize: 13, color: 'var(--agi-ink-2)' }}>
          Device code
        </label>
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
          style={inputStyle}
        />
        {message && (
          <p
            role={message.type === 'error' ? 'alert' : 'status'}
            style={{
              color: message.type === 'error' ? 'var(--agi-error)' : 'var(--agi-success)',
              fontSize: 13,
              margin: 0,
            }}
          >
            {message.text}
          </p>
        )}
        <button
          type="submit"
          disabled={loading || !code || !isLoaded || (isLoaded && !isSignedIn)}
          className="agi-cta-primary"
          style={{
            border: 'none',
            cursor:
              loading || !code || !isLoaded || (isLoaded && !isSignedIn)
                ? 'not-allowed'
                : 'pointer',
            textAlign: 'center',
          }}
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
      <p style={{ marginTop: 24, fontSize: 14, color: 'var(--agi-ink-2)', textAlign: 'center' }}>
        <Link href="/" style={{ color: 'var(--agi-ink)' }}>
          Cancel
        </Link>
      </p>
    </section>
  );
}

export default function AuthDevicePage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <Suspense fallback={null}>
          <DeviceForm />
        </Suspense>
        <MarketingFooter />
      </main>
    </div>
  );
}
