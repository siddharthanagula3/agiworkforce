import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(async (..._args: unknown[]) => undefined),
  cookieGet: vi.fn((_name: string) => ({ value: 'c'.repeat(64) })),
  cookieSet: vi.fn((_options: unknown) => undefined),
  generateState: vi.fn(() => 'a'.repeat(64)),
  getAuthorizationUrl: vi.fn(
    (_state: string, _redirectUri: string) =>
      `https://github.com/login/oauth/authorize?client_id=Iv1.client-id&state=${'a'.repeat(64)}`,
  ),
  linkingAvailable: vi.fn(() => false),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => mocks.cookieGet(name),
    set: (options: unknown) => mocks.cookieSet(options),
  })),
}));
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: 'attacker-user' })),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    execute: (...args: unknown[]) => mocks.execute(...args),
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
  generateGitHubInstallState: () => mocks.generateState(),
  getGitHubUserAuthorizationUrl: (state: string, redirectUri: string) =>
    mocks.getAuthorizationUrl(state, redirectUri),
  isGitHubInstallationLinkingAvailable: () => mocks.linkingAvailable(),
}));

import { GET } from './route';

describe('GitHub installation callback ownership proof', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue(undefined);
    mocks.cookieGet.mockReturnValue({ value: 'c'.repeat(64) });
    mocks.linkingAvailable.mockReturnValue(false);
  });

  it('does not let a valid CSRF state claim an unverified installation id', async () => {
    const response = await GET(
      new NextRequest(
        `http://localhost:3000/api/github/install?installation_id=987654&account_login=victim-org&account_type=Organization&state=${'c'.repeat(64)}`,
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/connectors?github=ownership_proof_required',
    );
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('stores the untrusted id only as pending and starts user authorization', async () => {
    mocks.linkingAvailable.mockReturnValue(true);

    const response = await GET(
      new NextRequest(
        `http://localhost:3000/api/github/install?installation_id=987654&account_login=spoofed-org&account_type=Organization&state=${'c'.repeat(64)}`,
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      `https://github.com/login/oauth/authorize?client_id=Iv1.client-id&state=${'a'.repeat(64)}`,
    );
    expect(mocks.getAuthorizationUrl).toHaveBeenCalledWith(
      'a'.repeat(64),
      'http://localhost:3000/api/github/oauth/callback',
    );
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'github_install_state',
        value: '',
        maxAge: 0,
      }),
    );
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'github_pending_installation_id',
        value: '987654',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 600,
      }),
    );
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'github_oauth_state',
        value: 'a'.repeat(64),
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 600,
      }),
    );
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('rejects a malformed state even when the cookie and query happen to match', async () => {
    mocks.cookieGet.mockReturnValue({ value: 'short-state' });
    mocks.linkingAvailable.mockReturnValue(true);

    const response = await GET(
      new NextRequest(
        'http://localhost:3000/api/github/install?installation_id=987654&state=short-state',
      ),
    );

    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/connectors?github=invalid_state',
    );
    expect(mocks.getAuthorizationUrl).not.toHaveBeenCalled();
  });
});
