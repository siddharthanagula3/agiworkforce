import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NATIVE_BROWSER_POLL_MESSAGE, NATIVE_BROWSER_UNPAIR_MESSAGE } from '@agiworkforce/types';
import { NATIVE_RECONNECT_MAX_DELAY_MS } from '../src/features/native-bridge/reconnect';

type DesktopAnswer = Record<string, unknown> | null;

vi.setConfig({ testTimeout: 30_000 });

const harness = vi.hoisted(() => {
  const EXTENSION_ID = 'agi-desktop-pairing-proof-test';
  const SESSION_SECRET = '6b'.repeat(32);
  const SITE = 'https://recorded.example';
  const localStore: Record<string, unknown> = {};
  const sessionStore: Record<string, unknown> = {};
  const posted: Array<Record<string, unknown>> = [];
  const messageListeners: Array<
    (message: unknown, sender: unknown, sendResponse: (response?: unknown) => void) => unknown
  > = [];
  const tabRemovedListeners: Array<(tabId: number) => void> = [];
  const desktop = {
    answer: (_message: Record<string, unknown>): DesktopAnswer => ({ success: true }),
    disconnectWith: null as string | null,
  };
  const page = { recording: true, reachable: true };
  const ports: Array<{ disconnect: ReturnType<typeof vi.fn>; exit: () => void }> = [];

  // Every startWorker evaluates a fresh background module against these shared
  // mocks, and nothing can unload the previous one. Each case is one worker
  // generation, retired when the next case begins: a timer from a retired
  // generation never runs, and an async chain it started that is still awaiting
  // real work, such as WebCrypto, can no longer open the native host, post to a
  // port or write storage. Generations are per case, not per startWorker: vitest
  // builds its fake clock lazily from these globals, so its shouldAdvanceTime
  // interval is one of these timers and has to outlive a startWorker in the case.
  const workers = { generation: 0 };
  const { AsyncLocalStorage } = process.getBuiltinModule('node:async_hooks');
  const workerCalls = new AsyncLocalStorage<number>();
  const asLiveWorker = <T>(run: () => T): T => workerCalls.run(workers.generation, run);
  const fromRetiredWorker = (): boolean => {
    const generation = workerCalls.getStore();
    return generation !== undefined && generation !== workers.generation;
  };

  const event = () => ({
    addListener: vi.fn(),
    removeListener: vi.fn(),
    hasListener: vi.fn(() => false),
  });
  const pick = (store: Record<string, unknown>, keys: unknown): Record<string, unknown> => {
    const requested =
      keys === undefined || keys === null
        ? Object.keys(store)
        : typeof keys === 'string'
          ? [keys]
          : Array.isArray(keys)
            ? (keys as string[])
            : Object.keys(keys as Record<string, unknown>);
    const out: Record<string, unknown> = {};
    for (const key of requested) if (key in store) out[key] = structuredClone(store[key]);
    return out;
  };
  const area = (store: Record<string, unknown>) => ({
    get: vi.fn(async (keys?: unknown) => pick(store, keys)),
    set: vi.fn(async (items: Record<string, unknown>) => {
      if (fromRetiredWorker()) return;
      Object.assign(store, structuredClone(items));
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      if (fromRetiredWorker()) return;
      for (const key of Array.isArray(keys) ? keys : [keys]) delete store[key];
    }),
    clear: vi.fn(async () => undefined),
    setAccessLevel: vi.fn(async () => undefined),
  });

  const sign = (id: string, body: Record<string, unknown>) => {
    const timestamp = Date.now();
    const mac = createHmac('sha256', Buffer.from(SESSION_SECRET, 'hex'))
      .update(`${id}|${timestamp}|${JSON.stringify(body)}`)
      .digest('hex');
    return { ...body, id, timestamp, mac };
  };

  const connectNative = vi.fn(() => {
    const messageHandlers: Array<(message: unknown) => void> = [];
    const disconnectHandlers: Array<() => void> = [];
    const reply = (message: Record<string, unknown>): void => {
      setTimeout(() => {
        for (const listener of [...messageHandlers]) listener(message);
      }, 0);
    };
    const port = {
      name: 'com.agiworkforce.browser',
      onMessage: {
        addListener: vi.fn((listener: (message: unknown) => void) =>
          messageHandlers.push(listener),
        ),
        removeListener: vi.fn(),
        hasListener: vi.fn(() => false),
      },
      onDisconnect: {
        addListener: vi.fn((listener: () => void) => disconnectHandlers.push(listener)),
        removeListener: vi.fn(),
      },
      disconnect: vi.fn(),
      postMessage: vi.fn((envelope: { id: string; message: Record<string, unknown> }) => {
        if (fromRetiredWorker()) return;
        const { id, message } = envelope;
        posted.push(message);
        const answer = desktop.answer(message);
        if (answer === null) return;
        reply(
          message['type'] === 'connect'
            ? { ...sign(id, answer), session_secret: SESSION_SECRET }
            : sign(id, answer),
        );
      }),
    };
    ports.push({
      disconnect: port.disconnect,
      exit: () => {
        chromeMock.runtime.lastError = { message: 'Specified native messaging host not found.' };
        for (const listener of disconnectHandlers) listener();
        chromeMock.runtime.lastError = null;
      },
    });
    if (desktop.disconnectWith !== null) {
      const error = desktop.disconnectWith;
      setTimeout(() => {
        chromeMock.runtime.lastError = { message: error };
        for (const listener of disconnectHandlers) listener();
        chromeMock.runtime.lastError = null;
      }, 0);
    }
    return port;
  });
  const retiredPort = () => ({
    name: 'com.agiworkforce.browser',
    onMessage: event(),
    onDisconnect: event(),
    postMessage: () => undefined,
    disconnect: () => undefined,
  });

  const chromeMock = {
    runtime: {
      id: EXTENSION_ID,
      lastError: null as { message: string } | null,
      getURL: (path: string) => `chrome-extension://${EXTENSION_ID}${path}`,
      getManifest: () => ({ version: '0.0.0-test' }),
      getPlatformInfo: vi.fn(() => Promise.resolve({ os: 'mac' })),
      onMessage: {
        addListener: vi.fn((listener: (typeof messageListeners)[number]) =>
          messageListeners.push(listener),
        ),
        removeListener: vi.fn(),
        hasListener: vi.fn(() => false),
      },
      onConnect: event(),
      onInstalled: event(),
      onStartup: event(),
      onSuspend: event(),
      onSuspendCanceled: event(),
      sendMessage: vi.fn(() => Promise.resolve()),
      connectNative: () => (fromRetiredWorker() ? retiredPort() : connectNative()),
    },
    storage: {
      local: area(localStore),
      sync: area({}),
      session: area(sessionStore),
      managed: area({}),
      onChanged: event(),
    },
    tabs: {
      get: vi.fn(async (id: number) => ({ id, url: `${SITE}/form`, windowId: 1, active: true })),
      query: vi.fn(() => Promise.resolve([])),
      sendMessage: vi.fn(async (_tabId: number, message: { type?: string }) => {
        if (!page.reachable) throw new Error('Could not establish connection.');
        if (message.type === 'GET_RECORDED_ACTIONS')
          return { success: true, recording: page.recording, actions: [] };
        if (message.type === 'START_RECORDING') return { success: true, recording: true };
        return { success: true, recording: false, actions: [] };
      }),
      update: vi.fn(() => Promise.resolve()),
      onRemoved: {
        addListener: vi.fn((listener: (tabId: number) => void) =>
          tabRemovedListeners.push(listener),
        ),
        removeListener: vi.fn(),
      },
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
      get: vi.fn(() => Promise.resolve(undefined)),
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
      getAll: vi.fn(() => Promise.resolve({ origins: [] })),
      remove: vi.fn(() => Promise.resolve(true)),
    },
    i18n: { getMessage: (key: string) => key, getUILanguage: () => 'en' },
  };

  const liveSetTimeout = globalThis.setTimeout;
  const liveSetInterval = globalThis.setInterval;
  const liveClearInterval = globalThis.clearInterval;
  const ownedByLiveWorker = <Args extends unknown[]>(
    handler: (...args: Args) => void,
    onRetired: () => void = () => undefined,
  ) => {
    const generation = workers.generation;
    return (...args: Args): void => {
      if (generation === workers.generation) handler(...args);
      else onRetired();
    };
  };
  globalThis.setTimeout = ((
    handler: (...args: unknown[]) => void,
    delay?: number,
    ...args: unknown[]
  ) => liveSetTimeout(ownedByLiveWorker(handler), delay, ...args)) as unknown as typeof setTimeout;
  globalThis.setInterval = ((
    handler: (...args: unknown[]) => void,
    delay?: number,
    ...args: unknown[]
  ) => {
    const interval = liveSetInterval(
      ownedByLiveWorker(handler, () => liveClearInterval(interval)),
      delay,
      ...args,
    );
    return interval;
  }) as unknown as typeof setInterval;
  const retireWorkers = (): void => {
    workers.generation += 1;
  };

  // The worker signs and verifies every native envelope with real asynchronous
  // WebCrypto, which fake timers cannot see. Counting it lets a fake-time test
  // wait for that work instead of advancing the clock past it.
  const envelopeCrypto = { inFlight: 0 };
  const subtle = globalThis.crypto.subtle as unknown as Record<
    'importKey' | 'sign',
    (...args: unknown[]) => Promise<unknown>
  >;
  for (const method of ['importKey', 'sign'] as const) {
    const run = subtle[method].bind(globalThis.crypto.subtle);
    subtle[method] = (...args: unknown[]) => {
      envelopeCrypto.inFlight += 1;
      return run(...args).finally(() => {
        envelopeCrypto.inFlight -= 1;
      });
    };
  }

  Object.assign(globalThis, {
    chrome: chromeMock,
    fetch: vi.fn(() => Promise.reject(new Error('offline in tests'))),
  });

  return {
    EXTENSION_ID,
    SITE,
    localStore,
    sessionStore,
    posted,
    messageListeners,
    tabRemovedListeners,
    desktop,
    page,
    ports,
    connectNative,
    retireWorkers,
    asLiveWorker,
    envelopeCrypto,
  };
});

