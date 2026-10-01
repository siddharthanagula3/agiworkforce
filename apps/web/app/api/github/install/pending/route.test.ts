import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
type ScanModule0 = typeof import('@/lib/rate-limit');
type ScanModule1 = typeof import('@/lib/api-auth');
type ScanModule2 = typeof import('@/lib/csrf');
type ScanModule3 = typeof import('@/lib/logger');
type ScanModule4 = typeof import('@/lib/github-app');
type ScanModule5 = typeof import('@/lib/github-install-app-return');

const mocks = vi.hoisted(() => ({
  pending: vi.fn(async (..._args: unknown[]): Promise<number | null> => 987654),
  account: vi.fn(
    async (
      ..._args: unknown[]
    ): Promise<{ accountLogin: string; accountType: 'User' | 'Organization' } | null> => ({
      accountLogin: 'acme',
      accountType: 'Organization',
    }),
  ),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  getClerkAuthUser: vi.fn(async () => ({ userId: 'user-1' })),
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  requireCsrfToken: vi.fn(async () => null),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/github-app', async (importOriginal) => ({
  ...(await importOriginal<ScanModule4>()),
  getGitHubInstallationAccount: (...args: unknown[]) => mocks.account(...args),
}));
vi.mock('@/lib/github-install-app-return', async (importOriginal) => ({
  ...(await importOriginal<ScanModule5>()),
  pendingAppInstallation: (...args: unknown[]) => mocks.pending(...args),
}));

import { POST } from './route';

const STATE = 'b'.repeat(64);

function pendingRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/github/install/pending', {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/github/install/pending', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pending.mockResolvedValue(987654);
    mocks.account.mockResolvedValue({ accountLogin: 'acme', accountType: 'Organization' });
  });

  it("names the GitHub account of the starter's pending installation, without consuming it", async () => {
    const response = await POST(pendingRequest({ state: STATE }));

    expect(await response.json()).toEqual({
      status: 'ready',
      accountLogin: 'acme',
      accountType: 'Organization',
    });
    expect(mocks.pending).toHaveBeenCalledWith('user-1', STATE);
    expect(mocks.account).toHaveBeenCalledWith(987654);
  });

  it("tells another account nothing about someone else's install", async () => {
    mocks.pending.mockResolvedValue(null);

    const response = await POST(pendingRequest({ state: STATE }));

    expect(await response.json()).toEqual({ status: 'invalid_state' });
    expect(mocks.account).not.toHaveBeenCalled();
  });

  it('reports GitHub being unreachable without failing the request', async () => {
    mocks.account.mockRejectedValue(new Error('GitHub installation lookup failed: 502'));

    const response = await POST(pendingRequest({ state: STATE }));

    expect(await response.json()).toEqual({ status: 'unavailable' });
  });

  it('rejects a malformed state', async () => {
    const response = await POST(pendingRequest({ state: 'short' }));

    expect(response.status).toBe(400);
    expect(mocks.pending).not.toHaveBeenCalled();
  });
});
