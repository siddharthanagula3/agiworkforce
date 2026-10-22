'use client';

import { useCurrentUser, useSignOut } from '@/lib/identity/client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Header } from '@shared/components/layout/Header';
import { SuccessState } from '@shared/components/SuccessState';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Eyebrow, Prose, Stack } from '@/features/marketing/components/system';
import { toUserMessage } from '@/lib/user-error-message';
import { apiErrorMessage } from '@shared/utils/api-error';
import { buildLoginUrl, buildSignupUrl, type AuthRouteContext } from '@/features/auth/authRoutes';
import {
  DEVICE_AUTHORIZATION_APPROVE_PATH,
  DEVICE_AUTHORIZATION_CODE_PATH,
  DeviceAuthorizationLookupResponseSchema,
  type DeviceAuthorizationLookupResponse,
} from '@agiworkforce/cloud-contracts';

function formatUserCode(value: string): string {
  const clean = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

function getTermsAcceptanceUrl(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const candidate = (body as { acceptanceUrl?: unknown }).acceptanceUrl;
  return typeof candidate === 'string' && candidate.startsWith('/login/complete?')
    ? candidate
    : null;
}

function parseDeviceAuthorizationDetails(body: unknown): DeviceAuthorizationLookupResponse | null {
  const parsed = DeviceAuthorizationLookupResponseSchema.safeParse(body);
  return parsed.success && parsed.data.scopes.length > 0 ? parsed.data : null;
}

function DeviceForm() {
  const searchParams = useSearchParams();
  const { t, i18n } = useTranslation(['auth', 'common']);
  const { isLoaded, isSignedIn, user } = useCurrentUser();
  const signOut = useSignOut();
  const isDesktopSurface = searchParams.get('surface') === 'desktop';
  const [code, setCode] = useState(formatUserCode(searchParams.get('user_code') || ''));
  const [details, setDetails] = useState<DeviceAuthorizationLookupResponse | null>(null);
  const [lookupState, setLookupState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [switchingAccount, setSwitchingAccount] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'info' } | null>(null);
  const [approved, setApproved] = useState(false);
  const [declined, setDeclined] = useState(false);
  const router = useRouter();
  const [termsReviewHref, setTermsReviewHref] = useState<string | null>(null);
  const redirectParams = new URLSearchParams();
  if (code) redirectParams.set('user_code', code);
  if (isDesktopSurface) redirectParams.set('surface', 'desktop');
  const redirectQuery = redirectParams.toString();
  const redirectPath = `/auth/device${redirectQuery ? `?${redirectQuery}` : ''}`;
  const accountRoute: AuthRouteContext = {
    redirectTo: redirectPath,
    desktopSurface: isDesktopSurface,
    authRetry: false,
    requestedRedirect: true,
  };
  const signInHref = buildLoginUrl(accountRoute);
  const signUpHref = buildSignupUrl(accountRoute);
  const accountEmail = user?.email ?? user?.emails[0] ?? null;
  const accountName =
    user?.fullName ||
    [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() ||
    user?.username ||
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
    void fetch(`${DEVICE_AUTHORIZATION_CODE_PATH}?user_code=${encodeURIComponent(code)}`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as unknown;
        if (!response.ok)
          throw new Error(apiErrorMessage(body, i18n.t('auth:device.approvalFailed')));
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
        setLookupError(toUserMessage(error, i18n.t('auth:device.lookupFailed')));
        setLookupState('error');
      });

    return () => controller.abort();
  }, [code, hasCompleteCode, isLoaded, isSignedIn, i18n]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    return submitDecision('approve');
  }

  async function submitDecision(action: 'approve' | 'deny') {
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

    const failureText = t(
      action === 'deny' ? 'auth:device.declineFailed' : 'auth:device.approvalFailed',
    );
    setLoading(true);
    setDeclining(action === 'deny');
    setMessage(null);
    setTermsReviewHref(null);
    try {
      const csrfRes = await fetch('/api/csrf', { method: 'GET', credentials: 'include' });
      const csrfJson = (await csrfRes.json().catch(() => null)) as { token?: string } | null;
      if (!csrfRes.ok || !csrfJson?.token) {
        throw new Error(t('auth:device.csrfFailed'));
      }

      const res = await fetch(DEVICE_AUTHORIZATION_APPROVE_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfJson.token },
        credentials: 'include',
        body: JSON.stringify({
          user_code: code.trim().toUpperCase(),
          ...(action === 'deny' ? { action } : {}),
          ...(isDesktopSurface ? { surface: 'desktop' } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setTermsReviewHref(getTermsAcceptanceUrl(body));
        throw new Error(apiErrorMessage(body, failureText));
      }
      if (action === 'deny') setDeclined(true);
      else setApproved(true);
    } catch (err) {
      setMessage({
        text: toUserMessage(err, failureText),
        type: 'error',
      });
    } finally {
      setLoading(false);
      setDeclining(false);
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

  const cardStyle = { maxWidth: '30rem', width: '100%', marginInline: 'auto' } as const;

  if (approved) {
    return (
      <section aria-labelledby="device-auth-title" style={cardStyle}>
        <h1 id="device-auth-title" className="sr-only">
          {t('auth:device.approvedTitle')}
        </h1>
        <SuccessState
          title={t('auth:device.approvedTitle')}
          description={t('auth:device.approvedDetail')}
          action={{
            label: t('auth:device.approvedManage'),
            onClick: () => {
              router.push('/settings#account');
            },
          }}
        />
      </section>
    );
  }

  if (declined) {
    return (
      <section aria-labelledby="device-auth-title" style={cardStyle}>
        <h1 id="device-auth-title" className="sr-only">
          {t('auth:device.declinedTitle')}
        </h1>
        <SuccessState
          icon={X}
          title={t('auth:device.declinedTitle')}
          description={t('auth:device.declinedDetail')}
        />
      </section>
    );
  }

  return (
    <section aria-labelledby="device-auth-title" style={cardStyle}>
      <Stack gap="loose">
        <div>
          <Eyebrow>{t('auth:device.eyebrow')}</Eyebrow>
          <h1 className="agi-ds-h1" id="device-auth-title">
            {t('auth:device.title')}
          </h1>
        </div>
        <Prose>
          {t('auth:device.lede')} <strong>{t('auth:device.ledeWarning')}</strong>
        </Prose>
        {isLoaded && !isSignedIn ? (
          <div
            role="alert"
            style={{
              border: '1px solid var(--agi-rule)',
              borderRadius: 'var(--agi-radius-frame)',
              color: 'var(--agi-error)',
              padding: 'var(--agi-space-2)',
              fontSize: 'var(--agi-text-sm)',
            }}
          >
            {t('auth:device.signInFirst')}{' '}
            <Link href={signInHref} className="agi-ds-link">
              {t('common:navSignIn')}
            </Link>
            {' · '}
            <Link href={signUpHref} className="agi-ds-link">
              {t('auth:createAccount')}
            </Link>
          </div>
        ) : null}
        {isLoaded && isSignedIn ? (
          <div className="agi-ds-account-row" aria-label={t('auth:device.accountRegion')}>
            <div>
              <span
                style={{
                  display: 'block',
                  fontSize: 'var(--agi-text-xs)',
                  color: 'var(--agi-ink-2)',
                }}
              >
                {t('auth:device.approvingAs')}
              </span>
              <strong style={{ color: 'var(--agi-ink)' }}>
                {accountName || accountEmail || t('auth:device.signedInFallback')}
              </strong>
              {accountEmail && accountEmail !== accountName ? (
                <small style={{ display: 'block', color: 'var(--agi-ink-2)' }}>
                  {accountEmail}
                </small>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => void onSwitchAccount()}
              disabled={switchingAccount}
              className="relative before:absolute before:-inset-2 before:content-[''] agi-ds-link"
              style={{ background: 'none', border: 'none', font: 'inherit', cursor: 'pointer' }}
            >
              {switchingAccount ? t('auth:device.switching') : t('auth:device.useDifferentAccount')}
            </button>
          </div>
        ) : null}
        <form
          onSubmit={onSubmit}
          style={{ display: 'grid', gap: 'var(--agi-space-2)', width: '100%' }}
        >
          <label
            htmlFor="device-code"
            style={{ fontSize: 'var(--agi-text-sm)', color: 'var(--agi-ink-2)' }}
          >
            {t('auth:device.codeLabel')}
          </label>
          <input
            id="device-code"
            name="user_code"
            type="text"
            value={code}
            onChange={(e) => {
              setCode(formatUserCode(e.target.value));
              setMessage(null);
              setTermsReviewHref(null);
            }}
            required
            placeholder="ABCD-1234"
            autoComplete="off"
            inputMode="text"
            pattern="[A-Z0-9]{4}-[A-Z0-9]{4}"
            maxLength={9}
            className="agi-ds-code-input"
          />
          {lookupState === 'loading' ? (
            <p role="status" style={{ fontSize: 'var(--agi-text-sm)', color: 'var(--agi-ink-2)' }}>
              {t('auth:device.verifyingApp')}
            </p>
          ) : null}
          {lookupState === 'error' && lookupError ? (
            <p role="alert" style={{ fontSize: 'var(--agi-text-sm)', color: 'var(--agi-error)' }}>
              {lookupError}
            </p>
          ) : null}
          {lookupState === 'ready' && details ? (
            <section
              aria-labelledby="device-auth-request-title"
              style={{
                display: 'grid',
                gap: 'var(--agi-space-1)',
                padding: 'var(--agi-space-2) var(--agi-space-3)',
                border: '1px solid var(--agi-rule)',
                borderRadius: 'var(--agi-radius-frame)',
              }}
            >
              <span style={{ fontSize: 'var(--agi-text-xs)', color: 'var(--agi-ink-2)' }}>
                {t('auth:device.verifiedRequestingApp')}
              </span>
              <h2 id="device-auth-request-title" className="agi-ds-h3">
                {details.client.name}
              </h2>
              <p style={{ fontSize: 'var(--agi-text-sm)', color: 'var(--agi-ink-2)' }}>
                {t('auth:device.approvalGrants')}
              </p>
              <ul style={{ display: 'grid', gap: 'var(--agi-space-1)', margin: 0, padding: 0 }}>
                {details.scopes.map((scope) => (
                  <li key={scope.id} style={{ listStyle: 'none' }}>
                    <strong style={{ color: 'var(--agi-ink)' }}>{scope.label}</strong>{' '}
                    <small style={{ color: 'var(--agi-ink-2)' }}>{scope.description}</small>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {message && (
            <p
              role={message.type === 'error' ? 'alert' : 'status'}
              data-message-type={message.type}
              style={{
                fontSize: 'var(--agi-text-sm)',
                color: message.type === 'error' ? 'var(--agi-error)' : 'var(--agi-ink)',
              }}
            >
              {message.text}
            </p>
          )}
          {termsReviewHref ? (
            <Link href={termsReviewHref} className="agi-ds-link">
              Review current policies
            </Link>
          ) : null}
          <button
            type="submit"
            disabled={
              loading ||
              !hasCompleteCode ||
              !isLoaded ||
              (isLoaded && !isSignedIn) ||
              lookupState !== 'ready'
            }
            className="agi-ds-btn"
            data-variant="primary"
          >
            {!isLoaded
              ? t('auth:device.checking')
              : isSignedIn
                ? loading && !declining
                  ? t('auth:device.approving')
                  : lookupState === 'loading'
                    ? t('auth:device.verifyingRequest')
                    : t('auth:device.approve')
                : t('auth:device.signInRequired')}
          </button>
        </form>
        <Prose size="sm">
          <strong style={{ color: 'var(--agi-ink)' }}>{t('auth:device.cloudNoteHeading')}</strong>{' '}
          {t('auth:device.cloudNoteBody')}
          {!isDesktopSurface ? (
            <>
              {' '}
              <Link href="/pricing" className="agi-ds-link">
                {t('auth:device.comparePlans')}
              </Link>
            </>
          ) : null}
        </Prose>
        <p style={{ fontSize: 'var(--agi-text-sm)', textAlign: 'center' }}>
          <button
            type="button"
            className="agi-ds-link"
            onClick={() => void submitDecision('deny')}
            disabled={
              loading || !hasCompleteCode || !isLoaded || !isSignedIn || lookupState !== 'ready'
            }
            style={{
              background: 'none',
              border: 0,
              padding: 0,
              font: 'inherit',
              cursor: 'pointer',
            }}
          >
            {declining ? t('auth:device.declining') : t('common:decline')}
          </button>
        </p>
        <p
          style={{ fontSize: 'var(--agi-text-xs)', color: 'var(--agi-ink-2)', textAlign: 'center' }}
        >
          {t('auth:device.legalPrefix')}{' '}
          <Link href="/terms" className="agi-ds-link">
            {t('auth:device.termsLink')}
          </Link>{' '}
          {t('auth:and')}{' '}
          <Link href="/privacy" className="agi-ds-link">
            {t('auth:device.privacyLink')}
          </Link>
          .
        </p>
      </Stack>
    </section>
  );
}

function DeviceAuthContent() {
  const searchParams = useSearchParams();
  const isDesktopSurface = searchParams.get('surface') === 'desktop';

  if (isDesktopSurface) {
    return (
      <main
        id="main-content"
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: 'var(--agi-space-4) var(--agi-gutter)',
          background: 'var(--agi-ground)',
        }}
        data-testid="desktop-device-auth-shell"
      >
        <DeviceForm />
      </main>
    );
  }

  return (
    <>
      <Header minimal />
      <main id="main-content">
        <div
          style={{
            display: 'grid',
            placeItems: 'center',
            padding: 'var(--agi-section-y-md) var(--agi-gutter)',
          }}
        >
          <DeviceForm />
        </div>
      </main>
      <MarketingFooter />
    </>
  );
}

export default function AuthDevicePage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Suspense fallback={null}>
        <DeviceAuthContent />
      </Suspense>
    </div>
  );
}
