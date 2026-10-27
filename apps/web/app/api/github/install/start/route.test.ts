import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  cookieSet: vi.fn((_options: unknown) => undefined),
  linkingAvailable: vi.fn(() => false),
  codeGate: vi.fn(async () => null as Response | null),
  query: vi.fn(async () => [] as Array<{ installation_id: string; verified: boolean }>),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    set: (options: unknown) => mocks.cookieSet(options),
  })),
}));
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    userId: 'user-1',
    db: { query: (...args: unknown[]) => mocks.query(...args) },
  })),
}));
vi.mock('@/lib/services/organization-policy-code-gate', () => ({
  buildWorkspaceCodeGateResponse: mocks.codeGate,
}));
vi.mock('@/lib/github-app', () => ({
  generateGitHubInstallState: vi.fn(() => 'c'.repeat(64)),
  getGitHubAppInstallUrl: vi.fn(() => 'https://github.com/apps/agi/installations/new'),
  getGitHubUserAuthorizationUrl: vi.fn(
    (state: string) => `https://github.com/login/oauth/authorize?state=${state}`,
  ),
  isGitHubInstallationLinkingAvailable: () => mocks.linkingAvailable(),
}));

import { GET } from './route';

describe('GitHub installation start ownership proof', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.linkingAvailable.mockReturnValue(false);
    mocks.query.mockResolvedValue([]);
  });

  it('does not redirect to GitHub or issue state when linking cannot prove ownership', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/api/github/install/start'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/connectors?github=ownership_proof_required',
    );
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it('issues a short-lived state cookie before redirecting to the App installation page', async () => {
    mocks.linkingAvailable.mockReturnValue(true);

    const response = await GET(new NextRequest('http://localhost:3000/api/github/install/start'));

    expect(response.headers.get('location')).toBe(
      `https://github.com/apps/agi/installations/new?state=${'c'.repeat(64)}`,
    );
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'github_install_state',
        value: 'c'.repeat(64),
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 600,
      }),
    );
  });

  it('still opens GitHub when a verified account starts from outside AGI Code', async () => {
    mocks.linkingAvailable.mockReturnValue(true);
    mocks.query.mockResolvedValue([{ installation_id: '11', verified: true }]);

    const response = await GET(new NextRequest('http://localhost:3000/api/github/install/start'));

    expect(response.headers.get('location')).toBe(
      `https://github.com/apps/agi/installations/new?state=${'c'.repeat(64)}`,
    );
  });

  it('returns to the code page when this account already has a verified installation', async () => {
    mocks.linkingAvailable.mockReturnValue(true);
    mocks.query.mockResolvedValue([{ installation_id: '11', verified: true }]);

    const response = await GET(
      new NextRequest('http://localhost:3000/api/github/install/start?returnPath=/code'),
    );

    expect(response.headers.get('location')).toBe('http://localhost:3000/code');
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it('resumes ownership proof for an installation that was never verified', async () => {
    mocks.linkingAvailable.mockReturnValue(true);
    mocks.query.mockResolvedValue([{ installation_id: '11', verified: false }]);

    const response = await GET(
      new NextRequest('http://localhost:3000/api/github/install/start?returnPath=/code'),
    );

    expect(response.headers.get('location')).toBe(
      `https://github.com/login/oauth/authorize?state=${'c'.repeat(64)}`,
    );
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'github_pending_installation_id',
        value: '11',
        path: '/api/github/oauth/callback',
      }),
    );
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'github_connect_return', value: '/code' }),
    );
  });

  it('ignores a return path that is not one of the pages that start the flow', async () => {
    mocks.linkingAvailable.mockReturnValue(true);

    await GET(
      new NextRequest(
        'http://localhost:3000/api/github/install/start?returnPath=https://evil.test',
      ),
    );

    expect(mocks.cookieSet).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'github_connect_return' }),
    );
  });
});

describe('the workspace Code policy decides before GitHub is reached', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.linkingAvailable.mockReturnValue(true);
    mocks.codeGate.mockResolvedValue(null);
  });

  it('asks about connecting GitHub for the signed-in member', async () => {
    await GET(new NextRequest('https://agiworkforce.com/api/github/install/start'));

    expect(mocks.codeGate).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      { act: 'connect_github' },
      expect.anything(),
    );
  });

  it('returns the refusal and never mints an install state when the workspace says no', async () => {
    mocks.codeGate.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'code_control_disabled' } }), { status: 403 }),
    );

    const response = await GET(
      new NextRequest('https://agiworkforce.com/api/github/install/start'),
    );

    expect(response.status).toBe(403);
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });
});
