'use client';

import { useClerk, useUser } from '@clerk/nextjs';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';

interface DeviceAuthorizationDetails {
  user_code: string;
  client: {
    name: string;
    type: string;
  };
  scopes: Array<{
    id: string;
    label: string;
    description: string;
  }>;
  expires_at: string;
}

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

function parseDeviceAuthorizationDetails(body: unknown): DeviceAuthorizationDetails | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const candidate = body as Record<string, unknown>;
  const client = candidate['client'];
  const scopes = candidate['scopes'];
  if (
    typeof candidate['user_code'] !== 'string' ||
    typeof candidate['expires_at'] !== 'string' ||
    !client ||
    typeof client !== 'object' ||
    Array.isArray(client) ||
    typeof (client as Record<string, unknown>)['name'] !== 'string' ||
    typeof (client as Record<string, unknown>)['type'] !== 'string' ||
    !Array.isArray(scopes)
  ) {
    return null;
  }

  const parsedScopes = scopes.flatMap((scope) => {
    if (!scope || typeof scope !== 'object' || Array.isArray(scope)) return [];
    const record = scope as Record<string, unknown>;
    if (
      typeof record['id'] !== 'string' ||
      typeof record['label'] !== 'string' ||
      typeof record['description'] !== 'string'
    ) {
      return [];
    }
    return [
      {
        id: record['id'],
        label: record['label'],
        description: record['description'],
      },
    ];
  });
  if (parsedScopes.length !== scopes.length || parsedScopes.length === 0) return null;

  return {
    user_code: candidate['user_code'],
    client: {
      name: (client as Record<string, string>)['name']!,
      type: (client as Record<string, string>)['type']!,
    },
    scopes: parsedScopes,
    expires_at: candidate['expires_at'],
  };
}

