import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  linkingAvailable: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: 'user-1' })),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mocks.query(...args),
  })),
}));
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));
vi.mock('@/lib/github-app', () => ({
  isGitHubInstallationLinkingAvailable: () => mocks.linkingAvailable(),
}));

import { GET } from './route';

describe('GitHub installation listing ownership proof', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue([
      {
        id: 'row-1',
        installation_id: 987654,
        account_login: 'victim-org',
        account_type: 'Organization',
      },
    ]);
    mocks.linkingAvailable.mockReturnValue(false);
  });

  it('does not expose unverified installation rows as connected', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/api/github/installations'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ installations: [] });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('lists only rows carrying an explicit ownership proof', async () => {
    mocks.linkingAvailable.mockReturnValue(true);

    const response = await GET(new NextRequest('http://localhost:3000/api/github/installations'));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { installations: unknown[] };
    expect(body.installations).toHaveLength(1);
    const [sql] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/ownership_verified_at is not null/i);
  });

  // known-flaws WEB-CONNECTORS-PANEL-ALL-OR-NOTHING-01: an unmigrated
  // github_installations table used to 500 here, which the settings panel's
  // Promise.all turned into a global "connectors could not be loaded" error
  // even though /api/connectors and /api/connectors/custom were healthy.
  // Degrading to an empty list (mirroring getUserGithubInstallations) reads
  // as "no installations", exactly like /api/connectors already does.
  it('degrades an unmigrated github_installations table to an empty list instead of 500', async () => {
    mocks.linkingAvailable.mockReturnValue(true);
    mocks.query.mockRejectedValueOnce(
      Object.assign(new Error('relation "github_installations" does not exist'), {
        code: '42P01',
      }),
    );

    const response = await GET(new NextRequest('http://localhost:3000/api/github/installations'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ installations: [] });
  });

  it('still 500s on a genuinely unexpected database error', async () => {
    mocks.linkingAvailable.mockReturnValue(true);
    mocks.query.mockRejectedValueOnce(new Error('connection terminated unexpectedly'));

    const response = await GET(new NextRequest('http://localhost:3000/api/github/installations'));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Failed to fetch installations' });
  });
});
