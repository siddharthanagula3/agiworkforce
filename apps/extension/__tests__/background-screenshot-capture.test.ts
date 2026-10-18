import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => {
  const EXTENSION_ID = 'agi-screenshot-test';
  const SITE = 'https://site-a.example';
  const WINDOW_ID = 7;
  const SENDER_TAB_ID = 42;
  const OTHER_TAB_ID = 99;

  const localStore: Record<string, unknown> = {
    agi_site_allowlist: [SITE],
    agi_cu_browser_control_consent: [SITE],
  };
  const messageListeners: Array<
    (message: unknown, sender: unknown, sendResponse: (response?: unknown) => void) => unknown
  > = [];
  const tabs = new Map<number, { id: number; windowId: number; url: string; active: boolean }>();
  const activeAfterCapture: { tabId: number | null } = { tabId: null };

  const activate = (tabId: number): void => {
    for (const tab of tabs.values()) {
      if (tab.windowId === tabs.get(tabId)?.windowId) tab.active = tab.id === tabId;
    }
  };

  const event = () => ({
    addListener: vi.fn(),
    removeListener: vi.fn(),
    hasListener: vi.fn(() => false),
  });

  const area = (store: Record<string, unknown>) => ({
    get: vi.fn((keys?: unknown) => {
      const requested =
        typeof keys === 'string' ? [keys] : Array.isArray(keys) ? (keys as string[]) : [];
      const out: Record<string, unknown> =
        keys !== null && typeof keys === 'object' && !Array.isArray(keys)
          ? { ...(keys as Record<string, unknown>) }
          : {};
      for (const key of keys === undefined || keys === null ? Object.keys(store) : requested) {
        if (key in store) out[key] = store[key];
      }
      return Promise.resolve(out);
    }),
    set: vi.fn((items: Record<string, unknown>) => {
      Object.assign(store, items);
      return Promise.resolve();
    }),
    remove: vi.fn(() => Promise.resolve()),
    clear: vi.fn(() => Promise.resolve()),
  });

  const captureVisibleTab = vi.fn((windowId: number) => {
    const visible = [...tabs.values()].find((tab) => tab.windowId === windowId && tab.active);
    if (activeAfterCapture.tabId !== null) activate(activeAfterCapture.tabId);
    return Promise.resolve(`data:image/png;base64,pixels-of-${visible?.id}`);
  });

  (globalThis as Record<string, unknown>).chrome = {
    runtime: {
      id: EXTENSION_ID,
      lastError: null,
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
      onSuspendCanceled: event(),
      sendMessage: vi.fn(() => Promise.resolve()),
      connectNative: vi.fn(),
    },
    storage: {
      local: area(localStore),
      sync: area({}),
      session: area({}),
      onChanged: event(),
    },
    tabs: {
      get: vi.fn((tabId: number) => {
        const tab = tabs.get(tabId);
        return tab ? Promise.resolve({ ...tab }) : Promise.reject(new Error('no such tab'));
      }),
      query: vi.fn((filter: { active?: boolean; windowId?: number }) =>
        Promise.resolve(
          [...tabs.values()]
            .filter(
              (tab) =>
                (filter.active === undefined || tab.active === filter.active) &&
                (filter.windowId === undefined || tab.windowId === filter.windowId),
            )
            .map((tab) => ({ ...tab })),
        ),
      ),
      captureVisibleTab,
      sendMessage: vi.fn(() => Promise.resolve()),
      onRemoved: event(),
      onUpdated: event(),
      onActivated: event(),
    },
    windows: { get: vi.fn(() => Promise.resolve({ id: WINDOW_ID })), onFocusChanged: event() },
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
    debugger: {
      attach: vi.fn(),
      detach: vi.fn(),
      sendCommand: vi.fn(),
      onDetach: event(),
      onEvent: event(),
    },
    permissions: {
      contains: vi.fn(() => Promise.resolve(true)),
      request: vi.fn(() => Promise.resolve(true)),
    },
    i18n: { getMessage: (key: string) => key },
  };
  (globalThis as Record<string, unknown>).fetch = vi.fn(() =>
    Promise.reject(new Error('offline in tests')),
  );

  return {
    EXTENSION_ID,
    SITE,
    WINDOW_ID,
    SENDER_TAB_ID,
    OTHER_TAB_ID,
    messageListeners,
    tabs,
    activate,
    activeAfterCapture,
    captureVisibleTab,
  };
});

