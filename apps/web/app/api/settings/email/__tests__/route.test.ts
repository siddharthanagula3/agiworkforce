import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import {
  IdentityRequestRejectedError,
  type IdentityEmailAddress,
  type IdentityUser,
} from '@agiworkforce/identity';

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  getNeonDb: vi.fn(),
  claimScope: vi.fn(),
  resolveOrganization: vi.fn(),
  query: vi.fn(),
  getUser: vi.fn(),
  addEmailAddress: vi.fn(),
  setPrimaryEmailAddress: vi.fn(),
  removeEmailAddress: vi.fn(),
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  recordAuditEvent: vi.fn(),
  announceChange: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: mocks.authenticate,
  getClerkAuthorizedParties: vi.fn(),
  isAccountUnavailableError: vi.fn(),
  assertAccountActive: vi.fn(),
  getCookieSessionAuthUser: vi.fn(),
  getOptionalAuthUser: vi.fn(),
  getSuspendedAccountUser: vi.fn(),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: mocks.getNeonDb,
  getStripeWebhookDb: vi.fn(),
}));
vi.mock('@/lib/server/claimed-user-scope-db', () => ({
  createClaimedUserScopedDb: mocks.claimScope,
}));
vi.mock('@/lib/services/active-workspace-service', async (importOriginal) => ({
  ...(await importOriginal<MockedModule0>()),
  resolveActiveOrganizationId: mocks.resolveOrganization,
}));
vi.mock('@/lib/server/identity', () => ({
  getIdentityAuthorizedParties: vi.fn(),
  getIdentityUser: vi.fn(),
  getRequestIdentity: vi.fn(),
  verifyIdentitySessionToken: vi.fn(),
  getIdentityProvider: () => ({
    getUser: mocks.getUser,
    addEmailAddress: mocks.addEmailAddress,
    setPrimaryEmailAddress: mocks.setPrimaryEmailAddress,
    removeEmailAddress: mocks.removeEmailAddress,
  }),
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<MockedModule1>()),
  requireCsrfToken: mocks.requireCsrfToken,
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<MockedModule2>()),
  withRateLimit: mocks.withRateLimit,
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<MockedModule3>()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', () => ({
  SECURITY_EVENT_ACTIVITY_REDIS_KEY: 'agi-security-audit:pending-anomaly-check',
  BLOCK_APPEAL_PATH: '/support',
  consumePendingSecurityAnomalyCheck: vi.fn(),
  logSecurityEvent: vi.fn(),
  getClientIp: vi.fn(),
  logAuthFailure: vi.fn(),
  logRateLimitExceeded: vi.fn(),
  logCsrfFailure: vi.fn(),
  logInvalidSignature: vi.fn(),
  auditRetentionClassFor: vi.fn(),
  auditEnvelopeFields: vi.fn(),
  sanitizeAuditDetail: vi.fn(),
  recordAuditEvent: mocks.recordAuditEvent,
}));
vi.mock('@/lib/server/two-factor-security-events', () => ({
  announceTwoFactorChange: mocks.announceChange,
}));

process.env['CSRF_SECRET'] = 'email-route-step-up-secret-long-enough-for-fixtures';

import { createError } from '@/lib/errors';
import { STEP_UP_TOKEN_HEADER } from '@/lib/server/step-up-auth';
import { createStepUpGrant, resetStepUpSigningKeyCache } from '@/lib/server/step-up/grant-token';
import { GET, POST, PATCH } from '../route';

const ACCOUNT = 'product-account-7';
const SUBJECT = 'native-subject-9';
const SESSION = 'sess_native_9';
const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
const OLD: IdentityEmailAddress = {
  id: 'email-old',
  emailAddress: 'old@example.com',
  verified: true,
};
const NEXT: IdentityEmailAddress = {
  id: 'email-next',
  emailAddress: 'next@example.com',
  verified: true,
};
const DB = { query: mocks.query };
const SERVICE_DB = { query: vi.fn(), withUser: vi.fn() };

type Method = 'GET' | 'POST' | 'PATCH';

function providerUser(
  extraAddresses: IdentityEmailAddress[] = [],
): Pick<IdentityUser, 'id' | 'primaryEmail' | 'primaryEmailAddressId' | 'emailAddresses'> {
  return {
    id: SUBJECT,
    primaryEmail: OLD.emailAddress,
    primaryEmailAddressId: OLD.id,
    emailAddresses: [OLD, ...extraAddresses],
  };
}

function grant(resourceId: string | null = null, userId = ACCOUNT) {
  return createStepUpGrant({ userId, action: 'email.change', resourceId, method: 'second_factor' })
    .token;
}

