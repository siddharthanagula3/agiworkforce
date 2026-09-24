import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetUserScopedDb,
  mockRateLimit,
  mockE2bReady,
  mockLinkingAvailable,
  mockAppConfigured,
  mockListInstallationRepositories,
  mockKeyValueStore,
  mockGetSubscription,
} = vi.hoisted(() => ({
  mockGetUserScopedDb: vi.fn(),
  mockRateLimit: vi.fn(),
  mockE2bReady: vi.fn(),
  mockLinkingAvailable: vi.fn(),
  mockAppConfigured: vi.fn(),
  mockListInstallationRepositories: vi.fn(),
  mockKeyValueStore: vi.fn(),
  mockGetSubscription: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mockRateLimit }));
vi.mock('@/lib/e2b/gate', () => ({ e2bProvisioningReady: mockE2bReady }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mockGetUserScopedDb }));
vi.mock('@/lib/server/key-value', () => ({
  getKeyValueStore: mockKeyValueStore,
  getKeyValueRateLimiter: vi.fn(() => null),
  getKeyValueProvider: vi.fn(() => 'memory'),
}));
vi.mock('@/lib/github-app', () => ({
  isGitHubAppConfigured: mockAppConfigured,
  isGitHubInstallationLinkingAvailable: mockLinkingAvailable,
  listInstallationRepositories: mockListInstallationRepositories,
}));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: mockGetSubscription },
}));

import { GET } from './route';

function listRequest(search?: string): NextRequest {
  const url = new URL('http://localhost:3000/api/github/repositories');
  if (search !== undefined) url.searchParams.set('search', search);
  return new NextRequest(url);
}

function repository(fullName: string, installationId = 11) {
  const [owner, name] = fullName.split('/');
  return {
    installationId,
    owner: owner ?? '',
    name: name ?? '',
    fullName,
    defaultBranch: 'main',
    isPrivate: true,
  };
}

let queried: { sql: string; params: unknown[] }[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  queried = [];
  mockRateLimit.mockResolvedValue(null);
  mockE2bReady.mockReturnValue(true);
  mockLinkingAvailable.mockReturnValue(true);
  mockAppConfigured.mockReturnValue(true);
  mockKeyValueStore.mockReturnValue(null);
  mockGetSubscription.mockResolvedValue({ plan_tier: 'pro', status: 'active' });
  mockGetUserScopedDb.mockResolvedValue({
    userId: 'user-1',
    organizationId: null,
    db: {
      query: vi.fn(async (sql: string, params: unknown[]) => {
        queried.push({ sql, params });
        return [
          {
            installation_id: '11',
            account_login: 'acme',
            verified_repositories: ['acme/widgets', 'acme/apparatus'],
          },
        ];
      }),
    },
  });
  mockListInstallationRepositories.mockResolvedValue({
    repositories: [repository('acme/widgets'), repository('acme/apparatus')],
    truncated: false,
  });
});

