import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

type CsrfModule = typeof import('@/lib/csrf');
type LoggerModule = typeof import('@/lib/logger');
type RateLimitModule = typeof import('@/lib/rate-limit');
type IdentityModule = typeof import('@/lib/server/identity');
type ApiAuthModule = typeof import('@/lib/api-auth');

vi.mock('server-only', () => ({}));

vi.mock('@/lib/csrf', async () => ({
  ...(await vi.importActual<CsrfModule>('@/lib/csrf')),
}));

vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const rateLimit = vi.hoisted(() => ({
  keys: [] as string[],
  refuse: null as string | null,
}));

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: async (_request: unknown, key: string) => {
    rateLimit.keys.push(key);
    return rateLimit.refuse === key
      ? NextResponse.json({ error: { code: 'RATE_LIMIT_EXCEEDED' } }, { status: 429 })
      : null;
  },
}));

type IdentityContext = { proxied: false } | { proxied: true; subject: string | null };

const identity = vi.hoisted(() => ({
  context: { proxied: false } as IdentityContext,
  reads: 0,
}));

vi.mock('@/lib/server/identity', async (importOriginal) => ({
  ...(await importOriginal<IdentityModule>()),
  getRequestIdentity: async () => {
    identity.reads += 1;
    if (!identity.context.proxied) {
      throw new Error('auth() was called but the identity proxy did not run for this request');
    }
    return { subject: identity.context.subject, sessionId: null };
  },
  verifyIdentitySessionToken: async () => null,
}));

const optionalAuth = vi.hoisted(() => ({ real: false }));

vi.mock('@/lib/api-auth', async (importOriginal) => {
  const actual = await importOriginal<ApiAuthModule>();
  return {
    isAccountUnavailableError: vi.fn(),
    assertAccountActive: vi.fn(),
    getClerkAuthUser: vi.fn(),
    getOptionalAuthUser: async (request: NextRequest) =>
      optionalAuth.real ? actual.getOptionalAuthUser(request) : null,
    getSuspendedAccountUser: vi.fn(),
    getClerkAuthorizedParties: vi.fn(),
  };
});

const db = vi.hoisted(() => ({ executes: [] as Array<{ sql: string; params: unknown[] }> }));

vi.mock('@/lib/server/neon-db', () => ({
  getStripeWebhookDb: vi.fn(),
  getNeonDb: () => ({
    query: async (_sql: string, params: unknown[]) => [
      {
        purpose: params[2],
        granted: params[3],
        notice_version: params[4],
        surface: params[5],
        recorded_at: new Date('2026-10-04T00:00:00.000Z'),
      },
    ],
    execute: async (sql: string, params: unknown[]) => {
      db.executes.push({ sql, params });
      return 1;
    },
  }),
}));

import { GET as mintIdentityBoundToken } from '@/app/api/csrf/route';
import { GET as mintWaitlistToken, POST } from '@/app/api/waitlist/public/route';

const ORIGIN = 'https://app.agiworkforce.test';
const WAITLIST_URL = `${ORIGIN}/api/waitlist/public`;
const SIGNED_IN_COOKIES = '__session=provider-session-jwt; __client_uat=1700000000';
const ANON_COOKIE_NAME = '__Host-anon-session-id';

function tokenRequest(cookie?: string): NextRequest {
  return new NextRequest(WAITLIST_URL, cookie ? { headers: { cookie } } : undefined);
}

function joinRequest(input: { token?: string; cookie?: string }): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (input.token) headers['x-csrf-token'] = input.token;
  if (input.cookie) headers['cookie'] = input.cookie;
  return new NextRequest(WAITLIST_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email: 'visitor@example.invalid',
      source: 'mobile',
      consent: [
        { purpose: 'platform_availability_waitlist', granted: true },
        { purpose: 'product_updates', granted: false },
      ],
      consentSurface: 'web-waitlist-modal',
    }),
  });
}

function cookiePair(setCookie: string | null): string {
  return (setCookie ?? '').split(';')[0] ?? '';
}

async function mintFor(cookie?: string): Promise<{ token: string; cookie: string }> {
  const response = await mintWaitlistToken(tokenRequest(cookie));
  const { token } = (await response.json()) as { token: string };
  const anonCookie = cookiePair(response.headers.get('Set-Cookie'));
  return { token, cookie: [cookie, anonCookie].filter(Boolean).join('; ') };
}

beforeEach(() => {
  db.executes.length = 0;
  rateLimit.keys.length = 0;
  rateLimit.refuse = null;
  identity.context = { proxied: false };
  identity.reads = 0;
  optionalAuth.real = false;
});

