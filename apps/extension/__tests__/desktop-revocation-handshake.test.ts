import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NATIVE_BROWSER_POLL_MESSAGE, NATIVE_BROWSER_UNPAIR_MESSAGE } from '@agiworkforce/types';

const harness = vi.hoisted(() => {
  const SESSION_SECRET = '5a'.repeat(32);
  const localStore: Record<string, unknown> = {};
  const listeners = { native: [] as Array<(message: unknown) => void> };
  const posted: string[] = [];
  const unpairAnswer = { success: true };

  const event = () => ({
    addListener: vi.fn(),
    removeListener: vi.fn(),
    hasListener: vi.fn(() => false),
  });

  const readStore = (keys: unknown): Promise<Record<string, unknown>> => {
    const requested =
      keys === undefined || keys === null
        ? Object.keys(localStore)
        : typeof keys === 'string'
          ? [keys]
          : Array.isArray(keys)
            ? (keys as string[])
            : Object.keys(keys as Record<string, unknown>);
    const out: Record<string, unknown> = {};
    for (const key of requested) if (key in localStore) out[key] = localStore[key];
    return Promise.resolve(out);
  };
  const area = (store: Record<string, unknown>) => ({
    get: vi.fn((keys?: unknown) => (store === localStore ? readStore(keys) : Promise.resolve({}))),
    set: vi.fn((items: Record<string, unknown>) => {
      Object.assign(store, items);
      return Promise.resolve();
    }),
    remove: vi.fn((keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete store[key];
      return Promise.resolve();
    }),
    clear: vi.fn(() => Promise.resolve()),
  });

  const sign = (id: string, body: Record<string, unknown>) => {
    const timestamp = Date.now();
    const mac = createHmac('sha256', Buffer.from(SESSION_SECRET, 'hex'))
      .update(`${id}|${timestamp}|${JSON.stringify(body)}`)
      .digest('hex');
    return { ...body, id, timestamp, mac };
  };
  const reply = (message: Record<string, unknown>): void => {
    setTimeout(() => {
      for (const listener of [...listeners.native]) listener(message);
    }, 0);
  };

  const port = {
    name: 'com.agiworkforce.browser',
    onMessage: {
      addListener: vi.fn((listener: (message: unknown) => void) => listeners.native.push(listener)),
      removeListener: vi.fn(),
      hasListener: vi.fn(() => false),
    },
    onDisconnect: { addListener: vi.fn(), removeListener: vi.fn() },
    disconnect: vi.fn(),
    postMessage: vi.fn((envelope: { id: string; message: Record<string, unknown> }) => {
      const { id, message } = envelope;
      posted.push(String(message['type']));
      switch (message['type']) {
        case 'connect':
          reply({ ...sign(id, { success: true }), session_secret: SESSION_SECRET });
          return;
        case 'desktop_browser_unpair':
          reply(sign(id, { ...unpairAnswer }));
          return;
        default:
          reply(sign(id, { success: true }));
      }
    }),
  };

  const chromeMock = {
    runtime: {
      id: 'agi-desktop-revocation-test',
      lastError: null as { message: string } | null,
      getURL: (path: string) => `chrome-extension://agi-desktop-revocation-test${path}`,
      getManifest: () => ({ version: '0.0.0-test' }),
      getPlatformInfo: vi.fn(() => Promise.resolve({ os: 'mac' })),
      onMessage: event(),
      onConnect: event(),
      onInstalled: event(),
      onStartup: event(),
      onSuspend: event(),
      onSuspendCanceled: event(),
      sendMessage: vi.fn(() => Promise.resolve()),
      connectNative: vi.fn(() => port),
    },
    storage: {
      local: area(localStore),
      sync: area({}),
      session: area({}),
      onChanged: event(),
    },
    tabs: {
      get: vi.fn(() => Promise.reject(new Error('No tab with id'))),
      query: vi.fn(() => Promise.resolve([])),
      sendMessage: vi.fn(() => Promise.resolve({ success: true })),
      update: vi.fn(() => Promise.resolve()),
      onRemoved: event(),
      onActivated: event(),
      onUpdated: event(),
    },
    windows: {
      get: vi.fn(() => Promise.resolve({ id: 1 })),
      getLastFocused: vi.fn(() => Promise.resolve({ id: 1 })),
      onFocusChanged: event(),
    },
    debugger: {
      attach: vi.fn(),
      detach: vi.fn(),
      sendCommand: vi.fn(),
      onDetach: event(),
      onEvent: event(),
    },
    alarms: {
      create: vi.fn((_name: string, _info: unknown, callback?: () => void) => callback?.()),
      clear: vi.fn(() => Promise.resolve(true)),
      getAll: vi.fn(() => Promise.resolve([])),
      onAlarm: event(),
    },
    notifications: {
      create: vi.fn(),
      clear: vi.fn(),
      onClicked: event(),
      onButtonClicked: event(),
    },
    contextMenus: {
      create: vi.fn(),
      removeAll: vi.fn((callback?: () => void) => callback?.()),
      onClicked: event(),
    },
    sidePanel: {
      setPanelBehavior: vi.fn(() => Promise.resolve()),
      open: vi.fn(() => Promise.resolve()),
    },
    commands: { onCommand: event() },
    action: {
      onClicked: event(),
      setBadgeText: vi.fn(),
      setBadgeBackgroundColor: vi.fn(),
      setTitle: vi.fn(),
    },
    scripting: { executeScript: vi.fn(() => Promise.resolve([])) },
    permissions: {
      contains: vi.fn(() => Promise.resolve(true)),
      request: vi.fn(() => Promise.resolve(true)),
    },
    i18n: { getMessage: (key: string) => key, getUILanguage: () => 'en' },
  };

  Object.assign(globalThis, {
    chrome: chromeMock,
    fetch: vi.fn(() => Promise.reject(new Error('offline in tests'))),
  });

  return { localStore, posted, unpairAnswer, port };
});