describe('GET /api/github/repositories', () => {
  it('lists the repositories of the caller own verified installations, sorted', async () => {
    const response = await GET(listRequest());
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      repositories: { fullName: string }[];
      installationCount: number;
    };
    expect(body.repositories.map((entry) => entry.fullName)).toEqual([
      'acme/apparatus',
      'acme/widgets',
    ]);
    expect(body.installationCount).toBe(1);
    expect(mockListInstallationRepositories).toHaveBeenCalledWith(11, expect.any(Object), [
      'acme/widgets',
      'acme/apparatus',
    ]);
  });

  it('passes the proved repository set so the listing cannot widen to the installation', async () => {
    // WEB-SEC-SCAN-2026-09-09-F38: /installation/repositories answers at full
    // installation scope. Without this bound the picker offers private
    // repositories the signed-in account has no GitHub access to.
    await GET(listRequest());
    const [, , verified] = mockListInstallationRepositories.mock.calls[0] as [
      number,
      unknown,
      string[] | null,
    ];
    expect(verified).toEqual(['acme/widgets', 'acme/apparatus']);
  });

  it('reports an installation linked before the check as unreachable rather than listing it', async () => {
    mockGetUserScopedDb.mockResolvedValue({
      userId: 'user-1',
      organizationId: null,
      db: {
        query: vi.fn(async () => [
          { installation_id: '11', account_login: 'acme', verified_repositories: null },
        ]),
      },
    });
    mockListInstallationRepositories.mockRejectedValue(new Error('reconnect it'));

    const response = await GET(listRequest());

    expect(response.status).toBe(503);
    expect(mockListInstallationRepositories).toHaveBeenCalledWith(11, expect.any(Object), null);
  });

  it('scopes the installation read to the signed-in user and to verified ownership', async () => {
    await GET(listRequest());
    expect(queried).toHaveLength(1);
    expect(queried[0]?.sql).toContain('user_id = $1');
    expect(queried[0]?.sql).toContain('ownership_verified_at is not null');
    expect(queried[0]?.params).toEqual(['user-1']);
  });

  it('filters on the search parameter without asking GitHub again', async () => {
    const response = await GET(listRequest('WIDGET'));
    const body = (await response.json()) as { repositories: { fullName: string }[] };
    expect(body.repositories.map((entry) => entry.fullName)).toEqual(['acme/widgets']);
  });

  it('refuses a search term longer than the ceiling', async () => {
    const response = await GET(listRequest('x'.repeat(201)));
    expect(response.status).toBe(400);
    expect(mockListInstallationRepositories).not.toHaveBeenCalled();
  });

  it('answers with an empty list when the account has no installation', async () => {
    mockGetUserScopedDb.mockResolvedValue({
      userId: 'user-1',
      organizationId: null,
      db: { query: vi.fn(async () => []) },
    });
    const response = await GET(listRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      repositories: [],
      installationCount: 0,
    });
    expect(mockListInstallationRepositories).not.toHaveBeenCalled();
  });

  it('answers with an empty list when this deployment cannot link installations', async () => {
    mockLinkingAvailable.mockReturnValue(false);
    const response = await GET(listRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ repositories: [] });
  });

  it('refuses when managed Code is not enabled for the deployment', async () => {
    mockE2bReady.mockReturnValue(false);
    const response = await GET(listRequest());
    expect(response.status).toBe(503);
    expect(mockListInstallationRepositories).not.toHaveBeenCalled();
  });

  it('refuses when the plan includes no Code sessions', async () => {
    mockGetSubscription.mockResolvedValue({ plan_tier: 'local-only', status: 'active' });
    const response = await GET(listRequest());
    expect(response.status).toBe(503);
    expect(mockListInstallationRepositories).not.toHaveBeenCalled();
  });

  it('names an installation GitHub would not answer for instead of dropping it', async () => {
    mockGetUserScopedDb.mockResolvedValue({
      userId: 'user-1',
      organizationId: null,
      db: {
        query: vi.fn(async () => [
          { installation_id: '11', account_login: 'acme' },
          { installation_id: '12', account_login: 'other' },
        ]),
      },
    });
    mockListInstallationRepositories.mockImplementation(async (installationId: number) => {
      if (installationId === 12) throw new Error('Failed to list GitHub repositories: 403');
      return { repositories: [repository('acme/widgets')], truncated: false };
    });

    const response = await GET(listRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      repositories: [{ fullName: 'acme/widgets' }],
      unreachable: [{ installationId: 12, accountLogin: 'other' }],
    });
  });

  it('fails rather than reporting an empty account when every installation fails', async () => {
    mockListInstallationRepositories.mockRejectedValue(new Error('GitHub is down'));
    const response = await GET(listRequest());
    expect(response.status).toBe(503);
  });

  it('serves a cached catalogue without calling GitHub again', async () => {
    const store = {
      get: vi.fn(async () => ({
        repositories: [repository('acme/widgets')],
        truncated: false,
        unreachable: [],
      })),
      set: vi.fn(async () => undefined),
    };
    mockKeyValueStore.mockReturnValue(store);

    const response = await GET(listRequest());
    expect(response.status).toBe(200);
    expect(mockListInstallationRepositories).not.toHaveBeenCalled();
    expect(store.set).not.toHaveBeenCalled();
  });
});
