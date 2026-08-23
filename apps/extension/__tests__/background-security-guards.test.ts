import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

interface CapturedAgentLoopOptions {
  signal: AbortSignal;
  assertOwnership: () => Promise<void>;
  resolveOwnedCredential: () => Promise<string>;
  onActionStateChange: (active: boolean) => Promise<void>;
}

const harness = vi.hoisted(() => {
  const EXTENSION_ID = 'agi-background-guard-test';
  const RUN_TAB_ID = 41;
  const RUN_WINDOW_ID = 7;
  const SITE_A = 'https://site-a.example';
  const SITE_B = 'https://site-b.example';
  const SITE_ALLOWLIST_KEY = 'agi_site_allowlist';
  const CONSENT_KEY = 'agi_cu_browser_control_consent';

  const localStore: Record<string, unknown> = {
    agi_dev_bearer_token: 'background-guard-test-token',
  };
  const unreadableKeys = new Set<string>();
  const messageListeners: Array<
    (message: unknown, sender: unknown, sendResponse: (response?: unknown) => void) => unknown
  > = [];
  const nativeListeners: Array<(message: unknown) => void> = [];
  const storageListeners: Array<(changes: Record<string, unknown>, area: string) => void> = [];
  const captured: { options: CapturedAgentLoopOptions | null } = { options: null };
  const tab = { id: RUN_TAB_ID, url: `${SITE_A}/start`, windowId: RUN_WINDOW_ID };

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
    if (requested.some((key) => unreadableKeys.has(key))) {
      return Promise.reject(new Error('storage unavailable'));
    }
    const out: Record<string, unknown> =
      keys !== null && typeof keys === 'object' && !Array.isArray(keys)
        ? { ...(keys as Record<string, unknown>) }
        : {};
    for (const key of requested) {
      if (key in localStore) out[key] = localStore[key];
    }
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

  const debuggerMock = {
    attach: vi.fn((_target: unknown, _version: unknown, callback?: () => void) => callback?.()),
    detach: vi.fn((_target: unknown, callback?: () => void) => callback?.()),
    sendCommand: vi.fn(
      (_target: unknown, _method: string, _params: unknown, callback?: (result: unknown) => void) =>
        callback?.({}),
    ),
    onDetach: event(),
  };

  const chromeMock = {
    runtime: {
      id: EXTENSION_ID,
      lastError: null as { message: string } | null,
      getURL: (path: string) => `chrome-extension://${EXTENSION_ID}${path}`,
      getManifest: () => ({ version: '0.0.0-test' }),
      onMessage: {
        addListener: vi.fn((listener: (typeof messageListeners)[number]) => {
          messageListeners.push(listener);
        }),
        removeListener: vi.fn(),
      },
      onConnect: event(),
      onInstalled: event(),
      onStartup: event(),
      onSuspend: event(),
      sendMessage: vi.fn(() => Promise.resolve()),
      connectNative: vi.fn(() => ({
        name: 'com.agiworkforce.browser',
        onMessage: {
          addListener: vi.fn((listener: (message: unknown) => void) => {
            nativeListeners.push(listener);
          }),
          removeListener: vi.fn(),
        },
        onDisconnect: { addListener: vi.fn(), removeListener: vi.fn() },
        postMessage: vi.fn(),
        disconnect: vi.fn(),
      })),
    },
    storage: {
      local: area(localStore),
      sync: area({}),
      session: area({}),
      onChanged: {
        addListener: vi.fn((listener: (typeof storageListeners)[number]) => {
          storageListeners.push(listener);
        }),
        removeListener: vi.fn(),
      },
    },
    tabs: {
      get: vi.fn((tabId: number) =>
        tabId === tab.id ? Promise.resolve({ ...tab }) : Promise.reject(new Error('no such tab')),
      ),
      query: vi.fn(() => Promise.resolve([{ ...tab }])),
      sendMessage: vi.fn(() => Promise.resolve()),
      onRemoved: event(),
      onUpdated: event(),
      onActivated: event(),
    },
    windows: { get: vi.fn(() => Promise.resolve({ id: RUN_WINDOW_ID })), onFocusChanged: event() },
    alarms: {
      create: vi.fn((_name: string, _info: unknown, callback?: () => void) => callback?.()),
      clear: vi.fn(() => Promise.resolve(true)),
      getAll: vi.fn(() => Promise.resolve([])),
      onAlarm: event(),
    },
    notifications: { create: vi.fn(), onClicked: event(), onButtonClicked: event() },
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
    action: { setBadgeText: vi.fn(), setBadgeBackgroundColor: vi.fn(), setTitle: vi.fn() },
    scripting: { executeScript: vi.fn(() => Promise.resolve([])) },
    debugger: debuggerMock,
    permissions: {
      contains: vi.fn(() => Promise.resolve(true)),
      request: vi.fn(() => Promise.resolve(true)),
    },
    i18n: { getMessage: (key: string) => key },
  };

  (globalThis as Record<string, unknown>).chrome = chromeMock;
  (globalThis as Record<string, unknown>).fetch = vi.fn(() =>
    Promise.reject(new Error('offline in tests')),
  );

  const runAgentLoop = vi.fn((_goal: string, _tabId: number, options: CapturedAgentLoopOptions) => {
    captured.options = options;
    return new Promise<never>(() => {});
  });

  return {
    EXTENSION_ID,
    RUN_TAB_ID,
    SITE_A,
    SITE_B,
    SITE_ALLOWLIST_KEY,
    CONSENT_KEY,
    localStore,
    unreadableKeys,
    messageListeners,
    nativeListeners,
    storageListeners,
    captured,
    debuggerMock,
    tab,
    runAgentLoop,
  };
});

