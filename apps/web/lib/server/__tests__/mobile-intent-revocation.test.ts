import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRevokeEvery, mockRevokeTokens } = vi.hoisted(() => ({
  mockRevokeEvery: vi.fn(),
  mockRevokeTokens: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/mobile-intent-tokens', () => ({
  revokeEveryMobileIntentToken: (...args: unknown[]) => mockRevokeEvery(...args),
  revokeMobileIntentTokens: (...args: unknown[]) => mockRevokeTokens(...args),
}));

import { revokeEveryOtherSession } from '../session-revocation';
import { revokeEveryDeviceRefreshCredential } from '../refresh-token-family';

const WEB_ROOT = join(__dirname, '..', '..', '..');
const SWEEP = /\.listUserSessions\(|revokeEveryDeviceRefreshCredential\(|setPassword\(/;
const REVOKES_INTENT =
  /revokeEveryOtherSession\(|revokeEveryDeviceRefreshCredential\(|revokeEveryMobileIntentToken\(|revokeMobileIntentTokens\(/;
const SINGLE_SESSION_MODULES = new Set(['lib/auth/session-age.ts']);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('Ask from Siri tokens end with the sessions they stand beside', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('the session sweep revokes every intent token first', async () => {
    const identity = {
      listUserSessions: vi.fn().mockResolvedValue({ sessions: [], totalCount: 0 }),
      revokeSession: vi.fn(),
    };
    await revokeEveryOtherSession(identity as never, 'user-1', null);
    expect(mockRevokeEvery).toHaveBeenCalledWith('user-1');
  });

  it('the refresh-credential sweep revokes every intent token', async () => {
    const db = { query: vi.fn().mockResolvedValue([]) };
    await revokeEveryDeviceRefreshCredential(db as never, 'user-1');
    expect(mockRevokeTokens).toHaveBeenCalledWith(db, 'user-1', null);
  });

  it('every module that sweeps sessions, refresh credentials or the password also revokes intent tokens', () => {
    const missing = [...sourceFiles(join(WEB_ROOT, 'lib')), ...sourceFiles(join(WEB_ROOT, 'app'))]
      .map((path) => ({ path: relative(WEB_ROOT, path), text: readFileSync(path, 'utf8') }))
      .filter(({ path }) => !SINGLE_SESSION_MODULES.has(path))
      .filter(({ path }) => !path.endsWith('refresh-token-family.ts'))
      .filter(({ path }) => !path.endsWith('session-revocation.ts'))
      .filter(({ text }) => SWEEP.test(text) && !REVOKES_INTENT.test(text))
      .map(({ path }) => path);
    expect(missing).toEqual([]);
  });
});
