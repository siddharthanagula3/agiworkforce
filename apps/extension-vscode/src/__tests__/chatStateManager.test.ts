import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import type { ThreadReadResponse, ThreadSummary } from '@agiworkforce/types';
import {
  ChatStateManager,
  type ExtToWebviewMessage,
} from '../features/sidebar-webview/ChatStateManager';
import {
  MODEL_CONTEXT_LIMITS,
  MODEL_PICKER_OPTIONS,
  buildGroupedQuickPickItems,
  getModelProviderInfo,
} from '../features/model-picker/modelConstants';
import {
  LocalRuntimeProtocolError,
  type LocalRuntimeClient,
  type LocalRuntimeEvent,
} from '../integrations/localRuntimeClient';
import type { LocalRuntimePool } from '../integrations/localRuntimePool';
import type { ConversationTreeProvider } from '../features/trees/conversationTreeProvider';
import {
  setContextPanelInstance,
  type ContextPanelProvider,
} from '../features/trees/contextPanelProvider';
import { MEMORY_STORE_KEY } from '../memory/memoryStore';
import { ONBOARDING_SEEN_KEY } from '../features/onboarding/onboardingState';
import {
  HOST_CUSTOM_INSTRUCTIONS_KEY,
  WORKSPACE_CUSTOM_INSTRUCTIONS_KEY,
} from '../features/instructions';
import { SYNTHETIC_LOCAL_MODEL_ID } from './catalogModelFixtures';
import { getTokenCounter } from '../data/tokenCounter';
import * as api from '../utils/api';

function threadSummary(overrides: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    id: 'thread-1',
    title: 'Developer session',
    model: 'auto',
    cwd: '/workspace',
    provider: 'anthropic',
    trustMode: 'byok',
    createdAt: '2026-08-02T12:00:00.000Z',
    updatedAt: '2026-08-02T12:00:00.000Z',
    createdBy: 'vscode',
    status: 'idle',
    ...overrides,
  };
}

function makeHarness(
  options: {
    approvalFailure?: Error;
    startTurn?: Promise<{ id: string }>;
    localModels?: Array<{ id: string; provider: 'ollama' | 'lmstudio' }>;
    localModelError?: Error;
    resolvedConversation?: ThreadReadResponse;
    resumedThread?: ThreadSummary | Error;
    steerFailure?: Error;
    steerTurn?: Promise<{ id: string }>;
    interruptTurn?: Promise<void>;
  } = {},
) {
  const listeners = new Set<(event: LocalRuntimeEvent) => void>();
  const startedThreads = new Map<string, ThreadSummary>();
  const runtime = {
    startThread: vi
      .fn()
      .mockImplementation(async (params: { model?: string; provider?: 'ollama' | 'lmstudio' }) => {
        const model = params.model ?? 'auto';
        const thread = threadSummary({
          model,
          provider: params.provider ?? getModelProviderInfo(model).providerId ?? 'anthropic',
          trustMode: params.provider === undefined ? 'byok' : 'local',
        });
        startedThreads.set(thread.id, thread);
        return thread;
      }),
    resumeThread:
      options.resumedThread instanceof Error
        ? vi.fn().mockRejectedValue(options.resumedThread)
        : vi
            .fn()
            .mockImplementation(
              async (threadId: string) =>
                options.resumedThread ??
                (options.resolvedConversation?.thread.id === threadId
                  ? options.resolvedConversation.thread
                  : threadSummary({ id: threadId })),
            ),
    readThread: vi.fn().mockImplementation(async (threadId: string) =>
      options.resolvedConversation?.thread.id === threadId
        ? options.resolvedConversation
        : {
            thread: startedThreads.get(threadId) ?? threadSummary({ id: threadId }),
            messages: [],
            transcriptTruncated: false,
          },
    ),
    listLocalModels:
      options.localModelError === undefined
        ? vi.fn().mockResolvedValue({ models: options.localModels ?? [] })
        : vi.fn().mockRejectedValue(options.localModelError),
    startTurn: vi.fn(() => options.startTurn ?? Promise.resolve({ id: 'turn-1' })),
    steerTurn:
      options.steerFailure === undefined
        ? vi.fn(() => options.steerTurn ?? Promise.resolve({ id: 'turn-1' }))
        : vi.fn().mockRejectedValue(options.steerFailure),
    interruptTurn: vi.fn(() => options.interruptTurn ?? Promise.resolve()),
    respondToApproval:
      options.approvalFailure === undefined
        ? vi.fn().mockResolvedValue(undefined)
        : vi.fn().mockRejectedValue(options.approvalFailure),
    onEvent: vi.fn((listener: (event: LocalRuntimeEvent) => void) => {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    }),
  };
  const pool = {
    forWorkspace: vi.fn(() => runtime as unknown as LocalRuntimeClient),
  } as unknown as LocalRuntimePool;
  const context = new vscode.ExtensionContext();
  const posted: ExtToWebviewMessage[] = [];
  const conversationTreeProvider =
    options.resolvedConversation === undefined
      ? undefined
      : ({
          resolveThread: vi.fn().mockResolvedValue({
            response: options.resolvedConversation,
            runtime,
            cwd: options.resolvedConversation.thread.cwd ?? '/workspace',
          }),
          refresh: vi.fn(),
        } as unknown as ConversationTreeProvider);
  const manager = new ChatStateManager(
    context.secrets,
    context,
    (message) => posted.push(message),
    conversationTreeProvider,
    context.workspaceState,
    pool,
  );
  return {
    context,
    manager,
    runtime,
    conversationTreeProvider,
    posted,
    emit(event: LocalRuntimeEvent) {
      for (const listener of listeners) listener(event);
    },
  };
}