vi.mock('../src/features/computer-use/agentLoop', () => ({
  runAgentLoop: harness.runAgentLoop,
}));

import { assertDestinationAllowlisted, navigate } from '../src/features/computer-use/cdpDriver';

const { EXTENSION_ID, RUN_TAB_ID, SITE_A, SITE_B, SITE_ALLOWLIST_KEY, CONSENT_KEY } = harness;

function putStorage(key: string, value: unknown): void {
  harness.localStore[key] = value;
  for (const listener of harness.storageListeners) {
    listener({ [key]: { newValue: value } }, 'local');
  }
}

function dispatch(message: Record<string, unknown>): Promise<Record<string, unknown>> {
  const listener = harness.messageListeners[0];
  if (!listener) throw new Error('background did not register a runtime message listener');
  return new Promise((resolve) => {
    listener(
      message,
      {
        id: EXTENSION_ID,
        url: `chrome-extension://${EXTENSION_ID}/sidepanel.html`,
        origin: `chrome-extension://${EXTENSION_ID}`,
      },
      (response) => resolve((response ?? {}) as Record<string, unknown>),
    );
  });
}

async function startRun(runId: string): Promise<CapturedAgentLoopOptions> {
  harness.captured.options = null;
  const response = await dispatch({
    type: 'AGI_START_COMPUTER_USE',
    goal: 'complete the application',
    tabId: RUN_TAB_ID,
    runId,
  });
  expect(response['success'], String(response['error'])).toBe(true);
  const options = harness.captured.options;
  if (!options) throw new Error('runAgentLoop was never reached');
  return options;
}

function pageNavigations(): string[] {
  return harness.debuggerMock.sendCommand.mock.calls
    .filter((call) => call[1] === 'Page.navigate')
    .map((call) => String((call[2] as { url?: unknown } | undefined)?.url));
}