const { EXTENSION_ID, SITE, WINDOW_ID, SENDER_TAB_ID, OTHER_TAB_ID } = harness;

function dispatch(message: Record<string, unknown>, sender: Record<string, unknown>) {
  const listener = harness.messageListeners[0];
  if (!listener) throw new Error('background did not register a runtime message listener');
  return new Promise<Record<string, unknown>>((resolve) => {
    listener(message, sender, (response) => resolve((response ?? {}) as Record<string, unknown>));
  });
}

function fromPage(): Promise<Record<string, unknown>> {
  const tab = harness.tabs.get(SENDER_TAB_ID);
  return dispatch(
    { type: 'CAPTURE_SCREENSHOT', format: 'png', quality: 80 },
    { id: EXTENSION_ID, url: tab?.url, origin: SITE, frameId: 0, tab: { ...tab, active: true } },
  );
}

function fromSidePanel(message: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  return dispatch(
    { type: 'CAPTURE_SCREENSHOT', format: 'png', quality: 90, ...message },
    {
      id: EXTENSION_ID,
      url: `chrome-extension://${EXTENSION_ID}/side_panel.html`,
      origin: `chrome-extension://${EXTENSION_ID}`,
    },
  );
}

describe('CAPTURE_SCREENSHOT names the tab it captured', () => {
  beforeAll(async () => {
    await import('../src/background');
    await new Promise((resolve) => setTimeout(resolve, 0));
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.setSystemTime(Date.now() + 120_000);
    harness.tabs.clear();
    harness.tabs.set(SENDER_TAB_ID, {
      id: SENDER_TAB_ID,
      windowId: WINDOW_ID,
      url: `${SITE}/report`,
      active: true,
    });
    harness.tabs.set(OTHER_TAB_ID, {
      id: OTHER_TAB_ID,
      windowId: WINDOW_ID,
      url: 'https://other.example/inbox',
      active: false,
    });
    harness.activeAfterCapture.tabId = null;
    harness.captureVisibleTab.mockClear();
  });

  it('captures and labels the page that asked while it is showing', async () => {
    const response = await fromPage();

    expect(response['success'], String(response['error'])).toBe(true);
    expect(response['tabId']).toBe(SENDER_TAB_ID);
    expect(response['data']).toBe(`data:image/png;base64,pixels-of-${SENDER_TAB_ID}`);
  });

  it('refuses rather than label another tab with the page that asked', async () => {
    harness.activate(OTHER_TAB_ID);

    const response = await fromPage();

    expect(response['success']).toBe(false);
    expect(response['error']).toBe(
      'The tab is not the one showing in its window, so it cannot be captured.',
    );
    expect(response['data']).toBeUndefined();
    expect(harness.captureVisibleTab).not.toHaveBeenCalled();
  });

  it('refuses a named tab that is not the one showing in its window', async () => {
    harness.activate(OTHER_TAB_ID);

    const response = await fromSidePanel({ tabId: SENDER_TAB_ID });

    expect(response['success']).toBe(false);
    expect(response['error']).toBe(
      'The tab is not the one showing in its window, so it cannot be captured.',
    );
    expect(harness.captureVisibleTab).not.toHaveBeenCalled();
  });

  it('labels a capture from the side panel with the tab that was showing', async () => {
    harness.activate(OTHER_TAB_ID);

    const response = await fromSidePanel();

    expect(response['success'], String(response['error'])).toBe(true);
    expect(response['tabId']).toBe(OTHER_TAB_ID);
    expect(response['data']).toBe(`data:image/png;base64,pixels-of-${OTHER_TAB_ID}`);
  });

  it('withholds a capture when the tab changed while it was taken', async () => {
    harness.activeAfterCapture.tabId = OTHER_TAB_ID;

    const response = await fromPage();

    expect(response['success']).toBe(false);
    expect(response['error']).toBe('The tab changed while the screenshot was taken. Try again.');
    expect(response['data']).toBeUndefined();
  });

  it('reports a capture Chrome refused instead of an image', async () => {
    harness.captureVisibleTab.mockRejectedValueOnce(
      new Error('Either the <all_urls> or activeTab permission is required.'),
    );

    const response = await fromPage();

    expect(response['success']).toBe(false);
    expect(response['error']).toContain('activeTab permission');
  });
});