function request(
  method: Method,
  body?: unknown,
  options: { credential?: 'bearer' | 'cookie' | 'none'; proof?: string | null } = {},
) {
  const credential = options.credential ?? 'bearer';
  const proof =
    options.proof === undefined ? grant(method === 'PATCH' ? NEXT.id : null) : options.proof;
  const url = new URL('http://localhost/api/settings/email');
  url.search = new URLSearchParams({
    accountId: 'forged-account',
    subject: 'forged-subject',
    sessionId: 'forged-session',
  }).toString();
  return new NextRequest(url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(credential === 'bearer' ? { authorization: 'Bearer verified-native-token' } : {}),
      ...(credential === 'cookie' ? { cookie: '__session=verified-native-cookie' } : {}),
      ...(method !== 'GET' && proof ? { [STEP_UP_TOKEN_HEADER]: proof } : {}),
      'x-account-id': 'forged-account',
      'x-user-id': 'forged-subject',
      'x-session-id': 'forged-session',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function assertNoMutations() {
  expect(mocks.addEmailAddress).not.toHaveBeenCalled();
  expect(mocks.setPrimaryEmailAddress).not.toHaveBeenCalled();
  expect(mocks.removeEmailAddress).not.toHaveBeenCalled();
  expect(mocks.query).not.toHaveBeenCalled();
  expect(mocks.announceChange).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  resetStepUpSigningKeyCache();
  mocks.authenticate.mockResolvedValue({
    userId: ACCOUNT,
    identityId: 'identity-mapping-9',
    email: OLD.emailAddress,
    sessionIdentity: { subject: SUBJECT, sessionId: SESSION },
  });
  mocks.getNeonDb.mockReturnValue(SERVICE_DB);
  mocks.claimScope.mockReturnValue(DB);
  mocks.resolveOrganization.mockResolvedValue(ORGANIZATION);
  mocks.getUser.mockResolvedValue(providerUser());
  mocks.addEmailAddress.mockResolvedValue({ ...NEXT, verified: false });
  mocks.setPrimaryEmailAddress.mockResolvedValue(undefined);
  mocks.removeEmailAddress.mockResolvedValue(undefined);
  mocks.query.mockResolvedValue([{ id: ACCOUNT }]);
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.recordAuditEvent.mockResolvedValue(undefined);
  mocks.announceChange.mockResolvedValue(undefined);
});

describe('GET /api/settings/email admission', () => {
  it('does no extra provider or workspace reads after canonical auth', async () => {
    const incoming = request('GET');

    const response = await GET(incoming);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual({
      accountId: ACCOUNT,
      subject: SUBJECT,
      sessionId: SESSION,
    });
    expect(mocks.authenticate).toHaveBeenCalledExactlyOnceWith(incoming, {});
    expect(mocks.withRateLimit).toHaveBeenCalledExactlyOnceWith(
      incoming,
      'auth-verify',
      `user:${ACCOUNT}`,
    );
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.getNeonDb).not.toHaveBeenCalled();
    expect(mocks.claimScope).not.toHaveBeenCalled();
    expect(mocks.resolveOrganization).not.toHaveBeenCalled();
    expect(mocks.requireCsrfToken).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
    assertNoMutations();
  });

  it.each(['cookie', 'none'] as const)(
    'rejects %s admission without a bearer',
    async (credential) => {
      expect((await GET(request('GET', undefined, { credential }))).status).toBe(401);

      expect(mocks.authenticate).not.toHaveBeenCalled();
      expect(mocks.getUser).not.toHaveBeenCalled();
      assertNoMutations();
    },
  );

  it('returns the product-account rate limit instead of an admission tuple', async () => {
    mocks.withRateLimit.mockResolvedValue(NextResponse.json({}, { status: 429 }));

    const response = await GET(request('GET'));

    expect(response.status).toBe(429);
    expect((await response.json()).accountId).toBeUndefined();
    expect(mocks.getUser).not.toHaveBeenCalled();
    assertNoMutations();
  });
});

