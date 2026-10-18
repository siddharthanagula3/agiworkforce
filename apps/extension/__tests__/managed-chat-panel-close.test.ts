import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManagedCloudAgentRunReference } from '@agiworkforce/cloud-contracts';
import type {
  ChromeManagedChatDependencies,
  ChromeManagedChatRequest,
  ChromeManagedChatResult,
} from '../src/features/cloud-bridge/managedChatHandler';
import type {
  ChromeManagedRunCancellationResult,
  ChromeManagedRunControlResult,
} from '../src/features/cloud-bridge/managedRunControl';

type FreeTrialClientModule = typeof import('../src/features/cloud-bridge/freeTrialClient');
type ManagedChatHandlerModule = typeof import('../src/features/cloud-bridge/managedChatHandler');
type ManagedRunControlModule = typeof import('../src/features/cloud-bridge/managedRunControl');

const harness = vi.hoisted(() => {
  const extensionId = 'agi-panel-close-test';
  const messageListeners: Array<
    (message: unknown, sender: unknown, sendResponse: (response?: unknown) => void) => unknown
  > = [];
  const connectListeners: Array<(port: unknown) => void> = [];
  const event = () => ({ addListener: vi.fn(), removeListener: vi.fn() });
  const localStore: Record<string, unknown> = {};
  const area = (store: Record<string, unknown>) => ({
    get: vi.fn(
      (
        keys?: string | string[] | Record<string, unknown> | null,
        callback?: (result: Record<string, unknown>) => void,
      ) => {
        const names =
          typeof keys === 'string'
            ? [keys]
            : Array.isArray(keys)
              ? keys
              : Object.keys(keys ?? store);
        const defaults = keys && typeof keys === 'object' && !Array.isArray(keys) ? keys : {};
        const result = structuredClone({
          ...defaults,
          ...Object.fromEntries(
            names.filter((key) => key in store).map((key) => [key, store[key]]),
          ),
        });
        callback?.(result);
        return Promise.resolve(result);
      },
    ),
    set: vi.fn((items: Record<string, unknown>, callback?: () => void) => {
      Object.assign(store, structuredClone(items));
      callback?.();
      return Promise.resolve();
    }),
    remove: vi.fn((keys: string | string[], callback?: () => void) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete store[key];
      callback?.();
      return Promise.resolve();
    }),
  });
  const chromeMock = {
    runtime: {
      id: extensionId,
      lastError: undefined,
      getURL: (path: string) => `chrome-extension://${extensionId}${path}`,
      getManifest: () => ({ version: '0.0.0-test' }),
      getPlatformInfo: vi.fn((callback?: () => void) => callback?.()),
      onMessage: { addListener: vi.fn((listener) => messageListeners.push(listener)) },
      onConnect: { addListener: vi.fn((listener) => connectListeners.push(listener)) },
      onInstalled: event(),
      onStartup: event(),
      onSuspend: event(),
      onSuspendCanceled: event(),
      sendMessage: vi.fn(() => Promise.resolve()),
    },
    storage: { local: area(localStore), sync: area({}), session: area({}), onChanged: event() },
    tabs: {
      query: vi.fn(() => Promise.resolve([])),
      onRemoved: event(),
      onUpdated: event(),
      onActivated: event(),
    },
    windows: { onFocusChanged: event() },
    alarms: {
      clear: vi.fn(() => Promise.resolve(true)),
      getAll: vi.fn(() => Promise.resolve([])),
      create: vi.fn(),
      onAlarm: event(),
    },
    notifications: { onClicked: event(), onButtonClicked: event() },
    contextMenus: {
      create: vi.fn(),
      removeAll: vi.fn(() => Promise.resolve()),
      onClicked: event(),
    },
    sidePanel: { setPanelBehavior: vi.fn(() => Promise.resolve()) },
    commands: { onCommand: event() },
    action: { setBadgeText: vi.fn(), setBadgeBackgroundColor: vi.fn(), setTitle: vi.fn() },
    debugger: { onDetach: event() },
    i18n: { getMessage: (key: string) => key },
  };
  (globalThis as Record<string, unknown>).chrome = chromeMock;
  (globalThis as Record<string, unknown>).fetch = vi.fn(() =>
    Promise.reject(new Error('offline in panel-close tests')),
  );
  return {
    extensionId,
    chromeMock,
    messageListeners,
    connectListeners,
    getAuthContext: vi.fn(),
    executeChat: vi.fn(),
    cancelRun: vi.fn<(...args: unknown[]) => Promise<ChromeManagedRunCancellationResult>>(),
    resumeRun: vi.fn<(...args: unknown[]) => Promise<ChromeManagedRunControlResult>>(),
  };
});

