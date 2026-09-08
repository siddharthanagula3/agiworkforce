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

const INSTALLATION_ID = 987654;

async function loadConfiguredGitHubApp() {
  vi.stubEnv('GITHUB_APP_ID', '12345');
  vi.stubEnv('GITHUB_APP_PRIVATE_KEY_BASE64', Buffer.from(TEST_PRIVATE_KEY).toString('base64'));
  vi.resetModules();
  return import('./github-app');
}

async function loadUnconfiguredGitHubApp() {
  vi.stubEnv('GITHUB_APP_ID', '');
  vi.stubEnv('GITHUB_APP_PRIVATE_KEY_BASE64', '');
  vi.resetModules();
  return import('./github-app');
}

describe('deleteGitHubAppInstallation', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('sends an authenticated DELETE to the app installation endpoint', async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 204 }));
    const { deleteGitHubAppInstallation } = await loadConfiguredGitHubApp();

    const result = await deleteGitHubAppInstallation(INSTALLATION_ID);

    expect(result).toEqual({ status: 'deleted' });
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://api.github.com/app/installations/${INSTALLATION_ID}`);
    expect(init.method).toBe('DELETE');
    expect(String((init.headers as Record<string, string>)['Authorization'])).toMatch(/^Bearer /);
  });

  it('treats a 404 as already uninstalled, which is the state the caller wanted', async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 404 }));
    const { deleteGitHubAppInstallation } = await loadConfiguredGitHubApp();

    await expect(deleteGitHubAppInstallation(INSTALLATION_ID)).resolves.toEqual({
      status: 'already-absent',
    });
  });

  it('reports a refusal rather than reporting the grant as revoked', async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 403 }));
    const { deleteGitHubAppInstallation } = await loadConfiguredGitHubApp();

    const result = await deleteGitHubAppInstallation(INSTALLATION_ID);

    expect(result.status).toBe('failed');
    expect(result).toMatchObject({ reason: expect.stringContaining('403') });
  });

  it('reports an unreachable GitHub as a failure, never as a deletion', async () => {
    mockFetch.mockRejectedValue(new Error('socket hang up'));
    const { deleteGitHubAppInstallation } = await loadConfiguredGitHubApp();

    const result = await deleteGitHubAppInstallation(INSTALLATION_ID);

    expect(result.status).toBe('failed');
    expect(result).toMatchObject({ reason: expect.stringContaining('socket hang up') });
  });

  it('says revocation is unavailable when the app has no credentials', async () => {
    const { deleteGitHubAppInstallation } = await loadUnconfiguredGitHubApp();

    const result = await deleteGitHubAppInstallation(INSTALLATION_ID);

    expect(result.status).toBe('unavailable');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects an installation id that could reshape the request path', async () => {
    const { deleteGitHubAppInstallation } = await loadConfiguredGitHubApp();

    for (const id of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 2]) {
      const result = await deleteGitHubAppInstallation(id);
      expect(result.status).toBe('failed');
    }
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
