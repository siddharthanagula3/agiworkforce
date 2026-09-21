import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  recordAuditEvent: vi.fn(async (_event: Record<string, unknown>) => undefined),
  identityEvent: vi.fn(async (_event: Record<string, unknown>) => ({
    assessment: { level: 'normal', signals: [] },
    response: null,
  })),
  invalidate: vi.fn(async (_subject: string, _provider?: string) => undefined),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: (...args: unknown[]) => mocks.query(...args) },
    userId: 'user-1',
    organizationId: null,
  })),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: (...args: unknown[]) => mocks.query(...args) }),
}));
vi.mock('@/lib/server/identity-account', () => ({
  invalidateIdentityAccountCache: (subject: string, provider?: string) =>
    mocks.invalidate(subject, provider),
}));
vi.mock('@/lib/server/identity', () => ({
  getIdentityProvider: () => ({ name: 'clerk' }),
  getRequestIdentity: vi.fn(async () => ({ subject: 'user-1', sessionId: 'sess_1' })),
}));
vi.mock('@/lib/services/identity-events', () => ({
  handleIdentitySecurityEvent: (_db: unknown, _identity: unknown, event: Record<string, unknown>) =>
    mocks.identityEvent(event),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: (event: Record<string, unknown>) => mocks.recordAuditEvent(event),
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));

process.env['CSRF_SECRET'] = 'identities-step-up-secret-long-enough-for-hkdf';

import { STEP_UP_TOKEN_HEADER } from '@/lib/server/step-up-auth';
import { createStepUpGrant, resetStepUpSigningKeyCache } from '@/lib/server/step-up/grant-token';
import { DELETE, GET } from './route';

const CLERK_IDENTITY = '11111111-1111-4111-8111-111111111111';
const SECOND_IDENTITY = '22222222-2222-4222-8222-222222222222';

function identityRow(id: string, provider: string, subject: string) {
  return {
    id,
    provider,
    subject,
    creation_source: 'sign_in',
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    last_authenticated_at: new Date('2026-09-01T00:00:00.000Z'),
  };
}

/** Clerk writes its subject straight into profiles.id, so this row IS the account. */
const CLERK_ROW = identityRow(CLERK_IDENTITY, 'clerk', 'user-1');
const OKTA_ROW = identityRow(SECOND_IDENTITY, 'okta', 'okta|abc');

function listRequest() {
  return new NextRequest('http://localhost/api/settings/identities');
}

function unlinkRequest(identityId: string, stepUpToken?: string) {
  return new NextRequest('http://localhost/api/settings/identities', {
    method: 'DELETE',
    headers: {
      'content-type': 'application/json',
      ...(stepUpToken ? { [STEP_UP_TOKEN_HEADER]: stepUpToken } : {}),
    },
    body: JSON.stringify({ identityId }),
  });
}

/** The statement order unlinkAccountIdentity issues: target read, delete, then the re-check. */
function answers(target: unknown[], remainder: unknown[][] = []) {
  mocks.query.mockResolvedValueOnce(target);
  for (const rows of remainder) mocks.query.mockResolvedValueOnce(rows);
}

function grant(identityId: string) {
  return createStepUpGrant({
    userId: 'user-1',
    action: 'identity.unlink',
    resourceId: identityId,
    method: 'totp',
  }).token;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStepUpSigningKeyCache();
});

describe('GET /api/settings/identities', () => {
  it('lists every sign-in method on the account with when it was last used', async () => {
    mocks.query.mockResolvedValueOnce([CLERK_ROW, OKTA_ROW]);

    const body = (await (await GET(listRequest())).json()) as {
      identities: { id: string; provider: string; lastAuthenticatedAt: string }[];
    };

    expect(body.identities.map((identity) => identity.provider)).toEqual(['clerk', 'okta']);
    expect(body.identities[0]?.lastAuthenticatedAt).toBe('2026-09-01T00:00:00.000Z');
  });

  it('marks the only sign-in method as one that cannot be removed', async () => {
    mocks.query.mockResolvedValueOnce([CLERK_ROW]);

    const body = (await (await GET(listRequest())).json()) as {
      identities: { removable: boolean }[];
    };

    expect(body.identities).toHaveLength(1);
    expect(body.identities[0]?.removable).toBe(false);
  });

  it('marks the method the account is registered under unremovable even beside a sibling', async () => {
    mocks.query.mockResolvedValueOnce([CLERK_ROW, OKTA_ROW]);

    const body = (await (await GET(listRequest())).json()) as {
      identities: { id: string; removable: boolean }[];
    };

    expect(body.identities.find((row) => row.id === CLERK_IDENTITY)?.removable).toBe(false);
    expect(body.identities.find((row) => row.id === SECOND_IDENTITY)?.removable).toBe(true);
  });

  it('never returns the provider subject to the browser', async () => {
    mocks.query.mockResolvedValueOnce([CLERK_ROW, OKTA_ROW]);

    const body = await (await GET(listRequest())).text();

    expect(body).not.toContain('okta|abc');
  });

  it('scopes the listing to the caller rather than reading every account', async () => {
    mocks.query.mockResolvedValueOnce([]);

    await GET(listRequest());

    const [sql, params] = mocks.query.mock.calls[0] ?? [];
    expect(String(sql)).toContain('user_id = $1');
    expect(params).toEqual(['user-1']);
  });
});