const PAIR_TOKEN = 'e'.repeat(64);
const OWED_TOKEN = 'f'.repeat(64);
const POLL_PICKUP_BUDGET_MS = 5 * 60_000;
const LONGER_THAN_ANY_RECONNECT_MS = 2 * NATIVE_RECONNECT_MAX_DELAY_MS;
const OPTIONS_SENDER = {
  id: harness.EXTENSION_ID,
  url: `chrome-extension://${harness.EXTENSION_ID}/src/options.html`,
  origin: `chrome-extension://${harness.EXTENSION_ID}`,
};
const PAGE_SENDER = {
  id: harness.EXTENSION_ID,
  url: `${harness.SITE}/form`,
  origin: harness.SITE,
  tab: { id: 9, url: `${harness.SITE}/form`, windowId: 1 },
};

async function settled(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 2_000 && !predicate(); attempt += 1)
    await new Promise((resolve) => setTimeout(resolve, 5));
}

async function envelopeCryptoSettled(): Promise<void> {
  while (harness.envelopeCrypto.inFlight > 0)
    await new Promise<void>((resolve) => setImmediate(resolve));
}

function useFakeClock(): void {
  harness.asLiveWorker(() =>
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'Date'] }),
  );
}

async function advanceFakeTime(ms: number): Promise<void> {
  await harness.asLiveWorker(() => vi.advanceTimersByTimeAsync(ms));
  await envelopeCryptoSettled();
}

