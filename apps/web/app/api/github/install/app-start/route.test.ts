import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  codeGate: vi.fn(async (..._args: unknown[]): Promise<Response | null> => null),
  csrf: vi.fn(async (..._args: unknown[]): Promise<Response | null> => null),
  linkingAvailable: vi.fn(() => true),
  installUrl: vi.fn((): string | null => 'https://github.com/apps/agi-workforce/installations/new'),
  startAppInstall: vi.fn(async (..._args: unknown[]) => 'f'.repeat(64)),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: 'user-1' })),
}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: (...args: unknown[]) => mocks.csrf(...args) }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn(() => ({})) }));
vi.mock('@/lib/services/organization-policy-code-gate', () => ({
  buildWorkspaceCodeGateResponse: (...args: unknown[]) => mocks.codeGate(...args),
}));
vi.mock('@/lib/github-app', () => ({
  isGitHubInstallationLinkingAvailable: () => mocks.linkingAvailable(),
  getGitHubAppInstallUrl: () => mocks.installUrl(),
}));
vi.mock('@/lib/github-install-app-return', () => ({
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

  it('opens a pending install for the signed-in account and returns the install URL', async () => {
    const response = await POST(startRequest());

    expect(response.status).toBe(200);
    expect(mocks.startAppInstall).toHaveBeenCalledWith('user-1', 'app_scheme');
    const body = (await response.json()) as { url: string };
    const url = new URL(body.url);
    expect(url.origin + url.pathname).toBe(
      'https://github.com/apps/agi-workforce/installations/new',
    );
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

  it('asks for the verified App Link return when Android starts the install', async () => {
    await POST(startRequest({ platform: 'android' }));

    expect(mocks.startAppInstall).toHaveBeenCalledWith('user-1', 'app_link');
  });

  it('keeps the auth-session scheme for iOS', async () => {
    await POST(startRequest({ platform: 'ios' }));

    expect(mocks.startAppInstall).toHaveBeenCalledWith('user-1', 'app_scheme');
  });

  it('rejects an unknown platform', async () => {
    const response = await POST(startRequest({ platform: 'windows' }));

    expect(response.status).toBe(400);
    expect(mocks.startAppInstall).not.toHaveBeenCalled();
  });
});
