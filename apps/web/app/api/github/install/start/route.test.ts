import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  cookieSet: vi.fn((_options: unknown) => undefined),
  linkingAvailable: vi.fn(() => false),
  codeGate: vi.fn(async () => null as Response | null),
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
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: 'user-1' })),
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({}) }));
vi.mock('@/lib/services/organization-policy-code-gate', () => ({
  buildWorkspaceCodeGateResponse: mocks.codeGate,
}));
vi.mock('@/lib/github-app', () => ({
  generateGitHubInstallState: vi.fn(() => 'c'.repeat(64)),
  getGitHubAppInstallUrl: vi.fn(() => 'https://github.com/apps/agi/installations/new'),
  isGitHubInstallationLinkingAvailable: () => mocks.linkingAvailable(),
}));

import { GET } from './route';

describe('GitHub installation start ownership proof', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.linkingAvailable.mockReturnValue(false);
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