async function advanceUntilCounted(count: () => number, target: number): Promise<void> {
  for (let elapsed = 0; elapsed < POLL_PICKUP_BUDGET_MS && count() < target; elapsed += 1_000)
    await advanceFakeTime(1_000);
}

function clearStore(store: Record<string, unknown>): void {
  for (const key of Object.keys(store)) delete store[key];
}

async function startWorker(): Promise<void> {
  harness.messageListeners.length = 0;
  harness.tabRemovedListeners.length = 0;
  vi.resetModules();
  await harness.asLiveWorker(() => import('../src/background'));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function dispatch(
  message: Record<string, unknown>,
  sender: Record<string, unknown> = OPTIONS_SENDER,
): Promise<Record<string, unknown>> {
  const listener = harness.messageListeners.at(-1);
  if (!listener) throw new Error('background did not register a runtime message listener');
  return new Promise((resolve) => {
    harness.asLiveWorker(() =>
      listener(message, sender, (response) => resolve((response ?? {}) as Record<string, unknown>)),
    );
  });
}

function postedTypes(): unknown[] {
  return harness.posted.map((message) => message['type']);
}

beforeEach(() => {
  harness.retireWorkers();
  clearStore(harness.localStore);
  clearStore(harness.sessionStore);
  harness.posted.length = 0;
  harness.ports.length = 0;
  harness.connectNative.mockClear();
  harness.desktop.answer = (message) =>
    message['type'] === NATIVE_BROWSER_POLL_MESSAGE ? null : { success: true };
  harness.desktop.disconnectWith = null;
  harness.page.recording = true;
  harness.page.reachable = true;
});

afterEach(async () => {
  vi.useRealTimers();
  for (const port of harness.ports) harness.asLiveWorker(port.exit);
  await new Promise((resolve) => setTimeout(resolve, 20));
});

describe('a profile proves its pairing before it runs Desktop work', () => {
  it('never opens the native host from a profile with no pairing record', async () => {
    harness.localStore['connectedToDesktop'] = true;
    await startWorker();

    const reconnect = await dispatch({ type: 'RECONNECT_NATIVE' });

    expect(reconnect['nativeConnected']).toBe(false);
    expect(harness.connectNative).not.toHaveBeenCalled();
    expect(harness.posted).toHaveLength(0);
  });

  it('sends the stored pair token in connect and then polls for work', async () => {
    harness.localStore['connectedToDesktop'] = true;
    harness.localStore['agi_paired_desktop'] = {
      fingerprint: 'eeee',
      accountId: null,
      token: PAIR_TOKEN,
    };
    harness.desktop.answer = (message) =>
      message['type'] === NATIVE_BROWSER_POLL_MESSAGE ? null : { success: true };
    await startWorker();
    await settled(() => postedTypes().includes(NATIVE_BROWSER_POLL_MESSAGE));

    expect(harness.posted[0]).toMatchObject({ type: 'connect', pair_token: PAIR_TOKEN });
    expect(postedTypes()).toContain(NATIVE_BROWSER_POLL_MESSAGE);
  });

  it('drops a pairing Desktop no longer recognizes instead of retrying it', async () => {
    useFakeClock();
    harness.localStore['connectedToDesktop'] = true;
    harness.localStore['agi_paired_desktop'] = {
      fingerprint: 'eeee',
      accountId: null,
      token: PAIR_TOKEN,
    };
    harness.desktop.answer = (message) =>
      message['type'] === 'connect'
        ? { success: false, code: 'pairing-rejected', error: 'Not the paired profile.' }
        : { success: true };
    await startWorker();
    await settled(() => harness.localStore['agi_paired_desktop'] === undefined);
    await advanceFakeTime(LONGER_THAN_ANY_RECONNECT_MS);

    expect(harness.localStore['agi_paired_desktop']).toBeUndefined();
    expect(harness.localStore['connectedToDesktop']).toBe(false);
    expect(harness.connectNative).toHaveBeenCalledTimes(1);
    expect(postedTypes()).not.toContain(NATIVE_BROWSER_POLL_MESSAGE);
  });
});

describe('command pickup after Desktop has been away', () => {
  it('keeps asking with backoff and picks up work once Desktop answers again', async () => {
    useFakeClock();
    harness.localStore['connectedToDesktop'] = true;
    harness.localStore['agi_paired_desktop'] = {
      fingerprint: 'eeee',
      accountId: null,
      token: PAIR_TOKEN,
    };
    let desktopRunning = false;
    let polls = 0;
    harness.desktop.answer = (message) => {
      if (message['type'] !== NATIVE_BROWSER_POLL_MESSAGE) return { success: true };
      polls += 1;
      return desktopRunning ? null : { success: false, error: 'Desktop is not running.' };
    };
    await startWorker();
    await settled(() => polls >= 1);

    await advanceUntilCounted(() => polls, 3);
    const whileAway = polls;
    expect(whileAway).toBeGreaterThanOrEqual(3);
    expect(harness.localStore['agi_paired_desktop']).toMatchObject({ token: PAIR_TOKEN });
    expect(harness.ports[0]?.disconnect).not.toHaveBeenCalled();

    desktopRunning = true;
    await advanceUntilCounted(() => polls, whileAway + 1);
    expect(polls).toBeGreaterThan(whileAway);
    const resumed = polls;
    await advanceFakeTime(10_000);
    expect(polls).toBe(resumed);
  });
});

describe('a pairing Desktop removes while this browser is connected', () => {
  it('is dropped here at once, the port is closed and nothing polls again', async () => {
    useFakeClock();
    harness.localStore['connectedToDesktop'] = true;
    harness.localStore['agi_paired_desktop'] = {
      fingerprint: 'eeee',
      accountId: null,
      token: PAIR_TOKEN,
    };
    let polls = 0;
    harness.desktop.answer = (message) => {
      if (message['type'] !== NATIVE_BROWSER_POLL_MESSAGE) return { success: true };
      polls += 1;
      return {
        success: false,
        code: 'pairing-rejected',
        error: 'This browser profile is not the one paired with Desktop.',
      };
    };
    await startWorker();
    await settled(() => harness.localStore['agi_paired_desktop'] === undefined);

    expect(harness.localStore['agi_paired_desktop']).toBeUndefined();
    expect(harness.localStore['connectedToDesktop']).toBe(false);
    expect(harness.ports[0]?.disconnect).toHaveBeenCalled();
    const afterRelease = polls;
    for (let step = 0; step < 4; step += 1) await advanceFakeTime(61_000);
    expect(polls).toBe(afterRelease);
    expect(harness.connectNative).toHaveBeenCalledTimes(1);
  });
});

describe('a refusal of an older pairing never removes a newer one', () => {
  const NEWER = {
    fingerprint: 'dddd',
    accountId: null,
    token: 'd'.repeat(64),
  };

  it('keeps a pairing stored while the old connection was being refused, and reconnects with it', async () => {
    harness.localStore['connectedToDesktop'] = true;
    harness.localStore['agi_paired_desktop'] = {
      fingerprint: 'eeee',
      accountId: null,
      token: PAIR_TOKEN,
    };
    let polls = 0;
    harness.desktop.answer = (message) => {
      if (message['type'] !== NATIVE_BROWSER_POLL_MESSAGE) return { success: true };
      polls += 1;
      if (polls > 1) return null;
      harness.localStore['agi_paired_desktop'] = { ...NEWER };
      return { success: false, code: 'pairing-rejected', error: 'Not the paired profile.' };
    };
    await startWorker();
    await settled(() => harness.connectNative.mock.calls.length >= 2);
    await settled(() => polls >= 2);

    expect(harness.localStore['agi_paired_desktop']).toEqual(NEWER);
    expect(harness.ports[0]?.disconnect).toHaveBeenCalled();
    const connects = harness.posted.filter((message) => message['type'] === 'connect');
    expect(connects.at(-1)).toMatchObject({ pair_token: NEWER.token });
  });

  it('keeps a newer pairing when the refused handshake used the older token', async () => {
    harness.localStore['connectedToDesktop'] = true;
    harness.localStore['agi_paired_desktop'] = {
      fingerprint: 'eeee',
      accountId: null,
      token: PAIR_TOKEN,
    };
    let connects = 0;
    harness.desktop.answer = (message) => {
      if (message['type'] === NATIVE_BROWSER_POLL_MESSAGE) return null;
      if (message['type'] !== 'connect') return { success: true };
      connects += 1;
      if (connects > 1) return { success: true };
      harness.localStore['agi_paired_desktop'] = { ...NEWER };
      return { success: false, code: 'pairing-rejected', error: 'Not the paired profile.' };
    };
    await startWorker();
    await settled(() => connects >= 1);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(harness.localStore['agi_paired_desktop']).toEqual(NEWER);
    expect(harness.localStore['connectedToDesktop']).not.toBe(false);
  });
});

describe('an unpair Desktop could not hear is finished later', () => {
  it('records the unpair as owed with the token when Desktop is closed', async () => {
    harness.localStore['agi_paired_desktop'] = {
      fingerprint: 'eeee',
      accountId: null,
      token: PAIR_TOKEN,
    };
    harness.desktop.answer = (message) =>
      message['type'] === 'connect'
        ? { success: false, error: 'Desktop is not running.' }
        : { success: true };
    await startWorker();

    const receipt = await dispatch({ type: 'UNPAIR_NATIVE' });

    expect(receipt).toMatchObject({ success: false, revocationOwed: true });
    expect(harness.localStore['agi_paired_desktop']).toBeUndefined();
    expect(harness.localStore['agi_pending_desktop_revocation']).toMatchObject({
      token: PAIR_TOKEN,
    });
  });

  it('delivers the owed unpair on a later worker start, with no action from the user', async () => {
    useFakeClock();
    harness.localStore['agi_pending_desktop_revocation'] = { id: 'owed-1', token: OWED_TOKEN };
    harness.desktop.answer = (message) =>
      message['type'] === 'connect'
        ? { success: false, error: 'Desktop is not running.' }
        : { success: true };
    await startWorker();
    await settled(() => harness.connectNative.mock.calls.length > 0);
    await advanceFakeTime(LONGER_THAN_ANY_RECONNECT_MS);
    expect(postedTypes()).not.toContain(NATIVE_BROWSER_UNPAIR_MESSAGE);
    expect(harness.connectNative).toHaveBeenCalledTimes(1);

    harness.desktop.answer = (message) =>
      message['type'] === NATIVE_BROWSER_POLL_MESSAGE ? null : { success: true };
    await startWorker();
    await settled(() => harness.localStore['agi_pending_desktop_revocation'] === undefined);

    expect(postedTypes()).toContain(NATIVE_BROWSER_UNPAIR_MESSAGE);
    expect(postedTypes()).not.toContain(NATIVE_BROWSER_POLL_MESSAGE);
    expect(harness.posted.find((message) => message['type'] === 'connect')).toMatchObject({
      pair_token: OWED_TOKEN,
    });
    expect(harness.localStore['agi_pending_desktop_revocation']).toBeUndefined();
  });

  it('forgets an owed unpair once Desktop says it holds no such pairing', async () => {
    harness.localStore['agi_pending_desktop_revocation'] = { id: 'owed-2', token: OWED_TOKEN };
    harness.desktop.answer = (message) =>
      message['type'] === 'connect'
        ? { success: false, code: 'pairing-rejected', error: 'Not paired.' }
        : { success: true };
    await startWorker();
    await settled(() => harness.localStore['agi_pending_desktop_revocation'] === undefined);

    expect(harness.localStore['agi_pending_desktop_revocation']).toBeUndefined();
  });

  it('releases the pairing when Desktop has removed its host', async () => {
    harness.localStore['connectedToDesktop'] = true;
    harness.localStore['agi_paired_desktop'] = {
      fingerprint: 'eeee',
      accountId: null,
      token: PAIR_TOKEN,
    };
    harness.desktop.answer = () => null;
    harness.desktop.disconnectWith = 'Specified native messaging host not found.';
    await startWorker();
    await settled(() => harness.localStore['agi_paired_desktop'] === undefined);

    expect(harness.localStore['agi_paired_desktop']).toBeUndefined();
  });
});

describe('a recording lives in the worker, so a new page cannot take it away', () => {
  beforeEach(() => {
    harness.localStore['agi_site_allowlist'] = [harness.SITE];
  });

  it('keeps the steps recorded before a page load and says the recording stopped there', async () => {
    await startWorker();
    expect(await dispatch({ type: 'START_RECORDING', tabId: 9 })).toMatchObject({
      success: true,
    });
    for (const selector of ['#name', '#next']) {
      expect(
        await dispatch(
          { type: 'RECORDING_ACTION', action: { type: 'click', selector, timestamp: 1 } },
          PAGE_SENDER,
        ),
      ).toMatchObject({ success: true, recording: true });
    }

    harness.page.recording = false;
    const polled = await dispatch({ type: 'GET_RECORDED_ACTIONS', tabId: 9 });

    expect(polled).toMatchObject({ success: true, recording: false, stoppedBy: 'navigation' });
    expect((polled['actions'] as Array<{ selector: string }>).map((a) => a.selector)).toEqual([
      '#name',
      '#next',
    ]);
    expect(
      await dispatch(
        { type: 'RECORDING_ACTION', action: { type: 'click', selector: '#late', timestamp: 2 } },
        PAGE_SENDER,
      ),
    ).toMatchObject({ recording: false });
    const stopped = await dispatch({ type: 'STOP_RECORDING', tabId: 9 });
    expect(stopped).toMatchObject({ stoppedBy: 'navigation' });
    expect(stopped['actions']).toHaveLength(2);
  });

  it('takes no step from a page on another site than the one being recorded', async () => {
    await startWorker();
    await dispatch({ type: 'START_RECORDING', tabId: 9 });
    const elsewhere = {
      ...PAGE_SENDER,
      url: 'https://other.example/x',
      origin: 'https://other.example',
      tab: { ...PAGE_SENDER.tab, url: 'https://other.example/x' },
    };
    harness.localStore['agi_site_allowlist'] = [harness.SITE, 'https://other.example'];

    await dispatch(
      { type: 'RECORDING_ACTION', action: { type: 'click', selector: '#x', timestamp: 1 } },
      elsewhere,
    );

    expect((await dispatch({ type: 'GET_RECORDED_ACTIONS', tabId: 9 }))['actions']).toEqual([]);
  });
});