vi.mock('../src/features/cloud-bridge/freeTrialClient', async (importOriginal) => ({
  ...(await importOriginal<FreeTrialClientModule>()),
  getManagedCloudAuthContext: harness.getAuthContext,
}));

vi.mock('../src/features/cloud-bridge/managedChatHandler', async (importOriginal) => ({
  ...(await importOriginal<ManagedChatHandlerModule>()),
  executeChromeManagedChat: harness.executeChat,
}));

vi.mock('../src/features/cloud-bridge/managedRunControl', async (importOriginal) => ({
  ...(await importOriginal<ManagedRunControlModule>()),
  cancelChromeManagedRun: harness.cancelRun,
  cancelAndConfirmChromeManagedRun: harness.cancelRun,
  resumeChromeManagedRun: harness.resumeRun,
}));

import {
  getConversation,
  upsertConversation,
} from '../src/features/background/conversation-history';

const owner = { accountId: 'user-a', authIncarnation: 'session-a' };
const FIRST_PANEL = 'panel-first';
const REOPENED_PANEL = 'panel-reopened';
const CONVERSATION = 'chat-closed-panel';
const runId = '22222222-2222-4222-8222-222222222222';

function runReference(detachable: boolean): ManagedCloudAgentRunReference {
  return {
    runId,
    runPath: `/api/llm/v1/chat/completions/runs/${runId}`,
    lastSequence: 0,
    state: 'running',
    detachable,
  };
}

interface LiveTurn {
  signal: AbortSignal;
  dependencies: ChromeManagedChatDependencies;
  finish: (result: ChromeManagedChatResult) => void;
}

let live: LiveTurn | undefined;

function dispatch(message: Record<string, unknown>): Promise<Record<string, unknown>> {
  const listener = harness.messageListeners[0];
  if (!listener) throw new Error('background did not register its runtime message handler');
  return new Promise((resolve) => {
    listener(
      message,
      {
        id: harness.extensionId,
        url: `chrome-extension://${harness.extensionId}/side_panel.html`,
        origin: `chrome-extension://${harness.extensionId}`,
      },
      (response) => resolve((response ?? {}) as Record<string, unknown>),
    );
  });
}

function openPanelPort(clientInstanceId: string): () => void {
  const disconnectListeners: Array<() => void> = [];
  const port = {
    name: `agi-managed-chat:${clientInstanceId}`,
    sender: {
      id: harness.extensionId,
      url: `chrome-extension://${harness.extensionId}/side_panel.html`,
      origin: `chrome-extension://${harness.extensionId}`,
    },
    onMessage: { addListener: vi.fn() },
    onDisconnect: { addListener: (listener: () => void) => disconnectListeners.push(listener) },
    disconnect: vi.fn(),
  };
  for (const listener of harness.connectListeners) listener(port);
  return () => {
    for (const listener of disconnectListeners) listener();
  };
}

async function seedStreamingTurn(partial: string): Promise<void> {
  await upsertConversation(owner, CONVERSATION, [
    { role: 'user', content: 'Summarize the report', timestamp: 1_000, runtime: 'managed-cloud' },
    {
      role: 'assistant',
      content: partial,
      timestamp: 1_001,
      runtime: 'managed-cloud',
      streaming: true,
    },
  ]);
}

