import { AGENT_EVENT_SCHEMA_VERSION } from '@agiworkforce/types';
import {
  createChromeCallerToolCustody,
  CALLER_TOOL_CUSTODY_KEY,
} from '../src/features/cloud-bridge/callerToolCustody';
import { chatBrowserToolDefinitions } from '../src/features/computer-use/chatBrowserTools';
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
type CallerAuthorityModule =
  typeof import('../src/features/cloud-bridge/callerConversationAuthority');
type ManagedRunControlModule = typeof import('../src/features/cloud-bridge/managedRunControl');

const harness = vi.hoisted(() => {
  const extensionId = 'agi-stream-cancellation-test';
  const messageListeners: Array<
    (message: unknown, sender: unknown, sendResponse: (response?: unknown) => void) => unknown
  > = [];
  const event = () => ({ addListener: vi.fn(), removeListener: vi.fn() });
  const localStore: Record<string, unknown> = {};
  const area = () => ({
    QUOTA_BYTES: 10 * 1024 * 1024,
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
    scripting: { executeScript: vi.fn() },
    tabs: {
      get: vi.fn(),
      query: vi.fn(() => Promise.resolve([])),
      onRemoved: event(),
      onUpdated: event(),
      onActivated: event(),
    },
    windows: { onFocusChanged: event() },
    alarms: {
      get: vi.fn(async () => undefined),
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
    action: {
      onClicked: event(),
      setBadgeText: vi.fn(),
      setBadgeBackgroundColor: vi.fn(),
      setTitle: vi.fn(),
    },
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
    captureCallerContext: vi.fn<CallerAuthorityModule['captureCallerConversationContext']>(
      async () => undefined,
    ),
    assertCallerContext: vi.fn<CallerAuthorityModule['assertCallerConversationAuthority']>(
      async () => undefined,
    ),
    executeChat: vi.fn(),
    executeApproval: vi.fn<ManagedChatHandlerModule['executeChromeManagedApproval']>(async () => ({
      status: 'success',
    })),
    executeInput: vi.fn<ManagedChatHandlerModule['executeChromeManagedToolInput']>(async () => ({
      status: 'success',
    })),
    cancelRun: vi.fn(),
    assertCallerRun: vi.fn<ManagedRunControlModule['assertChromeManagedCallerRun']>(),
    authorizeTab: vi.fn(),
    resumeRun: vi.fn<ManagedRunControlModule['resumeChromeManagedRun']>(async () => ({
      status: 'success',
    })),
    executeCallerResume: vi.fn<ManagedChatHandlerModule['executeChromeManagedCallerResume']>(
      async () => ({ status: 'success' }),
    ),
  };
});

vi.mock('../src/features/cloud-bridge/freeTrialClient', async (importOriginal) => ({
  ...(await importOriginal<FreeTrialClientModule>()),
  getManagedCloudAuthContext: harness.getAuthContext,
}));

vi.mock('../src/features/cloud-bridge/managedChatHandler', async (importOriginal) => ({
  ...(await importOriginal<ManagedChatHandlerModule>()),
  executeChromeManagedChat: harness.executeChat,
  executeChromeManagedApproval: harness.executeApproval,
  executeChromeManagedToolInput: harness.executeInput,
  executeChromeManagedCallerResume: harness.executeCallerResume,
}));

vi.mock('../src/features/cloud-bridge/conversationSync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/features/cloud-bridge/conversationSync')>()),
  flushQuestionBeforeTurn: vi.fn(async () => undefined),
}));

vi.mock('../src/features/cloud-bridge/callerConversationAuthority', async (importOriginal) => ({
  ...(await importOriginal<CallerAuthorityModule>()),
  captureCallerConversationContext: harness.captureCallerContext,
  assertCallerConversationAuthority: harness.assertCallerContext,
}));

vi.mock('../src/features/browser-tools/tabAuthority', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/features/browser-tools/tabAuthority')>()),
  authorizeBrowserToolTab: harness.authorizeTab,
}));

vi.mock('../src/features/cloud-bridge/managedRunControl', async (importOriginal) => ({
  ...(await importOriginal<ManagedRunControlModule>()),
  cancelAndConfirmChromeManagedRun: harness.cancelRun,
  resumeChromeManagedRun: harness.resumeRun,
  assertChromeManagedCallerRun: harness.assertCallerRun,
}));

