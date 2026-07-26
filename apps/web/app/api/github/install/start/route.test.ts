import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  cookieSet: vi.fn((_options: unknown) => undefined),
  linkingAvailable: vi.fn(() => false),
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
