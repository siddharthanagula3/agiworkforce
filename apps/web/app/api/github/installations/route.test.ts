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
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: {
      query: (...args: unknown[]) => mocks.query(...args),
      execute: (...args: unknown[]) => mocks.query(...args),
    },
    userId: 'user-1',
    organizationId: null,
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
import { getUserScopedDb } from '@/lib/server/rls-db';
import { IpNotAllowedError } from '@/lib/ip-allow-list-gate';

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

  it('emits installation_id as a number even though the driver returns bigint as a string', async () => {
    // The fixture above uses a JS number, which is what hid this. installation_id
    // is `bigint` and no int8 type parser is registered, so the real driver hands
    // back a string. The settings panel validates the body with z.number(), so an
    // un-coerced row failed safeParse and rendered a connected GitHub as not
    // connected behind a retry notice that could never succeed.
    mocks.linkingAvailable.mockReturnValue(true);
    mocks.query.mockResolvedValue([
      {
        id: 'row-1',
        installation_id: '987654',
        account_login: 'victim-org',
        account_type: 'Organization',
      },
    ]);

    const response = await GET(new NextRequest('http://localhost:3000/api/github/installations'));

    const body = (await response.json()) as { installations: Array<{ installation_id: unknown }> };
    expect(body.installations[0]?.installation_id).toBe(987654);
    expect(typeof body.installations[0]?.installation_id).toBe('number');
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

  it('degrades a missing ownership proof column to an empty list instead of 500', async () => {
    mocks.linkingAvailable.mockReturnValue(true);
    mocks.query.mockRejectedValueOnce(
      Object.assign(new Error('column "ownership_verified_at" does not exist'), {
        code: '42703',
      }),
    );

    const response = await GET(new NextRequest('http://localhost:3000/api/github/installations'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ installations: [] });
  });

  it('does not hide unrelated missing-column errors', async () => {
    mocks.linkingAvailable.mockReturnValue(true);
    mocks.query.mockRejectedValueOnce(
      Object.assign(new Error('column "created_at" does not exist'), { code: '42703' }),
    );

    const response = await GET(new NextRequest('http://localhost:3000/api/github/installations'));

    expect(response.status).toBe(500);
  });

  it('surfaces an ip allow list denial as a 403 instead of a bare unauthorized', async () => {
    vi.mocked(getUserScopedDb).mockRejectedValueOnce(new IpNotAllowedError('network not allowed'));

    const response = await GET(new NextRequest('http://localhost:3000/api/github/installations'));

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('IP_NOT_ALLOWED');
    expect(body.error.message).toBe('network not allowed');
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('still 500s on a genuinely unexpected database error', async () => {
    mocks.linkingAvailable.mockReturnValue(true);
    mocks.query.mockRejectedValueOnce(new Error('connection terminated unexpectedly'));

    const response = await GET(new NextRequest('http://localhost:3000/api/github/installations'));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Failed to fetch installations' });
  });
});
