import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { getOptionalAuthUserMock, getOrCreateAnonSessionMock, getIdentityUserMock } = vi.hoisted(
  () => ({
    getOptionalAuthUserMock: vi.fn(),
    getOrCreateAnonSessionMock: vi.fn(),
    getIdentityUserMock: vi.fn(),
  }),
);

vi.mock('@/lib/api-auth', () => ({
  getOptionalAuthUser: (...args: unknown[]) => getOptionalAuthUserMock(...args),
  getClerkAuthUser: vi.fn(),
  assertAccountActive: vi.fn(),
  getClerkAuthorizedParties: vi.fn(() => []),
}));

vi.mock('@/lib/csrf', () => ({
  getOrCreateAnonSession: (...args: unknown[]) => getOrCreateAnonSessionMock(...args),
}));

vi.mock('@/lib/server/identity', () => ({
  getIdentityUser: (...args: unknown[]) => getIdentityUserMock(...args),
  getIdentityProvider: vi.fn(),
  getIdentityAuthorizedParties: vi.fn(() => []),
  getRequestIdentity: vi.fn(async () => ({ subject: null })),
  verifyIdentitySessionToken: vi.fn(async () => null),
}));

import { resolveHandoffIdentity } from '../request-identity';

function request(): NextRequest {
  return new Request('https://app.example.com/api/support/handoff', {
    method: 'POST',
  }) as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  getOrCreateAnonSessionMock.mockResolvedValue({ id: 'anon-session', newCookie: 'anon=1' });
  getIdentityUserMock.mockResolvedValue({ primaryEmail: 'someone@example.com' });
});

describe('resolveHandoffIdentity', () => {
  it('owns the session by the account id the gate returned, not by a provider subject', async () => {
    getOptionalAuthUserMock.mockResolvedValue({ userId: 'account-9' });

    await expect(resolveHandoffIdentity(request())).resolves.toMatchObject({
      userId: 'account-9',
      ownerSessionKey: 'account-9',
    });
  });

  it('falls back to an anonymous owner key for a caller with no session', async () => {
    getOptionalAuthUserMock.mockResolvedValue(null);

    await expect(resolveHandoffIdentity(request())).resolves.toMatchObject({
      userId: null,
      ownerSessionKey: 'anon-session',
      newCookie: 'anon=1',
    });
  });

  it('carries a suspended account refusal out rather than serving it as anonymous', async () => {
    getOptionalAuthUserMock.mockRejectedValue(
      Object.assign(new Error('Your account has been suspended. Please contact support.'), {
        statusCode: 403,
      }),
    );

    await expect(resolveHandoffIdentity(request())).rejects.toMatchObject({ statusCode: 403 });
    expect(getOrCreateAnonSessionMock).not.toHaveBeenCalled();
  });

  it('carries a locked-down workspace refusal out on the same path', async () => {
    getOptionalAuthUserMock.mockRejectedValue(
      Object.assign(new Error('This workspace is locked down while an incident is investigated.'), {
        statusCode: 403,
      }),
    );

    await expect(resolveHandoffIdentity(request())).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringMatching(/locked down/),
    });
  });

  it('resolves the verified email only when the caller asked for one', async () => {
    getOptionalAuthUserMock.mockResolvedValue({ userId: 'account-9' });

    await expect(resolveHandoffIdentity(request())).resolves.toMatchObject({
      verifiedEmail: null,
    });
    expect(getIdentityUserMock).not.toHaveBeenCalled();

    await expect(resolveHandoffIdentity(request(), { needEmail: true })).resolves.toMatchObject({
      verifiedEmail: 'someone@example.com',
    });
    expect(getIdentityUserMock).toHaveBeenCalledWith('account-9');
  });
});