async function startTurn(id: string, run?: ManagedCloudAgentRunReference): Promise<LiveTurn> {
  live = undefined;
  harness.executeChat.mockImplementationOnce(
    async (request: ChromeManagedChatRequest, dependencies: ChromeManagedChatDependencies) => {
      if (run) await dependencies.onRunReference?.(run);
      return new Promise<ChromeManagedChatResult>((resolve) => {
        live = { signal: request.signal!, dependencies, finish: resolve };
        request.signal?.addEventListener(
          'abort',
          () => resolve({ status: 'error', code: 'cancelled', message: 'Cancelled.' }),
          { once: true },
        );
      });
    },
  );
  const response = await dispatch({
    type: 'CHAT_MESSAGE',
    owner,
    clientInstanceId: FIRST_PANEL,
    id,
    text: 'Summarize the report',
    historyConversationId: CONVERSATION,
  });
  expect(response['success']).toBe(true);
  await vi.waitFor(() => expect(live).toBeDefined());
  return live!;
}

async function lastStoredMessage() {
  const entry = await getConversation(owner, CONVERSATION);
  return entry?.messages[entry.messages.length - 1];
}

function chunksFor(clientInstanceId: string): Array<Record<string, unknown>> {
  return harness.chromeMock.runtime.sendMessage.mock.calls
    .map(([message]) => message as Record<string, unknown>)
    .filter(
      (message) =>
        message['type'] === 'CHAT_CHUNK' && message['clientInstanceId'] === clientInstanceId,
    );
}

