import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
type ScanModule0 = typeof import('../webauthn');
type ScanModule1 = typeof import('@agiworkforce/data-layer');

const ACCOUNT = 'user_advanced_security';
const SESSION = 'sess_signed_in_with_password';
const DESKTOP_SESSION = 'sess_redeemed_in_the_desktop_window';
const CHALLENGE = 'c'.repeat(43);
const OWNER_EMAIL = 'owner@example.com';

const state = vi.hoisted(() => {
  process.env['CSRF_SECRET'] = 'gate-proof-signing-secret-that-is-long-enough';
  return {
    sessionId: 'sess_signed_in_with_password',
    enrolledAt: null as Date | null,
    verifiedSessions: new Set<string>(),
    noteSessionSighting: vi.fn(),
    createDesktopSignInGrant: vi.fn(
      async (_userId: string, _challenge: string) => 'desktop-grant-code',
    ),
    attackerPasskeys: false,
    addressJustLearned: false,
    statements: [] as string[],
  };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/key-value', () => ({
  getKeyValueProvider: vi.fn(),
  getKeyValueStore: () => null,
  getKeyValueRateLimiter: () => null,
}));
vi.mock('@/lib/security-audit', () => ({
  SECURITY_EVENT_ACTIVITY_REDIS_KEY: vi.fn(),
  auditEnvelopeFields: vi.fn(),
  auditRetentionClassFor: vi.fn(),
  consumePendingSecurityAnomalyCheck: vi.fn(),
  logAuthorizationFailure: vi.fn(),
  logCsrfFailure: vi.fn(),
  logInvalidSignature: vi.fn(),
  logSecurityEvent: vi.fn(),
  logSuspiciousActivity: vi.fn(),
  sanitizeAuditDetail: vi.fn(),
  BLOCK_APPEAL_PATH: '/support',
  getClientIp: vi.fn(() => undefined),
  logRateLimitExceeded: vi.fn(async () => undefined),
  logAuthFailure: vi.fn(async () => undefined),
  recordAuditEvent: vi.fn(async () => undefined),
}));
vi.mock('@/lib/rate-limit', () => ({
  REDIS_OUTAGE_POLICY_ENV: vi.fn(),
  acquireManagedTurnSlot: vi.fn(),
  checkRateLimit: vi.fn(),
  clientIpRateLimitIdentifier: vi.fn(),
  getClientIpForRateLimit: vi.fn(),
  isSharedStoreQuotaExhausted: vi.fn(),
  rateLimitConfigs: vi.fn(),
  readManagedTurnSlots: vi.fn(),
  resolveRedisOutagePolicy: vi.fn(),
  resolveTierRateLimit: vi.fn(),
  withRateLimitHandler: vi.fn(),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/csrf', () => ({
  generateCsrfToken: vi.fn(),
  getOrCreateAnonSession: vi.fn(),
  getSessionIdFromRequest: vi.fn(),
  isBearerTokenValid: vi.fn(),
  readCookie: vi.fn(),
  resetCsrfCache: vi.fn(),
  validateCsrfFromRequest: vi.fn(),
  verifyCsrfToken: vi.fn(),
  requireCsrfToken: vi.fn(async () => null),
}));
vi.mock('@/lib/server/session-sightings', () => ({
  noteSessionSighting: (...args: unknown[]) => state.noteSessionSighting(...args),
}));
vi.mock('@/lib/server/account-security/webauthn', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  verifyAssertion: async ({ credentials }: { credentials: { id: string }[] }) =>
    state.attackerPasskeys && credentials[0] ? { credential: credentials[0], signCount: 1 } : null,
}));
vi.mock('@/lib/server/desktop-sign-in', () => ({
  DESKTOP_SIGN_IN_GRANT_TTL_SECONDS: vi.fn(),
  isDesktopSignInCode: vi.fn(),
  isDesktopSignInVerifier: vi.fn(),
  mintDesktopSignInTicket: vi.fn(),
  redeemDesktopSignInGrant: vi.fn(),
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
    getIdentityAuthorizedParties: vi.fn(),
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
    getIdentityUser: async () => ({
      id: 'user_advanced_security',
      primaryEmail: 'owner@example.com',
      primaryEmailVerification: 'verified',
      emailAddresses: [{ id: 'email_owner', emailAddress: 'owner@example.com', verified: true }],
    }),
  };
});

function passkeyRow(id: string, deviceType: 'singleDevice' | 'multiDevice') {
  return {
    id,
    credential_id: `${id}-credential-id-0000`,
    public_key: `${id}-public-key-000000000`,
    sign_count: 0,
    transports: ['internal'],
    device_type: deviceType,
    backed_up: deviceType === 'multiDevice',
    name: id,
    created_at: new Date(),
    last_used_at: null,
  };
}

