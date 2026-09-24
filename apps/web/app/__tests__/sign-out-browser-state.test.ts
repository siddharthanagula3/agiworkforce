import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerNotificationWorker } from '@/features/notifications/lib/web-push-client';
import { cleanupAllStores, useAuthStore } from '@shared/stores/authentication-store';

const WEB_ROOT = path.join(__dirname, '..', '..');
const PUBLIC_ROOT = path.join(WEB_ROOT, 'public');
const SOURCE_DIRECTORIES = ['app', 'features', 'shared', 'lib', 'components'];
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.next', '__tests__', '__mocks__']);
const SOURCE_FILE = /\.(?:tsx?|jsx?|mjs)$/;
const TEST_FILE = /\.(?:test|spec)\.(?:tsx?|jsx?)$/;

const WORKER_REGISTRATION = /\bserviceWorker\s*\.\s*register\s*\(/;
const CACHE_STORAGE_USE =
  /\bcaches\s*\.\s*(?:open|match|matchAll|keys|delete|has)\s*\(|\bCacheStorage\b/;
const WORKER_EVENT = /\bself\s*\.\s*addEventListener\(\s*['"]([a-z]+)['"]/g;

const PUSH_ENDPOINT = 'https://push.example.test/push/signed-in-account';

function sourceFiles(directory: string, found: string[] = []): string[] {
  if (!fs.existsSync(directory)) return found;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) sourceFiles(full, found);
    else if (SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name)) found.push(full);
  }
  return found;
}

const APP_SOURCES = SOURCE_DIRECTORIES.flatMap((directory) =>
  sourceFiles(path.join(WEB_ROOT, directory)),
).map((file) => ({
  file: path.relative(WEB_ROOT, file),
  source: fs.readFileSync(file, 'utf8'),
}));

interface InstalledBrowser {
  register: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
  signOut: ReturnType<typeof vi.fn>;
  fetch: ReturnType<typeof vi.fn>;
  events: string[];
}

function installBrowser(options: { deleteFails?: boolean } = {}): InstalledBrowser {
  const events: string[] = [];
  const unsubscribe = vi.fn(async () => {
    events.push('unsubscribe');
    return true;
  });
  const subscription = { endpoint: PUSH_ENDPOINT, unsubscribe };
  const registration = {
    pushManager: { getSubscription: vi.fn(async () => subscription) },
  };
  const register = vi.fn(async () => registration);
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { register, ready: Promise.resolve(registration) },
  });
  vi.stubGlobal('PushManager', class {});
  vi.stubGlobal('Notification', { permission: 'granted' });

  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === '/api/csrf') return Response.json({ token: 'csrf', expiresIn: 3_600_000 });
    if (url === '/api/web-push' && init?.method === 'DELETE') {
      events.push('revoke');
      if (options.deleteFails) throw new TypeError('Failed to fetch');
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal('fetch', fetch);

  const signOut = vi.fn(async () => {
    events.push('sign-out');
  });
  Object.defineProperty(window, 'Clerk', { configurable: true, value: { signOut } });

  return { register, unsubscribe, signOut, fetch, events };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'serviceWorker');
  Reflect.deleteProperty(window, 'Clerk');
});

describe('service workers this app installs', () => {
  it('are registered from one place, and that place names a worker the app serves', async () => {
    const registering = APP_SOURCES.filter(({ source }) => WORKER_REGISTRATION.test(source));
    expect(registering.map(({ file }) => file)).toEqual([
      path.join('features', 'notifications', 'lib', 'web-push-client.ts'),
    ]);

    const browser = installBrowser();
    await registerNotificationWorker();
    const [workerPath] = browser.register.mock.calls[0] as [string];
    expect(fs.existsSync(path.join(PUBLIC_ROOT, workerPath))).toBe(true);
  });

  it('never intercept a request or keep a response the signed-in account fetched', async () => {
    const browser = installBrowser();
    await registerNotificationWorker();
    const [workerPath] = browser.register.mock.calls[0] as [string];
    const worker = fs.readFileSync(path.join(PUBLIC_ROOT, workerPath), 'utf8');

    const handled = [...worker.matchAll(WORKER_EVENT)].map((match) => match[1]);
    expect(handled.length).toBeGreaterThan(0);
    expect(handled).not.toContain('fetch');
    expect(worker).not.toMatch(CACHE_STORAGE_USE);
    expect(worker).not.toMatch(/\bimportScripts\s*\(|\bindexedDB\b/);
  });
});

describe('page scripts', () => {
  it('keep nothing in Cache Storage that sign-out would have to find and drop', () => {
    const offenders = APP_SOURCES.filter(({ source }) => CACHE_STORAGE_USE.test(source)).map(
      ({ file }) => file,
    );
    expect(offenders).toEqual([]);
  });
});

describe('signing out', () => {
  const STORE_MODULE_LOAD_MS = 60_000;

  beforeAll(async () => {
    await cleanupAllStores();
  }, STORE_MODULE_LOAD_MS);

  it('revokes this browser push registration before the session ends', async () => {
    const browser = installBrowser();

    await useAuthStore.getState().logout();

    const revoke = browser.fetch.mock.calls.find(
      ([url, init]) => url === '/api/web-push' && (init as RequestInit)?.method === 'DELETE',
    );
    expect(JSON.parse(String((revoke?.[1] as RequestInit).body))).toEqual({
      endpoint: PUSH_ENDPOINT,
    });
    expect(browser.unsubscribe).toHaveBeenCalledTimes(1);
    expect(browser.events).toEqual(['revoke', 'unsubscribe', 'sign-out']);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('still drops the browser subscription and ends the session when the server cannot be told', async () => {
    const browser = installBrowser({ deleteFails: true });

    await useAuthStore.getState().logout();

    expect(browser.unsubscribe).toHaveBeenCalledTimes(1);
    expect(browser.signOut).toHaveBeenCalledTimes(1);
    expect(browser.events).toEqual(['revoke', 'unsubscribe', 'sign-out']);
  });

  it('removes the app-owned tokens this browser kept for the account', async () => {
    installBrowser();
    localStorage.setItem('auth_token', 'encrypted-access');
    localStorage.setItem('refresh_token', 'encrypted-refresh');

    await useAuthStore.getState().logout();

    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
  });
});
