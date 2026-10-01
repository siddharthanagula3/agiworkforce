import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ChromeManagedRunCancellationResult,
  ChromeManagedRunControlResult,
} from '../src/features/cloud-bridge/managedRunControl';
type ScanModule0 = typeof import('../src/features/cloud-bridge/managedRunControl');
type ScanModule1 = typeof import('../src/features/cloud-bridge/freeTrialClient');

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
      onSuspendCanceled: event(),
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

  const cancel = vi.fn<(...args: unknown[]) => Promise<ChromeManagedRunCancellationResult>>();
  const resume = vi.fn<(...args: unknown[]) => Promise<ChromeManagedRunControlResult>>();
  const auth: {
    current: { token: string; owner: { accountId: string; authIncarnation: string } } | null;
  } = {
    current: {
      token: 'captured-token-a',
      owner: { accountId: 'account-a', authIncarnation: 'session-a' },
    },
  };
  return {
    EXTENSION_ID,
    RUN_TAB_ID,
    RUN_WINDOW_ID,
    SITE_A,
    SITE_B,
    SITE_ALLOWLIST_KEY,
    CONSENT_KEY,
    localStore,
    unreadableKeys,
    messageListeners,
    nativeListeners,
    storageListeners,
    tab,
    chromeMock,
    cancel,
    resume,
    auth,
  };
});

vi.mock('../src/features/cloud-bridge/managedRunControl', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  cancelChromeManagedRun: harness.cancel,
  cancelAndConfirmChromeManagedRun: harness.cancel,
  resumeChromeManagedRun: harness.resume,
}));
vi.mock('../src/features/cloud-bridge/freeTrialClient', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  getManagedCloudAuthContext: async () => harness.auth.current,
}));

const OWNER_A = { accountId: 'account-a', authIncarnation: 'session-a' };
const RUN_ID = '11111111-1111-4111-8111-111111111111';
const run = {
  runId: RUN_ID,
  runPath: `/api/llm/v1/chat/completions/runs/${RUN_ID}`,
  state: 'running',
  lastSequence: -1,
};

