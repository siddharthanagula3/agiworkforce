'use client';

import { useClerk, useUser } from '@clerk/nextjs';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
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

// `fallback` is passed in rather than baked in because this runs at module
// scope, outside any component, where the active locale's `t` is unavailable.
function getErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;
  const error = (body as { error?: unknown }).error;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
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
  const { t, i18n } = useTranslation(['auth', 'common']);
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

  // Error copy here is read through `i18n.t`, not the `t` from useTranslation,
  // and `i18n` (the instance, stable for the life of the tree) is what the dep
  // array carries. `t` gets a new identity on every `languageChanged`, and
  // app/i18n/index.ts fires one on every page load (the post-hydration
  // `changeLanguage()`); depending on it would abort the in-flight lookup, reset
  // the card back to "Verifying the requesting app…", and issue a second
  // GET /api/auth/device/code on a screen where the user is making a trust
  // decision. `i18n.t` resolves against the active language when it is called,
  // so the message is still localized.
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
        if (!response.ok)
          throw new Error(getErrorMessage(body, i18n.t('auth:device.approvalFailed')));
        const parsed = parseDeviceAuthorizationDetails(body);
        if (!parsed || parsed.user_code !== code) {
          throw new Error(i18n.t('auth:device.unverifiedRequest'));
        }
        if (!controller.signal.aborted) {
          setDetails(parsed);
          setLookupState('ready');
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLookupError(error instanceof Error ? error.message : i18n.t('auth:device.lookupFailed'));
        setLookupState('error');
      });

    return () => controller.abort();
  }, [code, hasCompleteCode, isLoaded, isSignedIn, i18n]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;
    if (!isSignedIn) {
      setMessage({
        text: t('auth:device.signInFirst'),
        type: 'error',
      });
      return;
    }
    if (lookupState !== 'ready' || !details || details.user_code !== code) {
      setMessage({
        text: t('auth:device.verifyBeforeApproving'),
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
        throw new Error(t('auth:device.csrfFailed'));
      }

      const res = await fetch('/api/auth/device/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfJson.token },
        credentials: 'include',
        body: JSON.stringify({ user_code: code.trim().toUpperCase() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(getErrorMessage(body, t('auth:device.approvalFailed')));
      }
      setMessage({
        text: t('auth:device.approved'),
        type: 'info',
      });
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : t('auth:device.approvalFailed'),
        type: 'error',
      });
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
      <p className="agi-section-eyebrow">{t('auth:device.eyebrow')}</p>
      <h1 id="device-auth-title" className="agi-device-auth-title">
        {t('auth:device.title')}
      </h1>
      <p className="agi-device-auth-lede">
        {t('auth:device.lede')} <strong>{t('auth:device.ledeWarning')}</strong>
      </p>
      {isLoaded && !isSignedIn ? (
        <div role="alert" className="agi-device-auth-alert agi-device-auth-alert--error">
          {t('auth:device.signInFirst')} <Link href={signInHref}>{t('common:navSignIn')}</Link>
        </div>
      ) : null}
      {isLoaded && isSignedIn ? (
        <div className="agi-device-auth-account" aria-label={t('auth:device.accountRegion')}>
          <div>
            <span>{t('auth:device.approvingAs')}</span>
            <strong>{accountName || accountEmail || t('auth:device.signedInFallback')}</strong>
            {accountEmail && accountEmail !== accountName ? <small>{accountEmail}</small> : null}
          </div>
          <button type="button" onClick={() => void onSwitchAccount()} disabled={switchingAccount}>
            {switchingAccount ? t('auth:device.switching') : t('auth:device.useDifferentAccount')}
          </button>
        </div>
      ) : null}
      <form onSubmit={onSubmit} className="agi-device-auth-form">
        <label htmlFor="device-code">{t('auth:device.codeLabel')}</label>
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
            {t('auth:device.verifyingApp')}
          </p>
        ) : null}
        {lookupState === 'error' && lookupError ? (
          <p role="alert" className="agi-device-auth-lookup">
            {lookupError}
          </p>
        ) : null}
        {lookupState === 'ready' && details ? (
          <section className="agi-device-auth-request" aria-labelledby="device-auth-request-title">
            <span>{t('auth:device.verifiedRequestingApp')}</span>
            <h2 id="device-auth-request-title">{details.client.name}</h2>
            <p>{t('auth:device.approvalGrants')}</p>
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
            ? t('auth:device.checking')
            : isSignedIn
              ? loading
                ? t('auth:device.approving')
                : lookupState === 'loading'
                  ? t('auth:device.verifyingRequest')
                  : t('auth:device.approve')
              : t('auth:device.signInRequired')}
        </button>
      </form>
      <div className="agi-device-auth-note">
        <strong>{t('auth:device.cloudNoteHeading')}</strong> {t('auth:device.cloudNoteBody')}
        {!isDesktopSurface ? (
          <>
            {' '}
            <Link href="/pricing">{t('auth:device.comparePlans')}</Link>
          </>
        ) : null}
      </div>
      <p className="agi-device-auth-cancel">
        {isDesktopSurface ? (
          t('auth:device.closeToCancel')
        ) : (
          <Link href="/">{t('common:cancel')}</Link>
        )}
      </p>
      <p className="agi-device-auth-legal">
        {t('auth:device.legalPrefix')} <Link href="/terms">{t('auth:device.termsLink')}</Link>{' '}
        {t('auth:and')} <Link href="/privacy">{t('auth:device.privacyLink')}</Link>.
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
