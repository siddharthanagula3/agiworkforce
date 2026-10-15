import { createHmac } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BROWSER_COMMAND_PROTOCOL_VERSION,
  NATIVE_BROWSER_COMMAND_WATCH_MESSAGE,
  NATIVE_BROWSER_POLL_MESSAGE,
  NATIVE_BROWSER_RESULT_MESSAGE,
  type BrowserCommandResult,
} from '@agiworkforce/types';

interface FakeTab {
  id: number;
  windowId: number;
  active: boolean;
  url: string;
  title: string;
  text: string;
  status: 'loading' | 'complete';
  loaderId: string;
  history: { currentIndex: number; entries: Array<{ id: number; url: string }> };
}

const harness = vi.hoisted(() => {
  const EXTENSION_ID = 'agi-paired-browser-lease-test';
  const SITE = 'https://site-a.example';
  const SESSION_SECRET = '5a'.repeat(32);
  const WINDOW_ID = 3;
  const FRONT_TAB_ID = 7;
  const BACKGROUND_TAB_ID = 9;

  const localStore: Record<string, unknown> = {};
  const tabs = new Map<number, FakeTab>();
  const listeners = {
    native: [] as Array<(message: unknown) => void>,
    updated: [] as Array<(tabId: number, change: Record<string, unknown>, tab: unknown) => void>,
  };
  const host = {
    heldPoll: null as string | null,
    queued: [] as unknown[],
    waiters: [] as Array<(result: BrowserCommandResult) => void>,
  };
  const debuggerCalls: Array<{ tabId: number | undefined; method: string; params: unknown }> = [];
  const attachedTabs: number[] = [];

  const event = () => ({
    addListener: vi.fn(),
    removeListener: vi.fn(),
    hasListener: vi.fn(() => false),
  });
  const listening = <T>(bucket: T[]) => ({
    addListener: vi.fn((listener: T) => bucket.push(listener)),
    removeListener: vi.fn((listener: T) => {
      const index = bucket.indexOf(listener);
      if (index >= 0) bucket.splice(index, 1);
    }),
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
    const out: Record<string, unknown> =
      keys !== null && typeof keys === 'object' && !Array.isArray(keys)
        ? { ...(keys as Record<string, unknown>) }
        : {};
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

  const snapshot = (tab: FakeTab) => ({
    id: tab.id,
    windowId: tab.windowId,
    active: tab.active,
    url: tab.url,
    title: tab.title,
    status: tab.status,
    incognito: false,
    index: tab.id,
  });

  const fireUpdated = (tab: FakeTab, change: Record<string, unknown>): void => {
    for (const listener of [...listeners.updated]) listener(tab.id, change, snapshot(tab));
  };

  const traverse = (tab: FakeTab, entryId: number): void => {
    const index = tab.history.entries.findIndex((entry) => entry.id === entryId);
    if (index < 0) throw new Error('no such history entry');
    tab.history.currentIndex = index;
    tab.url = tab.history.entries[index]!.url;
    tab.status = 'loading';
    tab.loaderId = `loader-${tab.id}-${entryId}`;
    fireUpdated(tab, { status: 'loading', url: tab.url });
    setTimeout(() => {
      tab.status = 'complete';
      fireUpdated(tab, { status: 'complete' });
    }, 5);
  };

  const debuggerCommand = (tabId: number, method: string, params: Record<string, unknown>) => {
    const tab = tabs.get(tabId);
    if (!tab) throw new Error('no such tab');
    switch (method) {
      case 'Page.getFrameTree':
        return {
          frameTree: { frame: { id: `frame-${tabId}`, loaderId: tab.loaderId, url: tab.url } },
        };
      case 'Page.getNavigationHistory':
        return { currentIndex: tab.history.currentIndex, entries: tab.history.entries };
      case 'Page.navigateToHistoryEntry':
        traverse(tab, params['entryId'] as number);
        return {};
      default:
        return {};
    }
  };

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
  const answerHeldPoll = (): void => {
    if (!host.heldPoll || host.queued.length === 0) return;
    const id = host.heldPoll;
    host.heldPoll = null;
    reply(sign(id, { success: true, command: host.queued.shift() }));
  };

  const port = {
    name: 'com.agiworkforce.browser',
    onMessage: listening(listeners.native),
    onDisconnect: { addListener: vi.fn(), removeListener: vi.fn() },
    disconnect: vi.fn(),
    postMessage: vi.fn((envelope: { id: string; message: Record<string, unknown> }) => {
      const { id, message } = envelope;
      switch (message['type']) {
        case 'connect':
          reply({ ...sign(id, { success: true }), session_secret: SESSION_SECRET });
          return;
        case NATIVE_BROWSER_POLL_MESSAGE:
          host.heldPoll = id;
          answerHeldPoll();
          return;
        case NATIVE_BROWSER_COMMAND_WATCH_MESSAGE:
          if (message['wait'] !== true) reply(sign(id, { success: true, state: 'active' }));
          return;
        case NATIVE_BROWSER_RESULT_MESSAGE:
          host.waiters.shift()?.(message['result'] as BrowserCommandResult);
          reply(sign(id, { success: true }));
          return;
        default:
          reply(sign(id, { success: true }));
      }
    }),
  };

  const chromeMock = {
    runtime: {
      id: EXTENSION_ID,
      lastError: null as { message: string } | null,
      getURL: (path: string) => `chrome-extension://${EXTENSION_ID}${path}`,
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
      get: vi.fn((tabId: number) => {
        const tab = tabs.get(tabId);
        return tab ? Promise.resolve(snapshot(tab)) : Promise.reject(new Error('No tab with id'));
      }),
      query: vi.fn((query: { active?: boolean; windowId?: number }) =>
        Promise.resolve(
          [...tabs.values()]
            .filter((tab) => query.active === undefined || tab.active === query.active)
            .filter((tab) => query.windowId === undefined || tab.windowId === query.windowId)
            .map(snapshot),
        ),
      ),
      sendMessage: vi.fn((tabId: number, message: { type?: string }) => {
        const tab = tabs.get(tabId);
        if (!tab) return Promise.reject(new Error('Could not establish connection'));
        if (message.type === 'GET_PAGE_INFO')
          return Promise.resolve({ success: true, url: tab.url, title: tab.title });
        if (message.type === 'GET_TEXT') return Promise.resolve({ success: true, text: tab.text });
        return Promise.resolve({ success: true });
      }),
      goBack: vi.fn((tabId: number) => {
        const tab = tabs.get(tabId)!;
        const entry = tab.history.entries[tab.history.currentIndex - 1];
        if (!entry) return Promise.reject(new Error('Cannot find a next page in history.'));
        traverse(tab, entry.id);
        return Promise.resolve();
      }),
      goForward: vi.fn((tabId: number) => {
        const tab = tabs.get(tabId)!;
        const entry = tab.history.entries[tab.history.currentIndex + 1];
        if (!entry) return Promise.reject(new Error('Cannot find a next page in history.'));
        traverse(tab, entry.id);
        return Promise.resolve();
      }),
      update: vi.fn(() => Promise.resolve()),
      onRemoved: event(),
      onActivated: event(),
      onUpdated: listening(listeners.updated),
    },
    windows: {
      get: vi.fn(() => Promise.resolve({ id: WINDOW_ID })),
      getLastFocused: vi.fn(() => Promise.resolve({ id: WINDOW_ID })),
      onFocusChanged: event(),
    },
    debugger: {
      attach: vi.fn((target: { tabId?: number }, _version: unknown, callback?: () => void) => {
        if (target.tabId !== undefined) attachedTabs.push(target.tabId);
        callback?.();
      }),
      detach: vi.fn((_target: unknown, callback?: () => void) => callback?.()),
      sendCommand: vi.fn(
        (
          target: { tabId?: number },
          method: string,
          params: Record<string, unknown>,
          callback?: (result: unknown) => void,
        ) => {
          debuggerCalls.push({ tabId: target.tabId, method, params });
          callback?.(debuggerCommand(target.tabId!, method, params));
        },
      ),
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
    action: { setBadgeText: vi.fn(), setBadgeBackgroundColor: vi.fn(), setTitle: vi.fn() },
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

  return {
    SITE,
    WINDOW_ID,
    FRONT_TAB_ID,
    BACKGROUND_TAB_ID,
    localStore,
    tabs,
    host,
    debuggerCalls,
    attachedTabs,
    answerHeldPoll,
  };
});

const { SITE, WINDOW_ID, FRONT_TAB_ID, BACKGROUND_TAB_ID } = harness;
let commandSequence = 0;

function resetTabs(): void {
  harness.tabs.clear();
  harness.tabs.set(FRONT_TAB_ID, {
    id: FRONT_TAB_ID,
    windowId: WINDOW_ID,
    active: true,
    url: `${SITE}/two`,
    title: 'Two',
    text: 'The page in front.',
    status: 'complete',
    loaderId: 'loader-front',
    history: {
      currentIndex: 1,
      entries: [
        { id: 101, url: `${SITE}/one` },
        { id: 102, url: `${SITE}/two` },
      ],
    },
  });
  harness.tabs.set(BACKGROUND_TAB_ID, {
    id: BACKGROUND_TAB_ID,
    windowId: WINDOW_ID,
    active: false,
    url: `${SITE}/report`,
    title: 'Quarterly report',
    text: 'Revenue grew in the third quarter.',
    status: 'complete',
    loaderId: 'loader-background',
    history: { currentIndex: 0, entries: [{ id: 201, url: `${SITE}/report` }] },
  });
}

function runPaired(command: string, args: Record<string, unknown>): Promise<BrowserCommandResult> {
  commandSequence += 1;
  const result = new Promise<BrowserCommandResult>((resolve) => harness.host.waiters.push(resolve));
  harness.host.queued.push({
    version: BROWSER_COMMAND_PROTOCOL_VERSION,
    id: `paired-${commandSequence}`,
    command,
    args,
  });
  harness.answerHeldPoll();
  return result;
}

async function waitForPoll(): Promise<void> {
  for (let attempt = 0; attempt < 200 && !harness.host.heldPoll; attempt += 1)
    await new Promise((resolve) => setTimeout(resolve, 5));
  if (!harness.host.heldPoll) throw new Error('the worker never polled the desktop for work');
}

describe('paired desktop browser commands', () => {
  beforeAll(async () => {
    harness.localStore['agi_site_allowlist'] = [SITE];
    harness.localStore['agi_cu_browser_control_consent'] = [SITE];
    harness.localStore['connectedToDesktop'] = true;
    resetTabs();
    await import('../src/background');
    await waitForPoll();
  });

  beforeEach(async () => {
    resetTabs();
    harness.debuggerCalls.length = 0;
    harness.attachedTabs.length = 0;
    await waitForPoll();
  });

  it('goes back on the leased foreground tab and reports where it landed', async () => {
    const result = await runPaired('browser_history', { direction: 'back' });

    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(result.value).toMatchObject({
      direction: 'back',
      url: `${SITE}/one`,
      tabUrl: `${SITE}/one`,
    });
    expect(harness.tabs.get(FRONT_TAB_ID)?.url).toBe(`${SITE}/one`);
    expect(
      harness.debuggerCalls.filter((call) => call.method === 'Page.navigateToHistoryEntry'),
    ).toEqual([
      { tabId: FRONT_TAB_ID, method: 'Page.navigateToHistoryEntry', params: { entryId: 101 } },
    ]);
  });

  it('refuses to go back when the tab has no earlier web page', async () => {
    harness.tabs.get(FRONT_TAB_ID)!.history = {
      currentIndex: 0,
      entries: [{ id: 102, url: `${SITE}/two` }],
    };

    const result = await runPaired('browser_history', { direction: 'back' });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('This tab has no web page to go back to.');
    expect(harness.tabs.get(FRONT_TAB_ID)?.url).toBe(`${SITE}/two`);
  });

  it('reads the tab the desktop named without leasing the foreground tab', async () => {
    const result = await runPaired('browser_read_page', { tabId: BACKGROUND_TAB_ID });

    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(result.value).toMatchObject({
      url: `${SITE}/report`,
      title: 'Quarterly report',
      text: 'Revenue grew in the third quarter.',
    });
    expect(harness.attachedTabs).toEqual([]);
  });

  it('says a named tab that has closed is gone instead of reading another', async () => {
    const result = await runPaired('browser_read_page', { tabId: 404 });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('That tab is no longer open in Chrome.');
  });

  it('keeps a command that acts on the leased foreground tab', async () => {
    const result = await runPaired('browser_fill_form', {
      tabId: BACKGROUND_TAB_ID,
      fields: [{ selector: '#name', value: 'Ada' }],
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('The requested browser tab is not the foreground paired tab.');
  });
});
