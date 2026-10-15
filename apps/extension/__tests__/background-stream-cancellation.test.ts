import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CloudAgentRun, ManagedCloudAgentRunReference } from '@agiworkforce/cloud-contracts';
import type {
  ChromeManagedChatDependencies,
  ChromeManagedChatRequest,
  ChromeManagedChatResult,
} from '../src/features/cloud-bridge/managedChatHandler';
import type { ChromeManagedRunCancellationResult } from '../src/features/cloud-bridge/managedRunControl';

type FreeTrialClientModule = typeof import('../src/features/cloud-bridge/freeTrialClient');
type ManagedChatHandlerModule = typeof import('../src/features/cloud-bridge/managedChatHandler');
type ManagedRunControlModule = typeof import('../src/features/cloud-bridge/managedRunControl');

const harness = vi.hoisted(() => {
  const extensionId = 'agi-stream-cancellation-test';
  const messageListeners: Array<
    (message: unknown, sender: unknown, sendResponse: (response?: unknown) => void) => unknown
  > = [];
  const event = () => ({ addListener: vi.fn(), removeListener: vi.fn() });
  const localStore: Record<string, unknown> = {};
  const area = () => ({
    get: vi.fn((keys?: string | string[] | Record<string, unknown> | null) => {
      const names =
        typeof keys === 'string'
          ? [keys]
          : Array.isArray(keys)
            ? keys
            : Object.keys(keys ?? localStore);
      const defaults = keys && typeof keys === 'object' && !Array.isArray(keys) ? keys : {};
      return Promise.resolve({
        ...defaults,
        ...Object.fromEntries(
          names.filter((key) => key in localStore).map((key) => [key, localStore[key]]),
        ),
      });
    }),
    set: vi.fn((items: Record<string, unknown>) => {
      Object.assign(localStore, items);
      return Promise.resolve();
    }),
    remove: vi.fn(() => Promise.resolve()),
  });
  const chromeMock = {
    runtime: {
      id: extensionId,
      lastError: null,
      getURL: (path: string) => `chrome-extension://${extensionId}${path}`,
      getManifest: () => ({ version: '0.0.0-test' }),
      onMessage: { addListener: vi.fn((listener) => messageListeners.push(listener)) },
      onConnect: event(),
      onInstalled: event(),
      onStartup: event(),
      onSuspend: event(),
      onSuspendCanceled: event(),
      sendMessage: vi.fn(() => Promise.resolve()),
    },
    storage: { local: area(), sync: area(), session: area(), onChanged: event() },
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
    Promise.reject(new Error('offline in cancellation tests')),
  );
  return {
    extensionId,
    chromeMock,
    messageListeners,
    getAuthContext: vi.fn(),
    executeChat: vi.fn(),
    cancelRun: vi.fn(),
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
  cancelAndConfirmChromeManagedRun: harness.cancelRun,
}));

const owner = { accountId: 'user-a', authIncarnation: 'session-a' };
const otherOwner = { accountId: 'user-b', authIncarnation: 'session-b' };
const runId = '11111111-1111-4111-8111-111111111111';
const cloudRun: ManagedCloudAgentRunReference = {
  runId,
  runPath: `/api/llm/v1/chat/completions/runs/${runId}`,
  lastSequence: 1,
  state: 'running',
};
const cancelledRun: CloudAgentRun = {
  id: runId,
  userId: owner.accountId,
  requestId: 'request-cancellation',
  conversationId: null,
  originSurface: 'chrome',
  workMode: 'agiwork',
  state: 'cancelled',
  provider: 'test-provider',
  model: 'test-model',
  lastEventSequence: 4,
  cancellationRequestedAt: '2026-10-12T20:01:00.000Z',
  completedAt: null,
  createdAt: '2026-10-12T20:00:00.000Z',
  updatedAt: '2026-10-12T20:01:00.000Z',
};

let signal: AbortSignal | undefined;
let finishChat: ((result: ChromeManagedChatResult) => void) | undefined;

function dispatch(message: Record<string, unknown>): Promise<Record<string, unknown>> {
  const listener = harness.messageListeners[0];
  if (!listener) throw new Error('background did not register its runtime message handler');
  return new Promise((resolve) => {
    listener(
      { clientInstanceId: 'cancellation-panel', ...message },
      {
        id: harness.extensionId,
        url: `chrome-extension://${harness.extensionId}/sidepanel.html`,
        origin: `chrome-extension://${harness.extensionId}`,
      },
      (response) => resolve((response ?? {}) as Record<string, unknown>),
    );
  });
}

