import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({ query: (...args: unknown[]) => mocks.query(...args) })),
}));
vi.mock('@/lib/custom-connector-crypto', () => ({
  encryptConnectorToken: (value: string, purpose: string) => `sealed(${purpose}):${value}`,
  decryptConnectorToken: (value: string, purpose: string) => {
    const prefix = `sealed(${purpose}):`;
    if (!value.startsWith(prefix)) throw new Error('bad envelope');
    return value.slice(prefix.length);
  },
}));
vi.mock('@/lib/github-app', () => ({
  generateGitHubInstallState: vi.fn(() => 'a'.repeat(64)),
}));

import {
  appInstallOwner,
  appInstallRequester,
  appInstallReturnUrl,
  maskEmail,
  consumeAppInstall,
  pendingAppInstallation,
  recordAppInstallation,
  startAppInstall,
} from '../github-install-app-return';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('GitHub app install state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue([]);
  });

  it("purges the account's spent rows, then stores only the hash of the install state", async () => {
    const state = await startAppInstall('user-1');

    const [purge, purgeParams] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(purge).toMatch(/delete from public\.github_install_authorizations/);
    expect(purge).toMatch(/expires_at < now\(\) or consumed_at is not null/);
    expect(purgeParams).toEqual(['user-1']);
    const [sql, params] = mocks.query.mock.calls[1] as [string, unknown[]];
    expect(sql).toMatch(/insert into public\.github_install_authorizations/);
    expect(params).toEqual(['user-1', sha256(state), 10]);
    expect(params).not.toContain(state);
  });

  it('records an installation only once, on an open row', async () => {
    mocks.query.mockResolvedValueOnce([{ user_id: 'user-1' }]).mockResolvedValueOnce([]);

    const recorded = await recordAppInstallation('e'.repeat(64), 42);
    expect(await recordAppInstallation('e'.repeat(64), 43)).toBeNull();

    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/installation_id is null/);
    expect(sql).toMatch(/consumed_at is null/);
    expect(sql).toMatch(/expires_at > now\(\)/);
    expect(params.slice(0, 3)).toEqual([sha256('e'.repeat(64)), 42, sha256('a'.repeat(64))]);
    const sealed = params[3] as string;
    expect(sealed.startsWith('sealed(oauth-code-verifier):')).toBe(true);
    const verifier = sealed.slice('sealed(oauth-code-verifier):'.length);
    expect(recorded).toEqual({
      oauthState: 'a'.repeat(64),
      codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
    });
  });

  it('lets only the starting account consume the install, once', async () => {
    mocks.query.mockResolvedValueOnce([
      { installation_id: '42', code_verifier_enc: 'sealed(oauth-code-verifier):row-verifier' },
    ]);

    expect(await consumeAppInstall('user-1', 'b'.repeat(64))).toEqual({
      installationId: 42,
      codeVerifier: 'row-verifier',
    });

    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/set consumed_at = now\(\)/);
    expect(sql).toMatch(/user_id = \$2/);
    expect(params).toEqual([sha256('b'.repeat(64)), 'user-1']);
    expect(await consumeAppInstall('user-2', 'b'.repeat(64))).toBeNull();
  });

  it('refuses a row whose verifier cannot be opened', async () => {
    mocks.query.mockResolvedValueOnce([{ installation_id: '42', code_verifier_enc: 'tampered' }]);

    expect(await consumeAppInstall('user-1', 'b'.repeat(64))).toBeNull();
  });

  it('always returns over the verified https App Link, with only the values present', () => {
    expect(appInstallReturnUrl({ state: 's', code: null, error: 'denied' }).toString()).toBe(
      'https://agiworkforce.com/github/installed?state=s&error=denied',
    );
    expect(appInstallReturnUrl({ state: 's', code: 'c' }).toString()).toBe(
      'https://agiworkforce.com/github/installed?state=s&code=c',
    );
  });

  it('finds the owner of an open authorization', async () => {
    mocks.query.mockResolvedValueOnce([{ user_id: 'user-1' }]).mockResolvedValueOnce([]);

    expect(await appInstallOwner('b'.repeat(64))).toBe('user-1');
    expect(await appInstallOwner('b'.repeat(64))).toBeNull();
  });

  it('names the requesting account, masked, only for an install not yet used', async () => {
    mocks.query
      .mockResolvedValueOnce([{ user_id: 'user-1' }])
      .mockResolvedValueOnce([{ email: 'siddhartha@example.com' }])
      .mockResolvedValueOnce([]);

    expect(await appInstallRequester('e'.repeat(64))).toBe('s***@example.com');
    const [lookup, lookupParams] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(lookup).toMatch(/install_state_hash = \$1/);
    expect(lookup).toMatch(/installation_id is null/);
    expect(lookupParams).toEqual([sha256('e'.repeat(64))]);
    const [, profileParams] = mocks.query.mock.calls[1] as [string, unknown[]];
    expect(profileParams).toEqual(['user-1']);

    expect(await appInstallRequester('e'.repeat(64))).toBeNull();
  });

  it('masks an email down to its first letter and domain', () => {
    expect(maskEmail('me@example.com')).toBe('m***@example.com');
    expect(maskEmail('not-an-email')).toBe('***');
  });

  it('shows a pending installation only to the account that started it', async () => {
    mocks.query.mockResolvedValueOnce([{ installation_id: '42' }]).mockResolvedValueOnce([]);

    expect(await pendingAppInstallation('user-1', 'b'.repeat(64))).toBe(42);
    expect(await pendingAppInstallation('user-2', 'b'.repeat(64))).toBeNull();

    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/user_id = \$2/);
    expect(sql).toMatch(/consumed_at is null/);
    expect(params).toEqual([sha256('b'.repeat(64)), 'user-1']);
  });
});