describe('ChatStateManager local turn lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vscode.workspace.isTrusted = true;
    vscode.window.activeTextEditor = undefined;
    vscode.workspace.workspaceFolders = [
      { name: 'workspace', index: 0, uri: vscode.Uri.file('/workspace') },
    ];
    setContextPanelInstance({
      getContextFiles: () => ['/workspace/src/context.ts'],
    } as ContextPanelProvider);
  });

  it('acknowledges an Apply failure when no editor is open', async () => {
    const harness = makeHarness();

    await harness.manager.handleMessage({
      type: 'proposeDiff',
      payload: { code: 'const answer = 42;', language: 'typescript' },
    });

    expect(harness.posted).toContainEqual({
      type: 'diffProposalFailed',
      payload: { message: 'Open a file in the editor to review this code suggestion.' },
    });
  });

  it('does not launch the privileged local runtime for an untrusted workspace', async () => {
    const harness = makeHarness();
    vscode.workspace.isTrusted = false;

    await harness.manager.handleMessage({ type: 'sendMessage', payload: { text: 'Run tests' } });

    expect(harness.runtime.startThread).not.toHaveBeenCalled();
    expect(harness.posted).toContainEqual({
      type: 'error',
      payload: { message: 'Trust this workspace before starting a developer session.' },
    });
  });

  it.each([
    [
      'a relative cwd',
      threadSummary({ cwd: 'workspace' }),
      'workspace metadata that does not match',
    ],
    [
      'a non-runnable status',
      threadSummary({ status: 'running' }),
      'non-runnable status "running"',
    ],
  ] as const)('rejects a new thread with %s before prompt egress', async (_case, thread, error) => {
    const harness = makeHarness();
    harness.runtime.startThread.mockResolvedValueOnce(thread);

    await harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'SECRET_PROMPT', clientMessageId: 'msg-invalid-thread' },
    });

    expect(harness.runtime.startTurn).not.toHaveBeenCalled();
    expect(harness.posted).toContainEqual({
      type: 'error',
      payload: { message: expect.stringContaining(error) },
    });
  });

  it('rejects a non-Local start response before prompt and attachment egress', async () => {
    const harness = makeHarness({
      localModels: [{ id: SYNTHETIC_LOCAL_MODEL_ID, provider: 'ollama' }],
    });
    await harness.manager.handleMessage({ type: 'openModelPopover' });
    await harness.manager.handleMessage({
      type: 'selectModel',
      payload: { modelId: SYNTHETIC_LOCAL_MODEL_ID },
    });
    await harness.manager.handleMessage({
      type: 'attachFiles',
      payload: {
        files: [
          {
            name: 'secret.txt',
            mimeType: 'text/plain',
            sizeBytes: 6,
            dataUrl: 'data:text/plain;base64,U0VDUkVU',
          },
        ],
      },
    });
    harness.runtime.startThread.mockResolvedValueOnce(
      threadSummary({ model: SYNTHETIC_LOCAL_MODEL_ID, provider: 'anthropic', trustMode: 'byok' }),
    );

    await harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'SECRET_PROMPT', clientMessageId: 'msg-local-mismatch' },
    });

    expect(harness.runtime.startTurn).not.toHaveBeenCalled();
    expect(harness.posted).not.toContainEqual(
      expect.objectContaining({
        type: 'attachmentsConsumed',
      }),
    );
    expect(harness.posted).toContainEqual({
      type: 'error',
      payload: { message: expect.stringContaining('when local was requested') },
    });
  });

  it('persists onboarding completion in global extension state', async () => {
    const harness = makeHarness();

    await harness.manager.handleMessage({ type: 'completeOnboarding' });

    expect(harness.context.globalState.get<boolean>(ONBOARDING_SEEN_KEY)).toBe(true);
  });

  it('reconciles a stale first-run webview after durable onboarding completion', async () => {
    const harness = makeHarness();
    await harness.context.globalState.update(ONBOARDING_SEEN_KEY, true);

    await harness.manager.handleMessage({ type: 'ready' });

    expect(harness.posted).toContainEqual({ type: 'hideOnboarding' });
  });

  it('returns exact active-selection metadata in sidebar file search results', async () => {
    const harness = makeHarness();
    const uri = vscode.Uri.file('/workspace/src/app.ts');
    vi.mocked(vscode.workspace.findFiles).mockResolvedValueOnce([uri]);
    vi.spyOn(vscode.workspace, 'asRelativePath').mockReturnValue('src/app.ts');
    vscode.window.activeTextEditor = {
      document: { uri },
      selection: new vscode.Selection(4, 1, 6, 8),
    } as unknown as vscode.TextEditor;

    await harness.manager.handleMessage({ type: 'fileSearch', payload: { query: 'app' } });

    expect(harness.posted).toContainEqual({
      type: 'fileSearchResults',
      payload: {
        files: [
          {
            path: 'src/app.ts',
            label: 'src/app.ts · lines 5-7',
            range: { startLine: 4, startCharacter: 1, endLine: 6, endCharacter: 8 },
          },
        ],
      },
    });
  });

  it('replays onboarding without mutating chat state', () => {
    const harness = makeHarness();

    harness.manager.showOnboarding();

    expect(harness.posted).toContainEqual({ type: 'showOnboarding' });
    expect(harness.runtime.startThread).not.toHaveBeenCalled();
  });

  it('opens permission, privacy, and background-task handoffs on their canonical Web routes', async () => {
    const harness = makeHarness();

    await harness.manager.handleMessage({ type: 'openPermissionDocs' });
    await harness.manager.handleMessage({ type: 'openPrivacySettings' });
    await harness.manager.handleMessage({ type: 'openWebTasks' });

    expect(vscode.env.openExternal).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        toString: expect.any(Function),
      }),
    );
    expect(vi.mocked(vscode.env.openExternal).mock.calls.map(([uri]) => uri.path)).toEqual([
      'https://agiworkforce.com/docs?topic=permissions&from=vscode-extension',
      'https://agiworkforce.com/settings/privacy?from=vscode-extension',
      'https://agiworkforce.com/tasks?from=vscode-extension',
    ]);
  });

  it('does not mislabel unresolved Auto routing as AGI Cloud', async () => {
    const harness = makeHarness();

    await harness.manager.handleMessage({ type: 'ready' });

    expect(harness.posted).toContainEqual({
      type: 'providerBadge',
      payload: {
        providerLabel: 'Auto routing',
        brandColor: 'var(--vscode-descriptionForeground)',
      },
    });
    expect(harness.posted).not.toContainEqual(
      expect.objectContaining({
        type: 'providerBadge',
        payload: expect.objectContaining({ providerLabel: 'AGI Cloud' }),
      }),
    );
  });

  it.each(['idle', 'failed'] as const)(
    'resumes a %s runtime session into live chat, replays it after ready, and appends on the same id',
    async (status) => {
      const persisted = {
        thread: threadSummary({
          id: 'history-1',
          title: 'Persisted work',
          status,
        }),
        messages: [
          { role: 'system', text: 'internal runtime metadata' },
          { role: 'user', text: 'Inspect this workspace' },
          { role: 'assistant', text: 'I found the owner module.' },
        ],
        transcriptTruncated: false,
      } satisfies ThreadReadResponse;
      const harness = makeHarness({ resolvedConversation: persisted });

      await expect(harness.manager.resumeConversation('history-1')).resolves.toBe(true);
      expect(harness.runtime.resumeThread).toHaveBeenCalledWith('history-1');
      expect(harness.posted).toContainEqual({
        type: 'conversationLoaded',
        payload: {
          threadId: 'history-1',
          title: 'Persisted work',
          model: 'auto',
          trustMode: 'byok',
          provider: 'anthropic',
          messages: [
            { role: 'user', text: 'Inspect this workspace' },
            { role: 'assistant', text: 'I found the owner module.' },
          ],
          transcriptTruncated: false,
        },
      });

      harness.posted.length = 0;
      await harness.manager.handleMessage({ type: 'ready' });
      expect(harness.posted).toContainEqual(
        expect.objectContaining({
          type: 'conversationLoaded',
          payload: expect.objectContaining({ threadId: 'history-1' }),
        }),
      );

      harness.runtime.readThread.mockResolvedValueOnce({
        thread: threadSummary({ id: 'history-1', title: 'Persisted work' }),
        messages: [
          ...persisted.messages,
          { role: 'user', text: 'Make the narrow fix' },
          { role: 'assistant', text: 'The fix is complete.' },
        ],
        transcriptTruncated: false,
      });
      const send = harness.manager.handleMessage({
        type: 'sendMessage',
        payload: { text: 'Make the narrow fix', clientMessageId: 'msg-resumed' },
      });
      await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
      expect(harness.runtime.startThread).not.toHaveBeenCalled();
      expect(harness.runtime.startTurn).toHaveBeenCalledWith(
        expect.objectContaining({ threadId: 'history-1' }),
      );
      harness.emit({
        type: 'turn_completed',
        threadId: 'history-1',
        turnId: 'turn-1',
        status: 'completed',
        response: 'The fix is complete.',
        inputTokens: 1,
        outputTokens: 1,
      });
      await send;

      harness.posted.length = 0;
      await harness.manager.handleMessage({ type: 'ready' });
      expect(harness.posted).toContainEqual(
        expect.objectContaining({
          type: 'conversationLoaded',
          payload: expect.objectContaining({
            threadId: 'history-1',
            messages: expect.arrayContaining([
              { role: 'user', text: 'Make the narrow fix' },
              { role: 'assistant', text: 'The fix is complete.' },
            ]),
          }),
        }),
      );
    },
  );

  it('warns when resumed history is only the bounded newest-message window', async () => {
    const harness = makeHarness({
      resolvedConversation: {
        thread: threadSummary({ id: 'truncated-1' }),
        messages: [{ role: 'user', text: 'Newest persisted prompt' }],
        transcriptTruncated: true,
      },
    });

    await expect(harness.manager.resumeConversation('truncated-1')).resolves.toBe(true);

    expect(harness.posted).toContainEqual({
      type: 'conversationLoaded',
      payload: expect.objectContaining({
        threadId: 'truncated-1',
        transcriptTruncated: true,
      }),
    });
    expect(harness.posted).toContainEqual({
      type: 'sessionNotice',
      payload: {
        message: expect.stringContaining('bounded newest-message window'),
      },
    });
  });

  it.each(['running', 'awaiting_approval', 'archived'] as const)(
    'refuses to resume a %s session owned by another lifecycle',
    async (status) => {
      const harness = makeHarness({
        resolvedConversation: {
          thread: threadSummary({ id: 'blocked-1', status }),
          messages: [],
          transcriptTruncated: false,
        },
      });

      await expect(harness.manager.resumeConversation('blocked-1')).resolves.toBe(false);
      expect(harness.runtime.resumeThread).not.toHaveBeenCalled();
      expect(harness.posted).toContainEqual(expect.objectContaining({ type: 'error' }));
    },
  );

  it('refuses legacy sessions whose persisted trust boundary is unknown', async () => {
    const harness = makeHarness({
      resolvedConversation: {
        thread: threadSummary({ id: 'legacy-1', trustMode: 'unknown', provider: undefined }),
        messages: [{ role: 'user', text: 'Legacy prompt' }],
        transcriptTruncated: false,
      },
    });

    await expect(harness.manager.resumeConversation('legacy-1')).resolves.toBe(false);
    expect(harness.runtime.resumeThread).not.toHaveBeenCalled();
    expect(harness.posted).toContainEqual({
      type: 'error',
      payload: { message: expect.stringContaining('no verified Local, BYOK, or Managed boundary') },
    });
  });

  it('retains a resumed transcript when a follow-up is rejected before dispatch', async () => {
    const harness = makeHarness({
      resolvedConversation: {
        thread: threadSummary({ id: 'history-1' }),
        messages: [{ role: 'user', text: 'Keep this visible' }],
        transcriptTruncated: false,
      },
    });
    await harness.manager.resumeConversation('history-1');
    vscode.workspace.isTrusted = false;

    await harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Rejected follow-up', clientMessageId: 'msg-rejected' },
    });
    vscode.workspace.isTrusted = true;
    harness.posted.length = 0;
    await harness.manager.handleMessage({ type: 'ready' });

    expect(harness.runtime.startTurn).not.toHaveBeenCalled();
    expect(harness.posted).toContainEqual(
      expect.objectContaining({
        type: 'conversationLoaded',
        payload: expect.objectContaining({
          threadId: 'history-1',
          messages: [{ role: 'user', text: 'Keep this visible' }],
        }),
      }),
    );
  });

  it('lets New Chat invalidate a delayed history selection without stale UI effects', async () => {
    const persisted = {
      thread: threadSummary({ id: 'delayed-1' }),
      messages: [{ role: 'user', text: 'Do not resurrect this' }],
      transcriptTruncated: false,
    } satisfies ThreadReadResponse;
    const harness = makeHarness({ resolvedConversation: persisted });
    let resolveHistory!: (value: {
      response: ThreadReadResponse;
      runtime: LocalRuntimeClient;
      cwd: string;
    }) => void;
    vi.mocked(harness.conversationTreeProvider!.resolveThread).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveHistory = resolve;
      }),
    );
    const resume = harness.manager.resumeConversation('delayed-1');

    await harness.manager.handleMessage({ type: 'newChat' });
    resolveHistory({
      response: persisted,
      runtime: harness.runtime as unknown as LocalRuntimeClient,
      cwd: '/workspace',
    });

    await expect(resume).resolves.toBe(false);
    expect(harness.runtime.resumeThread).not.toHaveBeenCalled();
    expect(harness.posted).not.toContainEqual(
      expect.objectContaining({ type: 'conversationLoaded' }),
    );
  });

  it('lets a newly-started send invalidate a delayed history selection', async () => {
    const persisted = {
      thread: threadSummary({ id: 'delayed-1' }),
      messages: [{ role: 'user', text: 'Old history' }],
      transcriptTruncated: false,
    } satisfies ThreadReadResponse;
    const harness = makeHarness({ resolvedConversation: persisted });
    let resolveHistory!: (value: {
      response: ThreadReadResponse;
      runtime: LocalRuntimeClient;
      cwd: string;
    }) => void;
    vi.mocked(harness.conversationTreeProvider!.resolveThread).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveHistory = resolve;
      }),
    );
    const resume = harness.manager.resumeConversation('delayed-1');
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Newest intent', clientMessageId: 'msg-newest-intent' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    resolveHistory({
      response: persisted,
      runtime: harness.runtime as unknown as LocalRuntimeClient,
      cwd: '/workspace',
    });

    await expect(resume).resolves.toBe(false);
    expect(harness.runtime.resumeThread).not.toHaveBeenCalled();
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'done',
      inputTokens: 1,
      outputTokens: 1,
    });
    await send;
  });

  it('gives the latest of two out-of-order history selections sole ownership', async () => {
    const secondConversation = {
      thread: threadSummary({ id: 'history-new', title: 'Newest history' }),
      messages: [{ role: 'user', text: 'Newest persisted prompt' }],
      transcriptTruncated: false,
    } satisfies ThreadReadResponse;
    const firstConversation = {
      thread: threadSummary({ id: 'history-old', title: 'Older history' }),
      messages: [{ role: 'user', text: 'Stale persisted prompt' }],
      transcriptTruncated: false,
    } satisfies ThreadReadResponse;
    const harness = makeHarness({ resolvedConversation: secondConversation });
    let resolveFirst!: (value: {
      response: ThreadReadResponse;
      runtime: LocalRuntimeClient;
      cwd: string;
    }) => void;
    let resolveSecond!: (value: {
      response: ThreadReadResponse;
      runtime: LocalRuntimeClient;
      cwd: string;
    }) => void;
    vi.mocked(harness.conversationTreeProvider!.resolveThread)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSecond = resolve;
        }),
      );
    const first = harness.manager.resumeConversation('history-old');
    const second = harness.manager.resumeConversation('history-new');
    resolveSecond({
      response: secondConversation,
      runtime: harness.runtime as unknown as LocalRuntimeClient,
      cwd: '/workspace',
    });
    await expect(second).resolves.toBe(true);
    resolveFirst({
      response: firstConversation,
      runtime: harness.runtime as unknown as LocalRuntimeClient,
      cwd: '/workspace',
    });

    await expect(first).resolves.toBe(false);
    expect(harness.runtime.resumeThread).toHaveBeenCalledTimes(1);
    expect(harness.runtime.resumeThread).toHaveBeenCalledWith('history-new');
    const loaded = harness.posted.filter((message) => message.type === 'conversationLoaded');
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          threadId: 'history-new',
          messages: [{ role: 'user', text: 'Newest persisted prompt' }],
        }),
      }),
    );
  });

  it('rejects a resumed runtime response owned by another workspace', async () => {
    const persisted = {
      thread: threadSummary({ id: 'wrong-cwd-1' }),
      messages: [],
      transcriptTruncated: false,
    } satisfies ThreadReadResponse;
    const harness = makeHarness({
      resolvedConversation: persisted,
      resumedThread: threadSummary({ id: 'wrong-cwd-1', cwd: '/another-workspace' }),
    });

    await expect(harness.manager.resumeConversation('wrong-cwd-1')).resolves.toBe(false);
    expect(harness.posted).toContainEqual({
      type: 'error',
      payload: { message: expect.stringContaining('workspace does not match') },
    });
    expect(harness.posted).not.toContainEqual(
      expect.objectContaining({ type: 'conversationLoaded' }),
    );
  });

  it('rejects an unavailable persisted model instead of silently changing its route', async () => {
    const harness = makeHarness({
      resolvedConversation: {
        thread: threadSummary({ id: 'unknown-model-1', model: 'removed-provider-model' }),
        messages: [],
        transcriptTruncated: false,
      },
    });

    await expect(harness.manager.resumeConversation('unknown-model-1')).resolves.toBe(false);
    expect(harness.runtime.startTurn).not.toHaveBeenCalled();
    expect(harness.posted).toContainEqual({
      type: 'error',
      payload: { message: expect.stringContaining('not available') },
    });
  });

  it('continues an authoritative Local Auto session without treating Auto as a cloud handoff', async () => {
    const persisted = {
      thread: threadSummary({
        id: 'local-auto-1',
        model: 'auto',
        provider: 'ollama',
        trustMode: 'local',
      }),
      messages: [],
      transcriptTruncated: false,
    } satisfies ThreadReadResponse;
    const harness = makeHarness({ resolvedConversation: persisted, localModels: [] });

    await expect(harness.manager.resumeConversation('local-auto-1')).resolves.toBe(true);
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Continue the same Local Auto route', clientMessageId: 'msg-local-auto' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());

    expect(harness.runtime.startThread).not.toHaveBeenCalled();
    expect(harness.runtime.startTurn).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: 'local-auto-1', model: 'auto' }),
    );
    expect(harness.posted).not.toContainEqual(
      expect.objectContaining({
        type: 'followUpStatus',
        payload: expect.objectContaining({ clientMessageId: 'msg-local-auto', kind: 'error' }),
      }),
    );
    harness.emit({
      type: 'turn_completed',
      threadId: 'local-auto-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'done',
      inputTokens: 1,
      outputTokens: 1,
    });
    await send;
  });

  it('continues an authoritative Local custom model even when discovery omits it', async () => {
    const persisted = {
      thread: threadSummary({
        id: 'local-custom-1',
        model: 'localhost/custom-coder',
        provider: 'lmstudio',
        trustMode: 'local',
      }),
      messages: [],
      transcriptTruncated: false,
    } satisfies ThreadReadResponse;
    const harness = makeHarness({ resolvedConversation: persisted, localModels: [] });

    await expect(harness.manager.resumeConversation('local-custom-1')).resolves.toBe(true);
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Continue the same custom model', clientMessageId: 'msg-local-custom' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());

    expect(harness.runtime.startThread).not.toHaveBeenCalled();
    expect(harness.runtime.startTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'local-custom-1',
        model: 'localhost/custom-coder',
      }),
    );
    harness.emit({
      type: 'turn_completed',
      threadId: 'local-custom-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'done',
      inputTokens: 1,
      outputTokens: 1,
    });
    await send;
  });

  it('drains active-turn follow-ups in controller-local FIFO order', async () => {
    const harness = makeHarness();
    harness.runtime.startTurn
      .mockResolvedValueOnce({ id: 'turn-1' })
      .mockResolvedValueOnce({ id: 'turn-2' })
      .mockResolvedValueOnce({ id: 'turn-3' });
    const first = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'First', clientMessageId: 'msg-first' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledTimes(1));

    await harness.manager.handleMessage({
      type: 'sendMessage',
      payload: {
        text: 'Second',
        followUpBehavior: 'queue',
        clientMessageId: 'msg-second',
      },
    });
    await harness.manager.handleMessage({
      type: 'sendMessage',
      payload: {
        text: 'Third',
        followUpBehavior: 'queue',
        clientMessageId: 'msg-third',
      },
    });
    expect(harness.runtime.startTurn).toHaveBeenCalledTimes(1);

    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'one',
      inputTokens: 1,
      outputTokens: 1,
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledTimes(2));
    expect(harness.posted).toContainEqual({
      type: 'turnStarted',
      payload: {
        queued: true,
        queueRemaining: 1,
        clientMessageId: 'msg-second',
        text: 'Second',
      },
    });
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-2',
      status: 'completed',
      response: 'two',
      inputTokens: 1,
      outputTokens: 1,
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledTimes(3));
    expect(harness.posted).toContainEqual({
      type: 'turnStarted',
      payload: {
        queued: true,
        queueRemaining: 0,
        clientMessageId: 'msg-third',
        text: 'Third',
      },
    });
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-3',
      status: 'completed',
      response: 'three',
      inputTokens: 1,
      outputTokens: 1,
    });
    await first;

    const dispatchedText = harness.runtime.startTurn.mock.calls.map(
      ([params]) => params.input.find((input: { type: string }) => input.type === 'text')?.text,
    );
    expect(dispatchedText).toEqual(['First', 'Second', 'Third']);
  });

  it('caps the volatile follow-up FIFO at 20 and preserves accepted order and rejected attachments', async () => {
    const harness = makeHarness();
    let turnSequence = 0;
    harness.runtime.startTurn.mockImplementation(async () => ({ id: `turn-${++turnSequence}` }));
    const first = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Active turn', clientMessageId: 'msg-active' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());

    for (let index = 1; index <= 20; index++) {
      await harness.manager.handleMessage({
        type: 'sendMessage',
        payload: {
          text: `Queued ${index}`,
          followUpBehavior: 'queue',
          clientMessageId: `msg-queued-${index}`,
        },
      });
    }
    await harness.manager.handleMessage({
      type: 'attachFiles',
      payload: {
        files: [
          {
            name: 'overflow.png',
            mimeType: 'image/png',
            sizeBytes: 3,
            dataUrl: 'data:image/png;base64,AQID',
          },
        ],
      },
    });
    const attachmentAck = [...harness.posted]
      .reverse()
      .find((message) => message.type === 'attachFilesAck') as
      | Extract<ExtToWebviewMessage, { type: 'attachFilesAck' }>
      | undefined;
    const attachmentId = attachmentAck?.payload.added[0]?.id;

    await harness.manager.handleMessage({
      type: 'sendMessage',
      payload: {
        text: 'Rejected overflow',
        followUpBehavior: 'queue',
        clientMessageId: 'msg-overflow',
      },
    });

    expect(harness.runtime.startTurn).toHaveBeenCalledOnce();
    expect(harness.posted).toContainEqual({
      type: 'followUpStatus',
      payload: {
        kind: 'error',
        message:
          'Follow-up capacity is full (20 pending). Try again after the active turn finishes.',
        queueDepth: 20,
        attachmentIds: [attachmentId],
        clientMessageId: 'msg-overflow',
      },
    });
    expect(harness.posted).toContainEqual({
      type: 'attachmentsReleased',
      payload: { ids: [attachmentId] },
    });

    for (let index = 0; index <= 20; index++) {
      harness.emit({
        type: 'turn_completed',
        threadId: 'thread-1',
        turnId: `turn-${index + 1}`,
        status: 'completed',
        response: 'done',
        inputTokens: 1,
        outputTokens: 1,
      });
      if (index < 20) {
        await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledTimes(index + 2));
      }
    }
    await first;

    const dispatchedText = harness.runtime.startTurn.mock.calls.map(
      ([params]) => params.input.find((input: { type: string }) => input.type === 'text')?.text,
    );
    expect(dispatchedText).toEqual([
      'Active turn',
      ...Array.from({ length: 20 }, (_, index) => `Queued ${index + 1}`),
    ]);
    expect(dispatchedText).not.toContain('Rejected overflow');

    const retry = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Retry after capacity frees', clientMessageId: 'msg-retry' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledTimes(22));
    expect(harness.runtime.startTurn.mock.calls[21]?.[0].input).toContainEqual({
      type: 'image',
      image_url: 'data:image/png;base64,AQID',
    });
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-22',
      status: 'completed',
      response: 'done',
      inputTokens: 1,
      outputTokens: 1,
    });
    await retry;
  });

  it('ignores a stale prior terminal while the next queued turn is still starting', async () => {
    let resolveSecondTurn!: (turn: { id: string }) => void;
    const delayedSecondTurn = new Promise<{ id: string }>((resolve) => {
      resolveSecondTurn = resolve;
    });
    const harness = makeHarness();
    harness.runtime.startTurn
      .mockResolvedValueOnce({ id: 'turn-1' })
      .mockReturnValueOnce(delayedSecondTurn)
      .mockResolvedValueOnce({ id: 'turn-3' });
    const first = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'First', clientMessageId: 'msg-buffer-first' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    await harness.manager.handleMessage({
      type: 'sendMessage',
      payload: {
        text: 'Second',
        followUpBehavior: 'queue',
        clientMessageId: 'msg-buffer-second',
      },
    });
    await harness.manager.handleMessage({
      type: 'sendMessage',
      payload: {
        text: 'Third',
        followUpBehavior: 'queue',
        clientMessageId: 'msg-buffer-third',
      },
    });
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'first done',
      inputTokens: 1,
      outputTokens: 1,
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledTimes(2));

    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'stale duplicate',
      inputTokens: 1,
      outputTokens: 1,
    });
    resolveSecondTurn({ id: 'turn-2' });
    await vi.waitFor(() =>
      expect(harness.posted).toContainEqual({
        type: 'turnStarted',
        payload: {
          queued: true,
          queueRemaining: 1,
          clientMessageId: 'msg-buffer-second',
          text: 'Second',
        },
      }),
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(harness.runtime.startTurn).toHaveBeenCalledTimes(2);

    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-2',
      status: 'completed',
      response: 'second done',
      inputTokens: 1,
      outputTokens: 1,
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledTimes(3));
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-3',
      status: 'completed',
      response: 'third done',
      inputTokens: 1,
      outputTokens: 1,
    });
    await first;
  });

  it('steers the active turn with the expected turn id', async () => {
    const harness = makeHarness();
    const first = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Initial', clientMessageId: 'msg-initial' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());

    await harness.manager.handleMessage({
      type: 'sendMessage',
      payload: {
        text: 'Adjust course',
        followUpBehavior: 'steer',
        clientMessageId: 'msg-steer',
      },
    });

    expect(harness.runtime.steerTurn).toHaveBeenCalledWith({
      threadId: 'thread-1',
      expectedTurnId: 'turn-1',
      input: [{ type: 'text', text: 'Adjust course', text_elements: [] }],
    });
    expect(harness.runtime.startTurn).toHaveBeenCalledOnce();
    expect(harness.posted).toContainEqual({
      type: 'followUpStatus',
      payload: expect.objectContaining({ kind: 'steered', clientMessageId: 'msg-steer' }),
    });
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'done',
      inputTokens: 1,
      outputTokens: 1,
    });
    await first;
  });

  it('falls back to FIFO when the active turn changes before steering', async () => {
    const harness = makeHarness({
      steerFailure: new LocalRuntimeProtocolError('active turn changed', -32009),
    });
    harness.runtime.startTurn
      .mockResolvedValueOnce({ id: 'turn-1' })
      .mockResolvedValueOnce({ id: 'turn-2' });
    const first = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Initial', clientMessageId: 'msg-initial' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    await harness.manager.handleMessage({
      type: 'sendMessage',
      payload: {
        text: 'Race-safe follow-up',
        followUpBehavior: 'steer',
        clientMessageId: 'msg-fallback',
      },
    });
    expect(harness.posted).toContainEqual({
      type: 'followUpStatus',
      payload: expect.objectContaining({ kind: 'queue-fallback', clientMessageId: 'msg-fallback' }),
    });
    expect(harness.runtime.startTurn).toHaveBeenCalledOnce();

    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'done',
      inputTokens: 1,
      outputTokens: 1,
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledTimes(2));
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-2',
      status: 'completed',
      response: 'done',
      inputTokens: 1,
      outputTokens: 1,
    });
    await first;
  });

  it('cancels an in-progress steer exactly when New Chat wins the race', async () => {
    let resolveSteer!: (turn: { id: string }) => void;
    const delayedSteer = new Promise<{ id: string }>((resolve) => {
      resolveSteer = resolve;
    });
    const harness = makeHarness({ steerTurn: delayedSteer });
    const first = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Initial', clientMessageId: 'msg-steer-race-initial' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    await harness.manager.handleMessage({
      type: 'attachFiles',
      payload: {
        files: [
          {
            name: 'steer.png',
            mimeType: 'image/png',
            sizeBytes: 3,
            dataUrl: 'data:image/png;base64,AQID',
          },
        ],
      },
    });
    const attachmentAck = harness.posted.find((message) => message.type === 'attachFilesAck') as
      | Extract<ExtToWebviewMessage, { type: 'attachFilesAck' }>
      | undefined;
    const attachmentId = attachmentAck?.payload.added[0]?.id;
    const steer = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: {
        text: 'Delayed steer',
        followUpBehavior: 'steer',
        clientMessageId: 'msg-delayed-steer',
      },
    });
    await vi.waitFor(() => expect(harness.runtime.steerTurn).toHaveBeenCalledOnce());

    await harness.manager.handleMessage({ type: 'newChat' });
    resolveSteer({ id: 'turn-1' });
    await steer;
    await first;

    expect(harness.runtime.startTurn).toHaveBeenCalledOnce();
    expect(harness.posted).toContainEqual({
      type: 'attachmentsReleased',
      payload: { ids: [attachmentId] },
    });
    expect(harness.posted).toContainEqual({
      type: 'followUpStatus',
      payload: expect.objectContaining({
        kind: 'cancelled',
        clientMessageId: 'msg-delayed-steer',
      }),
    });
    expect(harness.posted).not.toContainEqual({
      type: 'followUpStatus',
      payload: expect.objectContaining({
        kind: 'steered',
        clientMessageId: 'msg-delayed-steer',
      }),
    });
  });

  it('cancels an awaiting steer exactly when Stop wins the RPC race', async () => {
    let resolveSteer!: (turn: { id: string }) => void;
    const delayedSteer = new Promise<{ id: string }>((resolve) => {
      resolveSteer = resolve;
    });
    const harness = makeHarness({ steerTurn: delayedSteer });
    const first = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Initial', clientMessageId: 'msg-stop-steer-initial' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    await harness.manager.handleMessage({
      type: 'attachFiles',
      payload: {
        files: [
          {
            name: 'stop-steer.png',
            mimeType: 'image/png',
            sizeBytes: 3,
            dataUrl: 'data:image/png;base64,AQID',
          },
        ],
      },
    });
    const attachmentAck = [...harness.posted]
      .reverse()
      .find((message) => message.type === 'attachFilesAck') as
      | Extract<ExtToWebviewMessage, { type: 'attachFilesAck' }>
      | undefined;
    const attachmentId = attachmentAck?.payload.added[0]?.id;
    const steer = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: {
        text: 'Delayed steer stopped by the user',
        followUpBehavior: 'steer',
        clientMessageId: 'msg-stop-delayed-steer',
      },
    });
    await vi.waitFor(() => expect(harness.runtime.steerTurn).toHaveBeenCalledOnce());

    await harness.manager.handleMessage({ type: 'cancel' });
    resolveSteer({ id: 'turn-1' });
    await steer;
    await first;

    expect(harness.runtime.interruptTurn).toHaveBeenCalledWith({
      threadId: 'thread-1',
      turnId: 'turn-1',
    });
    expect(harness.posted).toContainEqual({
      type: 'attachmentsReleased',
      payload: { ids: [attachmentId] },
    });
    expect(harness.posted).toContainEqual({
      type: 'followUpStatus',
      payload: expect.objectContaining({
        kind: 'cancelled',
        clientMessageId: 'msg-stop-delayed-steer',
      }),
    });
    expect(harness.posted).not.toContainEqual({
      type: 'followUpStatus',
      payload: expect.objectContaining({
        kind: 'steered',
        clientMessageId: 'msg-stop-delayed-steer',
      }),
    });
  });

  it('cancels queued ownership exactly and never leaks its attachment into a new chat', async () => {
    const harness = makeHarness();
    const first = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Initial', clientMessageId: 'msg-initial' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    await harness.manager.handleMessage({
      type: 'attachFiles',
      payload: {
        files: [
          {
            name: 'queued.png',
            mimeType: 'image/png',
            sizeBytes: 3,
            dataUrl: 'data:image/png;base64,AQID',
          },
        ],
      },
    });
    const attachmentAck = harness.posted.find((message) => message.type === 'attachFilesAck') as
      | Extract<ExtToWebviewMessage, { type: 'attachFilesAck' }>
      | undefined;
    const attachmentId = attachmentAck?.payload.added[0]?.id;
    expect(attachmentId).toMatch(/^att-/);
    await harness.manager.handleMessage({
      type: 'sendMessage',
      payload: {
        text: 'Queued with image',
        followUpBehavior: 'queue',
        clientMessageId: 'msg-queued-image',
      },
    });

    await harness.manager.handleMessage({ type: 'newChat' });
    await first;
    expect(harness.runtime.startTurn).toHaveBeenCalledOnce();
    expect(harness.posted).toContainEqual({
      type: 'attachmentsReleased',
      payload: { ids: [attachmentId] },
    });
    expect(harness.posted).toContainEqual({
      type: 'followUpStatus',
      payload: expect.objectContaining({
        kind: 'cancelled',
        clientMessageId: 'msg-queued-image',
      }),
    });

    harness.runtime.startTurn.mockResolvedValueOnce({ id: 'turn-2' });
    const next = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Fresh message', clientMessageId: 'msg-fresh' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledTimes(2));
    expect(harness.runtime.startTurn.mock.calls[1]?.[0].input).not.toContainEqual(
      expect.objectContaining({ type: 'image' }),
    );
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-2',
      status: 'completed',
      response: 'fresh',
      inputTokens: 1,
      outputTokens: 1,
    });
    await next;
  });

  it('hands an immediate post-New Chat send to the new epoch exactly once', async () => {
    let resolveInterrupt!: () => void;
    const delayedInterrupt = new Promise<void>((resolve) => {
      resolveInterrupt = resolve;
    });
    const harness = makeHarness({ interruptTurn: delayedInterrupt });
    harness.runtime.startTurn
      .mockResolvedValueOnce({ id: 'turn-1' })
      .mockResolvedValueOnce({ id: 'turn-2' });
    const first = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Old epoch', clientMessageId: 'msg-old-epoch' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());

    const reset = harness.manager.handleMessage({ type: 'newChat' });
    await vi.waitFor(() => expect(harness.runtime.interruptTurn).toHaveBeenCalledOnce());
    await harness.manager.handleMessage({
      type: 'sendMessage',
      payload: {
        text: 'New epoch prompt',
        followUpBehavior: 'steer',
        clientMessageId: 'msg-new-epoch',
      },
    });
    expect(harness.runtime.steerTurn).not.toHaveBeenCalled();
    expect(harness.runtime.startTurn).toHaveBeenCalledOnce();

    resolveInterrupt();
    await reset;
    await first;
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledTimes(2));
    expect(harness.runtime.startTurn.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        input: expect.arrayContaining([
          { type: 'text', text: 'New epoch prompt', text_elements: [] },
        ]),
      }),
    );
    expect(harness.posted).toContainEqual({
      type: 'turnStarted',
      payload: {
        queued: true,
        queueRemaining: 0,
        clientMessageId: 'msg-new-epoch',
        text: 'New epoch prompt',
      },
    });
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-2',
      status: 'completed',
      response: 'new epoch done',
      inputTokens: 1,
      outputTokens: 1,
    });
    await vi.waitFor(() => {
      expect(
        harness.posted.filter(
          (message) =>
            message.type === 'turnStarted' && message.payload.clientMessageId === 'msg-new-epoch',
        ),
      ).toHaveLength(1);
    });
  });

  it('fails closed when a Local session is aimed at catalog or Auto routing', async () => {
    const harness = makeHarness({
      localModels: [{ id: SYNTHETIC_LOCAL_MODEL_ID, provider: 'ollama' }],
    });
    await harness.context.globalState.update('tierStatus.cachedTier', 'max');
    await harness.manager.handleMessage({ type: 'openModelPopover' });
    await harness.manager.handleMessage({
      type: 'selectModel',
      payload: { modelId: SYNTHETIC_LOCAL_MODEL_ID },
    });
    const first = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Inspect locally' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledTimes(1));
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'done',
      inputTokens: 1,
      outputTokens: 1,
    });
    await first;

    await harness.manager.handleMessage({
      type: 'attachFiles',
      payload: {
        files: [
          {
            name: 'local-context.png',
            mimeType: 'image/png',
            sizeBytes: 3,
            dataUrl: 'data:image/png;base64,AQID',
          },
        ],
      },
    });
    const attachmentAck = [...harness.posted]
      .reverse()
      .find((message) => message.type === 'attachFilesAck') as
      | Extract<ExtToWebviewMessage, { type: 'attachFilesAck' }>
      | undefined;
    const attachmentId = attachmentAck?.payload.added[0]?.id;
    const catalogModel = MODEL_PICKER_OPTIONS.find((option) => option.id !== 'auto')!;
    await harness.manager.handleMessage({
      type: 'selectModel',
      payload: { modelId: catalogModel.id },
    });
    await harness.manager.handleMessage({
      type: 'sendMessage',
      payload: {
        text: 'Continue with the cloud-capable model',
        clientMessageId: 'msg-local-to-catalog',
      },
    });
    await harness.manager.handleMessage({
      type: 'sendMessage',
      payload: {
        text: 'Auto must not forward it either',
        model: 'auto',
        clientMessageId: 'msg-local-to-auto',
      },
    });

    expect(harness.runtime.startThread).toHaveBeenCalledOnce();
    expect(harness.runtime.startTurn).toHaveBeenCalledOnce();
    expect(harness.posted).not.toContainEqual(
      expect.objectContaining({ type: 'conversationBoundaryChanged' }),
    );
    expect(harness.posted).toContainEqual({
      type: 'followUpStatus',
      payload: expect.objectContaining({
        kind: 'error',
        message: expect.stringContaining('without a reviewed handoff'),
        clientMessageId: 'msg-local-to-catalog',
      }),
    });
    expect(harness.posted).toContainEqual({
      type: 'followUpStatus',
      payload: expect.objectContaining({
        kind: 'error',
        message: expect.stringContaining('without a reviewed handoff'),
        clientMessageId: 'msg-local-to-auto',
      }),
    });
    expect(harness.posted).toContainEqual({
      type: 'attachmentsReleased',
      payload: { ids: [attachmentId] },
    });

    await harness.manager.handleMessage({
      type: 'removePendingAttachment',
      payload: { id: attachmentId! },
    });
    await harness.manager.handleMessage({
      type: 'selectModel',
      payload: { modelId: SYNTHETIC_LOCAL_MODEL_ID },
    });
    harness.runtime.startTurn.mockResolvedValueOnce({ id: 'turn-2' });
    const localFollowUp = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Continue in the original Local session' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledTimes(2));
    expect(harness.runtime.startThread).toHaveBeenCalledOnce();
    expect(harness.runtime.startTurn).toHaveBeenLastCalledWith(
      expect.objectContaining({ threadId: 'thread-1', model: SYNTHETIC_LOCAL_MODEL_ID }),
    );
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-2',
      status: 'completed',
      response: 'done',
      inputTokens: 1,
      outputTokens: 1,
    });
    await localFollowUp;
  });

  it('shows CLI-discovered local models in the inline picker', async () => {
    const harness = makeHarness({
      localModels: [{ id: SYNTHETIC_LOCAL_MODEL_ID, provider: 'ollama' }],
    });

    await harness.manager.handleMessage({ type: 'openModelPopover' });

    expect(harness.posted).toContainEqual({
      type: 'modelPickerData',
      payload: expect.objectContaining({
        groups: expect.arrayContaining([
          {
            label: 'On this device',
            description: 'Ollama and LM Studio stay inside the local runtime',
            boundary: 'local',
            models: [
              {
                id: SYNTHETIC_LOCAL_MODEL_ID,
                label: SYNTHETIC_LOCAL_MODEL_ID,
                description: 'Ollama · On device',
              },
            ],
          },
        ]),
      }),
    });
  });

  it('shows an honest setup state when the local CLI runtime is unavailable', async () => {
    const harness = makeHarness({ localModelError: new Error('spawn agi ENOENT') });

    await harness.manager.handleMessage({ type: 'ready' });

    expect(harness.posted).toContainEqual({
      type: 'runtimeStatus',
      payload: {
        status: 'unavailable',
        message:
          'The AGI CLI executable was not found. Choose its installed path in Runtime settings.',
      },
    });
  });

  it('preserves an actionable CLI protocol mismatch in the persistent runtime state', async () => {
    const mismatch =
      'Installed AGI CLI uses developer-session protocol 6; this extension requires exactly protocol 7. Install a compatible AGI CLI or update the extension.';
    const harness = makeHarness({ localModelError: new Error(mismatch) });

    await harness.manager.handleMessage({ type: 'ready' });

    expect(harness.posted).toContainEqual({
      type: 'runtimeStatus',
      payload: { status: 'unavailable', message: mismatch },
    });
  });

  it('does not publish stale signed-in identity when account validation clears the token', async () => {
    const authState = vi
      .spyOn(api, 'getAccountAuthState')
      .mockResolvedValueOnce({ status: 'signed-in' })
      .mockResolvedValueOnce({ status: 'signed-out' });
    const identity = vi.spyOn(api, 'fetchAccountIdentity').mockResolvedValue({
      displayName: 'Expired account',
      email: 'expired@example.test',
      accountType: 'Personal account',
      planName: 'Pro',
      tier: 'pro',
    });
    const harness = makeHarness();

    try {
      await harness.manager.pushAccountStatus();

      expect(harness.posted).toContainEqual({
        type: 'accountStatus',
        payload: { status: 'signed-out' },
      });
      expect(harness.posted).not.toContainEqual(
        expect.objectContaining({
          type: 'accountStatus',
          payload: expect.objectContaining({ identity: expect.anything() }),
        }),
      );
    } finally {
      authState.mockRestore();
      identity.mockRestore();
    }
  });

  it('opens a workspace-file picker without claiming folder support', async () => {
    const harness = makeHarness();
    vi.mocked(vscode.window.showOpenDialog).mockResolvedValueOnce(undefined);

    await harness.manager.handleMessage({ type: 'openFilePicker' });

    expect(vscode.window.showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        canSelectFiles: true,
        canSelectFolders: false,
        title: 'Attach Workspace Files to Chat',
      }),
    );
  });

  it('passes the trusted discovered provider with a selected local model', async () => {
    const harness = makeHarness({
      localModels: [{ id: SYNTHETIC_LOCAL_MODEL_ID, provider: 'ollama' }],
    });
    await harness.manager.handleMessage({ type: 'openModelPopover' });
    await harness.manager.handleMessage({
      type: 'selectModel',
      payload: { modelId: SYNTHETIC_LOCAL_MODEL_ID },
    });

    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Say hello' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    expect(harness.runtime.startThread).toHaveBeenCalledWith(
      expect.objectContaining({ model: SYNTHETIC_LOCAL_MODEL_ID, provider: 'ollama' }),
    );
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'hello',
      inputTokens: 1,
      outputTokens: 1,
    });
    await send;
  });

  it('preserves a selected local model when the webview native select has no dynamic option', async () => {
    const harness = makeHarness({
      localModels: [{ id: SYNTHETIC_LOCAL_MODEL_ID, provider: 'ollama' }],
    });
    await harness.manager.handleMessage({ type: 'openModelPopover' });
    await harness.manager.handleMessage({
      type: 'selectModel',
      payload: { modelId: SYNTHETIC_LOCAL_MODEL_ID },
    });

    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Say hello', model: '' },
    });

    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    expect(harness.runtime.startThread).toHaveBeenCalledWith(
      expect.objectContaining({ model: SYNTHETIC_LOCAL_MODEL_ID, provider: 'ollama' }),
    );
    expect(harness.runtime.startTurn).toHaveBeenCalledWith(
      expect.objectContaining({ model: SYNTHETIC_LOCAL_MODEL_ID }),
    );
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'hello',
      inputTokens: 1,
      outputTokens: 1,
    });
    await send;
  });

  it('forwards the effective agent controls and selected workspace context', async () => {
    const harness = makeHarness();
    await harness.manager.handleMessage({ type: 'setMode', payload: { mode: 'plan' } });
    await harness.manager.handleMessage({ type: 'setEffort', payload: { effort: 'high' } });
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Plan this change' },
    });

    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    expect(harness.runtime.startTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        agentMode: 'plan',
        reasoningEffort: 'high',
        contextFiles: ['/workspace/src/context.ts'],
      }),
    );
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'done',
      inputTokens: 1,
      outputTokens: 1,
    });
    await send;
  });

  it('keeps a spoofed or cancelled sidebar bypass request on Auto', async () => {
    const harness = makeHarness();

    await harness.manager.handleMessage({ type: 'setMode', payload: { mode: 'bypass' } });

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      'Turn on Bypass Permissions?',
      expect.objectContaining({ modal: true }),
      expect.objectContaining({ title: 'Cancel', isCloseAffordance: true }),
      expect.objectContaining({ title: 'Turn On Bypass Permissions' }),
    );
    expect(harness.manager.mode).toBeUndefined();
    expect(harness.posted).toContainEqual({
      type: 'modeChanged',
      payload: { mode: 'auto' },
    });
  });

  it('includes user-curated memory as untrusted turn data', async () => {
    const harness = makeHarness();
    await harness.context.workspaceState.update(MEMORY_STORE_KEY, [
      {
        id: 'memory-1',
        text: 'Prefer Rust for command-line tools',
        createdAt: '2026-07-25T00:00:00.000Z',
      },
    ]);
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Implement the CLI command' },
    });

    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    expect(harness.runtime.startTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.arrayContaining([
          expect.objectContaining({
            type: 'text',
            text: expect.stringContaining(
              '<untrusted_memory_context>\n- Prefer Rust for command-line tools',
            ),
          }),
        ]),
      }),
    );
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'done',
      inputTokens: 1,
      outputTokens: 1,
    });
    await send;
  });

  it('prepends the effective workspace custom instructions before the user turn', async () => {
    const harness = makeHarness();
    await harness.context.globalState.update(HOST_CUSTOM_INSTRUCTIONS_KEY, 'Use the host default.');
    await harness.context.workspaceState.update(
      WORKSPACE_CUSTOM_INSTRUCTIONS_KEY,
      'Prefer workspace fixtures.',
    );
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Implement the feature' },
    });

    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    const turnParams = harness.runtime.startTurn.mock.calls[0]?.[0];
    expect(turnParams.input[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('Prefer workspace fixtures.'),
    });
    expect(turnParams.input[0].text).toContain('this VS Code workspace');
    expect(turnParams.input[1]).toMatchObject({
      type: 'text',
      text: 'Implement the feature',
    });
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'done',
      inputTokens: 1,
      outputTokens: 1,
    });
    await send;
  });

  it('sends the shared self-routing Auto model to the Rust session owner', async () => {
    const harness = makeHarness();
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: {
        text: 'Search the web for the latest Rust release and cite sources',
        model: 'auto',
      },
    });

    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    expect(harness.runtime.startTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'auto',
        routingTaskType: 'research',
      }),
    );
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'done',
      inputTokens: 1,
      outputTokens: 1,
    });
    await send;
  });

  it('routes a one-turn browse request through the real web-search tool boundary', async () => {
    const harness = makeHarness();
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: {
        text: 'What changed in the latest Rust release?',
        browseWeb: true,
      },
    });

    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    expect(harness.runtime.startTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        routingTaskType: 'research',
        input: expect.arrayContaining([
          expect.objectContaining({
            type: 'text',
            text: expect.stringMatching(
              /Use the web_search tool[\s\S]*Local privacy boundary refuses network access[\s\S]*latest Rust release/u,
            ),
          }),
        ]),
      }),
    );
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'done',
      inputTokens: 1,
      outputTokens: 1,
    });
    await send;
  });

  it('keeps the same runtime thread when a model changes within one catalog provider', async () => {
    const harness = makeHarness();
    await harness.context.globalState.update('tierStatus.cachedTier', 'max');
    const manualModels = MODEL_PICKER_OPTIONS.filter((option) => option.id !== 'auto');
    const firstModel = manualModels.find(
      (option) => getModelProviderInfo(option.id).providerId !== null,
    );
    const secondModel = manualModels.find(
      (option) =>
        option.id !== firstModel?.id &&
        getModelProviderInfo(option.id).providerId ===
          getModelProviderInfo(firstModel?.id ?? '').providerId,
    );
    expect(firstModel).toBeDefined();
    expect(secondModel).toBeDefined();

    const first = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Inspect this project', model: firstModel!.id },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledTimes(1));
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'done',
      inputTokens: 1,
      outputTokens: 1,
    });
    await first;

    harness.runtime.startTurn.mockResolvedValueOnce({ id: 'turn-2' });
    const second = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Now make the change', model: secondModel!.id },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledTimes(2));
    expect(harness.runtime.startThread).toHaveBeenCalledTimes(1);
    expect(harness.runtime.startTurn).toHaveBeenLastCalledWith(
      expect.objectContaining({
        threadId: 'thread-1',
        model: secondModel!.id,
      }),
    );
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-2',
      status: 'completed',
      response: 'done',
      inputTokens: 1,
      outputTokens: 1,
    });
    await second;
  });

  it('starts a fresh runtime thread when catalog providers change', async () => {
    const harness = makeHarness();
    await harness.context.globalState.update('tierStatus.cachedTier', 'max');
    const manualModels = MODEL_PICKER_OPTIONS.filter((option) => option.id !== 'auto');
    const firstModel = manualModels.find(
      (option) => getModelProviderInfo(option.id).providerId !== null,
    );
    const secondModel = manualModels.find(
      (option) =>
        getModelProviderInfo(option.id).providerId !== null &&
        getModelProviderInfo(option.id).providerId !==
          getModelProviderInfo(firstModel?.id ?? '').providerId,
    );
    expect(firstModel).toBeDefined();
    expect(secondModel).toBeDefined();
    const firstThread = threadSummary({
      id: 'thread-1',
      model: firstModel!.id,
      provider: getModelProviderInfo(firstModel!.id).providerId!,
      trustMode: 'byok',
    });
    const secondThread = threadSummary({
      id: 'thread-2',
      model: secondModel!.id,
      provider: getModelProviderInfo(secondModel!.id).providerId!,
      trustMode: 'byok',
    });
    harness.runtime.startThread
      .mockResolvedValueOnce(firstThread)
      .mockResolvedValueOnce(secondThread);
    harness.runtime.readThread
      .mockResolvedValueOnce({
        thread: firstThread,
        messages: [],
        transcriptTruncated: false,
      })
      .mockResolvedValueOnce({
        thread: secondThread,
        messages: [],
        transcriptTruncated: false,
      });

    const first = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Inspect this project', model: firstModel!.id },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledTimes(1));
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'done',
      inputTokens: 1,
      outputTokens: 1,
    });
    await first;

    harness.runtime.startTurn.mockResolvedValueOnce({ id: 'turn-2' });
    const second = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Continue with another provider', model: secondModel!.id },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledTimes(2));

    expect(harness.runtime.startThread).toHaveBeenCalledTimes(2);
    expect(harness.runtime.startTurn).toHaveBeenLastCalledWith(
      expect.objectContaining({ threadId: 'thread-2', model: secondModel!.id }),
    );
    expect(
      harness.runtime.startTurn.mock.calls[1]?.[0].input.some(
        (input: { type: string; text?: string }) => input.text?.includes('Inspect this project'),
      ),
    ).toBe(false);
    expect(harness.posted).toContainEqual({
      type: 'conversationBoundaryChanged',
      payload: {
        message:
          'Provider boundary changed. AGI started a new developer session; earlier transcript context was not forwarded.',
        clientMessageId: expect.any(String),
        text: 'Continue with another provider',
      },
    });

    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-2',
      turnId: 'turn-2',
      status: 'completed',
      response: 'done',
      inputTokens: 1,
      outputTokens: 1,
    });
    await second;
  });

  it('marks tier-locked catalog rows disabled in the inline picker', async () => {
    const harness = makeHarness();
    await harness.context.globalState.update('tierStatus.cachedTier', 'local');
    const lockedModel = buildGroupedQuickPickItems('local').find(
      (item) => item.modelId !== undefined && item.modelId !== 'auto' && item.disabled === true,
    );
    expect(lockedModel).toBeDefined();

    await harness.manager.handleMessage({ type: 'openModelPopover' });

    expect(harness.posted).toContainEqual({
      type: 'modelPickerData',
      payload: expect.objectContaining({
        groups: expect.arrayContaining([
          expect.objectContaining({
            label: 'Recommended',
            boundary: 'unavailable',
            description: 'Sign in or add a provider key to use Auto',
          }),
          expect.objectContaining({
            label: 'On this device',
            boundary: 'local',
            description: 'Ollama and LM Studio stay inside the local runtime',
          }),
          expect.objectContaining({
            label: expect.stringMatching(/^Unavailable · /u),
            boundary: 'unavailable',
            description: 'Sign in or add a provider key to unlock these models',
            models: expect.arrayContaining([
              expect.objectContaining({ id: lockedModel!.modelId, disabled: true }),
            ]),
          }),
        ]),
      }),
    });
  });

  it('labels BYOK picker groups as direct provider boundaries', async () => {
    const harness = makeHarness();
    await harness.context.globalState.update('tierStatus.cachedTier', 'byok');

    await harness.manager.handleMessage({ type: 'openModelPopover' });

    const pickerMessage = [...harness.posted]
      .reverse()
      .find((message) => message.type === 'modelPickerData') as
      | Extract<ExtToWebviewMessage, { type: 'modelPickerData' }>
      | undefined;
    expect(pickerMessage).toBeDefined();
    expect(pickerMessage?.payload.groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Recommended',
          boundary: 'byok',
          description: 'Auto uses your configured providers; requests go directly to them',
        }),
        expect.objectContaining({
          label: 'On this device',
          boundary: 'local',
        }),
        expect.objectContaining({
          label: expect.stringMatching(/^Your providers · /u),
          boundary: 'byok',
          description: 'Requests go directly to this provider using your key',
        }),
      ]),
    );
    expect(
      pickerMessage?.payload.groups.filter((group) => group.label.startsWith('Your providers · ')),
    ).not.toHaveLength(0);
    expect(
      pickerMessage?.payload.groups
        .filter((group) => group.label.startsWith('Your providers · '))
        .every((group) => group.boundary === 'byok'),
    ).toBe(true);
  });

  it('labels paid picker groups as Managed Cloud boundaries', async () => {
    const harness = makeHarness();
    await harness.context.globalState.update('tierStatus.cachedTier', 'pro');

    await harness.manager.handleMessage({ type: 'openModelPopover' });

    const pickerMessage = [...harness.posted]
      .reverse()
      .find((message) => message.type === 'modelPickerData') as
      | Extract<ExtToWebviewMessage, { type: 'modelPickerData' }>
      | undefined;
    expect(pickerMessage).toBeDefined();
    expect(pickerMessage?.payload.groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Recommended',
          boundary: 'cloud',
          description: 'Auto routes within your Managed Cloud plan',
        }),
        expect.objectContaining({
          label: 'On this device',
          boundary: 'local',
        }),
        expect.objectContaining({
          label: expect.stringMatching(/^Managed Cloud · /u),
          boundary: 'cloud',
          description: 'Prompts are sent to AGI infrastructure under your plan',
        }),
      ]),
    );
    expect(
      pickerMessage?.payload.groups.filter((group) => group.label.startsWith('Managed Cloud · ')),
    ).not.toHaveLength(0);
    expect(
      pickerMessage?.payload.groups
        .filter((group) => group.label.startsWith('Managed Cloud · '))
        .every((group) => group.boundary === 'cloud'),
    ).toBe(true);
  });

  it('rejects a forged selection of a tier-locked catalog model', async () => {
    const harness = makeHarness();
    await harness.context.globalState.update('tierStatus.cachedTier', 'local');
    const lockedModel = buildGroupedQuickPickItems('local').find(
      (item) => item.modelId !== undefined && item.disabled === true,
    );
    expect(lockedModel).toBeDefined();

    await harness.manager.handleMessage({
      type: 'selectModel',
      payload: { modelId: lockedModel!.modelId! },
    });

    expect(harness.posted).toContainEqual({
      type: 'error',
      payload: {
        message: 'This model is not available for your current plan or provider setup.',
      },
    });
    expect(harness.posted).not.toContainEqual({
      type: 'model',
      payload: { model: lockedModel!.modelId! },
    });
  });

  it('rejects a forged send with a tier-locked catalog model', async () => {
    const harness = makeHarness();
    await harness.context.globalState.update('tierStatus.cachedTier', 'local');
    const lockedModel = buildGroupedQuickPickItems('local').find(
      (item) => item.modelId !== undefined && item.disabled === true,
    );
    expect(lockedModel).toBeDefined();

    await harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Bypass the picker', model: lockedModel!.modelId! },
    });

    expect(harness.runtime.startThread).not.toHaveBeenCalled();
    expect(harness.posted).toContainEqual({
      type: 'error',
      payload: {
        message: 'This model is not available for your current plan or provider setup.',
      },
    });
  });

  it('forwards dropped image attachments as image turn input', async () => {
    const harness = makeHarness();
    await harness.manager.handleMessage({
      type: 'attachFiles',
      payload: {
        files: [
          {
            name: 'diagram.png',
            mimeType: 'image/png',
            sizeBytes: 3,
            dataUrl: 'data:image/png;base64,AQID',
          },
        ],
      },
    });
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Explain this diagram' },
    });

    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    expect(harness.posted).toContainEqual({
      type: 'attachmentsConsumed',
      payload: { ids: [expect.stringMatching(/^att-/)] },
    });
    expect(harness.runtime.startTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.arrayContaining([{ type: 'image', image_url: 'data:image/png;base64,AQID' }]),
      }),
    );
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'done',
      inputTokens: 1,
      outputTokens: 1,
    });
    await send;
  });

  it('forwards sidebar file mentions with their exact selected range', async () => {
    const harness = makeHarness();
    vi.mocked(vscode.workspace.fs.stat).mockResolvedValueOnce({
      type: vscode.FileType.File,
      ctime: 0,
      mtime: 0,
      size: 30,
    });
    vi.mocked(vscode.workspace.openTextDocument).mockResolvedValueOnce({
      getText: vi.fn(() => 'const mentioned = true;'),
    } as unknown as vscode.TextDocument);
    vi.spyOn(vscode.workspace, 'asRelativePath').mockReturnValue('src/mentioned.ts');

    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: {
        text: 'Review @src/mentioned.ts#L5-L7',
        references: [
          {
            path: 'src/mentioned.ts',
            range: { startLine: 4, startCharacter: 0, endLine: 6, endCharacter: 8 },
          },
        ],
      },
    });

    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    expect(harness.runtime.startTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.arrayContaining([
          expect.objectContaining({
            type: 'text',
            text: expect.stringContaining(
              '<untrusted_file_reference path="src/mentioned.ts" lines="5-7">\nconst mentioned = true;',
            ),
          }),
        ]),
      }),
    );
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'done',
      inputTokens: 1,
      outputTokens: 1,
    });
    await send;
  });

  it('ignores a sidebar file reference that is not visible in the user text', async () => {
    const harness = makeHarness();
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: {
        text: 'Review this code',
        references: [{ path: 'src/hidden.ts' }],
      },
    });

    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();
    const input = harness.runtime.startTurn.mock.calls[0]?.[0].input;
    expect(input).toHaveLength(1);
    expect(input[0]).toMatchObject({ type: 'text', text: 'Review this code' });
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'done',
      inputTokens: 1,
      outputTokens: 1,
    });
    await send;
  });

  it('ignores malformed sidebar reference payloads without failing the turn', async () => {
    const harness = makeHarness();
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: {
        text: 'Review @src/app.ts#L1-L2',
        references: [{ path: 'src/app.ts', range: null }],
      },
    } as unknown as Parameters<typeof harness.manager.handleMessage>[0]);

    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'done',
      inputTokens: 1,
      outputTokens: 1,
    });
    await send;
  });

  it('removePendingAttachment deletes the host-side pending file before send', async () => {
    const harness = makeHarness();
    await harness.manager.handleMessage({
      type: 'attachFiles',
      payload: {
        files: [
          {
            name: 'diagram.png',
            mimeType: 'image/png',
            sizeBytes: 3,
            dataUrl: 'data:image/png;base64,AQID',
          },
        ],
      },
    });
    const ack = harness.posted.find((m) => m.type === 'attachFilesAck') as {
      type: 'attachFilesAck';
      payload: { added: Array<{ id: string; name: string }> };
    };
    expect(ack.payload.added).toHaveLength(1);
    expect(ack.payload.added[0].id).toMatch(/^att-/);

    await harness.manager.handleMessage({
      type: 'removePendingAttachment',
      payload: { id: ack.payload.added[0].id },
    });

    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Explain this diagram' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    expect(harness.runtime.startTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        input: [{ type: 'text', text: 'Explain this diagram', text_elements: [] }],
      }),
    );
    expect(harness.posted).not.toContainEqual({ type: 'attachmentsConsumed' });
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'done',
      inputTokens: 1,
      outputTokens: 1,
    });
    await send;
  });

  it('forwards dropped text attachments as explicitly untrusted text input', async () => {
    const harness = makeHarness();
    await harness.manager.handleMessage({
      type: 'attachFiles',
      payload: {
        files: [
          {
            name: 'notes.txt',
            mimeType: 'text/plain',
            sizeBytes: 5,
            dataUrl: 'data:text/plain;base64,aGVsbG8=',
          },
        ],
      },
    });
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Summarize the attachment' },
    });

    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    expect(harness.runtime.startTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.arrayContaining([
          expect.objectContaining({
            type: 'text',
            text: expect.stringContaining('<untrusted_attachment name="notes.txt">'),
          }),
        ]),
      }),
    );
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'done',
      inputTokens: 1,
      outputTokens: 1,
    });
    await send;
  });

  it('settles an in-flight send after cancellation even without an interrupted event', async () => {
    const harness = makeHarness();
    let settled = false;
    const send = harness.manager
      .handleMessage({ type: 'sendMessage', payload: { text: 'Fix it' } })
      .then(() => {
        settled = true;
      });

    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    await harness.manager.handleMessage({ type: 'cancel' });
    await vi.waitFor(() => expect(settled).toBe(true));

    expect(harness.runtime.interruptTurn).toHaveBeenCalledOnce();
    expect(harness.posted).toContainEqual({ type: 'done' });
    await send;
  });

  it('honors cancellation requested while the runtime is still starting the turn', async () => {
    let resolveTurn!: (turn: { id: string }) => void;
    const startTurn = new Promise<{ id: string }>((resolve) => {
      resolveTurn = resolve;
    });
    const harness = makeHarness({ startTurn });
    let settled = false;
    const send = harness.manager
      .handleMessage({ type: 'sendMessage', payload: { text: 'Fix it' } })
      .then(() => {
        settled = true;
      });

    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    await harness.manager.handleMessage({ type: 'cancel' });
    resolveTurn({ id: 'turn-1' });

    await vi.waitFor(() => expect(settled).toBe(true));
    expect(harness.runtime.interruptTurn).toHaveBeenCalledOnce();
    await send;
  });

  it('settles visibly and interrupts when the pre-start event buffer overflows', async () => {
    const startTurn = new Promise<{ id: string }>(() => undefined);
    const harness = makeHarness({ startTurn });
    let settled = false;
    const send = harness.manager
      .handleMessage({ type: 'sendMessage', payload: { text: 'Generate lots of output' } })
      .then(() => {
        settled = true;
      });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());

    for (let index = 0; index <= 1_024; index += 1) {
      harness.emit({
        type: 'output_delta',
        threadId: 'thread-1',
        turnId: 'turn-1',
        delta: `${index}`,
      });
    }

    await vi.waitFor(() => expect(settled).toBe(true));
    expect(harness.runtime.interruptTurn).toHaveBeenCalledWith({
      threadId: 'thread-1',
      turnId: 'turn-1',
    });
    expect(harness.posted).toContainEqual({
      type: 'error',
      payload: { message: expect.stringContaining('too many events') },
    });
    await send;
  });

  it('stops before turn dispatch when cancellation arrives during thread startup', async () => {
    const harness = makeHarness();
    let resolveThread!: (thread: ThreadSummary) => void;
    harness.runtime.startThread.mockReturnValueOnce(
      new Promise<ThreadSummary>((resolve) => {
        resolveThread = resolve;
      }),
    );
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Do not dispatch this turn', clientMessageId: 'msg-stop-early' },
    });
    await vi.waitFor(() => expect(harness.runtime.startThread).toHaveBeenCalledOnce());

    await harness.manager.handleMessage({ type: 'cancel' });
    resolveThread(threadSummary());
    await send;

    expect(harness.runtime.startTurn).not.toHaveBeenCalled();
    expect(harness.posted).toContainEqual({ type: 'done' });
  });

  it('drops unseen pending attachments when a chat surface closes', async () => {
    const harness = makeHarness();
    await harness.manager.handleMessage({
      type: 'attachFiles',
      payload: {
        files: [
          {
            name: 'stale.png',
            mimeType: 'image/png',
            sizeBytes: 3,
            dataUrl: 'data:image/png;base64,AQID',
          },
        ],
      },
    });

    harness.manager.cancelInFlight();
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Fresh view', clientMessageId: 'msg-fresh-view' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    expect(harness.runtime.startTurn.mock.calls[0]?.[0].input).not.toContainEqual(
      expect.objectContaining({ type: 'image' }),
    );
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'done',
      inputTokens: 1,
      outputTokens: 1,
    });
    await send;
  });

  it('interrupts and settles the turn when an approval response is rejected', async () => {
    const harness = makeHarness({ approvalFailure: new Error('approval channel closed') });
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValueOnce('Approve once');
    let settled = false;
    const send = harness.manager
      .handleMessage({ type: 'sendMessage', payload: { text: 'Run tests' } })
      .then(() => {
        settled = true;
      });

    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    harness.emit({
      type: 'approval_requested',
      threadId: 'thread-1',
      turnId: 'turn-1',
      requestId: 'approval-1',
      kind: 'shell',
      summary: 'Run tests',
      detail: 'pnpm test',
    });

    await vi.waitFor(() => expect(settled).toBe(true));
    expect(harness.runtime.respondToApproval).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'approved' }),
    );
    expect(harness.runtime.interruptTurn).toHaveBeenCalledOnce();
    expect(harness.posted).toContainEqual({
      type: 'error',
      payload: { message: 'approval channel closed' },
    });
    await send;
  });

  it('interrupts the turn directly when approval UI selects Abort turn', async () => {
    const harness = makeHarness();
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValueOnce('Abort turn');
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Run tests' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());

    harness.emit({
      type: 'approval_requested',
      threadId: 'thread-1',
      turnId: 'turn-1',
      requestId: 'approval-1',
      kind: 'shell',
      summary: 'Run tests',
      detail: 'pnpm test',
    });
    await send;

    expect(harness.runtime.interruptTurn).toHaveBeenCalledWith({
      threadId: 'thread-1',
      turnId: 'turn-1',
    });
    expect(harness.runtime.respondToApproval).not.toHaveBeenCalled();
  });

  it('does not approve a stale sidebar modal after New Chat retires its turn', async () => {
    let resolveApproval!: (choice: string | undefined) => void;
    vi.mocked(vscode.window.showWarningMessage).mockImplementationOnce(
      () => new Promise((resolve) => (resolveApproval = resolve)),
    );
    const harness = makeHarness();
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Run tests' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    harness.emit({
      type: 'approval_requested',
      threadId: 'thread-1',
      turnId: 'turn-1',
      requestId: 'approval-1',
      kind: 'shell',
      summary: 'Run tests',
      detail: 'pnpm test',
    });
    await vi.waitFor(() => expect(vscode.window.showWarningMessage).toHaveBeenCalledOnce());

    await harness.manager.handleMessage({ type: 'newChat' });
    await send;
    resolveApproval('Approve once');
    await vi.waitFor(() => expect(harness.runtime.interruptTurn).toHaveBeenCalledOnce());

    expect(harness.runtime.respondToApproval).not.toHaveBeenCalled();
    expect(harness.posted).not.toContainEqual(expect.objectContaining({ type: 'error' }));
  });

  it('surfaces unavailable MCP integrations as a non-terminal warning', async () => {
    const harness = makeHarness();
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Inspect the workspace' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());

    harness.emit({
      type: 'mcp_status',
      status: 'unavailable',
      threadId: 'thread-1',
      message: 'MCP discovery timed out',
    });
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'done',
      inputTokens: 1,
      outputTokens: 1,
    });

    await send;
    expect(harness.posted).toContainEqual({
      type: 'token',
      payload: { text: expect.stringContaining('MCP discovery timed out') },
    });
    expect(harness.posted.some((message) => message.type === 'error')).toBe(false);
  });

  it('forwards structured tool request and response activity to the inline timeline', async () => {
    const harness = makeHarness();
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Search official sources' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());

    harness.emit({
      type: 'tool_execution_start',
      threadId: 'thread-1',
      turnId: 'turn-1',
      sequence: 0,
      emittedAtMs: 1_784_335_200_000,
      toolCallId: 'tool-1',
      name: 'web_search',
      category: 'web-search',
      summary: 'Searching official sources',
      input: { query: 'AGI Workforce' },
    });
    harness.emit({
      type: 'tool_execution_end',
      threadId: 'thread-1',
      turnId: 'turn-1',
      sequence: 1,
      emittedAtMs: 1_784_335_200_100,
      toolCallId: 'tool-1',
      name: 'web_search',
      output: { results: 4 },
      isError: false,
      elapsedMs: 100,
    });
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'done',
      inputTokens: 1,
      outputTokens: 1,
    });

    await send;
    expect(harness.posted).toContainEqual({
      type: 'toolCallStart',
      payload: {
        toolUseId: 'tool-1',
        name: 'web_search',
        category: 'web-search',
        summary: 'Searching official sources',
        input: { query: 'AGI Workforce' },
      },
    });
    expect(harness.posted).toContainEqual({
      type: 'toolCallEnd',
      payload: {
        toolUseId: 'tool-1',
        output: { results: 4 },
        isError: false,
        elapsedMs: 100,
      },
    });
  });

  it('forwards engine-authored progress to the inline timeline', async () => {
    const harness = makeHarness();
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Inspect the workspace' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());

    harness.emit({
      type: 'progress_update',
      threadId: 'thread-1',
      turnId: 'turn-1',
      sequence: 0,
      emittedAtMs: 1_784_335_200_000,
      progressId: 'turn-work',
      summary: 'Working on your request',
      detail: 'The agent is inspecting the workspace and planning the next safe action.',
      status: 'running',
    });
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'done',
      inputTokens: 1,
      outputTokens: 1,
    });

    await send;
    expect(harness.posted).toContainEqual({
      type: 'progressUpdate',
      payload: {
        progressId: 'turn-work',
        summary: 'Working on your request',
        detail: 'The agent is inspecting the workspace and planning the next safe action.',
        status: 'running',
      },
    });
  });

  it('promotes update_plan tool input to a structured plan message', async () => {
    const harness = makeHarness();
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Plan this change' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());

    harness.emit({
      type: 'tool_execution_start',
      threadId: 'thread-1',
      turnId: 'turn-1',
      sequence: 0,
      emittedAtMs: 1_784_335_200_000,
      toolCallId: 'plan-1',
      name: 'update_plan',
      category: 'other',
      summary: 'Updating the plan',
      input: {
        explanation: 'Implement and verify.',
        plan: [
          { step: 'Inspect the flow', status: 'completed' },
          { step: 'Build the UI', status: 'in_progress' },
          { step: 'Run tests', status: 'pending' },
        ],
      },
    });
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'done',
      inputTokens: 1,
      outputTokens: 1,
    });

    await send;
    expect(harness.posted).toContainEqual({
      type: 'planUpdate',
      payload: {
        explanation: 'Implement and verify.',
        plan: [
          { step: 'Inspect the flow', status: 'completed' },
          { step: 'Build the UI', status: 'in_progress' },
          { step: 'Run tests', status: 'pending' },
        ],
      },
    });
    expect(harness.posted).not.toContainEqual(
      expect.objectContaining({
        type: 'toolCallStart',
        payload: expect.objectContaining({ name: 'update_plan' }),
      }),
    );
  });

  it('settles the UI turn when the local app-server disconnects', async () => {
    const harness = makeHarness();
    let settled = false;
    const send = harness.manager
      .handleMessage({ type: 'sendMessage', payload: { text: 'Inspect the workspace' } })
      .then(() => {
        settled = true;
      });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());

    harness.emit({ type: 'runtime_disconnected', error: 'AGI local runtime exited' });

    await vi.waitFor(() => expect(settled).toBe(true));
    expect(harness.posted).toContainEqual({
      type: 'error',
      payload: { message: 'AGI local runtime exited' },
    });
    await send;
  });
});

