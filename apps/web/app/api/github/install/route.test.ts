import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(async (..._args: unknown[]) => undefined),
  cookieGet: vi.fn((_name: string) => ({ value: 'c'.repeat(64) })),
  cookieSet: vi.fn((_options: unknown) => undefined),
  generateState: vi.fn(() => 'a'.repeat(64)),
  getAuthorizationUrl: vi.fn(
    (_state: string, _redirectUri: string, _challenge?: string) =>
      `https://github.com/login/oauth/authorize?client_id=Iv1.client-id&state=${'a'.repeat(64)}`,
  ),
  linkingAvailable: vi.fn(() => false),
  recordAppInstallation: vi.fn(
    async (..._args: unknown[]): Promise<{ oauthState: string; codeChallenge: string } | null> =>
      null,
  ),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/headers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/headers')>()),
  cookies: vi.fn(async () => ({
    get: (name: string) => mocks.cookieGet(name),
    set: (options: unknown) => mocks.cookieSet(options),
  })),
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-auth')>()),
  isAccountUnavailableError: vi.fn(() => false),
  getClerkAuthUser: vi.fn(async () => ({ userId: 'attacker-user' })),
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/neon-db')>()),
  getNeonDb: vi.fn(() => ({
    execute: (...args: unknown[]) => mocks.execute(...args),
  })),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/logger')>()),
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));
vi.mock('@/lib/github-app', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/github-app')>()),
  generateGitHubInstallState: () => mocks.generateState(),
  getGitHubUserAuthorizationUrl: (state: string, redirectUri: string, challenge?: string) =>
    challenge === undefined
      ? mocks.getAuthorizationUrl(state, redirectUri)
      : mocks.getAuthorizationUrl(state, redirectUri, challenge),
  isGitHubInstallationLinkingAvailable: () => mocks.linkingAvailable(),
}));

vi.mock('@/lib/github-install-app-return', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/github-install-app-return')>()),
  recordAppInstallation: (...args: unknown[]) => mocks.recordAppInstallation(...args),
}));

import { GET } from './route';

describe('GitHub installation callback ownership proof', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue(undefined);
    mocks.cookieGet.mockReturnValue({ value: 'c'.repeat(64) });
    mocks.linkingAvailable.mockReturnValue(false);
    mocks.recordAppInstallation.mockResolvedValue(null);
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

  it('records an app install against its pending row without a cookie or web session', async () => {
    mocks.linkingAvailable.mockReturnValue(true);
    mocks.cookieGet.mockReturnValue(undefined as never);
    mocks.recordAppInstallation.mockResolvedValue({
      oauthState: 'd'.repeat(64),
      codeChallenge: 'row-challenge',
    });

    const response = await GET(
      new NextRequest(
        `http://localhost:3000/api/github/install?installation_id=987654&state=${'e'.repeat(64)}`,
      ),
    );

    expect(mocks.recordAppInstallation).toHaveBeenCalledWith('e'.repeat(64), 987654);
    expect(response.status).toBe(307);
    expect(mocks.getAuthorizationUrl).toHaveBeenCalledWith(
      'd'.repeat(64),
      'http://localhost:3000/api/github/oauth/callback',
      'row-challenge',
    );
    expect(mocks.cookieSet).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('keeps the cookie flow when the state belongs to no app install', async () => {
    mocks.linkingAvailable.mockReturnValue(true);

    const response = await GET(
      new NextRequest(
        `http://localhost:3000/api/github/install?installation_id=987654&state=${'c'.repeat(64)}`,
      ),
    );

    expect(mocks.recordAppInstallation).toHaveBeenCalledWith('c'.repeat(64), 987654);
    expect(response.status).toBe(307);
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'github_pending_installation_id', value: '987654' }),
    );
  });
});
