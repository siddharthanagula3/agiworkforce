import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

interface CookieOptions {
  name: string;
  value: string;
  maxAge?: number;
}

const mocks = vi.hoisted(() => ({
  cookieValues: new Map<string, string>(),
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
  exchangeCode: vi.fn(),
  findInstallation: vi.fn(),
  linkingAvailable: vi.fn(),
  query: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => mocks.cookieGet(name),
    set: (options: CookieOptions) => mocks.cookieSet(options),
  })),
}));
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
  exchangeGitHubOAuthCode: (...args: unknown[]) => mocks.exchangeCode(...args),
  findGitHubInstallationForUser: (...args: unknown[]) => mocks.findInstallation(...args),
  isGitHubInstallationLinkingAvailable: () => mocks.linkingAvailable(),
}));

import { GET } from './route';

const OAUTH_STATE = 'b'.repeat(64);

function callbackRequest(query = `code=one-time-code&state=${OAUTH_STATE}`): NextRequest {
  return new NextRequest(`http://localhost:3000/api/github/oauth/callback?${query}`);
}

describe('GitHub OAuth callback ownership proof', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookieValues.clear();
    mocks.cookieValues.set('github_oauth_state', OAUTH_STATE);
    mocks.cookieValues.set('github_pending_installation_id', '987654');
    mocks.cookieGet.mockImplementation((name: string) => {
      const value = mocks.cookieValues.get(name);
      return value === undefined ? undefined : { value };
    });
    mocks.cookieSet.mockImplementation((options: CookieOptions) => {
      if (options.maxAge === 0) mocks.cookieValues.delete(options.name);
      else mocks.cookieValues.set(options.name, options.value);
    });
    mocks.linkingAvailable.mockReturnValue(true);
    mocks.exchangeCode.mockResolvedValue('ghu_ephemeral-secret');
    mocks.findInstallation.mockResolvedValue({
      installationId: 987654,
      accountLogin: 'verified-org',
      accountType: 'Organization',
    });
    mocks.query.mockResolvedValue([{ id: 'row-1' }]);
  });

  it('rejects a state mismatch before exchanging the code', async () => {
    const response = await GET(callbackRequest('code=one-time-code&state=wrong-state'));

    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/connectors?github=invalid_state',
    );
    expect(mocks.exchangeCode).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('rejects a malformed state even when the cookie and query happen to match', async () => {
    mocks.cookieValues.set('github_oauth_state', 'short-state');

    const response = await GET(callbackRequest('code=one-time-code&state=short-state'));

    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/connectors?github=invalid_state',
    );
    expect(mocks.exchangeCode).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('rejects a spoofed pending installation that is absent from the user token', async () => {
    mocks.findInstallation.mockResolvedValue(null);

    const response = await GET(callbackRequest());

    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/connectors?github=ownership_failed',
    );
    expect(mocks.exchangeCode).toHaveBeenCalledWith(
      'one-time-code',
      'http://localhost:3000/api/github/oauth/callback',
    );
    expect(mocks.findInstallation).toHaveBeenCalledWith('ghu_ephemeral-secret', 987654);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('persists only authoritative GitHub metadata after ownership is proven', async () => {
    const response = await GET(callbackRequest());

    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/connectors?github=connected',
    );
    expect(mocks.query).toHaveBeenCalledOnce();
    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/ownership_verified_at/i);
    expect(sql).toMatch(
      /ownership_verified_at is null[\s\S]*github_installations\.user_id = excluded\.user_id/i,
    );
    expect(params).toEqual(['user-1', 987654, 'verified-org', 'Organization']);
  });

  it('consumes the OAuth state and pending id so a successful callback cannot replay', async () => {
    const firstResponse = await GET(callbackRequest());
    const replayResponse = await GET(callbackRequest());

    expect(firstResponse.headers.get('location')).toContain('github=connected');
    expect(replayResponse.headers.get('location')).toContain('github=invalid_state');
    expect(mocks.exchangeCode).toHaveBeenCalledOnce();
    expect(mocks.query).toHaveBeenCalledOnce();
    expect(mocks.cookieValues.has('github_oauth_state')).toBe(false);
    expect(mocks.cookieValues.has('github_pending_installation_id')).toBe(false);
  });

  it('handles a user-denied authorization without exchanging or persisting', async () => {
    const response = await GET(
      callbackRequest(`error=access_denied&error_description=denied&state=${OAUTH_STATE}`),
    );

    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/connectors?github=oauth_denied',
    );
    expect(mocks.exchangeCode).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.cookieValues.has('github_oauth_state')).toBe(false);
  });

  it('fails closed when the one-time code exchange fails', async () => {
    mocks.exchangeCode.mockRejectedValue(new Error('GitHub OAuth code exchange failed: 502'));

    const response = await GET(callbackRequest());

    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/connectors?github=oauth_failed',
    );
    expect(mocks.findInstallation).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.cookieValues.has('github_oauth_state')).toBe(false);
  });

  it('does not reassign an installation already verified for another AGI account', async () => {
    mocks.query.mockResolvedValue([]);

    const response = await GET(callbackRequest());

    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/connectors?github=already_linked',
    );
    const [sql] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(
      /ownership_verified_at is null[\s\S]*github_installations\.user_id = excluded\.user_id/i,
    );
  });
});