function answer(sql: string, params: unknown[]): Record<string, unknown>[] {
  const statement = sql.toLowerCase();
  state.statements.push(statement);
  if (statement.includes('from public.profiles') && statement.includes('changed_recently')) {
    return [{ email: OWNER_EMAIL, changed_recently: state.addressJustLearned }];
  }
  if (statement.includes('select email from public.profiles')) {
    return [{ email: OWNER_EMAIL }];
  }
  if (statement.includes("event_key = 'email_changed'")) {
    return [{ changed: false }];
  }
  if (statement.includes('from public.account_security_credentials')) {
    return state.attackerPasskeys
      ? [passkeyRow('attacker-phone', 'multiDevice'), passkeyRow('attacker-key', 'singleDevice')]
      : [];
  }
  if (
    statement.includes('delete from public.account_security_challenges') &&
    statement.includes('returning challenge')
  ) {
    return state.attackerPasskeys ? [{ challenge: CHALLENGE, live: true }] : [];
  }
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

interface AnsweringDb {
  query: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
  execute: (sql: string) => Promise<number>;
  transaction: (run: (tx: AnsweringDb) => Promise<unknown>) => Promise<unknown>;
  withUser: () => AnsweringDb;
  withOrg: () => AnsweringDb;
}

function answeringDb(): AnsweringDb {
  const db: AnsweringDb = {
    query: async (sql, params = []) => answer(sql, params),
    execute: async (sql) => {
      state.statements.push(sql.toLowerCase());
      return sql.toLowerCase().includes('update public.account_security_credentials') ? 1 : 0;
    },
    transaction: async (run) => run(db),
    withUser: () => db,
    withOrg: () => db,
  };
  return db;
}

vi.mock('@/lib/server/neon-db', () => ({
  getStripeWebhookDb: vi.fn(),
  getNeonDb: () => answeringDb(),
}));
vi.mock('@agiworkforce/data-layer', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  createDatabaseClient: () => answeringDb(),
}));

import { POST as grantDesktopSignIn } from '@/app/api/auth/desktop/grant/route';
import { POST as enrollAccountSecurity } from '@/app/api/account-security/enrollment/route';
import { getClerkAuthUser } from '@/lib/api-auth';
import { STEP_UP_TOKEN_HEADER } from '@/lib/server/step-up-auth';
import { createStepUpGrant } from '@/lib/server/step-up/grant-token';
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

function passwordOnlyEnrollment(body: Record<string, unknown>): NextRequest {
  const grant = createStepUpGrant({
    userId: ACCOUNT,
    action: 'account_security.enroll',
    method: 'first_factor',
  });
  return new NextRequest('https://agiworkforce.com/api/account-security/enrollment', {
    method: 'POST',
    headers: { 'content-type': 'application/json', [STEP_UP_TOKEN_HEADER]: grant.token },
    body: JSON.stringify(body),
  });
}

function enrollmentWasPromoted(): boolean {
  return state.statements.some((statement) =>
    statement.includes('set recovery_key_hashes = pending_recovery_key_hashes'),
  );
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
    state.attackerPasskeys = false;
    state.addressJustLearned = false;
    state.statements = [];
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

  it('refuses to turn the mode on with only a password step-up grant', async () => {
    const response = await enrollAccountSecurity(
      passwordOnlyEnrollment({ recoveryKeysSaved: true }),
    );

    expect(response.status).toBe(400);
    expect(enrollmentWasPromoted()).toBe(false);
  });

  it('refuses a password step-up grant and passkeys the attacker added without the code emailed to the owner', async () => {
    state.attackerPasskeys = true;

    const response = await enrollAccountSecurity(
      passwordOnlyEnrollment({
        recoveryKeysSaved: true,
        emailCode: '000000',
        response: { id: 'attacker-phone-credential-id-0000', type: 'public-key' },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: expect.stringContaining('code') },
    });
    expect(
      state.statements.some((statement) => statement.includes('set attempts = attempts + 1')),
    ).toBe(true);
    expect(enrollmentWasPromoted()).toBe(false);
  });

  it('refuses to turn the mode on with an address the account only just learned from the identity provider', async () => {
    state.attackerPasskeys = true;
    state.addressJustLearned = true;

    const response = await enrollAccountSecurity(
      passwordOnlyEnrollment({
        recoveryKeysSaved: true,
        emailCode: '000000',
        response: { id: 'attacker-phone-credential-id-0000', type: 'public-key' },
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: expect.stringContaining('set or changed in the last 7 days') },
    });
    expect(state.statements.some((statement) => statement.includes('returning challenge'))).toBe(
      false,
    );
    expect(enrollmentWasPromoted()).toBe(false);
  });
});