function DeviceForm() {
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  const isDesktopSurface = searchParams.get('surface') === 'desktop';
  const [code, setCode] = useState(formatUserCode(searchParams.get('user_code') || ''));
  const [details, setDetails] = useState<DeviceAuthorizationDetails | null>(null);
  const [lookupState, setLookupState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [switchingAccount, setSwitchingAccount] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'info' } | null>(null);
  const redirectParams = new URLSearchParams();
  if (code) redirectParams.set('user_code', code);
  if (isDesktopSurface) redirectParams.set('surface', 'desktop');
  const redirectQuery = redirectParams.toString();
  const redirectPath = `/auth/device${redirectQuery ? `?${redirectQuery}` : ''}`;
  const signInHref = isDesktopSurface
    ? `/login?surface=desktop&redirectTo=${encodeURIComponent(redirectPath)}`
    : `/login?redirectTo=${encodeURIComponent(redirectPath)}`;
  const accountEmail =
    user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress ?? null;
  const accountName =
    user?.fullName?.trim() ||
    [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() ||
    user?.username?.trim() ||
    null;
  const hasCompleteCode = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !hasCompleteCode) {
      setDetails(null);
      setLookupError(null);
      setLookupState('idle');
      return;
    }

    const controller = new AbortController();
    setDetails(null);
    setLookupError(null);
    setLookupState('loading');
    void fetch(`/api/auth/device/code?user_code=${encodeURIComponent(code)}`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) throw new Error(getErrorMessage(body));
        const parsed = parseDeviceAuthorizationDetails(body);
        if (!parsed || parsed.user_code !== code) {
          throw new Error('The device request could not be verified. Start sign-in again.');
        }
        if (!controller.signal.aborted) {
          setDetails(parsed);
          setLookupState('ready');
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLookupError(error instanceof Error ? error.message : 'Device request lookup failed');
        setLookupState('error');
      });

    return () => controller.abort();
  }, [code, hasCompleteCode, isLoaded, isSignedIn]);

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
    if (lookupState !== 'ready' || !details || details.user_code !== code) {
      setMessage({
        text: 'Verify the requesting app and requested access before approving.',
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

  async function onSwitchAccount() {
    setSwitchingAccount(true);
    try {
      await signOut({ redirectUrl: signInHref });
    } finally {
      setSwitchingAccount(false);
    }
  }

  return (
    <section className="agi-device-auth-card" aria-labelledby="device-auth-title">
      <p className="agi-section-eyebrow">Authorize a device</p>
      <h1 id="device-auth-title" className="agi-device-auth-title">
        Connect a device.
      </h1>
      <p className="agi-device-auth-lede">
        Confirm the code, signed-in account, and verified requesting app below.{' '}
        <strong>Only approve a request you started.</strong>
      </p>
      {isLoaded && !isSignedIn ? (
        <div role="alert" className="agi-device-auth-alert agi-device-auth-alert--error">
          Sign in before approving this device request. <Link href={signInHref}>Sign in</Link>
        </div>
      ) : null}
      {isLoaded && isSignedIn ? (
        <div className="agi-device-auth-account" aria-label="Signed-in account">
          <div>
            <span>Approving as</span>
            <strong>{accountName || accountEmail || 'Signed-in AGI account'}</strong>
            {accountEmail && accountEmail !== accountName ? <small>{accountEmail}</small> : null}
          </div>
          <button type="button" onClick={() => void onSwitchAccount()} disabled={switchingAccount}>
            {switchingAccount ? 'Switching…' : 'Use a different account'}
          </button>
        </div>
      ) : null}
      <form onSubmit={onSubmit} className="agi-device-auth-form">
        <label htmlFor="device-code">Device code</label>
        <input
          id="device-code"
          name="user_code"
          type="text"
          value={code}
          onChange={(e) => {
            setCode(formatUserCode(e.target.value));
            setMessage(null);
          }}
          required
          placeholder="ABCD-1234"
          autoComplete="off"
          inputMode="text"
          pattern="[A-Z0-9]{4}-[A-Z0-9]{4}"
          maxLength={9}
          className="agi-device-auth-code"
        />
        {lookupState === 'loading' ? (
          <p role="status" className="agi-device-auth-lookup">
            Verifying the requesting app…
          </p>
        ) : null}
        {lookupState === 'error' && lookupError ? (
          <p role="alert" className="agi-device-auth-lookup">
            {lookupError}
          </p>
        ) : null}
        {lookupState === 'ready' && details ? (
          <section className="agi-device-auth-request" aria-labelledby="device-auth-request-title">
            <span>Verified requesting app</span>
            <h2 id="device-auth-request-title">{details.client.name}</h2>
            <p>This approval grants:</p>
            <ul>
              {details.scopes.map((scope) => (
                <li key={scope.id}>
                  <strong>{scope.label}</strong>
                  <small>{scope.description}</small>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {message && (
          <p role={message.type === 'error' ? 'alert' : 'status'} data-message-type={message.type}>
            {message.text}
          </p>
        )}
        <button
          type="submit"
          disabled={
            loading ||
            !hasCompleteCode ||
            !isLoaded ||
            (isLoaded && !isSignedIn) ||
            lookupState !== 'ready'
          }
          className="agi-cta-primary agi-device-auth-submit"
        >
          {!isLoaded
            ? 'Checking...'
            : isSignedIn
              ? loading
                ? 'Approving...'
                : lookupState === 'loading'
                  ? 'Verifying request…'
                  : 'Approve device'
              : 'Sign in required'}
        </button>
      </form>
      <div className="agi-device-auth-note">
        <strong>Using AGI Cloud models?</strong> Approval signs this device into your account. Local
        Mode remains local and does not require account access.
        {!isDesktopSurface ? (
          <>
            {' '}
            <Link href="/pricing">Compare plans &rarr;</Link>
          </>
        ) : null}
      </div>
      <p className="agi-device-auth-cancel">
        {isDesktopSurface ? 'Close this window to cancel.' : <Link href="/">Cancel</Link>}
      </p>
      <p className="agi-device-auth-legal">
        Review the <Link href="/terms">Terms of Service</Link> and{' '}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </section>
  );
}

function DeviceAuthContent() {
  const searchParams = useSearchParams();
  const isDesktopSurface = searchParams.get('surface') === 'desktop';

  if (isDesktopSurface) {
    return (
      <main className="agi-device-auth-desktop-shell" data-testid="desktop-device-auth-shell">
        <div className="agi-device-auth-stage">
          <DeviceForm />
        </div>
      </main>
    );
  }

  return (
    <main className="agi-shell">
      <Header minimal />
      <div className="agi-device-auth-stage">
        <DeviceForm />
      </div>
      <MarketingFooter />
    </main>
  );
}

export default function AuthDevicePage() {
  return (
    <div data-design="agi">
      <Suspense fallback={null}>
        <DeviceAuthContent />
      </Suspense>
    </div>
  );
}
