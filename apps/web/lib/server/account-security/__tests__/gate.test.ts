import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const ACCOUNT = 'user_advanced_security';
const SESSION = 'sess_signed_in_with_password';
const DESKTOP_SESSION = 'sess_redeemed_in_the_desktop_window';
const CHALLENGE = 'c'.repeat(43);

const state = vi.hoisted(() => ({
  sessionId: 'sess_signed_in_with_password',
  enrolledAt: null as Date | null,
  verifiedSessions: new Set<string>(),
  noteSessionSighting: vi.fn(),
  createDesktopSignInGrant: vi.fn(
    async (_userId: string, _challenge: string) => 'desktop-grant-code',
  ),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/key-value', () => ({
  getKeyValueStore: () => null,
  getKeyValueRateLimiter: () => null,
}));
vi.mock('@/lib/security-audit', () => ({
  logAuthFailure: vi.fn(async () => undefined),
  recordAuditEvent: vi.fn(async () => undefined),
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/server/session-sightings', () => ({
  noteSessionSighting: (...args: unknown[]) => state.noteSessionSighting(...args),
}));
vi.mock('@/lib/server/desktop-sign-in', () => ({
  isDesktopSignInChallenge: (value: unknown) => typeof value === 'string' && value.length === 43,
  createDesktopSignInGrant: (userId: string, challenge: string) =>
    state.createDesktopSignInGrant(userId, challenge),
}));
vi.mock('@/lib/server/identity', () => {
  const provider = {
    name: 'clerk',
    authorizedParties: () => ['https://agiworkforce.com'],
    verifySessionToken: async () => null,
    getSession: async (id: string) => ({
      id,
      userId: 'user_advanced_security',
      status: 'active',
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      expireAt: null,
      latestActivity: null,
    }),
    revokeSession: async () => undefined,
  };
  return {
    getIdentityProvider: () => provider,
    getRequestIdentity: async () => ({
      subject: 'user_advanced_security',
      sessionId: state.sessionId,
      organizationId: null,
      organizationRole: null,
      isSignedIn: true,
      getToken: async () => 'session-token',
    }),
    verifyIdentitySessionToken: async () => null,
    getIdentityUser: async () => null,
  };
});

function answer(sql: string, params: unknown[]): Record<string, unknown>[] {
  const statement = sql.toLowerCase();
  if (statement.includes('left join public.identities')) {
    return [{ identity_id: null, account_id: params[2] ?? null, erased: false }];
  }
  if (statement.includes('account_status')) {
    return [{ account_status: null, deletion_scheduled_for: null, erased: false }];
  }
  if (statement.includes('from public.account_security_enrollments')) {
    return state.enrolledAt ? [{ enrolled_at: state.enrolledAt }] : [];
  }
  if (statement.includes('from public.account_security_sessions')) {
    const [sessionId, userId] = params as [string, string];
    return userId === ACCOUNT && state.verifiedSessions.has(sessionId)
      ? [{ expires_at: new Date(Date.now() + 60 * 60 * 1000) }]
      : [];
  }
  return [];
}

vi.mock('@/lib/server/neon-db', () => {
  const db = {
    query: async (sql: string, params: unknown[] = []) => answer(sql, params),
    execute: async () => 0,
    transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
    withUser: () => db,
    withOrg: () => db,
  };
  return { getNeonDb: () => db };
});

import { POST as grantDesktopSignIn } from '@/app/api/auth/desktop/grant/route';
import { getClerkAuthUser } from '@/lib/api-auth';
import { isPasskeyRequiredError } from '../gate';

function browserRequest(): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/chat/conversations');
}

function desktopGrantRequest(): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/auth/desktop/grant', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ challenge: CHALLENGE }),
  });
}

async function refusalOf(work: Promise<unknown>): Promise<unknown> {
  return work.then(
    () => null,
    (error: unknown) => error,
  );
}

describe('the Advanced Account Security gate on a signed-in session', () => {
  beforeEach(() => {
    state.sessionId = SESSION;
    state.enrolledAt = null;
    state.verifiedSessions.clear();
    state.noteSessionSighting.mockReset();
    state.createDesktopSignInGrant.mockClear();
  });

  it('lets a session through when the account has not enrolled', async () => {
    await expect(getClerkAuthUser(browserRequest())).resolves.toMatchObject({ userId: ACCOUNT });
  });

  it('refuses every request from an enrolled account until that session passes a passkey check', async () => {
    state.enrolledAt = new Date(Date.now() - 60 * 1000);

    const refusal = await refusalOf(getClerkAuthUser(browserRequest()));

    expect(isPasskeyRequiredError(refusal)).toBe(true);
    expect(refusal).toMatchObject({
      statusCode: 403,
      code: 'PASSKEY_REQUIRED',
      details: { reason: 'passkey_required' },
    });
    expect(state.noteSessionSighting).toHaveBeenCalledWith(ACCOUNT, SESSION, expect.anything());
  });

  it('lets the same session through once a passkey check is recorded against it', async () => {
    state.enrolledAt = new Date(Date.now() - 60 * 1000);
    state.verifiedSessions.add(SESSION);

    await expect(getClerkAuthUser(browserRequest())).resolves.toMatchObject({ userId: ACCOUNT });
  });

  it('refuses a desktop sign-in grant from an enrolled browser session that has not passed the check', async () => {
    state.enrolledAt = new Date(Date.now() - 60 * 1000);

    const response = await grantDesktopSignIn(desktopGrantRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'PASSKEY_REQUIRED', details: { reason: 'passkey_required' } },
    });
    expect(state.createDesktopSignInGrant).not.toHaveBeenCalled();
  });

  it('grants the desktop sign-in once the browser session passed, and gates the session it starts', async () => {
    state.enrolledAt = new Date(Date.now() - 60 * 1000);
    state.verifiedSessions.add(SESSION);

    const response = await grantDesktopSignIn(desktopGrantRequest());
    expect(response.status).toBe(200);
    expect(state.createDesktopSignInGrant).toHaveBeenCalledWith(ACCOUNT, CHALLENGE);

    state.sessionId = DESKTOP_SESSION;
    const refusal = await refusalOf(getClerkAuthUser(browserRequest()));
    expect(isPasskeyRequiredError(refusal)).toBe(true);
  });
});
