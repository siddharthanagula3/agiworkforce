/**
 * Where the extension keeps a session, and where it does not.
 *
 * A shipped build holds no bearer of its own: every call asks the Clerk
 * background client for a fresh one. The only token in extension storage is the
 * development escape hatch, and a release build must not read it even when a
 * previous development profile left one behind.
 *
 * @vitest-environment jsdom
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DEV_TOKEN_KEY = 'agi_dev_bearer_token';
const SESSION_TOKEN_KEY = 'agi_clerk_session_token';

const clerk = vi.hoisted(() => ({ token: null as string | null }));

vi.mock('../src/features/cloud-bridge/clerkAuth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/features/cloud-bridge/clerkAuth')>()),
  getFreshClerkToken: () => Promise.resolve(clerk.token),
  getFreshClerkAuthContext: () =>
    Promise.resolve(
      clerk.token
        ? { token: clerk.token, owner: { accountId: 'acct', authIncarnation: 'sess' } }
        : null,
    ),
  signOutClerk: () => Promise.resolve(),
}));

const store = vi.hoisted(() => ({
  local: {} as Record<string, unknown>,
  session: {} as Record<string, unknown>,
}));

function area(bucket: Record<string, unknown>) {
  return {
    get: (keys: string | string[]) => {
      const result: Record<string, unknown> = {};
      for (const key of typeof keys === 'string' ? [keys] : keys) {
        if (key in bucket) result[key] = bucket[key];
      }
      return Promise.resolve(result);
    },
    set: (items: Record<string, unknown>) => {
      Object.assign(bucket, items);
      return Promise.resolve();
    },
    remove: (keys: string | string[]) => {
      for (const key of typeof keys === 'string' ? [keys] : keys) delete bucket[key];
      return Promise.resolve();
    },
  };
}

vi.stubGlobal('chrome', {
  runtime: {
    lastError: null,
    sendMessage: () => Promise.resolve(undefined),
    getManifest: () => ({ version: '1.2.0' }),
  },
  storage: { local: area(store.local), session: area(store.session), sync: area({}) },
});

function sourceFiles(): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (/\.(ts|js)$/u.test(entry.name) && !/\.d\.ts$/u.test(entry.name)) {
        out.push({ path: relative(APP_ROOT, full), text: readFileSync(full, 'utf8') });
      }
    }
  };
  walk(join(APP_ROOT, 'src'));
  return out;
}

beforeEach(() => {
  clerk.token = null;
  for (const key of Object.keys(store.local)) delete store.local[key];
  for (const key of Object.keys(store.session)) delete store.session[key];
  vi.resetModules();
});

describe('the session a shipped build holds', () => {
  it('reads the account session from the background client rather than from storage', async () => {
    clerk.token = 'fresh-from-clerk';
    store.local[DEV_TOKEN_KEY] = 'stale-development-token';
    const { getAuthToken } = await import('../src/features/cloud-bridge/freeTrialClient');

    await expect(getAuthToken()).resolves.toBe('fresh-from-clerk');
  });

  it('falls back to a stored token only when the account client has none', async () => {
    store.local[DEV_TOKEN_KEY] = 'development-token';
    const { getAuthToken } = await import('../src/features/cloud-bridge/freeTrialClient');

    await expect(getAuthToken()).resolves.toBe('development-token');

    clerk.token = 'fresh-from-clerk';
    await expect(getAuthToken()).resolves.toBe('fresh-from-clerk');
  });

  it('writes no session token of its own anywhere in the source', () => {
    const writers = sourceFiles().filter((source) =>
      new RegExp(`storage\\.(local|sync|session)\\.set\\([^)]*${SESSION_TOKEN_KEY}`, 'u').test(
        source.text,
      ),
    );

    expect(writers.map((source) => source.path)).toEqual([]);
  });

  it('keeps no bearer in chrome.storage.sync, which Chrome copies between machines', () => {
    for (const source of sourceFiles()) {
      expect(source.text, `${source.path} syncs a credential`).not.toMatch(
        /storage\.sync\.set\([^)]*(token|bearer|apiKey|api_key)/iu,
      );
    }
  });
});

describe('signing out', () => {
  it('removes every credential the extension can have stored', async () => {
    clerk.token = 'fresh-from-clerk';
    store.local[DEV_TOKEN_KEY] = 'development-token';
    store.session[SESSION_TOKEN_KEY] = 'session-token';
    const { clearAuthToken } = await import('../src/features/cloud-bridge/freeTrialClient');

    await clearAuthToken();

    expect(store.local[DEV_TOKEN_KEY]).toBeUndefined();
    expect(store.session[SESSION_TOKEN_KEY]).toBeUndefined();
  });

  it('tells the background which owner left, so its runs are cancelled rather than adopted', async () => {
    clerk.token = 'fresh-from-clerk';
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    (
      globalThis as unknown as { chrome: { runtime: { sendMessage: unknown } } }
    ).chrome.runtime.sendMessage = sendMessage;
    const { clearAuthToken } = await import('../src/features/cloud-bridge/freeTrialClient');

    await clearAuthToken();

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'MANAGED_CLOUD_AUTH_CHANGED',
        previousOwner: { accountId: 'acct', authIncarnation: 'sess' },
      }),
    );
  });
});