describe('joining the public waitlist with the token the route mints', () => {
  it('stores a signed-in visitor, whose browser carries a provider session', async () => {
    const minted = await mintFor(SIGNED_IN_COOKIES);
    expect(minted.token.startsWith('anon-')).toBe(true);

    const response = await POST(joinRequest(minted));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, joined: true });
    expect(db.executes).toHaveLength(1);
    expect(db.executes[0]?.params[1]).toBe('visitor@example.invalid');
  });

  it('stores a signed-out visitor', async () => {
    const minted = await mintFor();
    expect(minted.cookie.startsWith(`${ANON_COOKIE_NAME}=anon-`)).toBe(true);

    const response = await POST(joinRequest(minted));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, joined: true });
    expect(db.executes).toHaveLength(1);
  });

  it('never reads the identity provider to mint or to check the token', async () => {
    const response = await POST(joinRequest(await mintFor(SIGNED_IN_COOKIES)));

    expect(response.status).toBe(200);
    expect(identity.reads).toBe(0);
  });

  it('stores the visitor when the real account lookup reads an identity the proxy never set', async () => {
    optionalAuth.real = true;

    const response = await POST(joinRequest(await mintFor(SIGNED_IN_COOKIES)));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, joined: true });
    expect(identity.reads).toBe(1);
    expect(db.executes).toHaveLength(1);
    expect(db.executes[0]?.params.slice(0, 2)).toEqual([null, 'visitor@example.invalid']);
  });

  it('binds to the anonymous session even where an identity is readable', async () => {
    identity.context = { proxied: true, subject: 'user_signed_in_1' };
    const minted = await mintFor(SIGNED_IN_COOKIES);

    expect(minted.token.startsWith('anon-')).toBe(true);
    expect((await POST(joinRequest(minted))).status).toBe(200);
  });

  it('reuses the anonymous session a returning visitor already holds', async () => {
    const first = await mintFor();
    const again = await mintWaitlistToken(tokenRequest(first.cookie));

    expect(again.headers.get('Set-Cookie')).toBeNull();
    const { token } = (await again.json()) as { token: string };
    expect((await POST(joinRequest({ token, cookie: first.cookie }))).status).toBe(200);
  });
});

describe('the public waitlist still checks the token', () => {
  it('refuses the token /api/csrf mints for a signed-in visitor, which is bound to the user id', async () => {
    identity.context = { proxied: true, subject: 'user_signed_in_1' };
    const minted = await mintIdentityBoundToken(
      new NextRequest(`${ORIGIN}/api/csrf`, { headers: { cookie: SIGNED_IN_COOKIES } }),
    );
    const { token } = (await minted.json()) as { token: string };
    expect(token.startsWith('user_signed_in_1:')).toBe(true);
    expect(minted.headers.get('Set-Cookie')).toBeNull();

    identity.context = { proxied: false };
    const response = await POST(joinRequest({ token, cookie: SIGNED_IN_COOKIES }));

    expect(response.status).toBe(403);
    expect(((await response.json()) as { code: string }).code).toBe('CSRF_VALIDATION_FAILED');
    expect(db.executes).toHaveLength(0);
  });

  it('refuses a request with no token, and a token minted for another anonymous session', async () => {
    const mine = await mintFor();
    const theirs = await mintFor();

    const missing = await POST(joinRequest({ cookie: mine.cookie }));
    const crossed = await POST(joinRequest({ token: theirs.token, cookie: mine.cookie }));
    const cookieless = await POST(joinRequest({ token: mine.token }));

    expect([missing.status, crossed.status, cookieless.status]).toEqual([403, 403, 403]);
    expect(db.executes).toHaveLength(0);
  });
});

describe('GET /api/waitlist/public', () => {
  it('refuses to be cached, with or without a token in the answer', async () => {
    const minted = await mintWaitlistToken(tokenRequest());
    expect(minted.headers.get('Cache-Control')).toBe('private, no-store');

    rateLimit.refuse = 'default';
    const limited = await mintWaitlistToken(tokenRequest());
    expect(limited.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('is rate limited before it mints anything', async () => {
    rateLimit.refuse = 'default';

    const response = await mintWaitlistToken(tokenRequest());

    expect(rateLimit.keys).toEqual(['default']);
    expect(response.status).toBe(429);
    expect(response.headers.get('Set-Cookie')).toBeNull();
    expect(JSON.stringify(await response.json())).not.toContain('anon-');
  });

  it('keeps the anonymous session cookie out of script and cross-site reach', async () => {
    const response = await mintWaitlistToken(tokenRequest());
    const setCookie = response.headers.get('Set-Cookie') ?? '';

    expect(setCookie.startsWith(`${ANON_COOKIE_NAME}=anon-`)).toBe(true);
    for (const attribute of ['HttpOnly', 'SameSite=Strict', 'Secure', 'Path=/']) {
      expect(setCookie).toContain(attribute);
    }
  });
});
