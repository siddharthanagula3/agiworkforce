import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { AuthResult } from '@/lib/api-auth';

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  getNeonDb: vi.fn(),
  resolveOrganization: vi.fn(),
  claimScope: vi.fn(),
  setTenantScope: vi.fn(),
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
vi.mock('@/lib/services/active-workspace-service', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  resolveActiveOrganizationId: mocks.resolveOrganization,
}));
vi.mock('@/lib/server/claimed-user-scope-db', () => ({
  createClaimedUserScopedDb: mocks.claimScope,
}));
vi.mock('@/lib/observability/trace-context', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  setTenantScope: mocks.setTenantScope,
}));

import { createError } from '@/lib/errors';
import { getSessionAccount, getSessionAccountDb } from '../session-account';

const ACCOUNT = 'product-account-7';
const SUBJECT = 'native-subject-9';
const SESSION = 'sess_native_9';
const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
const SERVICE_DB = { query: vi.fn(), withUser: vi.fn() };
const CLAIMED_DB = { query: vi.fn() };
const AUTH: AuthResult = {
  userId: ACCOUNT,
  identityId: 'identity-9',
  sessionIdentity: { subject: SUBJECT, sessionId: SESSION },
};

function request(bearer = true) {
  return new NextRequest('http://localhost/api/settings/email?accountId=forged-account', {
    headers: {
      ...(bearer
        ? { authorization: 'Bearer verified-native-token' }
        : { cookie: '__session=cookie' }),
      'x-user-id': 'forged-subject',
      'x-session-id': 'forged-session',
    },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authenticate.mockResolvedValue(AUTH);
  mocks.getNeonDb.mockReturnValue(SERVICE_DB);
  mocks.resolveOrganization.mockResolvedValue(ORGANIZATION);
  mocks.claimScope.mockReturnValue(CLAIMED_DB);
});

describe('canonical native session account admission', () => {
  it.each([true, false])('preserves the canonical tuple with bearer=%s', async (bearer) => {
    const incoming = request(bearer);
    const options = { mfaEnrollment: true, accountSecurityVerification: true };

    await expect(getSessionAccount(incoming, options)).resolves.toEqual(AUTH);

    expect(mocks.authenticate).toHaveBeenCalledExactlyOnceWith(incoming, options);
    expect(mocks.getNeonDb).not.toHaveBeenCalled();
    expect(mocks.resolveOrganization).not.toHaveBeenCalled();
    expect(mocks.claimScope).not.toHaveBeenCalled();
  });

  it.each([
    ['absent native identity', { userId: ACCOUNT }],
    [
      'absent native session',
      { userId: ACCOUNT, sessionIdentity: { subject: SUBJECT, sessionId: null } },
    ],
    [
      'empty native session',
      { userId: ACCOUNT, sessionIdentity: { subject: SUBJECT, sessionId: '' } },
    ],
    [
      'empty native subject',
      { userId: ACCOUNT, sessionIdentity: { subject: '', sessionId: SESSION } },
    ],
    ['API key', { userId: ACCOUNT, apiKeyId: 'key-1' }],
  ] satisfies Array<[string, AuthResult]>)(
    'rejects %s before creating a database scope',
    async (_label, auth) => {
      mocks.authenticate.mockResolvedValue(auth);

      await expect(getSessionAccountDb(request())).rejects.toMatchObject({ statusCode: 401 });

      expect(mocks.authenticate).toHaveBeenCalledTimes(1);
      expect(mocks.getNeonDb).not.toHaveBeenCalled();
      expect(mocks.resolveOrganization).not.toHaveBeenCalled();
      expect(mocks.claimScope).not.toHaveBeenCalled();
    },
  );

  it('refuses an authenticated developer credential with 403 before database access', async () => {
    mocks.authenticate.mockResolvedValue({ userId: ACCOUNT, surfaceClass: 'developer' });

    await expect(getSessionAccountDb(request())).rejects.toMatchObject({
      statusCode: 403,
      userSafe: true,
      message: 'Use your web account settings to manage sign-in security.',
    });

    expect(mocks.authenticate).toHaveBeenCalledTimes(1);
    expect(mocks.getNeonDb).not.toHaveBeenCalled();
    expect(mocks.resolveOrganization).not.toHaveBeenCalled();
    expect(mocks.claimScope).not.toHaveBeenCalled();
  });

  it('preserves an authentication rejection instead of converting it to unsupported-credential 403', async () => {
    const refusal = createError.unauthorized();
    mocks.authenticate.mockRejectedValue(refusal);

    await expect(getSessionAccountDb(request())).rejects.toBe(refusal);

    expect(mocks.authenticate).toHaveBeenCalledTimes(1);
    expect(mocks.getNeonDb).not.toHaveBeenCalled();
    expect(mocks.claimScope).not.toHaveBeenCalled();
  });

  it('preserves the canonical policy refusal rather than returning an identity-only session', async () => {
    const refusal = createError.forbidden('Account policy denied this request');
    mocks.authenticate.mockRejectedValue(refusal);

    await expect(getSessionAccountDb(request())).rejects.toBe(refusal);

    expect(mocks.getNeonDb).not.toHaveBeenCalled();
    expect(mocks.claimScope).not.toHaveBeenCalled();
  });
});

describe('mapped account database scope', () => {
  it.each([true, false])(
    'claims product account and organization with bearer=%s',
    async (bearer) => {
      const incoming = request(bearer);

      await expect(getSessionAccountDb(incoming)).resolves.toEqual({
        db: CLAIMED_DB,
        userId: ACCOUNT,
        organizationId: ORGANIZATION,
        sessionIdentity: { subject: SUBJECT, sessionId: SESSION },
      });

      expect(mocks.authenticate).toHaveBeenCalledExactlyOnceWith(incoming, {});
      expect(mocks.getNeonDb).toHaveBeenCalledTimes(1);
      expect(mocks.resolveOrganization).toHaveBeenCalledExactlyOnceWith(
        SERVICE_DB,
        ACCOUNT,
        incoming,
      );
      expect(mocks.claimScope).toHaveBeenCalledExactlyOnceWith(SERVICE_DB, {
        userId: ACCOUNT,
        organizationId: ORGANIZATION,
      });
      expect(mocks.setTenantScope).toHaveBeenCalledWith({
        userId: ACCOUNT,
        organizationId: ORGANIZATION,
      });
      expect(SERVICE_DB.withUser).not.toHaveBeenCalled();
    },
  );

  it('omits extra organization resolution for enrollment after canonical authentication', async () => {
    const incoming = request();
    const options = { mfaEnrollment: true, resolveOrganization: false };

    await expect(getSessionAccountDb(incoming, options)).resolves.toEqual({
      db: CLAIMED_DB,
      userId: ACCOUNT,
      organizationId: null,
      sessionIdentity: { subject: SUBJECT, sessionId: SESSION },
    });

    expect(mocks.authenticate).toHaveBeenCalledExactlyOnceWith(incoming, options);
    expect(mocks.resolveOrganization).not.toHaveBeenCalled();
    expect(mocks.claimScope).toHaveBeenCalledExactlyOnceWith(SERVICE_DB, {
      userId: ACCOUNT,
      organizationId: null,
    });
    expect(mocks.setTenantScope).toHaveBeenCalledWith({
      userId: ACCOUNT,
      organizationId: undefined,
    });
  });

  it('does not silently choose another organization if resolution fails', async () => {
    const failure = new Error('Workspace lookup unavailable');
    mocks.resolveOrganization.mockRejectedValue(failure);

    await expect(getSessionAccountDb(request())).rejects.toBe(failure);

    expect(mocks.claimScope).not.toHaveBeenCalled();
  });
});

type ImportedModule0 = typeof import('@/lib/services/active-workspace-service');
type ImportedModule1 = typeof import('@/lib/observability/trace-context');
