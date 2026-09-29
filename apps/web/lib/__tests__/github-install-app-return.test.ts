import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({ query: (...args: unknown[]) => mocks.query(...args) })),
}));
vi.mock('@/lib/github-app', () => ({
  generateGitHubInstallState: vi.fn(() => 'a'.repeat(64)),
}));

import {
  appInstallReturnUrl,
  consumeAppInstall,
  recordAppInstallation,
  startAppInstall,
} from '../github-install-app-return';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('GitHub app install state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue([]);
  });

  it('stores only the hash of the install state, with an expiry', async () => {
    const state = await startAppInstall('user-1');

    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/insert into public\.github_install_authorizations/);
    expect(params).toEqual(['user-1', sha256(state), 10]);
    expect(params).not.toContain(state);
  });

  it('records an installation only once, on an open row', async () => {
    mocks.query.mockResolvedValueOnce([{ user_id: 'user-1' }]).mockResolvedValueOnce([]);

    expect(await recordAppInstallation('e'.repeat(64), 42)).toBe('a'.repeat(64));
    expect(await recordAppInstallation('e'.repeat(64), 43)).toBeNull();

    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/installation_id is null/);
    expect(sql).toMatch(/consumed_at is null/);
    expect(sql).toMatch(/expires_at > now\(\)/);
    expect(params).toEqual([sha256('e'.repeat(64)), 42, sha256('a'.repeat(64))]);
  });

  it('lets only the starting account consume the install, once', async () => {
    mocks.query.mockResolvedValueOnce([{ installation_id: '42' }]);

    expect(await consumeAppInstall('user-1', 'b'.repeat(64))).toBe(42);

    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/set consumed_at = now\(\)/);
    expect(sql).toMatch(/user_id = \$2/);
    expect(params).toEqual([sha256('b'.repeat(64)), 'user-1']);
    expect(await consumeAppInstall('user-2', 'b'.repeat(64))).toBeNull();
  });

  it('builds the app return link with only the values present', () => {
    expect(appInstallReturnUrl({ state: 's', code: null, error: 'denied' }).toString()).toBe(
      'agiworkforce://github/installed?state=s&error=denied',
    );
  });
});