describe('POST /api/settings/email', () => {
  it.each(['bearer', 'cookie'] as const)(
    'adds using native subject and product grant, %s auth',
    async (credential) => {
      const incoming = request('POST', { emailAddress: NEXT.emailAddress }, { credential });

      const response = await POST(incoming);

      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toEqual({ emailAddressId: NEXT.id, verified: false });
      expect(mocks.authenticate).toHaveBeenCalledExactlyOnceWith(incoming, {});
      expect(mocks.getUser).toHaveBeenCalledExactlyOnceWith(SUBJECT);
      expect(mocks.addEmailAddress).toHaveBeenCalledExactlyOnceWith(SUBJECT, NEXT.emailAddress);
      expect(mocks.resolveOrganization).toHaveBeenCalledExactlyOnceWith(
        SERVICE_DB,
        ACCOUNT,
        incoming,
      );
      expect(mocks.claimScope).toHaveBeenCalledExactlyOnceWith(SERVICE_DB, {
        userId: ACCOUNT,
        organizationId: ORGANIZATION,
      });
      expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: ACCOUNT,
          eventType: 'step_up_satisfied',
          organizationId: ORGANIZATION,
          endpoint: '/api/settings/email',
          detail: { resourceType: 'step_up', resourceId: 'email.change', source: 'second_factor' },
        }),
      );
      expect(mocks.query).not.toHaveBeenCalled();
      expect(mocks.setPrimaryEmailAddress).not.toHaveBeenCalled();
    },
  );

  it('removes only the matching user stale non-primary addresses before adding', async () => {
    mocks.getUser.mockResolvedValue(
      providerUser([
        { ...NEXT, id: 'verified-secondary' },
        { id: 'stale-unverified', emailAddress: 'stale@example.com', verified: false },
      ]),
    );

    const response = await POST(request('POST', { emailAddress: 'replacement@example.com' }));

    expect(response.status).toBe(201);
    expect(mocks.removeEmailAddress).toHaveBeenCalledExactlyOnceWith('stale-unverified');
    expect(mocks.addEmailAddress).toHaveBeenCalledWith(SUBJECT, 'replacement@example.com');
  });

  it('reuses only an exactly matching verified address owned by the native user', async () => {
    mocks.getUser.mockResolvedValue(providerUser([NEXT]));

    const response = await POST(request('POST', { emailAddress: NEXT.emailAddress.toUpperCase() }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ emailAddressId: NEXT.id, verified: true });
    assertNoMutations();
  });

  it('rejects injected product or provider identities in the mutation body', async () => {
    const response = await POST(
      request('POST', {
        emailAddress: NEXT.emailAddress,
        accountId: 'forged-account',
        subject: 'forged-subject',
        sessionId: 'forged-session',
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.getUser).not.toHaveBeenCalled();
    assertNoMutations();
  });
});