const FIXTURE_CONVERSATION_CONTEXT = {
  id: '33333333-3333-4333-8333-333333333333',
  organizationId: null,
  projectId: null,
};
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
      {
        clientInstanceId: 'cancellation-panel',
        ...(['RESUME_CHAT_RUN', 'RESOLVE_CHAT_APPROVAL', 'RESOLVE_CHAT_INPUT'].includes(
          String(message['type']),
        )
          ? { historyConversationId: 'fixture-local' }
          : {}),
        ...message,
      },
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

  beforeEach(async () => {
    await chrome.storage.local.set({ [CALLER_TOOL_CUSTODY_KEY]: { version: 1, entries: [] } });
    signal = undefined;
    finishChat = undefined;
    harness.getAuthContext.mockReset();
    harness.getAuthContext.mockResolvedValue({ owner, token: 'captured-account-a-token' });
    harness.cancelRun.mockReset();
    harness.resumeRun.mockReset().mockResolvedValue({ status: 'success' });
    harness.executeCallerResume.mockReset().mockResolvedValue({ status: 'success' });
    harness.executeApproval.mockReset().mockResolvedValue({ status: 'success' });
    harness.executeInput.mockReset().mockResolvedValue({ status: 'success' });
    harness.captureCallerContext.mockReset().mockResolvedValue(undefined);
    harness.assertCallerContext.mockReset().mockResolvedValue(undefined);
    harness.chromeMock.runtime.sendMessage.mockReset().mockResolvedValue(undefined);
    harness.assertCallerRun
      .mockReset()
      .mockRejectedValue(new Error('No confirmed caller run in this fixture'));
    harness.authorizeTab
      .mockReset()
      .mockRejectedValue(new Error('No approved task tab in this fixture'));
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

  it('validates and retains the original website identity in the actual chat admission', async () => {
    const browserContext = {
      tabId: 17,
      windowId: 3,
      url: 'https://example.test/application',
      documentId: 'original-website-document',
    };
    harness.chromeMock.tabs.get.mockResolvedValue({
      id: 17,
      windowId: 3,
      url: browserContext.url,
      status: 'complete',
    });
    harness.chromeMock.scripting.executeScript.mockResolvedValue([
      { documentId: browserContext.documentId, result: browserContext.url },
    ]);
    const previous = (await chrome.storage.local.get(CALLER_TOOL_CUSTODY_KEY))[
      CALLER_TOOL_CUSTODY_KEY
    ];
    harness.executeChat.mockImplementationOnce(async (_request, deps) => {
      await deps.callerCustody!.admit(
        'native-site-context-request',
        chatBrowserToolDefinitions('read'),
      );
      await deps.callerCustody!.bindRun(runId);
      return { status: 'success' };
    });
    try {
      await dispatch({
        type: 'CHAT_MESSAGE',
        id: 'site-context-admission',
        owner,
        text: 'Read this page',
        browserToolTier: 'read',
        browserContext,
      });
      await vi.waitFor(() => expect(harness.executeChat).toHaveBeenCalledOnce());
      await vi.waitFor(async () => {
        const saved = (await chrome.storage.local.get(CALLER_TOOL_CUSTODY_KEY))[
          CALLER_TOOL_CUSTODY_KEY
        ];
        expect(
          saved.entries.find((entry) => entry.requestId === 'native-site-context-request').binding
            .browserContext,
        ).toEqual(browserContext);
      });
      await vi.waitFor(() => expect(chunks().some((chunk) => chunk['done'] === true)).toBe(true));
    } finally {
      await chrome.storage.local.set({ [CALLER_TOOL_CUSTODY_KEY]: previous });
    }
  });

  it('refuses a replaced website document before invoking the chat transport', async () => {
    const browserContext = {
      tabId: 17,
      windowId: 3,
      url: 'https://example.test/application',
      documentId: 'original-website-document',
    };
    harness.chromeMock.tabs.get.mockResolvedValue({
      id: 17,
      windowId: 3,
      url: browserContext.url,
      status: 'complete',
    });
    harness.chromeMock.scripting.executeScript.mockResolvedValue([
      { documentId: 'replacement-document', result: browserContext.url },
    ]);
    await dispatch({
      type: 'CHAT_MESSAGE',
      id: 'replaced-site-context',
      owner,
      text: 'Read this page',
      browserToolTier: 'read',
      browserContext,
    });
    await vi.waitFor(() =>
      expect(
        chunks().some((chunk) => chunk['done'] === true && typeof chunk['error'] === 'string'),
      ).toBe(true),
    );
    expect(harness.executeChat).not.toHaveBeenCalled();
  });

  it('retains the acknowledged conversation scope in the actual chat admission', async () => {
    harness.captureCallerContext.mockResolvedValueOnce(FIXTURE_CONVERSATION_CONTEXT);
    harness.executeChat.mockImplementationOnce(async (_request, deps) => {
      await deps.callerCustody!.admit(
        'scoped-chat-admission-request',
        chatBrowserToolDefinitions('read'),
      );
      await deps.callerCustody!.bindRun(runId);
      return { status: 'success' };
    });
    await dispatch({
      type: 'CHAT_MESSAGE',
      id: 'scoped-chat-admission',
      owner,
      text: 'Read this page',
      browserToolTier: 'read',
      historyConversationId: 'fixture-local',
      conversationId: FIXTURE_CONVERSATION_CONTEXT.id,
    });
    await vi.waitFor(() => expect(chunks().some((chunk) => chunk['done'] === true)).toBe(true));
    expect(harness.captureCallerContext).toHaveBeenCalledWith(
      owner,
      'fixture-local',
      FIXTURE_CONVERSATION_CONTEXT.id,
      expect.any(Function),
    );
    const saved = (await chrome.storage.local.get(CALLER_TOOL_CUSTODY_KEY))[
      CALLER_TOOL_CUSTODY_KEY
    ];
    expect(
      saved.entries.find((entry) => entry.requestId === 'scoped-chat-admission-request').binding
        .conversationContext,
    ).toEqual(FIXTURE_CONVERSATION_CONTEXT);
  });

  it('refuses a different local chat even when a saved run is marked completed', async () => {
    const custody = createChromeCallerToolCustody(
      {
        owner,
        clientInstanceId: 'cancellation-panel',
        streamId: 'completed-local-owner',
        historyConversationId: 'fixture-local',
        conversationContext: FIXTURE_CONVERSATION_CONTEXT,
      },
      () => undefined,
    );
    await custody.admit('completed-local-owner-request', chatBrowserToolDefinitions('read'));
    await custody.bindRun(runId);
    await custody.finish();
    harness.resumeRun.mockClear();
    await dispatch({
      type: 'RESUME_CHAT_RUN',
      id: 'wrong-local-completed',
      owner,
      historyConversationId: 'another-local',
      cloudRun: { ...cloudRun, state: 'completed' },
      alreadyVisibleText: '',
    });
    await vi.waitFor(() =>
      expect(
        chunks().some((chunk) => chunk['done'] === true && typeof chunk['error'] === 'string'),
      ).toBe(true),
    );
    expect(harness.resumeRun).not.toHaveBeenCalled();
  });

  it.each(['RESUME_CHAT_RUN', 'RESOLVE_CHAT_APPROVAL', 'RESOLVE_CHAT_INPUT'])(
    'refuses %s when the original conversation authority cannot be verified',
    async (type) => {
      const custody = createChromeCallerToolCustody(
        {
          owner,
          clientInstanceId: 'cancellation-panel',
          streamId: 'authority-refusal',
          historyConversationId: 'fixture-local',
          conversationContext: FIXTURE_CONVERSATION_CONTEXT,
        },
        () => undefined,
      );
      await custody.admit('authority-refusal-request', chatBrowserToolDefinitions('read'));
      await custody.bindRun(runId);
      harness.executeApproval.mockClear();
      harness.executeInput.mockClear();
      harness.executeCallerResume.mockClear();
      harness.resumeRun.mockClear();
      harness.assertCallerContext.mockRejectedValueOnce(new Error('Original workspace changed'));
      await dispatch({
        type,
        id: 'authority-refusal-resume',
        owner,
        cloudRun,
        alreadyVisibleText: '',
        toolApprovals: [{ tool_call_id: 'hosted-call', decision: 'approved' }],
        toolInputs: [{ tool_call_id: 'hosted-call', input_responses: { answer: 'fixture' } }],
      });
      await vi.waitFor(() =>
        expect(
          chunks().some((chunk) => chunk['done'] === true && typeof chunk['error'] === 'string'),
        ).toBe(true),
      );
      expect(harness.assertCallerContext).toHaveBeenCalledWith(
        expect.objectContaining({
          historyConversationId: 'fixture-local',
          conversationContext: FIXTURE_CONVERSATION_CONTEXT,
        }),
        'fixture-local',
        expect.any(Function),
        expect.any(AbortSignal),
      );
      expect(harness.executeApproval).not.toHaveBeenCalled();
      expect(harness.executeInput).not.toHaveBeenCalled();
      expect(harness.executeCallerResume).not.toHaveBeenCalled();
      expect(harness.resumeRun).not.toHaveBeenCalled();
    },
  );

  it.each(['RESOLVE_CHAT_APPROVAL', 'RESOLVE_CHAT_INPUT'])(
    'retains legacy server-only %s without inventing browser checkpoint scope',
    async (type) => {
      const custody = createChromeCallerToolCustody(
        { owner, clientInstanceId: 'cancellation-panel', streamId: 'legacy-hosted-only' },
        () => undefined,
      );
      await custody.admit('legacy-hosted-only-request', chatBrowserToolDefinitions('read'));
      await custody.bindRun(runId);
      const executor =
        type === 'RESOLVE_CHAT_INPUT' ? harness.executeInput : harness.executeApproval;
      executor.mockClear();
      await dispatch({
        type,
        id: 'legacy-hosted-only-resume',
        owner,
        cloudRun,
        toolApprovals: [{ tool_call_id: 'hosted-call', decision: 'approved' }],
        toolInputs: [{ tool_call_id: 'hosted-call', input_responses: { answer: 'fixture' } }],
      });
      await vi.waitFor(() => expect(chunks().some((chunk) => chunk['done'] === true)).toBe(true));
      expect(executor).toHaveBeenCalledOnce();
      expect(harness.assertCallerContext).not.toHaveBeenCalled();
    },
  );

  it.each(['RESOLVE_CHAT_APPROVAL', 'RESOLVE_CHAT_INPUT'])(
    'restores owned original names for %s and refreshes the token',
    async (type) => {
      const previousCustody = (await chrome.storage.local.get(CALLER_TOOL_CUSTODY_KEY))[
        CALLER_TOOL_CUSTODY_KEY
      ];
      const custody = createChromeCallerToolCustody(
        {
          owner,
          clientInstanceId: 'cancellation-panel',
          streamId: 'hosted-origin',
          historyConversationId: 'fixture-local',
          conversationContext: FIXTURE_CONVERSATION_CONTEXT,
        },
        () => undefined,
      );
      const tools = chatBrowserToolDefinitions('read');
      await custody.admit('hosted-offer-request', tools);
      await custody.bindRun(runId);
      const executor =
        type === 'RESOLVE_CHAT_INPUT' ? harness.executeInput : harness.executeApproval;
      executor.mockClear();
      executor.mockImplementationOnce(async (_request, deps) => {
        expect(await deps.getAuthToken()).toBe('renewed-owner-token');
        return { status: 'success' };
      });
      harness.getAuthContext
        .mockResolvedValueOnce({ owner, token: 'initial-token' })
        .mockResolvedValueOnce({ owner, token: 'renewed-owner-token' });
      try {
        await dispatch({
          type,
          id: 'hosted-checkpoint-resume',
          owner,
          cloudRun,
          ...(type === 'RESOLVE_CHAT_INPUT'
            ? {
                toolInputs: [
                  { tool_call_id: 'hosted-call', input_responses: { answer: 'fixture' } },
                ],
              }
            : { toolApprovals: [{ tool_call_id: 'hosted-call', decision: 'approved' }] }),
        });
        await vi.waitFor(() => expect(executor).toHaveBeenCalledOnce());
        expect(executor.mock.calls[0]![0]).toMatchObject({
          originalCallerToolNames: tools.map((tool) => tool.function.name),
        });
        await vi.waitFor(() => expect(chunks().some((chunk) => chunk['done'] === true)).toBe(true));
      } finally {
        await chrome.storage.local.set({ [CALLER_TOOL_CUSTODY_KEY]: previousCustody });
      }
    },
  );

  it.each(['in_flight', 'terminal'] as const)(
    'does not answer a hosted checkpoint for a %s caller record',
    async (state) => {
      const previousCustody = (await chrome.storage.local.get(CALLER_TOOL_CUSTODY_KEY))[
        CALLER_TOOL_CUSTODY_KEY
      ];
      const custody = createChromeCallerToolCustody(
        {
          owner,
          clientInstanceId: 'cancellation-panel',
          streamId: 'refused-hosted-origin',
          historyConversationId: 'fixture-local',
          conversationContext: FIXTURE_CONVERSATION_CONTEXT,
        },
        () => undefined,
      );
      const tools = chatBrowserToolDefinitions('read');
      await custody.admit('refused-hosted-request', tools);
      await custody.bindRun(runId);
      if (state === 'terminal') await custody.finish();
      else
        await custody.claim({
          schema_version: AGENT_EVENT_SCHEMA_VERSION,
          run_id: runId,
          turn_id: 'fixture-turn',
          next_event_sequence: 8,
          calls: [
            {
              id: 'uncertain-call',
              type: 'function',
              function: { name: tools[0]!.function.name, arguments: '{}' },
            },
          ],
        });
      harness.executeApproval.mockClear();
      try {
        await dispatch({
          type: 'RESOLVE_CHAT_APPROVAL',
          id: 'refused-hosted-checkpoint',
          owner,
          cloudRun,
          toolApprovals: [{ tool_call_id: 'hosted-call', decision: 'approved' }],
        });
        await vi.waitFor(() =>
          expect(
            chunks().some((chunk) => chunk['done'] === true && typeof chunk['error'] === 'string'),
          ).toBe(true),
        );
        expect(harness.executeApproval).not.toHaveBeenCalled();
        const saved = (await chrome.storage.local.get(CALLER_TOOL_CUSTODY_KEY))[
          CALLER_TOOL_CUSTODY_KEY
        ];
        expect(saved.entries[0]).toMatchObject(
          state === 'terminal' ? { terminal: true } : { step: { state: 'in_flight' } },
        );
      } finally {
        await chrome.storage.local.set({ [CALLER_TOOL_CUSTODY_KEY]: previousCustody });
      }
    },
  );

  it('confirms the pending public checkpoint before posting its saved receipt without duplicating text', async () => {
    harness.executeCallerResume.mockClear();
    harness.resumeRun.mockClear();
    harness.executeCallerResume.mockImplementationOnce(async (_request, deps) => {
      await deps.onText('Previously visible text');
      return { status: 'success' };
    });
    harness.resumeRun
      .mockImplementationOnce(async (_request, deps) => {
        await deps?.onCallerCheckpoint?.(checkpoint);
        return { status: 'error', code: 'server_error', message: 'Pending browser results' };
      })
      .mockImplementationOnce(async (_request, deps) => {
        await deps?.onText?.('New journal suffix');
        return { status: 'success' };
      });
    const custody = createChromeCallerToolCustody(
      {
        owner,
        clientInstanceId: 'cancellation-panel',
        streamId: 'completed-origin',
        historyConversationId: 'fixture-local',
        conversationContext: FIXTURE_CONVERSATION_CONTEXT,
      },
      () => undefined,
    );
    const tools = chatBrowserToolDefinitions('read');
    await custody.admit('completed-caller-request', tools);
    await custody.bindRun(runId);
    const checkpoint = {
      schema_version: AGENT_EVENT_SCHEMA_VERSION,
      run_id: runId,
      turn_id: 'fixture-turn',
      next_event_sequence: 8,
      calls: [
        {
          id: 'completed-call',
          type: 'function' as const,
          function: { name: tools[0]!.function.name, arguments: '{}' },
        },
      ],
    };
    const receipt = {
      schema_version: AGENT_EVENT_SCHEMA_VERSION,
      run_id: runId,
      turn_id: 'fixture-turn',
      next_event_sequence: 8,
      tool_results: [{ tool_call_id: 'completed-call', content: 'Verified fixture result' }],
    };
    await custody.claim(checkpoint);
    for (const call of checkpoint.calls) {
      await custody.claimAction(checkpoint, call.id);
      await custody.completeAction(
        checkpoint,
        receipt.tool_results.find((result) => result.tool_call_id === call.id)!,
      );
    }
    await custody.complete(checkpoint, receipt);
    try {
      await dispatch({
        type: 'RESUME_CHAT_RUN',
        id: 'completed-recovery',
        owner,
        cloudRun,
        alreadyVisibleText: '',
      });
      await vi.waitFor(() => expect(harness.executeCallerResume).toHaveBeenCalledOnce());
      expect(harness.executeCallerResume.mock.calls[0]![0]).toMatchObject({
        receipt,
        originalToolNames: tools.map((tool) => tool.function.name),
      });
      await vi.waitFor(() => expect(harness.resumeRun).toHaveBeenCalledTimes(2));
      expect(harness.resumeRun.mock.invocationCallOrder[0]).toBeLessThan(
        harness.executeCallerResume.mock.invocationCallOrder[0]!,
      );
      expect(harness.executeCallerResume.mock.invocationCallOrder[0]).toBeLessThan(
        harness.resumeRun.mock.invocationCallOrder[1]!,
      );
      expect(
        chunks()
          .map((chunk) => chunk['text'])
          .join(''),
      ).not.toContain('Previously visible text');
      expect(
        chunks()
          .map((chunk) => chunk['text'])
          .join(''),
      ).toContain('New journal suffix');
    } finally {
      await harness.chromeMock.storage.local.set({ [CALLER_TOOL_CUSTODY_KEY]: undefined });
    }
  });

  it.each(['RESOLVE_CHAT_APPROVAL', 'RESOLVE_CHAT_INPUT'])(
    'hands %s into browser recovery on the same active controller',
    async (type) => {
      const page = {
        tabId: 17,
        windowId: 3,
        url: 'https://example.test/application',
        documentId: 'original-document',
      };
      const observation = {
        tabId: 17,
        url: page.url,
        documentId: page.documentId,
        formSnapshotId: '44444444-4444-4444-8444-444444444444',
      };
      const tools = chatBrowserToolDefinitions('act');
      const checkpoint = {
        schema_version: AGENT_EVENT_SCHEMA_VERSION,
        run_id: runId,
        turn_id: 'fixture-turn',
        next_event_sequence: 8,
        calls: [
          {
            id: 'fill-saved',
            type: 'function' as const,
            function: { name: 'browser_fill_form', arguments: '{"fields":{"#name":"Recovered"}}' },
          },
        ],
      };
      const custody = createChromeCallerToolCustody(
        {
          owner,
          clientInstanceId: 'original-panel',
          streamId: 'original-stream',
          historyConversationId: 'fixture-local',
          conversationContext: FIXTURE_CONVERSATION_CONTEXT,
          browserContext: page,
        },
        () => undefined,
      );
      await custody.admit('hosted-browser-handoff-request', tools, observation);
      await custody.bindRun(runId);
      let initialSignal: AbortSignal | undefined;
      const executor =
        type === 'RESOLVE_CHAT_INPUT' ? harness.executeInput : harness.executeApproval;
      executor.mockImplementationOnce(async (request, deps) => {
        initialSignal = request.signal;
        await deps.onText('After approval ');
        await deps.onRunReference?.({ ...cloudRun, state: 'awaiting_input', lastSequence: 7 });
        await deps.onCallerCheckpoint?.(checkpoint);
        return { status: 'success' };
      });
      harness.resumeRun
        .mockImplementationOnce(async (request, deps) => {
          expect(request.alreadyVisibleText).toBe('Existing prefix.After approval ');
          await deps?.onCallerCheckpoint?.(checkpoint);
          return { status: 'error', code: 'server_error', message: 'Pending' };
        })
        .mockImplementationOnce(async (_request, deps) => {
          await deps?.onRunReference?.({ ...cloudRun, state: 'completed', lastSequence: 9 });
          await deps?.onText?.('Final reply');
          return { status: 'success' };
        });
      harness.executeCallerResume.mockResolvedValue({ status: 'success' });
      harness.assertCallerRun.mockResolvedValue(undefined);
      harness.authorizeTab.mockResolvedValue({
        tabId: 17,
        url: page.url,
        origin: 'https://example.test',
      });
      harness.chromeMock.tabs.get.mockResolvedValue({
        id: 17,
        windowId: 3,
        url: page.url,
        status: 'complete',
      });
      harness.chromeMock.scripting.executeScript.mockResolvedValue([
        { documentId: page.documentId, result: page.url },
      ]);
      harness.chromeMock.runtime.sendMessage.mockImplementation(async (value) => {
        const message = value as Record<string, unknown>;
        if (message['type'] === 'CHAT_TOOL_HANDOFF') {
          expect(message['recoveryContext']).toMatchObject({ observation });
          await dispatch({
            type: 'RESOLVE_CHAT_TOOLS',
            owner,
            id: 'hosted-browser-handoff',
            handoffId: message['handoffId'],
            results: [{ toolCallId: 'fill-saved', content: 'Filled one field', observation: null }],
          });
        }
      });
      await dispatch({
        type,
        id: 'hosted-browser-handoff',
        owner,
        cloudRun,
        alreadyVisibleText: 'Existing prefix.',
        toolApprovals: [{ tool_call_id: 'hosted-call', decision: 'approved' }],
        toolInputs: [{ tool_call_id: 'hosted-call', input_responses: { answer: 'fixture' } }],
      });
      await vi.waitFor(() =>
        expect(chunks().some((chunk) => chunk['done'] === true && !chunk['error'])).toBe(true),
      );
      expect(harness.executeCallerResume).toHaveBeenCalledOnce();
      expect(harness.assertCallerRun.mock.calls[0]![3]).toBe(initialSignal);
      expect(
        chunks()
          .map((chunk) => chunk['text'])
          .join(''),
      ).toBe('After approval Final reply');
    },
  );

  it('recovers only unstarted siblings, preserves form observations and advances through live checkpoints', async () => {
    const page = {
      tabId: 17,
      windowId: 3,
      url: 'https://example.test/application',
      documentId: 'original-document',
    };
    const observation = {
      tabId: 17,
      url: page.url,
      documentId: page.documentId,
      formSnapshotId: '44444444-4444-4444-8444-444444444444',
    };
    const tools = chatBrowserToolDefinitions('read');
    const checkpoint = {
      schema_version: AGENT_EVENT_SCHEMA_VERSION,
      run_id: runId,
      turn_id: 'fixture-turn',
      next_event_sequence: 8,
      calls: ['read-one', 'read-two'].map((id) => ({
        id,
        type: 'function' as const,
        function: { name: tools[0]!.function.name, arguments: '{}' },
      })),
    };
    const next = {
      ...checkpoint,
      next_event_sequence: 11,
      calls: [{ ...checkpoint.calls[0]!, id: 'read-three' }],
    };
    const custody = createChromeCallerToolCustody(
      {
        owner,
        clientInstanceId: 'original-panel',
        streamId: 'original-stream',
        historyConversationId: 'fixture-local',
        conversationContext: FIXTURE_CONVERSATION_CONTEXT,
        browserContext: page,
      },
      () => undefined,
    );
    await custody.admit('partial-broker-request', tools);
    await custody.bindRun(runId);
    await custody.claim(checkpoint);
    await custody.claimAction(checkpoint, 'read-one');
    await custody.completeAction(
      checkpoint,
      { tool_call_id: 'read-one', content: 'Saved first result' },
      observation,
    );
    harness.resumeRun
      .mockReset()
      .mockImplementationOnce(async (_request, deps) => {
        await deps?.onCallerCheckpoint?.(checkpoint);
        return { status: 'error', code: 'server_error', message: 'Pending' };
      })
      .mockImplementationOnce(async (_request, deps) => {
        await deps?.onCallerCheckpoint?.(next);
        return { status: 'error', code: 'server_error', message: 'Pending' };
      })
      .mockImplementationOnce(async (_request, deps) => {
        await deps?.onRunReference?.({ ...cloudRun, state: 'completed', lastSequence: 12 });
        await deps?.onText?.('Recovered final reply');
        return { status: 'success' };
      });
    harness.executeCallerResume.mockReset().mockResolvedValue({ status: 'success' });
    harness.assertCallerRun.mockResolvedValue(undefined);
    harness.authorizeTab.mockResolvedValue({
      tabId: 17,
      url: page.url,
      origin: 'https://example.test',
    });
    harness.chromeMock.tabs.get.mockResolvedValue({
      id: 17,
      windowId: 3,
      url: page.url,
      status: 'complete',
    });
    harness.chromeMock.scripting.executeScript.mockResolvedValue([
      { documentId: page.documentId, result: page.url },
    ]);
    harness.chromeMock.runtime.sendMessage.mockImplementation(async (value) => {
      const message = value as Record<string, unknown>;
      if (message['type'] === 'CHAT_TOOL_HANDOFF') {
        const calls = message['calls'] as Array<{ id: string }>;
        expect(calls).toHaveLength(1);
        expect(calls[0]!.id).not.toBe('read-one');
        expect(message['recoveryContext']).toMatchObject({
          historyConversationId: 'fixture-local',
          projectId: null,
          organizationId: null,
          browserContext: page,
          observation,
        });
        await dispatch({
          type: 'RESOLVE_CHAT_TOOLS',
          owner,
          id: 'partial-broker-recovery',
          handoffId: message['handoffId'],
          results: [{ toolCallId: calls[0]!.id, content: `New ${calls[0]!.id}`, observation }],
        });
      }
    });
    await dispatch({
      type: 'RESUME_CHAT_RUN',
      owner,
      id: 'partial-broker-recovery',
      cloudRun,
      alreadyVisibleText: '',
    });
    await vi.waitFor(() =>
      expect(chunks().some((chunk) => chunk['done'] === true && !chunk['error'])).toBe(true),
    );
    expect(harness.executeCallerResume).toHaveBeenCalledTimes(2);
    expect(harness.executeCallerResume.mock.calls[0]![0].receipt.tool_results).toEqual([
      { tool_call_id: 'read-one', content: 'Saved first result' },
      { tool_call_id: 'read-two', content: 'New read-two' },
    ]);
    expect(harness.executeCallerResume.mock.calls[1]![0].receipt.tool_results).toEqual([
      { tool_call_id: 'read-three', content: 'New read-three' },
    ]);
    expect(harness.assertCallerRun).toHaveBeenCalledTimes(2);
    expect(
      chunks()
        .map((chunk) => chunk['text'])
        .join(''),
    ).toContain('Recovered final reply');
  });

  it('retains a completed receipt and relays retry/quota metadata when posting is rate limited', async () => {
    const tools = chatBrowserToolDefinitions('read');
    const checkpoint = {
      schema_version: AGENT_EVENT_SCHEMA_VERSION,
      run_id: runId,
      turn_id: 'fixture-turn',
      next_event_sequence: 8,
      calls: [
        {
          id: 'saved-call',
          type: 'function' as const,
          function: { name: tools[0]!.function.name, arguments: '{}' },
        },
      ],
    };
    const receipt = {
      schema_version: checkpoint.schema_version,
      run_id: runId,
      turn_id: checkpoint.turn_id,
      next_event_sequence: 8,
      tool_results: [{ tool_call_id: 'saved-call', content: 'Saved result' }],
    };
    const custody = createChromeCallerToolCustody(
      {
        owner,
        clientInstanceId: 'original-panel',
        streamId: 'original-stream',
        historyConversationId: 'fixture-local',
        conversationContext: FIXTURE_CONVERSATION_CONTEXT,
      },
      () => undefined,
    );
    await custody.admit('rate-limit-receipt-request', tools);
    await custody.bindRun(runId);
    await custody.claim(checkpoint);
    await custody.claimAction(checkpoint, 'saved-call');
    await custody.completeAction(checkpoint, receipt.tool_results[0]!);
    await custody.complete(checkpoint, receipt);
    harness.resumeRun.mockImplementationOnce(async (_request, deps) => {
      await deps?.onCallerCheckpoint?.(checkpoint);
      return { status: 'error', code: 'server_error', message: 'Pending' };
    });
    harness.executeCallerResume.mockResolvedValueOnce({
      status: 'error',
      code: 'rate_limited',
      message: 'Retry later',
      retryAfterSeconds: 3,
      requestId: 'fixture-rate-limit',
      quota: { code: 'fixture-limit' },
    });
    await dispatch({
      type: 'RESUME_CHAT_RUN',
      owner,
      id: 'rate-limit-receipt-recovery',
      cloudRun,
      alreadyVisibleText: '',
    });
    await vi.waitFor(() =>
      expect(
        chunks().some((chunk) => chunk['done'] === true && chunk['errorCode'] === 'rate_limited'),
      ).toBe(true),
    );
    expect(chunks().find((chunk) => chunk['errorCode'] === 'rate_limited')).toMatchObject({
      errorRetryAfterSeconds: 3,
      errorRequestId: 'fixture-rate-limit',
      errorQuota: { code: 'fixture-limit' },
    });
    expect(
      (await chrome.storage.local.get(CALLER_TOOL_CUSTODY_KEY))[CALLER_TOOL_CUSTODY_KEY].entries[0]
        .step,
    ).toMatchObject({ state: 'completed', receipt });
    expect(harness.assertCallerRun).not.toHaveBeenCalled();
  });

  it('does not repost a saved receipt for a completed run', async () => {
    harness.executeCallerResume.mockClear();
    harness.resumeRun.mockClear();
    const custody = createChromeCallerToolCustody(
      {
        owner,
        clientInstanceId: 'cancellation-panel',
        streamId: 'already-completed-origin',
        historyConversationId: 'fixture-local',
        conversationContext: FIXTURE_CONVERSATION_CONTEXT,
      },
      () => undefined,
    );
    const tools = chatBrowserToolDefinitions('read');
    await custody.admit('already-completed-request', tools);
    await custody.bindRun(runId);
    const checkpoint = {
      schema_version: AGENT_EVENT_SCHEMA_VERSION,
      run_id: runId,
      turn_id: 'fixture-turn',
      next_event_sequence: 8,
      calls: [
        {
          id: 'completed-call',
          type: 'function' as const,
          function: { name: tools[0]!.function.name, arguments: '{}' },
        },
      ],
    };
    await custody.claim(checkpoint);
    await custody.claimAction(checkpoint, 'completed-call');
    await custody.completeAction(checkpoint, {
      tool_call_id: 'completed-call',
      content: 'Verified fixture result',
    });
    await custody.complete(checkpoint, {
      schema_version: AGENT_EVENT_SCHEMA_VERSION,
      run_id: runId,
      turn_id: 'fixture-turn',
      next_event_sequence: 8,
      tool_results: [{ tool_call_id: 'completed-call', content: 'Verified fixture result' }],
    });
    try {
      await dispatch({
        type: 'RESUME_CHAT_RUN',
        id: 'already-completed-recovery',
        owner,
        cloudRun: { ...cloudRun, state: 'completed', lastSequence: 12 },
        alreadyVisibleText: '',
      });
      await vi.waitFor(() => expect(harness.resumeRun).toHaveBeenCalledOnce());
      expect(harness.executeCallerResume).not.toHaveBeenCalled();
      await vi.waitFor(async () => {
        const stored = await harness.chromeMock.storage.local.get(CALLER_TOOL_CUSTODY_KEY);
        expect(
          (stored[CALLER_TOOL_CUSTODY_KEY] as { entries: Array<{ terminal: boolean }> }).entries[0]!
            .terminal,
        ).toBe(true);
      });
    } finally {
      await harness.chromeMock.storage.local.set({ [CALLER_TOOL_CUSTODY_KEY]: undefined });
    }
  });

  it('reads the live checkpoint but refuses an uncertain action before repeating browser work', async () => {
    harness.resumeRun.mockClear();
    const custody = createChromeCallerToolCustody(
      {
        owner,
        clientInstanceId: 'cancellation-panel',
        streamId: 'uncertain-origin',
        historyConversationId: 'fixture-local',
        conversationContext: FIXTURE_CONVERSATION_CONTEXT,
      },
      () => undefined,
    );
    const tools = chatBrowserToolDefinitions('read');
    await custody.admit('uncertain-caller-request', tools);
    await custody.bindRun(runId);
    const checkpoint = {
      schema_version: AGENT_EVENT_SCHEMA_VERSION,
      run_id: runId,
      turn_id: 'fixture-turn',
      next_event_sequence: 8,
      calls: [
        {
          id: 'uncertain-call',
          type: 'function' as const,
          function: { name: tools[0]!.function.name, arguments: '{}' },
        },
      ],
    };
    await custody.claim(checkpoint);
    await custody.claimAction(checkpoint, 'uncertain-call');
    harness.resumeRun.mockImplementationOnce(async (_request, deps) => {
      await deps?.onCallerCheckpoint?.(checkpoint);
      return { status: 'error', code: 'server_error', message: 'Pending browser results' };
    });
    try {
      await dispatch({
        type: 'RESUME_CHAT_RUN',
        id: 'uncertain-recovery',
        owner,
        cloudRun,
        alreadyVisibleText: '',
      });
      await vi.waitFor(() =>
        expect(
          chunks().some((chunk) => String(chunk['error']).includes('may already have run')),
        ).toBe(true),
      );
      expect(harness.resumeRun).toHaveBeenCalledOnce();
      expect(harness.assertCallerRun).not.toHaveBeenCalled();
      expect(harness.cancelRun).not.toHaveBeenCalled();
    } finally {
      await harness.chromeMock.storage.local.set({ [CALLER_TOOL_CUSTODY_KEY]: undefined });
    }
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

  it('refreshes the cancellation token without changing its admitted owner', async () => {
    await startChat('stream-renewed-stop');
    harness.getAuthContext.mockResolvedValue({ owner, token: 'renewed-account-a-token' });
    harness.cancelRun.mockImplementation(async (_run, dependencies) => {
      expect(await dependencies.getAuthToken()).toBe('renewed-account-a-token');
      return { status: 'success', run: cancelledRun };
    });

    const response = await dispatch({ type: 'CANCEL_STREAM', id: 'stream-renewed-stop', owner });
    expect(response).toMatchObject({ success: true, cancellationConfirmed: true });
    expect(signal?.aborted).toBe(true);
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

  it.each(['LIST_MEMORIES', 'ADD_MEMORY', 'UPDATE_MEMORY', 'DELETE_MEMORY'])(
    'refuses missing and mismatched owners for %s without a memory request',
    async (type) => {
      const requestsBefore = vi.mocked(fetch).mock.calls.length;
      for (const requestOwner of [undefined, otherOwner]) {
        const response = await dispatch({
          type,
          owner: requestOwner,
          id: 'memory-id',
          content: 'Old view draft',
        });
        expect(response).toMatchObject({ success: false, status: 'signed-out' });
      }
      expect(
        vi
          .mocked(fetch)
          .mock.calls.slice(requestsBefore)
          .filter(([url]) => String(url).includes('/api/memory')),
      ).toEqual([]);
    },
  );
});