describe('DELETE /api/settings/identities', () => {
  it('removes a sign-in method once a second factor has been re-verified', async () => {
    answers([OKTA_ROW], [[{ provider: 'okta', subject: 'okta|abc' }]]);

    const response = await DELETE(unlinkRequest(SECOND_IDENTITY, grant(SECOND_IDENTITY)));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ removed: SECOND_IDENTITY });
  });

  it('refuses a session that has not re-authenticated, and removes nothing', async () => {
    const response = await DELETE(unlinkRequest(SECOND_IDENTITY));

    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'STEP_UP_REQUIRED',
    );
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('refuses a proof minted for a different sign-in method', async () => {
    const response = await DELETE(unlinkRequest(SECOND_IDENTITY, grant(CLERK_IDENTITY)));

    expect(response.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('refuses to remove the final way in and says what to do instead', async () => {
    answers([OKTA_ROW], [[], [{ present: 1 }]]);

    const response = await DELETE(unlinkRequest(SECOND_IDENTITY, grant(SECOND_IDENTITY)));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toContain('only way left to sign in');
    expect(body.error.message).toContain('Add another sign-in method');
  });

  it('refuses the method the account is registered under, before it deletes anything', async () => {
    answers([CLERK_ROW]);

    const response = await DELETE(unlinkRequest(CLERK_IDENTITY, grant(CLERK_IDENTITY)));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toContain('registered under');
    expect(body.error.message).toContain('undone the next time you sign in');
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(String(mocks.query.mock.calls[0]?.[0])).not.toMatch(/delete/i);
  });

  it('records that refusal with its own reason, not the last-method one', async () => {
    answers([CLERK_ROW]);

    await DELETE(unlinkRequest(CLERK_IDENTITY, grant(CLERK_IDENTITY)));

    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'identity_unlinked',
        outcome: 'denied',
        detail: expect.objectContaining({ reason: 'primary_sign_in_method' }),
      }),
    );
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  // The fake cannot hold a row lock, so this pins the statement that does: the
  // concurrency property is by construction of the SQL, not measured here.
  it('locks every identity on the account before it counts what is left', async () => {
    answers([OKTA_ROW], [[], [{ present: 1 }]]);

    await DELETE(unlinkRequest(SECOND_IDENTITY, grant(SECOND_IDENTITY)));

    const [sql, params] = mocks.query.mock.calls[1] ?? [];
    expect(String(sql)).toMatch(/delete\s+from\s+public\.identities/i);
    expect(String(sql)).toMatch(/with locked as materialized/i);
    expect(String(sql)).toMatch(/where user_id = \$1\s+order by id\s+for update/i);
    expect(String(sql)).toContain('(select count(*) from locked) > 1');
    expect(params).toEqual(['user-1', SECOND_IDENTITY]);
  });

  it('records the refusal to remove the final way in, not only the successes', async () => {
    answers([OKTA_ROW], [[], [{ present: 1 }]]);

    await DELETE(unlinkRequest(SECOND_IDENTITY, grant(SECOND_IDENTITY)));

    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'identity_unlinked',
        outcome: 'denied',
        detail: expect.objectContaining({ reason: 'last_sign_in_method' }),
      }),
    );
  });

  it('answers not found for an identity that belongs to somebody else', async () => {
    answers([]);

    const response = await DELETE(unlinkRequest(SECOND_IDENTITY, grant(SECOND_IDENTITY)));

    expect(response.status).toBe(404);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'identity_unlinked', outcome: undefined }),
    );
  });

  it('raises the catalogued security event so the account holder is told, not only the log', async () => {
    answers([OKTA_ROW], [[{ provider: 'okta', subject: 'okta|abc' }]]);

    await DELETE(unlinkRequest(SECOND_IDENTITY, grant(SECOND_IDENTITY)));

    expect(mocks.identityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        event: 'identity_unlinked',
        subjectRef: SECOND_IDENTITY,
        detail: expect.objectContaining({ resourceId: SECOND_IDENTITY, provider: 'okta' }),
      }),
    );
  });

  it('tells nobody anything when the removal was refused', async () => {
    answers([OKTA_ROW], [[], [{ present: 1 }]]);

    await DELETE(unlinkRequest(SECOND_IDENTITY, grant(SECOND_IDENTITY)));

    expect(mocks.identityEvent).not.toHaveBeenCalled();
  });

  it('drops the cached resolution for a mapped subject it removed', async () => {
    answers([OKTA_ROW], [[{ provider: 'okta', subject: 'okta|abc' }]]);

    await DELETE(unlinkRequest(SECOND_IDENTITY, grant(SECOND_IDENTITY)));

    expect(mocks.invalidate).toHaveBeenCalledWith('okta|abc', 'okta');
  });

  it('never puts the removed subject in the audit detail', async () => {
    answers([OKTA_ROW], [[{ provider: 'okta', subject: 'okta|abc' }]]);

    await DELETE(unlinkRequest(SECOND_IDENTITY, grant(SECOND_IDENTITY)));

    const recorded = JSON.stringify([
      ...mocks.recordAuditEvent.mock.calls.map((call) => call[0]),
      ...mocks.identityEvent.mock.calls.map((call) => call[0]),
    ]);
    expect(recorded).not.toContain('okta|abc');
  });
});