describe('PATCH /api/settings/email', () => {
  beforeEach(() => {
    mocks.getUser.mockResolvedValue(providerUser([NEXT]));
  });

  it.each(['bearer', 'cookie'] as const)(
    'updates native identity and product profile, %s auth',
    async (credential) => {
      const incoming = request('PATCH', { emailAddressId: NEXT.id }, { credential });

      const response = await PATCH(incoming);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        emailAddress: NEXT.emailAddress,
        previousAddressRemoved: true,
      });
      expect(mocks.authenticate).toHaveBeenCalledExactlyOnceWith(incoming, {});
      expect(mocks.getUser).toHaveBeenCalledExactlyOnceWith(SUBJECT);
      expect(mocks.setPrimaryEmailAddress).toHaveBeenCalledExactlyOnceWith(SUBJECT, NEXT.id);
      expect(mocks.query).toHaveBeenCalledExactlyOnceWith(
        'update public.profiles set email = $2, updated_at = now() where id = $1 returning id',
        [ACCOUNT, NEXT.emailAddress],
      );
      expect(mocks.claimScope).toHaveBeenCalledExactlyOnceWith(SERVICE_DB, {
        userId: ACCOUNT,
        organizationId: ORGANIZATION,
      });
      expect(mocks.removeEmailAddress).toHaveBeenCalledExactlyOnceWith(OLD.id);
      expect(mocks.announceChange).toHaveBeenCalledExactlyOnceWith({
        userId: ACCOUNT,
        identitySubject: SUBJECT,
        event: 'email_changed',
        noticeRef: NEXT.id,
        request: incoming,
        organizationId: ORGANIZATION,
        detail: { source: 'second_factor', status: 'replaced' },
      });
      expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: ACCOUNT,
          eventType: 'step_up_satisfied',
          detail: {
            resourceType: 'step_up',
            resourceId: 'email.change',
            source: 'second_factor',
            scope: NEXT.id,
          },
        }),
      );
    },
  );

  it('refuses an already-primary verified address without proof, profile, provider, or event mutations', async () => {
    mocks.getUser.mockResolvedValue({
      ...providerUser([NEXT]),
      primaryEmail: NEXT.emailAddress,
      primaryEmailAddressId: NEXT.id,
    });

    const response = await PATCH(request('PATCH', { emailAddressId: NEXT.id }, { proof: null }));

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.message).toBe(
      'That address is already primary, but profile synchronization and previous-address cleanup cannot be confirmed. Check your account email and sign-in methods before starting another change.',
    );
    expect(body.previousAddressRemoved).toBeUndefined();
    expect(body.emailAddress).toBeUndefined();
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
    assertNoMutations();
  });

  it.each([
    { label: 'zero rows', rows: [] },
    { label: 'missing result', rows: undefined },
    { label: 'non-array result', rows: { id: ACCOUNT } },
    { label: 'null row', rows: [null] },
    { label: 'missing returned identity', rows: [{}] },
    { label: 'foreign product account', rows: [{ id: 'foreign-account' }] },
    { label: 'native subject instead of product account', rows: [{ id: SUBJECT }] },
    { label: 'multiple rows', rows: [{ id: ACCOUNT }, { id: 'foreign-account' }] },
  ])(
    'refuses completion after promotion when the profile update returns $label',
    async ({ rows }) => {
      mocks.query.mockResolvedValue(rows);

      const response = await PATCH(request('PATCH', { emailAddressId: NEXT.id }));

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.error.message).toBe(
        'The address was made primary, but profile synchronization could not be confirmed and previous-address cleanup was not attempted. Check your account email and sign-in methods before starting another change.',
      );
      expect(body.previousAddressRemoved).toBeUndefined();
      expect(body.emailAddress).toBeUndefined();
      expect(mocks.setPrimaryEmailAddress).toHaveBeenCalledExactlyOnceWith(SUBJECT, NEXT.id);
      expect(mocks.query).toHaveBeenCalledExactlyOnceWith(
        'update public.profiles set email = $2, updated_at = now() where id = $1 returning id',
        [ACCOUNT, NEXT.emailAddress],
      );
      expect(mocks.removeEmailAddress).not.toHaveBeenCalled();
      expect(mocks.announceChange).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    'profile exception',
    'unconfirmed profile',
    'unknown removal failure',
    'known removal rejection',
    'completed response lost',
  ] as const)(
    'does not upgrade a repeat request to confirmed completion after %s',
    async (outcome) => {
      const promoted = {
        ...providerUser([NEXT]),
        primaryEmail: NEXT.emailAddress,
        primaryEmailAddressId: NEXT.id,
      };
      mocks.setPrimaryEmailAddress.mockImplementation(async () => {
        mocks.getUser.mockResolvedValue(promoted);
      });
      if (outcome === 'profile exception')
        mocks.query.mockRejectedValue(new Error('Database unavailable'));
      if (outcome === 'unconfirmed profile') mocks.query.mockResolvedValue([]);
      if (outcome === 'unknown removal failure')
        mocks.removeEmailAddress.mockRejectedValue(new Error('Provider unavailable'));
      if (outcome === 'known removal rejection') {
        mocks.removeEmailAddress.mockRejectedValue(
          new IdentityRequestRejectedError('Address retained', 'removal_rejected'),
        );
      }

      const first = await PATCH(request('PATCH', { emailAddressId: NEXT.id }));

      expect(first.status).toBe(
        outcome === 'unconfirmed profile'
          ? 409
          : outcome === 'known removal rejection' || outcome === 'completed response lost'
            ? 200
            : 500,
      );
      const firstBody = await first.json();
      expect(firstBody.previousAddressRemoved).toBe(
        outcome === 'known removal rejection'
          ? false
          : outcome === 'completed response lost'
            ? true
            : undefined,
      );
      expect(mocks.setPrimaryEmailAddress).toHaveBeenCalledExactlyOnceWith(SUBJECT, NEXT.id);
      expect(mocks.query).toHaveBeenCalledTimes(1);
      expect(mocks.removeEmailAddress).toHaveBeenCalledTimes(
        outcome === 'profile exception' || outcome === 'unconfirmed profile' ? 0 : 1,
      );
      vi.clearAllMocks();

      const repeated = await PATCH(request('PATCH', { emailAddressId: NEXT.id }));

      expect(repeated.status).toBe(409);
      const repeatedBody = await repeated.json();
      expect(repeatedBody.error.message).toContain(
        'profile synchronization and previous-address cleanup cannot be confirmed',
      );
      expect(repeatedBody.previousAddressRemoved).toBeUndefined();
      expect(repeatedBody.emailAddress).toBeUndefined();
      expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
      assertNoMutations();
    },
  );

  it('does not accept an address belonging to another identity even with a grant for its id', async () => {
    const response = await PATCH(
      request(
        'PATCH',
        { emailAddressId: 'foreign-address-id' },
        {
          proof: grant('foreign-address-id'),
        },
      ),
    );

    expect(response.status).toBe(404);
    assertNoMutations();
  });

  it('does not accept an unverified address owned by the native user', async () => {
    mocks.getUser.mockResolvedValue(providerUser([{ ...NEXT, verified: false }]));

    expect((await PATCH(request('PATCH', { emailAddressId: NEXT.id }))).status).toBe(400);

    assertNoMutations();
  });

  it('does not accept a product-account grant for a different address', async () => {
    const response = await PATCH(
      request('PATCH', { emailAddressId: NEXT.id }, { proof: grant(OLD.id) }),
    );

    expect(response.status).toBe(403);
    assertNoMutations();
  });
});

