import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({ query: vi.fn(), execute: vi.fn() })),
}));

const LINKING_VARS = [
  'GITHUB_APP_ID',
  'GITHUB_APP_PRIVATE_KEY_BASE64',
  'GITHUB_APP_SLUG',
  'GITHUB_APP_CLIENT_ID',
  'GITHUB_APP_CLIENT_SECRET',
] as const;

async function loadGitHubApp(overrides: Partial<Record<string, string>>) {
  for (const name of LINKING_VARS) vi.stubEnv(name, overrides[name] ?? '');
  vi.stubEnv('GITHUB_WEBHOOK_SECRET', '');
  vi.stubEnv('GITHUB_TOKEN_ENCRYPTION_KEY', '');
  vi.resetModules();
  return import('./github-app');
}

const COMPLETE = {
  GITHUB_APP_ID: '12345',
  GITHUB_APP_PRIVATE_KEY_BASE64: 'cHJpdmF0ZS1rZXk=',
  GITHUB_APP_SLUG: 'agi',
  GITHUB_APP_CLIENT_ID: 'Iv1.client-id',
  GITHUB_APP_CLIENT_SECRET: 'client-secret',
};

describe('GitHub connector misconfiguration diagnostics', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    warn.mockRestore();
  });

  it('names every missing credential instead of hiding the connector silently', async () => {
    const github = await loadGitHubApp({
      ...COMPLETE,
      GITHUB_APP_SLUG: undefined,
      GITHUB_APP_CLIENT_SECRET: undefined,
    });

    expect(github.isGitHubInstallationLinkingAvailable()).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain('GITHUB_APP_SLUG');
    expect(message).toContain('GITHUB_APP_CLIENT_SECRET');
    expect(message).not.toContain('GITHUB_APP_CLIENT_ID');
  });

  it('logs the misconfiguration once, not on every availability check', async () => {
    const github = await loadGitHubApp({ ...COMPLETE, GITHUB_APP_CLIENT_ID: undefined });

    expect(github.isGitHubInstallationLinkingAvailable()).toBe(false);
    expect(github.isGitHubInstallationLinkingAvailable()).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('gates on five variables; the webhook secret and token key are not part of linking', async () => {
    const github = await loadGitHubApp(COMPLETE);

    expect(github.missingGitHubInstallationLinkingVars()).toEqual([]);
    expect(github.isGitHubInstallationLinkingAvailable()).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it('reports each unset linking variable by name', async () => {
    for (const omitted of LINKING_VARS) {
      const github = await loadGitHubApp({ ...COMPLETE, [omitted]: undefined });
      expect(github.missingGitHubInstallationLinkingVars()).toEqual([omitted]);
    }
  });
});