describe('background service worker security guards', () => {
  beforeAll(async () => {
    harness.localStore[SITE_ALLOWLIST_KEY] = [SITE_A, SITE_B];
    harness.localStore[CONSENT_KEY] = [SITE_A];
    await import('../src/background');
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  beforeEach(() => {
    harness.unreadableKeys.clear();
    harness.debuggerMock.sendCommand.mockClear();
    harness.tab.url = `${SITE_A}/start`;
    putStorage(SITE_ALLOWLIST_KEY, [SITE_A, SITE_B]);
    putStorage(CONSENT_KEY, [SITE_A]);
  });

  describe('ongoing CDP control is re-authorized against the browser-control grant', () => {
    it('cancels the run when the debugged tab moves to an allowlisted but never CDP-consented origin', async () => {
      const options = await startRun('cu_run_cross_origin');

      await options.onActionStateChange(true);
      harness.tab.url = `${SITE_B}/inbox`;

      await expect(options.assertOwnership()).rejects.toThrow(/tab intent changed/);
      expect(options.signal.aborted).toBe(true);
    });

    it('keeps running across an origin move once that origin carries the grant', async () => {
      putStorage(CONSENT_KEY, [SITE_A, SITE_B]);
      const options = await startRun('cu_run_cross_origin_granted');

      await options.onActionStateChange(true);
      harness.tab.url = `${SITE_B}/inbox`;

      await expect(options.assertOwnership()).resolves.toBeUndefined();
      expect(options.signal.aborted).toBe(false);
    });

    it('cancels the run when the grant for its own origin is revoked mid-run', async () => {
      const options = await startRun('cu_run_revoked');

      putStorage(CONSENT_KEY, []);

      expect(options.signal.aborted).toBe(true);
      await expect(options.assertOwnership()).rejects.toThrow(/tab intent changed/);
    });

    it('fails closed when the browser-control record cannot be read mid-run', async () => {
      const options = await startRun('cu_run_unreadable_consent');

      harness.unreadableKeys.add(CONSENT_KEY);

      await expect(options.assertOwnership()).rejects.toThrow(/tab intent changed/);
      expect(options.signal.aborted).toBe(true);
    });

    it('refuses to start a run on an allowlisted origin that has no grant', async () => {
      putStorage(CONSENT_KEY, []);

      const response = await dispatch({
        type: 'AGI_START_COMPUTER_USE',
        goal: 'complete the application',
        tabId: RUN_TAB_ID,
        runId: 'cu_run_unconsented_start',
      });

      expect(response['success']).toBe(false);
      expect(String(response['error'])).toMatch(/full Chrome DevTools Protocol control/);
    });
  });

  describe('cdpDriver navigation across an origin boundary', () => {
    it('refuses to move the tab to a site-allowlisted but never CDP-consented origin', async () => {
      await expect(navigate(RUN_TAB_ID, `${SITE_B}/inbox`)).rejects.toThrow(
        /full Chrome DevTools Protocol control/,
      );
      expect(pageNavigations()).toEqual([]);
    });

    it('moves the tab to another origin once that origin carries the grant', async () => {
      putStorage(CONSENT_KEY, [SITE_A, SITE_B]);

      await expect(navigate(RUN_TAB_ID, `${SITE_B}/inbox`)).resolves.toBeUndefined();
      expect(pageNavigations()).toEqual([`${SITE_B}/inbox`]);
    });

    it('allows a same-origin move, which crosses no consent boundary', async () => {
      await expect(navigate(RUN_TAB_ID, `${SITE_A}/jobs`)).resolves.toBeUndefined();
      expect(pageNavigations()).toEqual([`${SITE_A}/jobs`]);
    });

    it('fails closed when the browser-control record cannot be read', async () => {
      putStorage(CONSENT_KEY, [SITE_A, SITE_B]);
      harness.unreadableKeys.add(CONSENT_KEY);

      await expect(navigate(RUN_TAB_ID, `${SITE_B}/inbox`)).rejects.toThrow(
        /full Chrome DevTools Protocol control/,
      );
      expect(pageNavigations()).toEqual([]);
    });

    it('still rejects an off-allowlist destination before consent is consulted', async () => {
      await expect(navigate(RUN_TAB_ID, 'https://evil.example/steal')).rejects.toThrow(
        /not on your AGI site allowlist/,
      );
      await expect(assertDestinationAllowlisted(`${SITE_B}/inbox`)).resolves.toBeUndefined();
    });
  });

  describe('native messaging handshake logging', () => {
    it('never writes the session HMAC key to the console', () => {
      const sessionSecret = 'a1b2c3d4'.repeat(8);
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const listener = harness.nativeListeners[0];
      if (!listener) throw new Error('background never attached a native message listener');

      listener({
        id: 'req-connect-1',
        type: 'connect',
        success: true,
        session_secret: sessionSecret,
      });

      const logged = debugSpy.mock.calls.map((call) => JSON.stringify(call)).join('\n');
      expect(debugSpy).toHaveBeenCalled();
      expect(logged).not.toContain(sessionSecret);
      expect(logged).toContain('Received native message');
      debugSpy.mockRestore();
    });
  });
});