describe('ChatStateManager context usage reporting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vscode.workspace.isTrusted = true;
    vscode.window.activeTextEditor = undefined;
    vscode.workspace.workspaceFolders = [
      { name: 'workspace', index: 0, uri: vscode.Uri.file('/workspace') },
    ];
    setContextPanelInstance({
      getContextFiles: () => ['/workspace/src/context.ts'],
    } as ContextPanelProvider);
  });

  it('reports the runtime-measured turn tokens against the catalog context window', async () => {
    const harness = makeHarness();
    await harness.context.globalState.update('tierStatus.cachedTier', 'max');
    const model = MODEL_PICKER_OPTIONS.filter((option) => option.id !== 'auto').find(
      (option) => MODEL_CONTEXT_LIMITS[option.id] !== undefined,
    );
    expect(model).toBeDefined();

    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Inspect this project', model: model!.id },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'done',
      inputTokens: 41_200,
      outputTokens: 1_800,
    });
    await send;

    expect(harness.posted).toContainEqual({
      type: 'contextUsage',
      payload: { usedTokens: 43_000, contextWindow: MODEL_CONTEXT_LIMITS[model!.id] },
    });
  });

  it('feeds the session token counter the runtime-measured counts, not a char estimate', async () => {
    const harness = makeHarness();
    const counter = getTokenCounter();
    counter.reset();

    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Inspect this project' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'done',
      inputTokens: 41_200,
      outputTokens: 1_800,
    });
    await send;

    expect(counter.promptTokens).toBe(41_200);
    expect(counter.completionTokens).toBe(1_800);
    expect(counter.requestCount).toBe(1);
  });

  it('omits the window for Auto routing rather than claiming a model that may not have run', async () => {
    const harness = makeHarness();

    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Inspect this project' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'done',
      inputTokens: 900,
      outputTokens: 100,
    });
    await send;

    expect(harness.posted).toContainEqual({
      type: 'contextUsage',
      payload: { usedTokens: 1_000 },
    });
  });
});