describe.each(['POST', 'PATCH'] as const)('%s /api/settings/email boundaries', (method) => {
  const call = (options: { proof?: string | null } = {}) => {
    const body =
      method === 'POST' ? { emailAddress: NEXT.emailAddress } : { emailAddressId: NEXT.id };
    const incoming = request(method, body, options);
    return method === 'POST' ? POST(incoming) : PATCH(incoming);
  };

  beforeEach(() => {
    if (method === 'PATCH') mocks.getUser.mockResolvedValue(providerUser([NEXT]));
  });

  it('preserves the CSRF check before canonical authentication', async () => {
    mocks.requireCsrfToken.mockResolvedValue(NextResponse.json({}, { status: 403 }));

    expect((await call()).status).toBe(403);

    expect(mocks.authenticate).not.toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
    assertNoMutations();
  });

  it('preserves the product-account rate limit before provider reads and mutations', async () => {
    mocks.withRateLimit.mockResolvedValue(NextResponse.json({}, { status: 429 }));

    expect((await call()).status).toBe(429);

    expect(mocks.withRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'auth-verify',
      `user:${ACCOUNT}`,
    );
    expect(mocks.getUser).not.toHaveBeenCalled();
    assertNoMutations();
  });

  it('requires the step-up grant before making any changes', async () => {
    expect((await call({ proof: null })).status).toBe(403);

    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ACCOUNT,
        eventType: 'step_up_challenged',
        outcome: 'denied',
      }),
    );
    assertNoMutations();
  });

  it('refuses a native-subject grant where a product-account grant is required', async () => {
    const proof = grant(method === 'PATCH' ? NEXT.id : null, SUBJECT);

    expect((await call({ proof })).status).toBe(403);

    assertNoMutations();
  });

  it.each([
    null,
    { ...providerUser([NEXT]), id: 'foreign-subject' },
    { ...providerUser([NEXT]), id: ACCOUNT },
  ])('rejects a missing or foreign returned provider user: %j', async (user) => {
    mocks.getUser.mockResolvedValue(user);

    expect((await call()).status).toBe(401);

    expect(mocks.getUser).toHaveBeenCalledExactlyOnceWith(SUBJECT);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
    assertNoMutations();
  });
});

describe.each(['GET', 'POST', 'PATCH'] as const)('%s email native-session admission', (method) => {
  const call = () => {
    if (method === 'GET') return GET(request('GET'));
    if (method === 'POST') return POST(request('POST', { emailAddress: NEXT.emailAddress }));
    return PATCH(request('PATCH', { emailAddressId: NEXT.id }));
  };

  it.each([
    { userId: ACCOUNT },
    { userId: ACCOUNT, sessionIdentity: { subject: SUBJECT, sessionId: null } },
    { userId: ACCOUNT, apiKeyId: 'key-1' },
  ])('rejects a canonical principal without a verified native session: %j', async (principal) => {
    mocks.authenticate.mockResolvedValue(principal);

    expect((await call()).status).toBe(401);

    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.claimScope).not.toHaveBeenCalled();
    assertNoMutations();
  });

  it('refuses an authenticated developer credential with 403 before provider work', async () => {
    mocks.authenticate.mockResolvedValue({ userId: ACCOUNT, surfaceClass: 'developer' });

    expect((await call()).status).toBe(403);

    expect(mocks.getNeonDb).not.toHaveBeenCalled();
    expect(mocks.claimScope).not.toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
    assertNoMutations();
  });

  it('propagates canonical account-policy denials without falling back to provider identity', async () => {
    mocks.authenticate.mockRejectedValue(createError.forbidden('Account policy refused access'));

    expect((await call()).status).toBe(403);

    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.claimScope).not.toHaveBeenCalled();
    assertNoMutations();
  });
});

type MockedModule0 = typeof import('@/lib/services/active-workspace-service');
type MockedModule1 = typeof import('@/lib/csrf');
type MockedModule2 = typeof import('@/lib/rate-limit');
type MockedModule3 = typeof import('@/lib/logger');