const REVOKED_TOKEN = 'd'.repeat(64);

async function settled(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200 && !predicate(); attempt += 1)
    await new Promise((resolve) => setTimeout(resolve, 5));
}

describe('reconnecting while Desktop is still owed an unpair', () => {
  beforeEach(() => {
    vi.resetModules();
    harness.posted.length = 0;
    harness.port.disconnect.mockClear();
    harness.localStore['connectedToDesktop'] = true;
    harness.localStore['agi_pending_desktop_revocation'] = {
      id: 'revocation-1',
      token: REVOKED_TOKEN,
    };
  });

  it('removes the pairing from Desktop before any browser command is polled', async () => {
    harness.unpairAnswer.success = true;
    await import('../src/background');
    await settled(() => harness.localStore['agi_pending_desktop_revocation'] === undefined);

    expect(harness.posted).toContain(NATIVE_BROWSER_UNPAIR_MESSAGE);
    expect(harness.posted).not.toContain(NATIVE_BROWSER_POLL_MESSAGE);
    expect(harness.localStore['agi_pending_desktop_revocation']).toBeUndefined();
    expect(harness.localStore['connectedToDesktop']).toBe(false);
    expect(harness.port.disconnect).toHaveBeenCalled();
  });

  it('keeps commands blocked and the revocation owed when Desktop does not acknowledge', async () => {
    harness.unpairAnswer.success = false;
    await import('../src/background');
    await settled(() => harness.port.disconnect.mock.calls.length > 0);

    expect(harness.posted).toContain(NATIVE_BROWSER_UNPAIR_MESSAGE);
    expect(harness.posted).not.toContain(NATIVE_BROWSER_POLL_MESSAGE);
    expect(harness.localStore['agi_pending_desktop_revocation']).toEqual({
      id: 'revocation-1',
      token: REVOKED_TOKEN,
    });
  });
});
