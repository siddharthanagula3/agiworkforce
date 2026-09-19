import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  mockGetClerkAuthUser,
  mockGetIdentityUser,
  mockProvision,
  mockLinkPendingScimUsers,
  mockBackfill,
} = vi.hoisted(() => ({
  mockGetClerkAuthUser: vi.fn(),
  mockBackfill: vi.fn(async () => undefined),
  mockGetIdentityUser: vi.fn(),
  mockProvision: vi.fn(async () => []),
  mockLinkPendingScimUsers: vi.fn(async () => ({ linked: 0, failed: 0 })),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/web-search/web-search-tool', () => ({
  webSearchBackendConfigured: vi.fn(() => true),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: mockGetClerkAuthUser }));
vi.mock('@/lib/server/identity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/identity')>()),
  getIdentityUser: mockGetIdentityUser,
}));
vi.mock('@/lib/server/user-identity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/user-identity')>()),
  backfillProfileFromUpstream: mockBackfill,
}));
vi.mock('@/lib/server/sso/jit-provisioning', () => ({ provisionEnterpriseSignIn: mockProvision }));
vi.mock('@/lib/server/scim/scim-sign-in-linking', () => ({
  linkPendingScimUsersAtSignIn: mockLinkPendingScimUsers,
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({ query: vi.fn(async () => []) })),
}));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: vi.fn(async () => null) },
}));

import { GET } from '../route';

function identityUser(enterpriseAccounts: unknown[]) {
  return { id: 'user-1', fullName: 'Ada', primaryEmail: 'ada@acme.test', enterpriseAccounts };
}

describe('GET /api/me single sign-on provisioning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user-1', email: 'ada@acme.test' });
  });

  it.each(['verified', 'unverified', 'unknown'])(
    'persists email-only identity only when email verification is %s',
    async (verification) => {
      mockGetIdentityUser.mockResolvedValue({
        ...identityUser([]),
        fullName: null,
        primaryEmailVerification: verification,
      });
      const response = await GET(new Request('http://localhost:3000/api/me') as never);
      expect(response.status).toBe(200);
      if (verification === 'verified') {
        expect(mockBackfill).toHaveBeenCalledWith(
          expect.anything(),
          'user-1',
          'ada',
          'ada@acme.test',
        );
      } else {
        expect(mockBackfill).toHaveBeenCalledWith(expect.anything(), 'user-1', 'ada', null);
      }
    },
  );

  it('provisions workspace membership for a user who signed in through an enterprise connection', async () => {
    const accounts = [{ connectionId: 'econ_1', emailAddress: 'ada@acme.test', active: true }];
    mockGetIdentityUser.mockResolvedValue(identityUser(accounts));

    const res = await GET(new Request('http://localhost:3000/api/me') as never);

    expect(res.status).toBe(200);
    expect(mockProvision).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'user-1', enterpriseAccounts: accounts }),
    );
  });

  it('skips provisioning for a password or social sign-in', async () => {
    mockGetIdentityUser.mockResolvedValue(identityUser([]));

    await GET(new Request('http://localhost:3000/api/me') as never);

    expect(mockProvision).not.toHaveBeenCalled();
    expect(mockLinkPendingScimUsers).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'ada@acme.test',
    );
  });

  it('still answers when provisioning fails', async () => {
    mockGetIdentityUser.mockResolvedValue(
      identityUser([{ connectionId: 'econ_1', emailAddress: 'ada@acme.test', active: true }]),
    );
    mockProvision.mockRejectedValueOnce(new Error('database unavailable'));

    const res = await GET(new Request('http://localhost:3000/api/me') as never);

    expect(res.status).toBe(200);
  });

  it('still answers when a pending directory membership cannot be linked', async () => {
    mockGetIdentityUser.mockResolvedValue(identityUser([]));
    mockLinkPendingScimUsers.mockResolvedValueOnce({ linked: 0, failed: 1 });

    const res = await GET(new Request('http://localhost:3000/api/me') as never);

    expect(res.status).toBe(200);
  });
});
