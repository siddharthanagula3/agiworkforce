'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { Header } from '@shared/components/layout/Header';
import { SuccessState } from '@shared/components/SuccessState';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Eyebrow, Prose, Stack } from '@/features/marketing/components/system';
import { useCurrentUser } from '@/lib/identity/client';
import type { SlackLinkPreview } from '@/lib/slack/slack-contract';
import { toUserMessage } from '@/lib/user-error-message';

const LINK_PATH = '/api/slack/link';
const SETTINGS_PATH = '/chat?settings=slack';
const LOOKUP_FAILED =
  'This link could not be checked. Send AGI Workforce a message in Slack to get a new one.';
const CONNECT_FAILED = 'Your Slack account could not be connected.';

type LookupState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'failed'; message: string }
  | { kind: 'ready'; preview: SlackLinkPreview };

function errorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;
  const error = (body as { error?: unknown }).error;
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

function isPreview(body: unknown): body is SlackLinkPreview {
  if (!body || typeof body !== 'object') return false;
  const candidate = body as Record<string, unknown>;
  return (
    typeof candidate['teamName'] === 'string' &&
    typeof candidate['expiresAt'] === 'string' &&
    typeof candidate['planAllowed'] === 'boolean' &&
    typeof candidate['requiredPlans'] === 'string' &&
    (candidate['workspaceName'] === null || typeof candidate['workspaceName'] === 'string')
  );
}

function SlackLinkForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') ?? '';
  const { isLoaded, isSignedIn, user } = useCurrentUser();
  const [lookup, setLookup] = useState<LookupState>({ kind: 'idle' });
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [connectedTeam, setConnectedTeam] = useState<string | null>(null);

  const redirectPath = `/slack/link?token=${encodeURIComponent(token)}`;
  const signInHref = `/login?redirectTo=${encodeURIComponent(redirectPath)}`;
  const accountLabel = user?.email ?? user?.emails[0] ?? user?.fullName ?? null;

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !token) {
      setLookup({ kind: 'idle' });
      return;
    }
    const controller = new AbortController();
    setLookup({ kind: 'loading' });
    void fetch(`${LINK_PATH}?token=${encodeURIComponent(token)}`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) throw new Error(errorMessage(body, LOOKUP_FAILED));
        if (!isPreview(body)) throw new Error(LOOKUP_FAILED);
        if (!controller.signal.aborted) setLookup({ kind: 'ready', preview: body });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLookup({ kind: 'failed', message: toUserMessage(error, LOOKUP_FAILED) });
      });
    return () => controller.abort();
  }, [isLoaded, isSignedIn, token]);

  async function connect() {
    if (lookup.kind !== 'ready' || !lookup.preview.planAllowed) return;
    setConnecting(true);
    setMessage(null);
    try {
      const csrfResponse = await fetch('/api/csrf', { method: 'GET', credentials: 'include' });
      const csrf = (await csrfResponse.json().catch(() => null)) as { token?: string } | null;
      if (!csrfResponse.ok || !csrf?.token) throw new Error(CONNECT_FAILED);
      const response = await fetch(LINK_PATH, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf.token },
        body: JSON.stringify({ token }),
      });
      const body = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) throw new Error(errorMessage(body, CONNECT_FAILED));
      setConnectedTeam(lookup.preview.teamName);
    } catch (error) {
      setMessage(toUserMessage(error, CONNECT_FAILED));
    } finally {
      setConnecting(false);
    }
  }

  const cardStyle = { maxWidth: '30rem', width: '100%', marginInline: 'auto' } as const;

  if (connectedTeam) {
    return (
      <section aria-labelledby="slack-link-title" style={cardStyle}>
        <h1 id="slack-link-title" className="sr-only">
          Slack account connected
        </h1>
        <SuccessState
          title="Your Slack account is connected"
          description={`Go back to ${connectedTeam} in Slack and send AGI Workforce a message. It answers in the thread, as the app.`}
          action={{ label: 'Manage in Settings', onClick: () => router.push(SETTINGS_PATH) }}
        />
      </section>
    );
  }

  const preview = lookup.kind === 'ready' ? lookup.preview : null;

  return (
    <section aria-labelledby="slack-link-title" style={cardStyle}>
      <Stack gap="loose">
        <div>
          <Eyebrow>Slack</Eyebrow>
          <h1 className="agi-ds-h1" id="slack-link-title">
            Connect Slack to AGI Workforce
          </h1>
        </div>
        <Prose>
          AGI Workforce answers your Slack messages as the app, on your account: your plan and
          credits, your workspace&apos;s policies, and your approval settings. Anything that needs
          your approval waits for you here on the web or in the desktop app.
        </Prose>

        {!token ? (
          <p role="alert" style={{ fontSize: 'var(--agi-text-sm)', color: 'var(--agi-error)' }}>
            This link is missing its code. Send AGI Workforce a message in Slack to get a new one.
          </p>
        ) : null}

        {token && isLoaded && !isSignedIn ? (
          <p role="alert" style={{ fontSize: 'var(--agi-text-sm)', color: 'var(--agi-error)' }}>
            Sign in to the AGI Workforce account Slack should answer as.{' '}
            <Link href={signInHref} className="agi-ds-link">
              Sign in
            </Link>
          </p>
        ) : null}

        {lookup.kind === 'loading' ? (
          <p role="status" style={{ fontSize: 'var(--agi-text-sm)', color: 'var(--agi-ink-2)' }}>
            Checking the link…
          </p>
        ) : null}

        {lookup.kind === 'failed' ? (
          <p role="alert" style={{ fontSize: 'var(--agi-text-sm)', color: 'var(--agi-error)' }}>
            {lookup.message}
          </p>
        ) : null}

        {preview ? (
          <section
            aria-labelledby="slack-link-request-title"
            style={{
              display: 'grid',
              gap: 'var(--agi-space-1)',
              padding: 'var(--agi-space-2) var(--agi-space-3)',
              border: '1px solid var(--agi-rule)',
              borderRadius: 'var(--agi-radius-frame)',
            }}
          >
            <span style={{ fontSize: 'var(--agi-text-xs)', color: 'var(--agi-ink-2)' }}>
              Slack workspace
            </span>
            <h2 id="slack-link-request-title" className="agi-ds-h3">
              {preview.teamName}
            </h2>
            <p style={{ fontSize: 'var(--agi-text-sm)', color: 'var(--agi-ink-2)' }}>
              Answers as {accountLabel ?? 'your account'}, in{' '}
              {preview.workspaceName ?? 'your personal workspace'}.
            </p>
          </section>
        ) : null}

        {preview && !preview.planAllowed ? (
          <p role="alert" style={{ fontSize: 'var(--agi-text-sm)', color: 'var(--agi-error)' }}>
            AGI Workforce in Slack is available on {preview.requiredPlans} plans.{' '}
            <Link href="/pricing" className="agi-ds-link">
              See plans
            </Link>
          </p>
        ) : null}

        {message ? (
          <p role="alert" style={{ fontSize: 'var(--agi-text-sm)', color: 'var(--agi-error)' }}>
            {message}
          </p>
        ) : null}

        <button
          type="button"
          className="agi-ds-btn"
          data-variant="primary"
          disabled={connecting || !preview || !preview.planAllowed}
          onClick={() => void connect()}
        >
          {connecting ? 'Connecting…' : 'Connect Slack account'}
        </button>
        <p style={{ fontSize: 'var(--agi-text-sm)', textAlign: 'center' }}>
          <Link href="/" className="agi-ds-link">
            Cancel
          </Link>
        </p>
      </Stack>
    </section>
  );
}

export default function SlackLinkPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <main id="main-content">
        <Header minimal />
        <div
          style={{
            display: 'grid',
            placeItems: 'center',
            padding: 'var(--agi-section-y-md) var(--agi-gutter)',
          }}
        >
          <Suspense fallback={null}>
            <SlackLinkForm />
          </Suspense>
        </div>
        <MarketingFooter />
      </main>
    </div>
  );
}