describe('closing the side panel during a managed turn', () => {
  beforeAll(async () => {
    await import('../src/background');
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  beforeEach(() => {
    harness.getAuthContext.mockReset();
    harness.getAuthContext.mockResolvedValue({ owner, token: 'account-a-token' });
    harness.cancelRun.mockReset();
    harness.cancelRun.mockResolvedValue({
      status: 'error',
      code: 'server_error',
      message: 'unused',
    });
    harness.resumeRun.mockReset();
    harness.executeChat.mockReset();
    harness.chromeMock.runtime.sendMessage.mockClear();
  });

  afterEach(async () => {
    live?.finish({ status: 'error', code: 'cancelled', message: 'Cancelled.' });
    live = undefined;
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('keeps an AGI Work run going on the server instead of cancelling it', async () => {
    const closePanel = openPanelPort(FIRST_PANEL);
    const turn = await startTurn('stream-agi-work', runReference(true));

    closePanel();

    expect(turn.signal.aborted).toBe(false);
    expect(harness.cancelRun).not.toHaveBeenCalled();
  });

  it('saves the reply of a turn that finished after the panel closed', async () => {
    await seedStreamingTurn('The report');
    const closePanel = openPanelPort(FIRST_PANEL);
    const turn = await startTurn('stream-finished-closed');
    turn.dependencies.onText('The report');

    closePanel();
    turn.dependencies.onText(' shows growth.');
    turn.finish({
      status: 'success',
      routing: { modelKey: 'fixture-model', taskType: 'general', reason: 'test' },
    } as ChromeManagedChatResult);

    await vi.waitFor(async () =>
      expect(await lastStoredMessage()).toMatchObject({
        role: 'assistant',
        content: 'The report shows growth.',
      }),
    );
    const stored = await lastStoredMessage();
    expect(stored?.streaming).toBeUndefined();
    expect(stored?.error).toBeUndefined();
    expect(harness.cancelRun).not.toHaveBeenCalled();
  });

  it('saves a failure after the panel closed so the reopened transcript offers Retry', async () => {
    await seedStreamingTurn('');
    const closePanel = openPanelPort(FIRST_PANEL);
    const turn = await startTurn('stream-failed-closed');

    closePanel();
    turn.finish({ status: 'error', code: 'server_error', message: 'AGI Cloud is unavailable.' });

    await vi.waitFor(async () =>
      expect(await lastStoredMessage()).toMatchObject({
        role: 'assistant',
        error: true,
        errorText: 'AGI Cloud is unavailable.',
      }),
    );
    expect((await lastStoredMessage())?.streaming).toBeUndefined();
  });

  it('hands a still-running turn to the reopened panel, which can still stop it', async () => {
    await seedStreamingTurn('The report');
    const closePanel = openPanelPort(FIRST_PANEL);
    const turn = await startTurn('stream-adopted', runReference(false));
    turn.dependencies.onText('The report');
    closePanel();

    const adoption = await dispatch({
      type: 'ADOPT_CHAT_TURN',
      owner,
      clientInstanceId: REOPENED_PANEL,
      historyConversationId: CONVERSATION,
    });

    expect(adoption).toMatchObject({
      success: true,
      adopted: { id: 'stream-adopted', text: 'The report' },
    });
    turn.dependencies.onText(' shows growth.');
    expect(chunksFor(REOPENED_PANEL)).toContainEqual(
      expect.objectContaining({ id: 'stream-adopted', text: ' shows growth.' }),
    );

    harness.cancelRun.mockResolvedValue({
      status: 'success',
      run: {
        id: runId,
        userId: owner.accountId,
        requestId: 'request-adopted',
        conversationId: null,
        originSurface: 'chrome',
        workMode: 'chat',
        state: 'cancelled',
        provider: 'fixture',
        model: 'fixture-model',
        lastEventSequence: 1,
        cancellationRequestedAt: '2026-10-17T00:00:00.000Z',
        completedAt: null,
        createdAt: '2026-10-17T00:00:00.000Z',
        updatedAt: '2026-10-17T00:00:00.000Z',
      },
    } as ChromeManagedRunCancellationResult);
    const stop = await dispatch({
      type: 'CANCEL_STREAM',
      owner,
      clientInstanceId: REOPENED_PANEL,
      id: 'stream-adopted',
    });
    expect(stop['success']).toBe(true);
    expect(turn.signal.aborted).toBe(true);
    expect((await lastStoredMessage())?.streaming).toBe(true);
  });

  it('reports nothing to adopt for a conversation with no running turn', async () => {
    const response = await dispatch({
      type: 'ADOPT_CHAT_TURN',
      owner,
      clientInstanceId: REOPENED_PANEL,
      historyConversationId: 'chat-without-turn',
    });

    expect(response).toEqual({ success: true });
  });

  it('stops following locally when the reopened panel resumes the same durable run', async () => {
    const closePanel = openPanelPort(FIRST_PANEL);
    const turn = await startTurn('stream-resumed', runReference(true));
    closePanel();
    harness.resumeRun.mockReturnValue(new Promise(() => {}));

    await dispatch({
      type: 'RESUME_CHAT_RUN',
      owner,
      clientInstanceId: REOPENED_PANEL,
      id: 'stream-resumed-again',
      cloudRun: runReference(true),
      alreadyVisibleText: '',
    });

    await vi.waitFor(() => expect(harness.resumeRun).toHaveBeenCalledOnce());
    expect(turn.signal.aborted).toBe(true);
    expect(harness.cancelRun).not.toHaveBeenCalled();
  });

  it('still stops a closed-panel run when the account signs out', async () => {
    const closePanel = openPanelPort(FIRST_PANEL);
    const turn = await startTurn('stream-signed-out', runReference(true));
    closePanel();
    harness.cancelRun.mockResolvedValue({
      status: 'success',
      run: {
        id: runId,
        userId: owner.accountId,
        requestId: 'request-signed-out',
        conversationId: null,
        originSurface: 'chrome',
        workMode: 'agiwork',
        state: 'cancelled',
        provider: 'fixture',
        model: 'fixture-model',
        lastEventSequence: 1,
        cancellationRequestedAt: '2026-10-17T00:00:00.000Z',
        completedAt: null,
        createdAt: '2026-10-17T00:00:00.000Z',
        updatedAt: '2026-10-17T00:00:00.000Z',
      },
    } as ChromeManagedRunCancellationResult);

    expect(
      (await dispatch({ type: 'MANAGED_CLOUD_AUTH_CHANGED', previousOwner: owner })).success,
    ).toBe(true);

    expect(turn.signal.aborted).toBe(true);
    expect(harness.cancelRun).toHaveBeenCalledWith(
      expect.objectContaining({ runId }),
      expect.anything(),
      expect.anything(),
    );
  });
});