function terminalRun(state: 'cancelled' | 'completed' = 'cancelled') {
  return {
    id: RUN_ID,
    userId: 'account-a',
    requestId: 'request-fixture',
    conversationId: null,
    originSurface: 'chrome' as const,
    workMode: 'agiwork' as const,
    state,
    provider: 'openai',
    model: 'fixture-model',
    lastEventSequence: -1,
    cancellationRequestedAt: '2026-10-01T00:00:00.000Z',
    completedAt: '2026-10-01T00:00:00.000Z',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

function dispatch(message: Record<string, unknown>): Promise<Record<string, unknown>> {
  const listener = harness.messageListeners[0];
  if (!listener) throw new Error('background runtime listener was not registered');
  return new Promise((resolve) =>
    listener(
      message,
      {
        id: harness.EXTENSION_ID,
        url: `chrome-extension://${harness.EXTENSION_ID}/side_panel.html`,
        origin: `chrome-extension://${harness.EXTENSION_ID}`,
      },
      (response) => resolve((response ?? {}) as Record<string, unknown>),
    ),
  );
}

function cancelMessage(id = 'stream-fixture') {
  return {
    type: 'CANCEL_STREAM',
    owner: OWNER_A,
    clientInstanceId: 'panel-fixture',
    id,
    cloudRun: run,
  };
}
function cancelledBroadcasts() {
  return harness.chromeMock.runtime.sendMessage.mock.calls.filter(
    ([message]) => (message as { error?: string }).error === 'Cancelled.',
  );
}

beforeAll(async () => {
  await import('../src/background');
  await new Promise((resolve) => setTimeout(resolve, 0));
});
beforeEach(() => {
  harness.auth.current = { owner: OWNER_A, token: 'captured-token-a' };
  harness.cancel.mockReset().mockResolvedValue({
    status: 'error',
    code: 'server_error',
    message: 'Cancellation service unavailable',
  });
  harness.resume.mockReset();
  harness.chromeMock.runtime.sendMessage.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('registered Chrome Stop cancellation', () => {
  it('fails closed when the cancellation API refuses the owned run', async () => {
    const response = await dispatch(cancelMessage());
    expect(harness.cancel).toHaveBeenCalledTimes(1);
    expect(response.success).toBe(false);
    expect(cancelledBroadcasts()).toHaveLength(0);
  });
  it('does not report cancellation before the server result', async () => {
    let release!: (value: ChromeManagedRunCancellationResult) => void;
    harness.cancel.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const response = dispatch(cancelMessage());
    await vi.waitFor(() => expect(harness.cancel).toHaveBeenCalledTimes(1));
    expect(cancelledBroadcasts()).toHaveLength(0);
    release({ status: 'success', run: terminalRun() });
    expect((await response).success).toBe(true);
    expect(cancelledBroadcasts()).toHaveLength(1);
  });
  it('refuses a recovered run after its account session changed', async () => {
    harness.auth.current = {
      token: 'token-b',
      owner: { accountId: 'account-b', authIncarnation: 'session-b' },
    };
    expect((await dispatch(cancelMessage())).success).toBe(false);
    expect(harness.cancel).not.toHaveBeenCalled();
    expect(cancelledBroadcasts()).toHaveLength(0);
  });
  it('preserves an already completed terminal race', async () => {
    harness.cancel.mockResolvedValue({ status: 'success', run: terminalRun('completed') });
    expect((await dispatch(cancelMessage())).success).toBe(true);
    expect(cancelledBroadcasts()).toHaveLength(0);
    expect(harness.chromeMock.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CHAT_CHUNK',
        done: true,
        cloudRun: expect.objectContaining({ state: 'completed' }),
      }),
    );
  });
  it('aborts the actual cancellation request when its deadline expires', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    harness.cancel.mockImplementation((_run, _dependencies, value) => {
      signal = value as AbortSignal;
      return new Promise((resolve) =>
        signal?.addEventListener(
          'abort',
          () =>
            resolve({
              status: 'error',
              code: 'server_error',
              message: 'Cancellation remains unconfirmed',
            }),
          { once: true },
        ),
      );
    });
    const response = dispatch(cancelMessage());
    await vi.waitFor(() => expect(harness.cancel).toHaveBeenCalledTimes(1));
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(15_000);
    expect((await response).success).toBe(false);
    expect(signal?.aborted).toBe(true);
    expect(cancelledBroadcasts()).toHaveLength(0);
  });
  it('uses the admitted credential and shares an active Stop attempt', async () => {
    let readSignal!: AbortSignal;
    harness.resume.mockImplementation((_request, _dependencies) => {
      readSignal = (_request as { signal: AbortSignal }).signal;
      return new Promise((resolve) =>
        readSignal.addEventListener(
          'abort',
          () => resolve({ status: 'error', code: 'cancelled', message: 'Cancelled.' }),
          { once: true },
        ),
      );
    });
    await dispatch({
      type: 'RESUME_CHAT_RUN',
      owner: OWNER_A,
      clientInstanceId: 'panel-fixture',
      id: 'active-stop',
      cloudRun: run,
      alreadyVisibleText: 'partial',
    });
    await vi.waitFor(() => expect(harness.resume).toHaveBeenCalledTimes(1));
    harness.auth.current = {
      token: 'token-b',
      owner: { accountId: 'account-b', authIncarnation: 'session-b' },
    };
    let release!: (value: ChromeManagedRunCancellationResult) => void;
    harness.cancel.mockImplementation(async (_run, dependencies) => {
      expect(await (dependencies as { getAuthToken: () => Promise<string> }).getAuthToken()).toBe(
        'captured-token-a',
      );
      return new Promise((resolve) => {
        release = resolve;
      });
    });
    const first = dispatch(cancelMessage('active-stop'));
    const second = dispatch(cancelMessage('active-stop'));
    await vi.waitFor(() => expect(harness.cancel).toHaveBeenCalledTimes(1));
    expect(readSignal.aborted).toBe(false);
    release({ status: 'success', run: terminalRun() });
    expect((await first).success).toBe(true);
    expect((await second).success).toBe(true);
    expect(readSignal.aborted).toBe(true);
    expect(cancelledBroadcasts()).toHaveLength(1);
  });
  it('refuses the late cancellation result after its admitted owner is retired', async () => {
    let reply!: (result: ChromeManagedRunCancellationResult) => void;
    harness.cancel.mockImplementation(
      () =>
        new Promise((resolve) => {
          reply = resolve;
        }),
    );
    const pending = dispatch(cancelMessage('retired-stop'));
    await vi.waitFor(() => expect(harness.cancel).toHaveBeenCalledTimes(1));
    expect(
      (await dispatch({ type: 'MANAGED_CLOUD_AUTH_CHANGED', previousOwner: OWNER_A })).success,
    ).toBe(true);
    reply({ status: 'success', run: terminalRun() });
    expect((await pending).success).toBe(false);
    expect(cancelledBroadcasts()).toHaveLength(0);
  });
});
