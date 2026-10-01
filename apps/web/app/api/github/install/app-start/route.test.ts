import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
type ScanModule0 = typeof import('@/lib/rate-limit');
type ScanModule1 = typeof import('@/lib/api-auth');
type ScanModule2 = typeof import('@/lib/csrf');
type ScanModule3 = typeof import('@/lib/server/neon-db');
type ScanModule4 = typeof import('@/lib/services/organization-policy-code-gate');
type ScanModule5 = typeof import('@/lib/github-app');
type ScanModule6 = typeof import('@/lib/github-install-app-return');

const mocks = vi.hoisted(() => ({
  codeGate: vi.fn(async (..._args: unknown[]): Promise<Response | null> => null),
  csrf: vi.fn(async (..._args: unknown[]): Promise<Response | null> => null),
  linkingAvailable: vi.fn(() => true),
  installUrl: vi.fn((): string | null => 'https://github.com/apps/agi-workforce/installations/new'),
  startAppInstall: vi.fn(async (..._args: unknown[]) => 'f'.repeat(64)),
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
  requireCsrfToken: (...args: unknown[]) => mocks.csrf(...args),
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  getNeonDb: vi.fn(() => ({})),
}));
vi.mock('@/lib/services/organization-policy-code-gate', async (importOriginal) => ({
  ...(await importOriginal<ScanModule4>()),
  buildWorkspaceCodeGateResponse: (...args: unknown[]) => mocks.codeGate(...args),
}));
vi.mock('@/lib/github-app', async (importOriginal) => ({
  ...(await importOriginal<ScanModule5>()),
  isGitHubInstallationLinkingAvailable: () => mocks.linkingAvailable(),
  getGitHubAppInstallUrl: () => mocks.installUrl(),
}));
vi.mock('@/lib/github-install-app-return', async (importOriginal) => ({
  ...(await importOriginal<ScanModule6>()),
  startAppInstall: (...args: unknown[]) => mocks.startAppInstall(...args),
}));

import { POST } from './route';

function startRequest(body?: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/github/install/app-start', {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe('POST /api/github/install/app-start', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.codeGate.mockResolvedValue(null);
    mocks.linkingAvailable.mockReturnValue(true);
    mocks.installUrl.mockReturnValue('https://github.com/apps/agi-workforce/installations/new');
  });

  it('opens a pending install and sends the phone to our requester page, not straight to GitHub', async () => {
    const response = await POST(startRequest());

    expect(response.status).toBe(200);
    expect(mocks.startAppInstall).toHaveBeenCalledWith('user-1');
    const body = (await response.json()) as { url: string };
    const url = new URL(body.url);
    expect(url.origin + url.pathname).toBe('http://localhost:3000/github/connect');
    expect(url.searchParams.get('state')).toBe('f'.repeat(64));
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('honours the workspace code policy before opening anything', async () => {
    mocks.codeGate.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await POST(startRequest());

    expect(response.status).toBe(403);
    expect(mocks.startAppInstall).not.toHaveBeenCalled();
  });

  it('refuses when installation linking is not configured', async () => {
    mocks.linkingAvailable.mockReturnValue(false);

    const response = await POST(startRequest());

    expect(response.status).toBe(503);
    expect(mocks.startAppInstall).not.toHaveBeenCalled();
  });

  it('ignores any platform the caller claims, so the starter cannot pick the return channel', async () => {
    await POST(startRequest({ platform: 'ios' }));

    expect(mocks.startAppInstall).toHaveBeenCalledWith('user-1');
  });
});