async function startChat(id: string): Promise<void> {
  const response = await dispatch({ type: 'CHAT_MESSAGE', id, owner, text: 'Read this page' });
  expect(response['success']).toBe(true);
  await vi.waitFor(() => expect(finishChat).toBeDefined());
  harness.chromeMock.runtime.sendMessage.mockClear();
}

function chunks(): Array<Record<string, unknown>> {
  return harness.chromeMock.runtime.sendMessage.mock.calls
    .map(([message]) => message as Record<string, unknown>)
    .filter((message) => message['type'] === 'CHAT_CHUNK');
}

describe('background stream cancellation', () => {
  beforeAll(async () => {
    await import('../src/background');
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  beforeEach(() => {
    signal = undefined;
    finishChat = undefined;
    harness.getAuthContext.mockReset();
    harness.getAuthContext.mockResolvedValue({ owner, token: 'captured-account-a-token' });
    harness.cancelRun.mockReset();
    harness.chromeMock.runtime.sendMessage.mockClear();
    harness.executeChat.mockReset();
    harness.executeChat.mockImplementation(
      async (request: ChromeManagedChatRequest, dependencies: ChromeManagedChatDependencies) => {
        signal = request.signal;
        await dependencies.onRunReference?.(cloudRun);
        return new Promise<ChromeManagedChatResult>((resolve) => {
          finishChat = resolve;
          signal?.addEventListener(
            'abort',
            () => resolve({ status: 'error', code: 'cancelled', message: 'Cancelled.' }),
            { once: true },
          );
        });
      },
    );
  });

  afterEach(async () => {
    finishChat?.({ status: 'error', code: 'cancelled', message: 'Cancelled.' });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('keeps the stream running and reports a server refusal without claiming remote cancellation', async () => {
    await startChat('stream-server-failure');
    let settleCancellation!: (result: ChromeManagedRunCancellationResult) => void;
    harness.cancelRun.mockReturnValue(
      new Promise<ChromeManagedRunCancellationResult>((resolve) => {
        settleCancellation = resolve;
      }),
    );

    const cancellation = dispatch({ type: 'CANCEL_STREAM', id: 'stream-server-failure', owner });
    await vi.waitFor(() => expect(harness.cancelRun).toHaveBeenCalledOnce());
    expect(signal?.aborted).toBe(false);
    expect(chunks().some((chunk) => chunk['error'] === 'Cancelled.')).toBe(false);

    settleCancellation({ status: 'error', code: 'server_error', message: 'Server refused Stop.' });
    const response = await cancellation;
    expect(response['success']).toBe(false);
    expect(response['error']).toBe('Server refused Stop.');
    expect(signal?.aborted).toBe(false);
    expect(chunks().some((chunk) => chunk['done'] === true)).toBe(false);
  });

  it('uses the admitted account credential and reports the confirmed cancelled server state', async () => {
    await startChat('stream-server-success');
    harness.getAuthContext.mockResolvedValue({ owner: otherOwner, token: 'account-b-token' });
    harness.cancelRun.mockImplementation(async (_run, dependencies) => {
      expect(await dependencies.getAuthToken()).toBe('captured-account-a-token');
      return { status: 'success', run: cancelledRun };
    });

    const response = await dispatch({ type: 'CANCEL_STREAM', id: 'stream-server-success', owner });

    expect(response['success']).toBe(true);
    expect(response['cancellationConfirmed']).toBe(true);
    expect(response['cloudRun']).toMatchObject({ runId, state: 'cancelled' });
    expect(signal?.aborted).toBe(true);
    expect(harness.cancelRun).toHaveBeenCalledOnce();
    expect(chunks().at(-1)).toMatchObject({
      done: true,
      error: 'Cancelled.',
      cloudRun: {
        state: 'cancelled',
        lastSequence: cancelledRun.lastEventSequence,
        cancellationRequestedAt: cancelledRun.cancellationRequestedAt,
      },
    });
  });

  it('rejects another account before aborting or cancelling the active account stream', async () => {
    await startChat('stream-owner-mismatch');

    const response = await dispatch({
      type: 'CANCEL_STREAM',
      id: 'stream-owner-mismatch',
      owner: otherOwner,
    });

    expect(response).toMatchObject({ success: false, error: 'Managed Cloud stream owner changed' });
    expect(signal?.aborted).toBe(false);
    expect(harness.cancelRun).not.toHaveBeenCalled();
    expect(chunks()).toEqual([]);
  });
});
