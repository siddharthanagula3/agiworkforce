import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  dbQuery: vi.fn(async (..._args: unknown[]) => [] as unknown[]),
  dbExecute: vi.fn(async (..._args: unknown[]) => undefined),
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mocks.dbQuery(...args),
    execute: (...args: unknown[]) => mocks.dbExecute(...args),
  })),
}));

const mockFetch = vi.fn();

const { privateKey: TEST_PRIVATE_KEY } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

async function loadConfiguredGitHubApp(privateKeyBase64 = 'cHJpdmF0ZS1rZXk=') {
  vi.stubEnv('GITHUB_APP_ID', '12345');
  vi.stubEnv('GITHUB_APP_PRIVATE_KEY_BASE64', privateKeyBase64);
  vi.stubEnv('GITHUB_APP_SLUG', 'agi');
  vi.stubEnv('GITHUB_APP_CLIENT_ID', 'Iv1.client-id');
  vi.stubEnv('GITHUB_APP_CLIENT_SECRET', 'client-secret');
  vi.resetModules();
  return import('./github-app');
}

describe('GitHub App user authorization ownership proof', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mocks.dbQuery.mockReset();
    mocks.dbExecute.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('is available only when installation and user-authorization credentials are complete', async () => {
    const github = await loadConfiguredGitHubApp();
    expect(github.isGitHubInstallationLinkingAvailable()).toBe(true);

    vi.stubEnv('GITHUB_APP_CLIENT_SECRET', '');
    vi.resetModules();
    const incompleteGitHub = await import('./github-app');
    expect(incompleteGitHub.isGitHubInstallationLinkingAvailable()).toBe(false);
  });

  it('exchanges an OAuth code without putting the client secret in the URL', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'ghu_ephemeral', token_type: 'bearer' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const github = await loadConfiguredGitHubApp();

    const token = await github.exchangeGitHubOAuthCode(
      'one-time-code',
      'https://app.example.com/api/github/oauth/callback',
    );

    expect(token).toBe('ghu_ephemeral');
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://github.com/login/oauth/access_token');
    expect(url).not.toContain('client-secret');
    expect(init.method).toBe('POST');
    const body = init.body as URLSearchParams;
    expect(body.get('client_id')).toBe('Iv1.client-id');
    expect(body.get('client_secret')).toBe('client-secret');
    expect(body.get('code')).toBe('one-time-code');
    expect(body.get('redirect_uri')).toBe('https://app.example.com/api/github/oauth/callback');
  });

  it('checks every page of user-accessible installations and returns GitHub metadata', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      account: { login: `account-${index + 1}`, type: 'Organization' },
    }));
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ total_count: 101, installations: firstPage }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            total_count: 101,
            installations: [
              {
                id: 987654,
                account: { login: 'verified-org', type: 'Organization' },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    const github = await loadConfiguredGitHubApp();

    const installation = await github.findGitHubInstallationForUser('ghu_ephemeral', 987654);

    expect(installation).toEqual({
      installationId: 987654,
      accountLogin: 'verified-org',
      accountType: 'Organization',
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0]?.[0]).toBe(
      'https://api.github.com/user/installations?per_page=100&page=1',
    );
    expect(mockFetch.mock.calls[1]?.[0]).toBe(
      'https://api.github.com/user/installations?per_page=100&page=2',
    );
  });

  it('refuses to mint an installation token from an unverified legacy row', async () => {
    mocks.dbQuery.mockResolvedValue([
      {
        access_token_enc: null,
        access_token_expires_at: null,
        ownership_verified_at: null,
      },
    ]);
    const github = await loadConfiguredGitHubApp();

    await expect(github.getInstallationAccessToken(987654)).rejects.toThrow(/ownership.*verified/i);
    const [sql] = mocks.dbQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/ownership_verified_at is not null/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects a malformed installation-token response before caching it', async () => {
    mocks.dbQuery.mockResolvedValue([
      {
        access_token_enc: null,
        access_token_expires_at: null,
        ownership_verified_at: '2026-07-26T00:00:00.000Z',
      },
    ]);
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ token: 123, expires_at: 'not-a-timestamp' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const github = await loadConfiguredGitHubApp(
      Buffer.from(TEST_PRIVATE_KEY, 'utf8').toString('base64'),
    );

    await expect(github.getInstallationAccessToken(987654)).rejects.toThrow(
      /installation token response.*invalid/i,
    );
    expect(mocks.dbExecute).not.toHaveBeenCalled();
  });
});
