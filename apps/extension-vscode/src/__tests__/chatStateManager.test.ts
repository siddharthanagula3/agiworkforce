import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { type ThreadReadResponse, type ThreadSummary } from '@agiworkforce/types';
import {
  ChatStateManager,
  type ExtToWebviewMessage,
} from '../features/sidebar-webview/ChatStateManager';
import {
  presentChatError,
  presentTurnFailure,
} from '../features/sidebar-webview/errorPresentation';
import {
  MODEL_CONTEXT_LIMITS,
  MODEL_PICKER_OPTIONS,
  buildGroupedQuickPickItems,
  getModelProviderInfo,
  isAutoPickerModelId,
} from '../features/model-picker/modelConstants';
import {
  LocalRuntimeClient,
  LocalRuntimeProtocolError,
  type LocalRuntimeEvent,
} from '../integrations/localRuntimeClient';
import { LocalRuntimePool } from '../integrations/localRuntimePool';
import { ConversationTreeProvider } from '../features/trees/conversationTreeProvider';
import { parseBoundWebviewMessage } from '../protocol/webviewMessages';
import { trackLastTextEditor } from '../platform/lastTextEditor';
import { type DiffDecorationProvider } from '../providers/diffDecorationProvider';
import {
  setContextPanelInstance,
  validateWorkspaceContextFile,
  type ContextPanelProvider,
} from '../features/trees/contextPanelProvider';
import { setAccountMemoryStore, type AccountMemoryStore } from '../memory/accountMemoryStore';
import { ONBOARDING_SEEN_KEY } from '../features/onboarding/onboardingState';
import {
  HOST_CUSTOM_INSTRUCTIONS_KEY,
  WORKSPACE_CUSTOM_INSTRUCTIONS_KEY,
} from '../features/instructions';
import { SYNTHETIC_LOCAL_MODEL_ID, requireCatalogModel } from './catalogModelFixtures';
import { getTokenCounter } from '../data/tokenCounter';
import { modelDisplayNameById, PRODUCT_NAMES } from '@agiworkforce/types';
import * as api from '../utils/api';
import { Config } from '../platform/config';
import * as accountAccess from '../features/surfaces/accountAccess';
import * as proposedChangeReview from '../features/permissions/proposedChangeReview';
import * as tierResolver from '../integrations/tierResolver';

function completeTurnFor(harness: { emit(event: LocalRuntimeEvent): void }): Promise<void> {
  harness.emit({
    type: 'turn_completed',
    threadId: 'thread-1',
    turnId: 'turn-1',
    status: 'completed',
    response: 'done',
    inputTokens: 1,
    outputTokens: 1,
  });
  return Promise.resolve();
}

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
  const notificationListeners = new Set<
    (notification: { method: string; params?: unknown }) => void
  >();
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
    onNotification: vi.fn(
      (listener: (notification: { method: string; params?: unknown }) => void) => {
        notificationListeners.add(listener);
        return { dispose: () => notificationListeners.delete(listener) };
      },
    ),
    reconnectThread: vi.fn().mockResolvedValue(null),
    offers: vi.fn().mockResolvedValue(false),
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
    pool,
    runtime,
    conversationTreeProvider,
    posted,
    emit(event: LocalRuntimeEvent) {
      for (const listener of listeners) listener(event);
    },
    notify(notification: { method: string; params?: unknown }) {
      for (const listener of notificationListeners) listener(notification);
    },
  };
}

let fixtureCleanup: (() => Promise<void>) | undefined;

async function realContextWorkspace(harness?: ReturnType<typeof makeHarness>): Promise<string> {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agi-chat-context-')));
  await fs.mkdir(path.join(root, 'src'));
  for (const file of ['app.ts', 'context.ts', 'mentioned.ts'])
    await fs.writeFile(path.join(root, 'src', file), 'controlled ordinary code');
  execFileSync('git', ['-c', 'init.templateDir=', 'init', '-q'], { cwd: root });
  const originalFolder = vi.mocked(vscode.workspace.getWorkspaceFolder).getMockImplementation();
  vscode.workspace.workspaceFolders = [{ name: 'workspace', index: 0, uri: vscode.Uri.file(root) }];
  vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(
    vscode.workspace.workspaceFolders[0],
  );
  vi.mocked(vscode.workspace.fs.stat).mockResolvedValue({
    type: vscode.FileType.File,
    ctime: 0,
    mtime: 0,
    size: 24,
  });
  setContextPanelInstance({
    getContextFiles: () => [path.join(root, 'src/context.ts')],
  } as ContextPanelProvider);
  if (harness !== undefined)
    harness.runtime.startThread.mockResolvedValue(threadSummary({ cwd: root }));
  fixtureCleanup = async () => {
    if (originalFolder !== undefined)
      vi.mocked(vscode.workspace.getWorkspaceFolder).mockImplementation(originalFolder);
    else vi.mocked(vscode.workspace.getWorkspaceFolder).mockReset();
    await fs.rm(root, { recursive: true, force: true });
  };
  return root;
}

afterEach(async () => {
  setAccountMemoryStore(undefined);
  await fixtureCleanup?.();
  fixtureCleanup = undefined;
});

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

  it.each(['turn', 'steer'] as const)(
    'rechecks an attached selection before %s dispatch',
    async (dispatch) => {
      const harness = makeHarness();
      const root = await realContextWorkspace(harness);
      let initial: Promise<void> | undefined;
      let send: Promise<void> | undefined;
      try {
        if (dispatch === 'steer') {
          initial = harness.manager.handleMessage({
            type: 'sendMessage',
            payload: { text: 'Start' },
          });
          await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
        }
        vscode.window.activeTextEditor = {
          document: {
            uri: vscode.Uri.file(path.join(root, 'src/app.ts')),
            languageId: 'typescript',
            lineCount: 1,
            getText: () => 'CONTROLLED_SELECTION_CONTENT',
          },
          selection: new vscode.Selection(0, 0, 0, 27),
        } as unknown as vscode.TextEditor;
        await harness.manager.handleMessage({
          type: 'attachContext',
          payload: { kind: 'selection' },
        });
        expect(harness.posted.some((message) => message.type === 'contextAttached')).toBe(true);
        vscode.window.activeTextEditor = undefined;
        await fs.writeFile(path.join(root, '.gitignore'), 'src/app.ts\n');
        send = harness.manager.handleMessage({
          type: 'sendMessage',
          payload: {
            text: 'Use context',
            ...(dispatch === 'steer' ? { followUpBehavior: 'steer' as const } : {}),
          },
        });
        const target = dispatch === 'steer' ? harness.runtime.steerTurn : harness.runtime.startTurn;
        await vi.waitFor(() => expect(target).toHaveBeenCalledOnce());
        expect(JSON.stringify(target.mock.calls[0]?.[0])).not.toContain(
          'CONTROLLED_SELECTION_CONTENT',
        );
      } finally {
        harness.emit({
          type: 'turn_completed',
          threadId: 'thread-1',
          turnId: 'turn-1',
          status: 'completed',
          response: 'done',
          inputTokens: 1,
          outputTokens: 1,
        });
        if (send !== undefined) await send;
        if (initial !== undefined) await initial;
      }
    },
  );

  it('discards a web page that finishes loading after New Chat replaced the conversation', async () => {
    const harness = makeHarness();
    let answerInput: (value: string) => void = () => undefined;
    vi.mocked(vscode.window.showInputBox).mockImplementationOnce(
      () =>
        new Promise<string | undefined>((resolve) => {
          answerInput = resolve;
        }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: async () => 'OLD_CONVERSATION_PAGE_BODY',
      }),
    );
    let send: Promise<void> | undefined;
    try {
      const attaching = harness.manager.handleMessage({
        type: 'attachContext',
        payload: { kind: 'url' },
      });
      await harness.manager.handleMessage({ type: 'newChat' });

      answerInput('https://example.test/page');
      await attaching;

      expect(harness.posted.some((message) => message.type === 'contextAttached')).toBe(false);

      send = harness.manager.handleMessage({ type: 'sendMessage', payload: { text: 'Hello' } });
      await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
      expect(JSON.stringify(harness.runtime.startTurn.mock.calls[0]?.[0])).not.toContain(
        'OLD_CONVERSATION_PAGE_BODY',
      );
    } finally {
      vi.unstubAllGlobals();
      harness.emit({
        type: 'turn_completed',
        threadId: 'thread-1',
        turnId: 'turn-1',
        status: 'completed',
        response: 'done',
        inputTokens: 1,
        outputTokens: 1,
      });
      if (send !== undefined) await send;
    }
  });

  it('keeps a web page that finishes loading in the same conversation', async () => {
    const harness = makeHarness();
    vi.mocked(vscode.window.showInputBox).mockResolvedValueOnce('https://example.test/page');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: async () => 'CURRENT_PAGE_BODY',
      }),
    );
    try {
      await harness.manager.handleMessage({ type: 'attachContext', payload: { kind: 'url' } });

      expect(harness.posted.some((message) => message.type === 'contextAttached')).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rechecks retained pinned context files against current gitignore before dispatch', async () => {
    const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agi-pinned-context-')));
    const file = path.join(root, 'ordinary.txt');
    await fs.writeFile(file, 'controlled ordinary content');
    execFileSync('git', ['-c', 'init.templateDir=', 'init', '-q'], { cwd: root });
    const originalFolder = vi.mocked(vscode.workspace.getWorkspaceFolder).getMockImplementation();
    const originalStat = vi.mocked(vscode.workspace.fs.stat).getMockImplementation();
    vscode.workspace.workspaceFolders = [
      { name: 'controlled', index: 0, uri: vscode.Uri.file(root) },
    ];
    vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(
      vscode.workspace.workspaceFolders[0],
    );
    vi.mocked(vscode.workspace.fs.stat).mockResolvedValue({
      type: vscode.FileType.File,
      ctime: 0,
      mtime: 0,
      size: 27,
    });
    const harness = makeHarness();
    harness.runtime.startThread.mockResolvedValue(threadSummary({ cwd: root }));
    let send: Promise<void> | undefined;
    try {
      expect((await validateWorkspaceContextFile(vscode.Uri.file(file))).ok).toBe(true);
      setContextPanelInstance({ getContextFiles: () => [file] } as ContextPanelProvider);
      await fs.writeFile(path.join(root, '.gitignore'), 'ordinary.txt\n');
      send = harness.manager.handleMessage({
        type: 'sendMessage',
        payload: { text: 'Check the workspace' },
      });
      await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
      const params = harness.runtime.startTurn.mock.calls[0]?.[0] as { contextFiles?: string[] };
      expect(params.contextFiles ?? []).not.toContain(file);
    } finally {
      harness.emit({
        type: 'turn_completed',
        threadId: 'thread-1',
        turnId: 'turn-1',
        status: 'completed',
        response: 'done',
        inputTokens: 1,
        outputTokens: 1,
      });
      if (send !== undefined) await send;
      if (originalFolder !== undefined)
        vi.mocked(vscode.workspace.getWorkspaceFolder).mockImplementation(originalFolder);
      if (originalStat !== undefined)
        vi.mocked(vscode.workspace.fs.stat).mockImplementation(originalStat);
      else vi.mocked(vscode.workspace.fs.stat).mockReset();
      await fs.rm(root, { recursive: true, force: true });
    }
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
      payload: {
        category: 'permission',
        headline: 'Trust this workspace before starting a developer session.',
        retryable: false,
      },
    });
  });

  it('renders the sidebar for an untrusted workspace without starting the CLI', async () => {
    vscode.workspace.isTrusted = false;
    const spawn = vi.fn();
    const pool = new LocalRuntimePool(
      (cwd) =>
        new LocalRuntimeClient({
          cliPath: '/usr/local/bin/agi',
          workspaceTrusted: () => vscode.workspace.isTrusted,
          cwd,
          clientVersion: '0.3.0',
          spawn,
        }),
    );
    const context = new vscode.ExtensionContext();
    const posted: ExtToWebviewMessage[] = [];
    const manager = new ChatStateManager(
      context.secrets,
      context,
      (message) => posted.push(message),
      new ConversationTreeProvider(pool),
      context.workspaceState,
      pool,
    );

    await manager.handleMessage({ type: 'ready' });

    expect(spawn).not.toHaveBeenCalled();
    expect(posted).toContainEqual(
      expect.objectContaining({
        type: 'runtimeStatus',
        payload: expect.objectContaining({ status: 'workspace-untrusted' }),
      }),
    );
    expect(posted).toContainEqual(
      expect.objectContaining({
        type: 'recentConversations',
        payload: expect.objectContaining({ total: 0 }),
      }),
    );
    await pool.shutdownAll();
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
      payload: expect.objectContaining({ headline: expect.stringContaining(error) }),
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
      payload: expect.objectContaining({
        headline: expect.stringContaining('when local was requested'),
      }),
    });
  });

  it('refuses a send on a Local default that is not running instead of starting Auto', async () => {
    const configured = vi.spyOn(Config, 'model').mockReturnValue(SYNTHETIC_LOCAL_MODEL_ID);
    try {
      const harness = makeHarness();
      await harness.context.globalState.update('tierStatus.cachedTier', 'max');

      await harness.manager.handleMessage({
        type: 'sendMessage',
        payload: { text: 'WORKSPACE_SECRET', clientMessageId: 'msg-local-down' },
      });

      expect(harness.runtime.startThread).not.toHaveBeenCalled();
      expect(harness.runtime.startTurn).not.toHaveBeenCalled();
      expect(harness.manager.activeModel()).toBe(SYNTHETIC_LOCAL_MODEL_ID);
      expect(harness.posted).toContainEqual({
        type: 'error',
        payload: expect.objectContaining({
          headline: expect.stringContaining(SYNTHETIC_LOCAL_MODEL_ID),
        }),
      });
      expect(harness.posted).not.toContainEqual({ type: 'model', payload: { model: 'auto' } });

      harness.runtime.listLocalModels.mockResolvedValue({
        models: [{ id: SYNTHETIC_LOCAL_MODEL_ID, provider: 'ollama' }],
      });
      const send = harness.manager.handleMessage({
        type: 'sendMessage',
        payload: { text: 'Now it runs', clientMessageId: 'msg-local-up' },
      });
      await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
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

      expect(harness.runtime.startThread).toHaveBeenCalledOnce();
      expect(harness.runtime.startThread).toHaveBeenCalledWith(
        expect.objectContaining({ model: SYNTHETIC_LOCAL_MODEL_ID, provider: 'ollama' }),
      );
    } finally {
      configured.mockRestore();
    }
  });

  it.each(['ready', 'newChat'] as const)(
    'keeps a Local default that is not running on %s and says so, never Auto',
    async (trigger) => {
      const configured = vi.spyOn(Config, 'model').mockReturnValue(SYNTHETIC_LOCAL_MODEL_ID);
      try {
        const harness = makeHarness();
        await harness.context.globalState.update('tierStatus.cachedTier', 'max');
        if (trigger === 'newChat') {
          await harness.manager.handleMessage({ type: 'ready' });
          harness.posted.splice(0);
        }

        await harness.manager.handleMessage({ type: trigger });

        expect(harness.manager.activeModel()).toBe(SYNTHETIC_LOCAL_MODEL_ID);
        expect(harness.posted).not.toContainEqual({ type: 'model', payload: { model: 'auto' } });
        expect(harness.posted).toContainEqual({
          type: 'error',
          payload: expect.objectContaining({
            headline: expect.stringContaining(SYNTHETIC_LOCAL_MODEL_ID),
          }),
        });
        const modelWrites = vi
          .mocked(vscode.workspace.getConfiguration)
          .mock.results.flatMap(
            (result) =>
              (result.value as { update: { mock: { calls: unknown[][] } } }).update.mock.calls,
          )
          .filter((call) => call[0] === 'model');
        expect(modelWrites).toEqual([]);
      } finally {
        configured.mockRestore();
      }
    },
  );

  it('reopens the conversation a surface held before the window reloaded', async () => {
    const harness = makeHarness({
      resolvedConversation: {
        thread: threadSummary({ id: 'kept-1' }),
        messages: [{ role: 'user', text: 'Earlier prompt' }],
        transcriptTruncated: false,
      },
    });
    await harness.context.workspaceState.update(
      'agiWorkforce.openThread.panel:AGI Chat 2',
      'kept-1',
    );
    harness.manager.bindRestoreKey('panel:AGI Chat 2', true);

    await harness.manager.handleMessage({ type: 'ready' });

    expect(harness.conversationTreeProvider?.resolveThread).toHaveBeenCalledWith('kept-1');
    expect(harness.manager.activeThreadId()).toBe('kept-1');
    expect(harness.posted).toContainEqual(
      expect.objectContaining({
        type: 'conversationLoaded',
        payload: expect.objectContaining({ threadId: 'kept-1' }),
      }),
    );
  });

  it('restores nothing in Restricted Mode, and a new surface starts empty', async () => {
    const harness = makeHarness({
      resolvedConversation: {
        thread: threadSummary({ id: 'kept-1' }),
        messages: [],
        transcriptTruncated: false,
      },
    });
    await harness.context.workspaceState.update('agiWorkforce.openThread.sidebar', 'kept-1');
    harness.manager.bindRestoreKey('sidebar', true);
    vscode.workspace.isTrusted = false;
    try {
      await harness.manager.handleMessage({ type: 'ready' });
    } finally {
      vscode.workspace.isTrusted = true;
    }
    expect(harness.conversationTreeProvider?.resolveThread).not.toHaveBeenCalled();

    harness.manager.bindRestoreKey('sidebar', false);
    await vi.waitFor(() =>
      expect(harness.context.workspaceState.get('agiWorkforce.openThread.sidebar')).toBeUndefined(),
    );
  });

  it('remembers the session a send starts and forgets it on New Chat', async () => {
    const harness = makeHarness();
    harness.manager.bindRestoreKey('sidebar', true);
    const send = harness.manager.handleMessage({ type: 'sendMessage', payload: { text: 'Hi' } });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
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
    expect(harness.context.workspaceState.get('agiWorkforce.openThread.sidebar')).toBe('thread-1');

    await harness.manager.handleMessage({ type: 'newChat' });
    await vi.waitFor(() =>
      expect(harness.context.workspaceState.get('agiWorkforce.openThread.sidebar')).toBeUndefined(),
    );
  });

  it('applies a code block to the text editor the user left when the chat panel has focus', async () => {
    const editor = {
      document: {
        uri: vscode.Uri.file('/workspace/src/app.ts'),
        languageId: 'typescript',
        isUntitled: false,
        getText: () => '',
        lineCount: 1,
        lineAt: () => ({ text: '' }),
      },
      selection: new vscode.Selection(0, 0, 0, 0),
      setDecorations: vi.fn(),
    } as unknown as vscode.TextEditor;
    let changeActive: ((next: vscode.TextEditor | undefined) => void) | undefined;
    vi.mocked(vscode.window.onDidChangeActiveTextEditor).mockImplementationOnce(((
      listener: (next: vscode.TextEditor | undefined) => void,
    ) => {
      changeActive = listener;
      return new vscode.Disposable(() => undefined);
    }) as never);
    vscode.window.activeTextEditor = editor;
    const tracking = trackLastTextEditor();
    vscode.window.visibleTextEditors = [editor];
    vscode.window.activeTextEditor = undefined;
    changeActive?.(undefined);
    const showDiff = vi.fn(() => ({ id: 'diff-1' }));
    const context = new vscode.ExtensionContext();
    const posted: ExtToWebviewMessage[] = [];
    const manager = new ChatStateManager(
      context.secrets,
      context,
      (message) => posted.push(message),
      undefined,
      context.workspaceState,
      undefined,
      { showDiff } as unknown as DiffDecorationProvider,
    );
    try {
      await manager.handleMessage({
        type: 'proposeDiff',
        payload: { code: 'const a = 1;', language: 'typescript' },
      });
    } finally {
      tracking.dispose();
      vscode.window.visibleTextEditors = [];
    }

    expect(showDiff).toHaveBeenCalledWith(editor, '', 'const a = 1;', expect.anything(), {
      filePath: expect.any(String),
    });
    expect(posted).toContainEqual(expect.objectContaining({ type: 'diffProposed' }));
  });

  it('refuses to apply a code block in another language to the focused file', async () => {
    const editor = {
      document: {
        uri: vscode.Uri.file('/workspace/src/index.ts'),
        languageId: 'typescript',
        isUntitled: false,
        getText: () => '',
        lineCount: 50,
        lineAt: () => ({ text: '' }),
      },
      selection: new vscode.Selection(39, 0, 39, 0),
      setDecorations: vi.fn(),
    } as unknown as vscode.TextEditor;
    vscode.window.activeTextEditor = editor;
    const showDiff = vi.fn(() => ({ id: 'diff-1' }));
    const context = new vscode.ExtensionContext();
    const posted: ExtToWebviewMessage[] = [];
    const manager = new ChatStateManager(
      context.secrets,
      context,
      (message) => posted.push(message),
      undefined,
      context.workspaceState,
      undefined,
      { showDiff } as unknown as DiffDecorationProvider,
    );
    try {
      await manager.handleMessage({
        type: 'proposeDiff',
        payload: { code: 'def parse(path):\n    return []', language: 'python' },
      });
    } finally {
      vscode.window.activeTextEditor = undefined;
    }

    expect(showDiff).not.toHaveBeenCalled();
    expect(posted).toContainEqual({
      type: 'diffProposalFailed',
      payload: { message: expect.stringContaining('does not belong in') },
    });
  });

  it('leaves staged attachments for the user when a generated prompt is sent', async () => {
    const harness = makeHarness();
    await harness.manager.handleMessage({
      type: 'attachFiles',
      payload: {
        files: [
          {
            name: 'notes.txt',
            mimeType: 'text/plain',
            sizeBytes: 6,
            dataUrl: 'data:text/plain;base64,U0VDUkVU',
          },
        ],
      },
    });
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Explain this code', standalone: true },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    await completeTurnFor(harness);
    await send;

    expect(JSON.stringify(harness.runtime.startTurn.mock.calls[0]?.[0])).not.toContain('notes.txt');
    expect(harness.posted).not.toContainEqual(
      expect.objectContaining({ type: 'attachmentsConsumed' }),
    );
  });

  it('clears the chat when the session it shows is archived or deleted elsewhere', async () => {
    const removed = new vscode.EventEmitter<string>();
    const context = new vscode.ExtensionContext();
    const posted: ExtToWebviewMessage[] = [];
    const harness = makeHarness();
    const manager = new ChatStateManager(
      context.secrets,
      context,
      (message) => posted.push(message),
      { onDidRemoveThread: removed.event, refresh: vi.fn() } as unknown as ConversationTreeProvider,
      context.workspaceState,
      harness.pool,
    );
    const send = manager.handleMessage({ type: 'sendMessage', payload: { text: 'Hi' } });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    await completeTurnFor(harness);
    await send;
    expect(manager.activeThreadId()).toBe('thread-1');

    removed.fire('another-thread');
    expect(manager.activeThreadId()).toBe('thread-1');
    removed.fire('thread-1');

    expect(manager.activeThreadId()).toBeUndefined();
    expect(posted).toContainEqual({ type: 'conversationCleared' });
    manager.dispose();
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
    const root = await realContextWorkspace(harness);
    const uri = vscode.Uri.file(path.join(root, 'src/app.ts'));
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
        query: 'app',
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

  it('opens permission and privacy handoffs on their canonical Web routes', async () => {
    const harness = makeHarness();

    await harness.manager.handleMessage({ type: 'openPermissionDocs' });
    await harness.manager.handleMessage({ type: 'openPrivacySettings' });

    expect(vscode.env.openExternal).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        toString: expect.any(Function),
      }),
    );
    expect(vi.mocked(vscode.env.openExternal).mock.calls.map(([uri]) => uri.toString())).toEqual([
      'https://agiworkforce.com/docs?topic=permissions&from=vscode-extension',
      'https://agiworkforce.com/settings/privacy?from=vscode-extension',
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

      const answered = {
        thread: threadSummary({ id: 'history-1', title: 'Persisted work' }),
        messages: [
          ...persisted.messages,
          { role: 'user', text: 'Make the narrow fix' },
          { role: 'assistant', text: 'The fix is complete.' },
        ],
        transcriptTruncated: false,
      } satisfies ThreadReadResponse;
      harness.runtime.readThread.mockImplementation(async () =>
        harness.runtime.startTurn.mock.calls.length > 0 ? answered : persisted,
      );
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
      payload: expect.objectContaining({
        headline: expect.stringContaining('no verified Local, BYOK, or Managed boundary'),
      }),
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
      payload: expect.objectContaining({
        headline: expect.stringContaining('workspace does not match'),
      }),
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
      payload: expect.objectContaining({ headline: expect.stringContaining('not available') }),
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
      Extract<ExtToWebviewMessage, { type: 'attachFilesAck' }> | undefined;
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
      Extract<ExtToWebviewMessage, { type: 'attachFilesAck' }> | undefined;
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
      Extract<ExtToWebviewMessage, { type: 'attachFilesAck' }> | undefined;
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
      Extract<ExtToWebviewMessage, { type: 'attachFilesAck' }> | undefined;
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

  it('keeps a retired turn out of the cleared conversation while its interrupt settles', async () => {
    let resolveInterrupt!: () => void;
    const delayedInterrupt = new Promise<void>((resolve) => {
      resolveInterrupt = resolve;
    });
    const harness = makeHarness({ interruptTurn: delayedInterrupt });
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Old conversation' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());

    harness.manager.resetConversation();
    await vi.waitFor(() => expect(harness.runtime.interruptTurn).toHaveBeenCalledOnce());
    const clearedAt = harness.posted.length;

    harness.emit({
      type: 'output_delta',
      threadId: 'thread-1',
      turnId: 'turn-1',
      delta: 'stale fragment',
    });
    harness.emit({
      type: 'tool_execution_start',
      threadId: 'thread-1',
      turnId: 'turn-1',
      toolCallId: 'tool-1',
      name: 'read_file',
      category: 'read',
      summary: 'Read a file',
      input: {},
    } as LocalRuntimeEvent);
    harness.emit({
      type: 'turn_interrupted',
      threadId: 'thread-1',
      turnId: 'turn-1',
    } as LocalRuntimeEvent);
    resolveInterrupt();
    await send;

    const afterClear = harness.posted.slice(clearedAt);
    expect(afterClear.some((message) => message.type === 'token')).toBe(false);
    expect(afterClear.some((message) => message.type === 'toolCallStart')).toBe(false);
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
      Extract<ExtToWebviewMessage, { type: 'attachFilesAck' }> | undefined;
    const attachmentId = attachmentAck?.payload.added[0]?.id;
    const catalogModel = MODEL_PICKER_OPTIONS.find((option) => !isAutoPickerModelId(option.id))!;
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

  it('leaves the needs-setup state when a retry finds a working runtime', async () => {
    const harness = makeHarness({ localModelError: new Error('spawn agi ENOENT') });
    await harness.manager.handleMessage({ type: 'ready' });
    expect(harness.posted).toContainEqual(
      expect.objectContaining({
        type: 'runtimeStatus',
        payload: expect.objectContaining({ status: 'unavailable' }),
      }),
    );

    harness.runtime.listLocalModels.mockResolvedValueOnce({ models: [] });
    harness.posted.length = 0;
    await harness.manager.handleMessage({ type: 'retryRuntime' });

    expect(harness.posted[0]).toEqual({
      type: 'runtimeStatus',
      payload: { status: 'probing' },
    });
    expect(harness.posted).toContainEqual({
      type: 'runtimeStatus',
      payload: { status: 'ready' },
    });
  });

  it('re-probes on a retry and reports the new failure rather than the stale one', async () => {
    const harness = makeHarness({ localModelError: new Error('spawn agi ENOENT') });
    await harness.manager.handleMessage({ type: 'ready' });

    harness.runtime.listLocalModels.mockRejectedValueOnce(
      new Error('Installed AGI CLI returned an invalid developer-session handshake'),
    );
    harness.posted.length = 0;
    await harness.manager.handleMessage({ type: 'retryRuntime' });

    expect(harness.runtime.listLocalModels).toHaveBeenCalledTimes(2);
    expect(harness.posted).toContainEqual({
      type: 'runtimeStatus',
      payload: {
        status: 'unavailable',
        message: 'Installed AGI CLI returned an invalid developer-session handshake',
      },
    });
  });

  it('clears the untrusted-workspace block once the host grants trust and re-probes', async () => {
    const harness = makeHarness();
    vscode.workspace.isTrusted = false;
    await harness.manager.handleMessage({ type: 'ready' });
    expect(harness.posted).toContainEqual(
      expect.objectContaining({
        type: 'runtimeStatus',
        payload: expect.objectContaining({ status: 'workspace-untrusted' }),
      }),
    );

    vscode.workspace.isTrusted = true;
    harness.posted.length = 0;
    await harness.manager.refreshRuntimeStatus();

    expect(harness.posted).toContainEqual({
      type: 'runtimeStatus',
      payload: { status: 'ready' },
    });
  });

  it('unwraps the marked missing-binary error into user-facing recovery copy', async () => {
    const harness = makeHarness({
      localModelError: new Error(
        'AGI_CLI_NOT_FOUND: The AGI CLI could not be started. "agi" is not on the PATH this editor was launched with. Install AGI CLI 1.7.1 or newer, then set agiWorkforce.cliPath to its full path or relaunch the editor from a shell where "agi" runs.',
      ),
    });

    await harness.manager.handleMessage({ type: 'ready' });

    const status = harness.posted.find(
      (message): message is Extract<ExtToWebviewMessage, { type: 'runtimeStatus' }> =>
        message.type === 'runtimeStatus',
    );
    expect(status?.payload.message).not.toContain('AGI_CLI_NOT_FOUND');
    expect(status?.payload.message).toContain('agiWorkforce.cliPath');
    expect(status?.payload.message).toContain('1.7.1');
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

  it('records the tier the CLI reports, so pickers group by the plan after a CLI sign-in', async () => {
    const authState = vi
      .spyOn(api, 'getAccountAuthState')
      .mockResolvedValue({ status: 'signed-out' });
    const presence = vi.spyOn(accountAccess, 'resolveAccountPresence').mockResolvedValue({
      signedIn: true,
      source: 'cli',
      cli: { signedIn: true, email: 'qa@example.test', tier: 'max' },
    });
    const harness = makeHarness();

    try {
      await harness.manager.pushAccountStatus();

      expect(harness.context.globalState.get<string>('tierStatus.cachedTier')).toBe('max');
      expect(harness.posted).toContainEqual(
        expect.objectContaining({
          type: 'accountStatus',
          payload: expect.objectContaining({
            status: 'signed-in',
            identity: expect.objectContaining({ tier: 'max' }),
          }),
        }),
      );
    } finally {
      authState.mockRestore();
      presence.mockRestore();
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
    const root = await realContextWorkspace(harness);
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
        contextFiles: [path.join(root, 'src/context.ts')],
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

  it('sends the effort a later settings change chose, not the earlier composer pick', async () => {
    const harness = makeHarness();
    harness.runtime.offers.mockImplementation(
      async (capability: string) => capability === 'reasoningEffortLadder',
    );
    await realContextWorkspace(harness);
    const handlers = vi
      .mocked(vscode.workspace.onDidChangeConfiguration)
      .mock.calls.map(([listener]) => listener as (event: vscode.ConfigurationChangeEvent) => void);
    await harness.manager.handleMessage({ type: 'setEffort', payload: { effort: 'high' } });

    const effortSpy = vi.spyOn(Config, 'agentEffort').mockReturnValue('low');
    for (const handler of handlers) {
      handler({
        affectsConfiguration: (section: string) => section === 'agiWorkforce.agent.effort',
      });
    }

    expect(harness.posted.filter((message) => message.type === 'effortChanged').at(-1)).toEqual({
      type: 'effortChanged',
      payload: expect.objectContaining({ effort: 'low' }),
    });
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Think less' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    expect(harness.runtime.startTurn).toHaveBeenCalledWith(
      expect.objectContaining({ reasoningEffort: 'low' }),
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
    effortSpy.mockRestore();
  });

  it('sends an older CLI only a level it accepts, and offers it only those four', async () => {
    const harness = makeHarness();
    await realContextWorkspace(harness);
    await harness.manager.handleMessage({ type: 'setEffort', payload: { effort: 'xhigh' } });
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Think hard' },
    });

    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    expect(harness.runtime.startTurn).toHaveBeenCalledWith(
      expect.objectContaining({ reasoningEffort: 'high' }),
    );
    const shown = harness.posted.filter((message) => message.type === 'effortChanged').at(-1);
    expect(
      shown?.payload.efforts?.every((effort) => ['low', 'medium', 'high', 'max'].includes(effort)),
    ).toBe(true);
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

  it('sends every level to a CLI that advertises the full effort ladder', async () => {
    const harness = makeHarness();
    harness.runtime.offers.mockImplementation(
      async (capability: string) => capability === 'reasoningEffortLadder',
    );
    await realContextWorkspace(harness);
    await harness.manager.handleMessage({ type: 'setEffort', payload: { effort: 'xhigh' } });
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Think hard' },
    });

    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    expect(harness.runtime.startTurn).toHaveBeenCalledWith(
      expect.objectContaining({ reasoningEffort: 'xhigh' }),
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

  it('sends the active editor file, its selection and its problems with the turn', async () => {
    const root = await realContextWorkspace();
    Object.defineProperty(vscode.window, 'activeTextEditor', {
      configurable: true,
      writable: true,
      value: {
        selection: {
          isEmpty: false,
          start: { line: 0, character: 0 },
          end: { line: 2, character: 1 },
          active: { line: 2, character: 1 },
        },
        document: {
          uri: vscode.Uri.file(path.join(root, 'src/app.ts')),
          languageId: 'typescript',
          lineCount: 3,
          getText: () => 'export const add = (a, b) => a + b;',
        },
      },
    });
    vi.mocked(vscode.languages.getDiagnostics).mockReturnValue([
      { severity: 0, message: 'b is not defined', range: { start: { line: 1, character: 9 } } },
    ] as never);
    vi.mocked(vscode.workspace.asRelativePath).mockImplementation((value: unknown) =>
      String((value as { fsPath?: string }).fsPath ?? value).replace(`${root}${path.sep}`, ''),
    );

    const harness = makeHarness();
    harness.runtime.startThread.mockResolvedValue(threadSummary({ cwd: root }));

    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'What is this?' },
    });

    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    const params = harness.runtime.startTurn.mock.calls[0]?.[0] as {
      contextFiles: string[];
      input: Array<{ type: string; text?: string }>;
    };
    expect(params.contextFiles).toContain(path.join(root, 'src/app.ts'));
    const texts = params.input
      .filter((part) => part.type === 'text')
      .map((part) => part.text ?? '');
    expect(
      texts.some((text) => text.startsWith('Selected from src/app.ts (typescript), lines 1-3:')),
    ).toBe(true);
    expect(texts.some((text) => text.includes('b is not defined'))).toBe(true);
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

  it('stops sending an editor chip the user removed, until the next turn', async () => {
    const root = await realContextWorkspace();
    Object.defineProperty(vscode.window, 'activeTextEditor', {
      configurable: true,
      writable: true,
      value: {
        selection: {
          isEmpty: true,
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
          active: { line: 0, character: 0 },
        },
        document: {
          uri: vscode.Uri.file(path.join(root, 'src/app.ts')),
          languageId: 'typescript',
          lineCount: 3,
          getText: () => '',
        },
      },
    });
    vi.mocked(vscode.workspace.asRelativePath).mockImplementation((value: unknown) =>
      String((value as { fsPath?: string }).fsPath ?? value).replace(`${root}${path.sep}`, ''),
    );
    vi.mocked(vscode.languages.getDiagnostics).mockReturnValue([] as never);

    const harness = makeHarness();
    harness.runtime.startThread.mockResolvedValue(threadSummary({ cwd: root }));

    await harness.manager.handleMessage({
      type: 'dismissEditorContext',
      payload: { id: 'active-file:src/app.ts' },
    });
    expect(harness.posted.at(-1)).toEqual({ type: 'editorContext', payload: { chips: [] } });

    const send = harness.manager.handleMessage({ type: 'sendMessage', payload: { text: 'Hello' } });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    expect(
      (harness.runtime.startTurn.mock.calls[0]?.[0] as { contextFiles?: string[] }).contextFiles ??
        [],
    ).not.toContain(path.join(root, 'src/app.ts'));

    await vi.waitFor(() =>
      expect(harness.posted).toContainEqual({
        type: 'editorContext',
        payload: {
          chips: [{ id: 'active-file:src/app.ts', kind: 'active-file', label: 'app.ts' }],
        },
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

  it('presents a typed turn failure and ignores the legacy string when both arrive', async () => {
    const harness = makeHarness();
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Run tests' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());

    harness.emit({
      type: 'turn_failed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'failed',
      response: '',
      inputTokens: 0,
      outputTokens: 0,
      error: '[deepseek] Authentication failed: No API key found. Run `agi login deepseek`.',
      failure: {
        code: 'provider_auth_missing',
        message: '[deepseek] Authentication failed: No API key found. Run `agi login deepseek`.',
        provider: 'deepseek',
        retryable: false,
        action: 'sign_in_provider',
      },
    });
    await send;

    expect(harness.posted).toContainEqual({
      type: 'error',
      payload: expect.objectContaining({
        headline: 'AGI has no DeepSeek key to run this with.',
        action: { kind: 'sign-in-provider', label: 'Sign in to DeepSeek', provider: 'deepseek' },
      }),
    });
  });

  it('still reads the legacy string from a runtime that sends no typed failure', async () => {
    const harness = makeHarness();
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Run tests' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());

    harness.emit({
      type: 'turn_failed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'failed',
      response: '',
      inputTokens: 0,
      outputTokens: 0,
      error: '[deepseek] API error (HTTP 429): slow down',
    });
    await send;

    expect(harness.posted).toContainEqual({
      type: 'error',
      payload: presentChatError('[deepseek] API error (HTTP 429): slow down'),
    });
  });

  it('runs the provider sign-in the failure asked for', async () => {
    const harness = makeHarness();

    await harness.manager.handleMessage({
      type: 'resolveTurnFailure',
      payload: { kind: 'sign-in-provider', provider: 'deepseek' },
    });

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'agi-workforce.signInProvider',
      'deepseek',
    );
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
    const facts = [
      {
        id: 'memory-1',
        text: 'Prefer Rust for command-line tools',
        createdAt: '2026-07-25T00:00:00.000Z',
      },
    ];
    setAccountMemoryStore({
      cachedFacts: () => facts,
      turnFacts: () => facts,
    } as unknown as AccountMemoryStore);
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

  it('names the model Auto actually served instead of "auto"', async () => {
    const served = requireCatalogModel();
    const harness = makeHarness();
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Explain this function', model: 'auto' },
    });

    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    harness.emit({
      type: 'turn_model',
      threadId: 'thread-1',
      turnId: 'turn-1',
      model: served.id,
      provider: String(served.provider),
      autoSelection: 'auto',
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
      type: 'done',
      payload: expect.objectContaining({
        model: served.id,
        modelLabel: modelDisplayNameById(served.id),
      }),
    });
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
        input: [
          expect.objectContaining({
            type: 'text',
            text: 'What changed in the latest Rust release?',
          }),
          expect.objectContaining({
            type: 'text',
            text: expect.stringMatching(
              /Use the web_search tool[\s\S]*request above[\s\S]*Local privacy boundary refuses network access/u,
            ),
          }),
        ],
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
    const manualModels = MODEL_PICKER_OPTIONS.filter((option) => !isAutoPickerModelId(option.id));
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

  it('keeps the developer session when the model changes inside a managed session', async () => {
    const harness = makeHarness();
    await harness.context.globalState.update('tierStatus.cachedTier', 'max');
    const manualModels = MODEL_PICKER_OPTIONS.filter((option) => !isAutoPickerModelId(option.id));
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
    const thread = threadSummary({
      id: 'thread-1',
      model: firstModel!.id,
      provider: 'managed_cloud',
      trustMode: 'managed',
    });
    harness.runtime.startThread.mockResolvedValueOnce(thread);
    harness.runtime.readThread.mockResolvedValueOnce({
      thread,
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
      payload: { text: 'Continue on the plan', model: secondModel!.id },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledTimes(2));

    expect(harness.runtime.startThread).toHaveBeenCalledTimes(1);
    expect(harness.runtime.startTurn).toHaveBeenLastCalledWith(
      expect.objectContaining({ threadId: 'thread-1', model: secondModel!.id }),
    );
    expect(harness.posted).not.toContainEqual(
      expect.objectContaining({ type: 'conversationBoundaryChanged' }),
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
    const manualModels = MODEL_PICKER_OPTIONS.filter((option) => !isAutoPickerModelId(option.id));
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
      (item) =>
        item.modelId !== undefined && !isAutoPickerModelId(item.modelId) && item.disabled === true,
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
      Extract<ExtToWebviewMessage, { type: 'modelPickerData' }> | undefined;
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
      Extract<ExtToWebviewMessage, { type: 'modelPickerData' }> | undefined;
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
    await api.setAccountToken(harness.context.secrets as never, 'signed-in-token');
    await harness.context.globalState.update('tierStatus.cachedTier', 'local');
    await harness.context.globalState.update('tierStatus.cachedAtMs', Date.now());
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
        category: 'subscription',
        headline: 'This model is not available for your current plan or provider setup.',
        retryable: false,
        action: { kind: 'upgrade-plan', label: 'Upgrade your plan' },
      },
    });
    expect(harness.posted).not.toContainEqual({
      type: 'model',
      payload: { model: lockedModel!.modelId! },
    });
  });

  it('rejects a forged send with a tier-locked catalog model', async () => {
    const harness = makeHarness();
    await api.setAccountToken(harness.context.secrets as never, 'signed-in-token');
    await harness.context.globalState.update('tierStatus.cachedTier', 'local');
    await harness.context.globalState.update('tierStatus.cachedAtMs', Date.now());
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
        category: 'subscription',
        headline: 'This model is not available for your current plan or provider setup.',
        retryable: false,
        action: { kind: 'upgrade-plan', label: 'Upgrade your plan' },
      },
    });
  });

  it('asks a signed-out user to sign in, not to upgrade, when the cached plan excludes the model', async () => {
    const harness = makeHarness();
    await harness.context.globalState.update('tierStatus.cachedTier', 'local');
    const lockedModel = buildGroupedQuickPickItems('local').find(
      (item) => item.modelId !== undefined && item.disabled === true,
    );
    expect(lockedModel).toBeDefined();

    await harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Explain this function', model: lockedModel!.modelId! },
    });

    expect(harness.posted).toContainEqual({
      type: 'error',
      payload: {
        category: 'sign-in',
        headline: 'Sign in to AGI to run this model on your plan.',
        retryable: false,
        action: { kind: 'sign-in-account', label: 'Sign in to AGI' },
      },
    });
  });

  it('continues a web chat in this workspace when the CLI can import it, else opens it on the web', async () => {
    vscode.workspace.workspaceFolders = [
      { name: 'workspace', index: 0, uri: vscode.Uri.file('/workspace') },
    ];
    const harness = makeHarness({
      resolvedConversation: { thread: threadSummary(), messages: [], transcriptTruncated: false },
    });
    const adopt = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    Object.assign(harness.conversationTreeProvider!, { adoptAccountConversation: adopt });

    await harness.manager.handleMessage({
      type: 'openSessionRow',
      payload: { id: 'web-conversation-1', source: 'cloud' },
    });
    expect(adopt).toHaveBeenCalledWith('web-conversation-1', '/workspace');
    expect(harness.conversationTreeProvider?.resolveThread).toHaveBeenCalledWith(
      'web-conversation-1',
    );
    expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
      'agi-workforce.openConversation',
      'web-conversation-1',
    );
    expect(vscode.env.openExternal).not.toHaveBeenCalled();

    await harness.manager.handleMessage({
      type: 'openSessionRow',
      payload: { id: 'web-conversation-2', source: 'cloud' },
    });
    expect(vscode.env.openExternal).toHaveBeenCalledOnce();
    expect(String(vi.mocked(vscode.env.openExternal).mock.calls[0]?.[0])).toContain(
      '/chat/web-conversation-2',
    );
  });

  it('counts only edits that finished, not attempts that failed', async () => {
    const harness = makeHarness();
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Fix the bug' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    const edit = (toolCallId: string, path: string, sequence: number) =>
      harness.emit({
        type: 'tool_execution_start',
        threadId: 'thread-1',
        turnId: 'turn-1',
        sequence,
        emittedAtMs: sequence,
        toolCallId,
        name: 'edit_file',
        category: 'filesystem',
        summary: `Edit ${path}`,
        input: { path, old_string: 'a', new_string: 'b' },
      });
    const finish = (toolCallId: string, isError: boolean, sequence: number) =>
      harness.emit({
        type: 'tool_execution_end',
        threadId: 'thread-1',
        turnId: 'turn-1',
        sequence,
        emittedAtMs: sequence,
        toolCallId,
        name: 'edit_file',
        output: isError ? 'old_string not found' : 'Edited',
        isError,
      });
    edit('call-1', 'src/missing.ts', 1);
    finish('call-1', true, 2);
    edit('call-2', 'src/retry.ts', 3);
    finish('call-2', true, 4);
    edit('call-3', 'src/retry.ts', 5);
    finish('call-3', false, 6);
    edit('call-4', 'src/unfinished.ts', 7);
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'Done.',
      inputTokens: 1,
      outputTokens: 1,
    });
    await send;

    expect(harness.posted).toContainEqual({
      type: 'done',
      payload: expect.objectContaining({ turnId: 'turn-1', changedFiles: 1 }),
    });
  });

  it('reports no changed files when every edit failed', async () => {
    const harness = makeHarness();
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Fix the bug' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    harness.emit({
      type: 'tool_execution_start',
      threadId: 'thread-1',
      turnId: 'turn-1',
      sequence: 1,
      emittedAtMs: 1,
      toolCallId: 'call-1',
      name: 'edit_file',
      category: 'filesystem',
      summary: 'Edit src/example.txt',
      input: { path: 'src/example.txt', old_string: 'absent', new_string: 'x' },
    });
    harness.emit({
      type: 'tool_execution_end',
      threadId: 'thread-1',
      turnId: 'turn-1',
      sequence: 2,
      emittedAtMs: 2,
      toolCallId: 'call-1',
      name: 'edit_file',
      output: 'old_string not found',
      isError: true,
    });
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'I could not apply that edit.',
      inputTokens: 1,
      outputTokens: 1,
    });
    await send;

    expect(harness.posted).toContainEqual({
      type: 'done',
      payload: expect.not.objectContaining({ changedFiles: expect.anything() }),
    });
  });

  it('offers no Undo for a reply, because checkpoints cannot prove which reply they belong to', async () => {
    const harness = makeHarness();
    const rewindThread = vi.fn().mockResolvedValue({
      restoredFiles: ['src/math.ts'],
      removedFiles: [],
      skippedFiles: [],
      conversationRestored: false,
      prompt: 'Fix the bug',
    });
    const listCheckpoints = vi.fn().mockResolvedValue({
      checkpoints: [
        {
          checkpointIndex: 0,
          prompt: 'Explain',
          createdAt: '2026-10-18T00:00:00Z',
          trackedFiles: 1,
        },
        {
          checkpointIndex: 1,
          prompt: 'Fix the bug',
          createdAt: '2026-10-18T00:01:00Z',
          trackedFiles: 1,
        },
      ],
    });
    Object.assign(harness.runtime, { rewindThread, listCheckpoints });
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Fix the bug' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    harness.emit({
      type: 'tool_execution_start',
      threadId: 'thread-1',
      turnId: 'turn-1',
      sequence: 1,
      emittedAtMs: 1,
      toolCallId: 'call-1',
      name: 'edit_file',
      category: 'filesystem',
      summary: 'Edit src/math.ts',
      input: { path: 'src/math.ts', old_string: '<=', new_string: '<' },
    });
    harness.emit({
      type: 'tool_execution_end',
      threadId: 'thread-1',
      turnId: 'turn-1',
      sequence: 2,
      emittedAtMs: 2,
      toolCallId: 'call-1',
      name: 'edit_file',
      output: 'Edited src/math.ts',
      isError: false,
    });
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'Fixed.',
      inputTokens: 1,
      outputTokens: 1,
    });
    await send;

    expect(harness.posted).toContainEqual({
      type: 'done',
      payload: expect.objectContaining({ turnId: 'turn-1', changedFiles: 1 }),
    });

    expect(
      parseBoundWebviewMessage(
        { type: 'undoTurn', payload: { turnId: 'turn-1' }, origin: 'o', epoch: 0 },
        { origin: 'o', epoch: 0 },
      ),
    ).toBeUndefined();
    expect(listCheckpoints).not.toHaveBeenCalled();
    expect(rewindThread).not.toHaveBeenCalled();
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
    const root = await realContextWorkspace(harness);
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

  it('omits an attachment removed while the turn is still being prepared', async () => {
    const harness = makeHarness();
    let releaseLadder!: () => void;
    const ladderGate = new Promise<boolean>((resolve) => {
      releaseLadder = () => resolve(false);
    });
    harness.runtime.offers.mockImplementation(async (capability: string) =>
      capability === 'reasoningEffortLadder' ? ladderGate : false,
    );
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
    const ack = harness.posted.find((m) => m.type === 'attachFilesAck') as {
      type: 'attachFilesAck';
      payload: { added: Array<{ id: string }> };
    };
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Summarize the attachment' },
    });
    await vi.waitFor(() =>
      expect(harness.runtime.offers).toHaveBeenCalledWith('reasoningEffortLadder'),
    );
    expect(harness.runtime.startTurn).not.toHaveBeenCalled();

    await harness.manager.handleMessage({
      type: 'removePendingAttachment',
      payload: { id: ack.payload.added[0]!.id },
    });
    releaseLadder();

    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    expect(harness.runtime.startTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        input: [{ type: 'text', text: 'Summarize the attachment', text_elements: [] }],
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
      payload: expect.objectContaining({ headline: expect.stringContaining('too many events') }),
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

  async function runApprovalTurn(
    harness: ReturnType<typeof makeHarness>,
  ): Promise<{ finish: () => Promise<void> }> {
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Ship it' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    return {
      finish: async () => {
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
      },
    };
  }

  function requestApproval(
    harness: ReturnType<typeof makeHarness>,
    requestId: string,
    kind: string,
  ): void {
    harness.emit({
      type: 'approval_requested',
      threadId: 'thread-1',
      turnId: 'turn-1',
      requestId,
      kind,
      summary: 'Allow?',
      detail: kind,
    });
  }

  it('asks again for a push to another branch after one push was allowed for the session', async () => {
    const harness = makeHarness();
    const turn = await runApprovalTurn(harness);
    requestApproval(
      harness,
      'push-1',
      'GitPush { remote: "origin", branch: "feature", force: false }',
    );
    await vi.waitFor(() =>
      expect(harness.posted).toContainEqual(
        expect.objectContaining({
          type: 'approvalRequested',
          payload: expect.objectContaining({ requestId: 'push-1' }),
        }),
      ),
    );
    await harness.manager.handleMessage({
      type: 'respondToApproval',
      payload: { requestId: 'push-1', decision: 'session' },
    });

    requestApproval(
      harness,
      'push-2',
      'GitPush { remote: "origin", branch: "main", force: false }',
    );
    await vi.waitFor(() =>
      expect(harness.posted).toContainEqual(
        expect.objectContaining({
          type: 'approvalRequested',
          payload: expect.objectContaining({ requestId: 'push-2' }),
        }),
      ),
    );
    expect(harness.runtime.respondToApproval).toHaveBeenCalledOnce();

    requestApproval(
      harness,
      'push-3',
      'GitPush { remote: "origin", branch: "feature", force: false }',
    );
    await vi.waitFor(() => expect(harness.runtime.respondToApproval).toHaveBeenCalledTimes(2));
    expect(harness.runtime.respondToApproval).toHaveBeenLastCalledWith(
      expect.objectContaining({ requestId: 'push-3', decision: 'approved' }),
    );
    await turn.finish();
  });

  it('never remembers or offers a session answer for a force push', async () => {
    const harness = makeHarness();
    const turn = await runApprovalTurn(harness);
    const forced = 'GitPush { remote: "origin", branch: "main", force: true }';
    requestApproval(harness, 'force-1', forced);
    await vi.waitFor(() =>
      expect(harness.posted).toContainEqual({
        type: 'approvalRequested',
        payload: expect.objectContaining({ requestId: 'force-1', sessionScopeOffered: false }),
      }),
    );
    await harness.manager.handleMessage({
      type: 'respondToApproval',
      payload: { requestId: 'force-1', decision: 'session' },
    });
    expect(harness.runtime.respondToApproval).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'force-1', decision: 'approved' }),
    );

    requestApproval(harness, 'force-2', forced);
    await vi.waitFor(() =>
      expect(harness.posted).toContainEqual(
        expect.objectContaining({
          type: 'approvalRequested',
          payload: expect.objectContaining({ requestId: 'force-2' }),
        }),
      ),
    );
    expect(harness.runtime.respondToApproval).toHaveBeenCalledOnce();
    await turn.finish();
  });

  it('closes a card the runtime already resolved, and never answers it afterwards', async () => {
    const harness = makeHarness();
    const turn = await runApprovalTurn(harness);
    requestApproval(harness, 'timed-out', 'Exec { command: "pnpm test" }');
    await vi.waitFor(() =>
      expect(harness.posted).toContainEqual(
        expect.objectContaining({
          type: 'approvalRequested',
          payload: expect.objectContaining({ requestId: 'timed-out' }),
        }),
      ),
    );
    harness.emit({
      type: 'agent_event',
      threadId: 'thread-1',
      turnId: 'turn-1',
      envelope: {
        sessionId: 'thread-1',
        turnId: 'turn-1',
        sequence: 9,
        emittedAtMs: 0,
        event: { type: 'approval-resolved', approvalId: 'timed-out', decision: 'cancelled' },
      },
    } as unknown as LocalRuntimeEvent);
    await vi.waitFor(() =>
      expect(harness.posted).toContainEqual({
        type: 'approvalResolved',
        payload: { requestId: 'timed-out', outcome: 'expired' },
      }),
    );

    await harness.manager.handleMessage({
      type: 'respondToApproval',
      payload: { requestId: 'timed-out', decision: 'once' },
    });
    expect(harness.runtime.respondToApproval).not.toHaveBeenCalled();
    expect(harness.runtime.interruptTurn).not.toHaveBeenCalled();
    await turn.finish();
  });

  it('marks an answer to an approval the runtime no longer holds as expired, keeping the turn', async () => {
    const harness = makeHarness({
      approvalFailure: new LocalRuntimeProtocolError(
        'Approval request is no longer pending',
        -32004,
      ),
    });
    const turn = await runApprovalTurn(harness);
    requestApproval(harness, 'gone', 'Exec { command: "pnpm test" }');
    await vi.waitFor(() =>
      expect(harness.posted).toContainEqual(
        expect.objectContaining({
          type: 'approvalRequested',
          payload: expect.objectContaining({ requestId: 'gone' }),
        }),
      ),
    );
    await harness.manager.handleMessage({
      type: 'respondToApproval',
      payload: { requestId: 'gone', decision: 'once' },
    });

    expect(harness.posted).toContainEqual({
      type: 'approvalResolved',
      payload: { requestId: 'gone', outcome: 'expired' },
    });
    expect(harness.runtime.interruptTurn).not.toHaveBeenCalled();
    expect(harness.posted).not.toContainEqual(expect.objectContaining({ type: 'error' }));
    await turn.finish();
  });

  it('interrupts and settles the turn when an approval response is rejected', async () => {
    const harness = makeHarness({ approvalFailure: new Error('approval channel closed') });
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
      kind: 'Exec { command: "pnpm test" }',
      summary: 'Allow this command?',
      detail: 'pnpm test',
    });
    await harness.manager.handleMessage({
      type: 'respondToApproval',
      payload: { requestId: 'approval-1', decision: 'once' },
    });

    await vi.waitFor(() => expect(settled).toBe(true));
    expect(harness.runtime.respondToApproval).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'approved' }),
    );
    expect(harness.runtime.interruptTurn).toHaveBeenCalledOnce();
    expect(harness.posted).toContainEqual({
      type: 'error',
      payload: { category: 'runtime', headline: 'approval channel closed', retryable: true },
    });
    await send;
  });

  it('does not resurrect an approval after capability discovery outlives its turn', async () => {
    const harness = makeHarness();
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Edit file' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    let resolveCapability!: (value: boolean) => void;
    harness.runtime.offers.mockImplementation((capability: string) =>
      capability === 'approvalEdits'
        ? new Promise<boolean>((resolve) => {
            resolveCapability = resolve;
          })
        : Promise.resolve(false),
    );
    harness.emit({
      type: 'approval_requested',
      threadId: 'thread-1',
      turnId: 'turn-1',
      requestId: 'late-edit',
      kind: 'FileWrite { path: "/workspace/a.ts" }',
      summary: 'Edit?',
      detail: 'a.ts',
      editable: true,
      proposedContent: 'new text',
    });
    await vi.waitFor(() => expect(resolveCapability).toBeDefined());
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
    resolveCapability(true);
    await Promise.resolve();
    await harness.manager.handleMessage({
      type: 'respondToApproval',
      payload: { requestId: 'late-edit', decision: 'once' },
    });
    expect(harness.runtime.respondToApproval).not.toHaveBeenCalled();
    expect(harness.posted).not.toContainEqual({
      type: 'approvalRequested',
      payload: expect.objectContaining({ requestId: 'late-edit' }),
    });
  });

  it.each(['once', 'abort'] as const)(
    'does not apply a stale %s after review cleanup',
    async (decision) => {
      const harness = makeHarness();
      const send = harness.manager.handleMessage({
        type: 'sendMessage',
        payload: { text: 'Edit file' },
      });
      await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
      harness.runtime.offers.mockResolvedValue(true);
      harness.emit({
        type: 'approval_requested',
        threadId: 'thread-1',
        turnId: 'turn-1',
        requestId: 'edit-1',
        kind: 'FileWrite { path: "/workspace/a.ts" }',
        summary: 'Edit?',
        detail: 'a.ts',
        editable: true,
        proposedContent: 'new text',
      });
      await vi.waitFor(() =>
        expect(harness.posted).toContainEqual({
          type: 'approvalRequested',
          payload: expect.objectContaining({ requestId: 'edit-1' }),
        }),
      );
      let releaseReview!: () => void;
      const cleanup = new Promise<undefined>((resolve) => {
        releaseReview = () => resolve(undefined);
      });
      const review = vi
        .spyOn(
          proposedChangeReview,
          decision === 'once' ? 'finishProposedChange' : 'discardProposedChange',
        )
        .mockImplementation(() => cleanup);
      try {
        const response = harness.manager.handleMessage({
          type: 'respondToApproval',
          payload: { requestId: 'edit-1', decision },
        });
        await vi.waitFor(() => expect(review).toHaveBeenCalledOnce());
        await harness.manager.handleMessage({
          type: 'respondToApproval',
          payload: { requestId: 'edit-1', decision },
        });
        expect(review).toHaveBeenCalledOnce();
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
        harness.runtime.startTurn.mockResolvedValueOnce({ id: 'turn-2' });
        const next = harness.manager.handleMessage({
          type: 'sendMessage',
          payload: { text: 'Next turn' },
        });
        await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledTimes(2));
        releaseReview();
        await response;
        expect(harness.runtime.respondToApproval).not.toHaveBeenCalled();
        expect(harness.runtime.interruptTurn).not.toHaveBeenCalled();
        harness.emit({
          type: 'turn_completed',
          threadId: 'thread-1',
          turnId: 'turn-2',
          status: 'completed',
          response: 'done',
          inputTokens: 1,
          outputTokens: 1,
        });
        await next;
      } finally {
        review.mockRestore();
      }
    },
  );

  it('does not show a successful approval or cache session consent after an RPC failure', async () => {
    const harness = makeHarness({ approvalFailure: new Error('approval rejected') });
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Run command' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    harness.emit({
      type: 'approval_requested',
      threadId: 'thread-1',
      turnId: 'turn-1',
      requestId: 'failed-session',
      kind: 'Exec { command: "ls" }',
      summary: 'Run?',
      detail: 'ls',
    });
    await harness.manager.handleMessage({
      type: 'respondToApproval',
      payload: { requestId: 'failed-session', decision: 'session' },
    });
    await send;
    expect(harness.posted).not.toContainEqual({
      type: 'approvalResolved',
      payload: { requestId: 'failed-session', outcome: 'session' },
    });
    harness.runtime.startTurn.mockResolvedValueOnce({ id: 'turn-2' });
    const next = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Try another command' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledTimes(2));
    harness.emit({
      type: 'approval_requested',
      threadId: 'thread-1',
      turnId: 'turn-2',
      requestId: 'fresh-session',
      kind: 'Exec { command: "pwd" }',
      summary: 'Run?',
      detail: 'pwd',
    });
    expect(harness.posted).toContainEqual({
      type: 'approvalRequested',
      payload: expect.objectContaining({ requestId: 'fresh-session' }),
    });
    expect(harness.runtime.respondToApproval).toHaveBeenCalledOnce();
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-2',
      status: 'completed',
      response: 'done',
      inputTokens: 1,
      outputTokens: 1,
    });
    await next;
  });

  it.each(['session', 'deny'] as const)(
    'does not apply a delayed %s response to a later turn',
    async (decision) => {
      const harness = makeHarness();
      const send = harness.manager.handleMessage({
        type: 'sendMessage',
        payload: { text: 'Run command' },
      });
      await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
      let releaseResponse!: () => void;
      harness.runtime.respondToApproval.mockReturnValueOnce(
        new Promise<void>((resolve) => {
          releaseResponse = resolve;
        }),
      );
      harness.emit({
        type: 'approval_requested',
        threadId: 'thread-1',
        turnId: 'turn-1',
        requestId: 'delayed-session',
        kind: 'Exec { command: "ls" }',
        summary: 'Run?',
        detail: 'ls',
      });
      const response = harness.manager.handleMessage({
        type: 'respondToApproval',
        payload: { requestId: 'delayed-session', decision, guidance: 'Use another approach' },
      });
      await vi.waitFor(() => expect(harness.runtime.respondToApproval).toHaveBeenCalledOnce());
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
      harness.runtime.startTurn.mockResolvedValueOnce({ id: 'turn-2' });
      const next = harness.manager.handleMessage({
        type: 'sendMessage',
        payload: { text: 'Next command' },
      });
      await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledTimes(2));
      releaseResponse();
      await response;
      harness.emit({
        type: 'approval_requested',
        threadId: 'thread-1',
        turnId: 'turn-2',
        requestId: 'next-session',
        kind: 'Exec { command: "pwd" }',
        summary: 'Run?',
        detail: 'pwd',
      });
      expect(harness.posted).toContainEqual({
        type: 'approvalRequested',
        payload: expect.objectContaining({ requestId: 'next-session' }),
      });
      expect(harness.posted).not.toContainEqual({
        type: 'approvalResolved',
        payload: { requestId: 'delayed-session', outcome: decision },
      });
      expect(harness.runtime.respondToApproval).toHaveBeenCalledOnce();
      expect(harness.runtime.startTurn).toHaveBeenCalledTimes(2);
      expect(harness.runtime.steerTurn).not.toHaveBeenCalled();
      harness.emit({
        type: 'turn_completed',
        threadId: 'thread-1',
        turnId: 'turn-2',
        status: 'completed',
        response: 'done',
        inputTokens: 1,
        outputTokens: 1,
      });
      await next;
    },
  );

  it('does not publish a delayed interrupt failure into the next turn', async () => {
    let rejectInterrupt!: (error: Error) => void;
    const harness = makeHarness({
      interruptTurn: new Promise<void>((_resolve, reject) => {
        rejectInterrupt = reject;
      }),
    });
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Start work' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    const cancel = harness.manager.handleMessage({ type: 'cancel' });
    await vi.waitFor(() => expect(harness.runtime.interruptTurn).toHaveBeenCalledOnce());
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
    harness.runtime.startTurn.mockResolvedValueOnce({ id: 'turn-2' });
    const next = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Next work' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledTimes(2));
    rejectInterrupt(new Error('old interrupt failed'));
    await cancel;
    expect(harness.posted).not.toContainEqual({
      type: 'error',
      payload: expect.objectContaining({ headline: 'old interrupt failed' }),
    });
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-2',
      status: 'completed',
      response: 'done',
      inputTokens: 1,
      outputTokens: 1,
    });
    await next;
  });

  it('asks in the transcript rather than in a native dialog', async () => {
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
      kind: 'Exec { command: "pnpm test" }',
      summary: 'Allow this command?',
      detail: 'pnpm test',
    });

    await vi.waitFor(() =>
      expect(harness.posted).toContainEqual({
        type: 'approvalRequested',
        payload: {
          requestId: 'approval-1',
          toolLabel: 'shell commands',
          summary: 'Allow this command?',
          detail: 'pnpm test',
          sessionApproved: false,
        },
      }),
    );
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();

    await harness.manager.handleMessage({
      type: 'respondToApproval',
      payload: { requestId: 'approval-1', decision: 'once' },
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

  it('stops asking for the same tool after Approve for session, whatever the argument', async () => {
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
      kind: 'Exec { command: "node -e m.add(2,3)" }',
      summary: 'Allow this command?',
      detail: 'node -e',
    });
    await harness.manager.handleMessage({
      type: 'respondToApproval',
      payload: { requestId: 'approval-1', decision: 'session' },
    });

    for (const command of ['ls -la', '/usr/bin/env node -e "x"']) {
      harness.emit({
        type: 'approval_requested',
        threadId: 'thread-1',
        turnId: 'turn-1',
        requestId: `approval-${command}`,
        kind: `Exec { command: ${JSON.stringify(command)} }`,
        summary: 'Allow this command?',
        detail: command,
      });
    }

    await vi.waitFor(() => expect(harness.runtime.respondToApproval).toHaveBeenCalledTimes(3));
    expect(harness.posted.filter((message) => message.type === 'approvalRequested')).toHaveLength(
      1,
    );

    harness.emit({
      type: 'approval_requested',
      threadId: 'thread-1',
      turnId: 'turn-1',
      requestId: 'approval-write',
      kind: 'FileWrite { path: "/workspace/a.ts" }',
      summary: 'Allow this write?',
      detail: '/workspace/a.ts',
    });
    await vi.waitFor(() =>
      expect(harness.posted.filter((message) => message.type === 'approvalRequested')).toHaveLength(
        2,
      ),
    );

    await harness.manager.handleMessage({
      type: 'respondToApproval',
      payload: { requestId: 'approval-write', decision: 'deny' },
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

  it('interrupts the turn directly when the approval card chooses Abort turn', async () => {
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
      kind: 'Exec { command: "pnpm test" }',
      summary: 'Allow this command?',
      detail: 'pnpm test',
    });
    await harness.manager.handleMessage({
      type: 'respondToApproval',
      payload: { requestId: 'approval-1', decision: 'abort' },
    });
    await send;

    expect(harness.runtime.interruptTurn).toHaveBeenCalledWith({
      threadId: 'thread-1',
      turnId: 'turn-1',
    });
    expect(harness.runtime.respondToApproval).not.toHaveBeenCalled();
  });

  it('does not approve a stale card after New Chat retires its turn', async () => {
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
      kind: 'Exec { command: "pnpm test" }',
      summary: 'Allow this command?',
      detail: 'pnpm test',
    });
    await vi.waitFor(() =>
      expect(harness.posted.some((message) => message.type === 'approvalRequested')).toBe(true),
    );

    await harness.manager.handleMessage({ type: 'newChat' });
    await send;
    await harness.manager.handleMessage({
      type: 'respondToApproval',
      payload: { requestId: 'approval-1', decision: 'once' },
    });

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
      input: { query: 'AGI Code' },
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
        input: { query: 'AGI Code' },
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

  async function completeTurn(
    harness: Pick<ReturnType<typeof makeHarness>, 'emit'>,
    turnId = 'turn-1',
  ): Promise<void> {
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId,
      status: 'completed',
      response: 'done',
      inputTokens: 1,
      outputTokens: 1,
    });
  }

  it('continues the same persisted session after the CLI exits mid-turn', async () => {
    const harness = makeHarness();
    const first = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'First turn' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    harness.emit({ type: 'runtime_disconnected', error: 'AGI local runtime exited' });
    await first;

    const second = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Follow-up' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledTimes(2));
    await completeTurn(harness);
    await second;

    expect(harness.runtime.startThread).toHaveBeenCalledOnce();
    expect(harness.runtime.startTurn.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ threadId: 'thread-1' }),
    );
    expect(harness.posted).not.toContainEqual(
      expect.objectContaining({ type: 'conversationBoundaryChanged' }),
    );
  });

  it('announces a new session before starting one when the old session is gone after an exit', async () => {
    const harness = makeHarness();
    const first = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'First turn' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    harness.emit({ type: 'runtime_disconnected', error: 'AGI local runtime exited' });
    await first;
    harness.runtime.readThread.mockRejectedValueOnce(
      new LocalRuntimeProtocolError('thread not found', -32004),
    );
    const boundaryBeforeStart: boolean[] = [];
    harness.runtime.startThread.mockImplementationOnce(async () => {
      boundaryBeforeStart.push(
        harness.posted.some((message) => message.type === 'conversationBoundaryChanged'),
      );
      return threadSummary({ id: 'thread-2' });
    });

    const second = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Follow-up' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledTimes(2));
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-2',
      turnId: 'turn-1',
      status: 'completed',
      response: 'done',
      inputTokens: 1,
      outputTokens: 1,
    });
    await second;

    expect(harness.runtime.startThread).toHaveBeenCalledTimes(2);
    expect(harness.posted).toContainEqual(
      expect.objectContaining({ type: 'conversationBoundaryChanged' }),
    );
    expect(boundaryBeforeStart).toEqual([true]);
  });

  it('rebinds an idle conversation to the live client after its old client was disposed', async () => {
    const harness = makeHarness();
    const first = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'First turn' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    await completeTurn(harness);
    await first;

    const disposed = new Error('AGI local runtime client is disposed');
    harness.runtime.listLocalModels.mockRejectedValue(disposed);
    harness.runtime.readThread.mockRejectedValue(disposed);
    harness.runtime.startTurn.mockRejectedValue(disposed);
    const live = makeHarness();
    live.runtime.readThread.mockResolvedValue({
      thread: threadSummary({ id: 'thread-1' }),
      messages: [],
      transcriptTruncated: false,
    });
    vi.mocked(harness.pool.forWorkspace).mockReturnValue(
      live.runtime as unknown as LocalRuntimeClient,
    );

    harness.posted.splice(0);
    await harness.manager.refreshRuntimeStatus();
    expect(harness.posted).toContainEqual({ type: 'runtimeStatus', payload: { status: 'ready' } });

    const second = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Follow-up' },
    });
    await vi.waitFor(() => expect(live.runtime.startTurn).toHaveBeenCalledOnce());
    await completeTurn(live);
    await second;

    expect(harness.runtime.startTurn).toHaveBeenCalledOnce();
    expect(live.runtime.startThread).not.toHaveBeenCalled();
    expect(live.runtime.startTurn.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ threadId: 'thread-1' }),
    );
  });

  it('reloads the streamed answer when the runtime reports lost notifications', async () => {
    const harness = makeHarness();
    const turn = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Explain' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    const delta = (index: number, text: string): LocalRuntimeEvent => ({
      type: 'output_delta',
      threadId: 'thread-1',
      turnId: 'turn-1',
      index,
      delta: text,
    });
    harness.emit(delta(0, 'Hel'));
    harness.runtime.reconnectThread.mockResolvedValueOnce({
      turnId: 'turn-1',
      partialResponse: 'Hello wor',
      nextDeltaIndex: 3,
      pendingApprovals: [],
    });

    harness.notify({ method: 'server/warning', params: { code: 'notification_lag', skipped: 2 } });
    harness.emit(delta(2, 'lo wor'));
    await vi.waitFor(() =>
      expect(harness.posted).toContainEqual({
        type: 'streamReplaced',
        payload: { text: 'Hello wor' },
      }),
    );
    harness.emit(delta(3, 'ld'));

    expect(harness.runtime.reconnectThread).toHaveBeenCalledWith('thread-1');
    expect(harness.posted).not.toContainEqual({ type: 'token', payload: { text: 'lo wor' } });
    expect(harness.posted).toContainEqual({ type: 'token', payload: { text: 'ld' } });
    expect(harness.posted).toContainEqual(
      expect.objectContaining({
        type: 'sessionNotice',
        payload: expect.objectContaining({ message: expect.stringContaining('missed') }),
      }),
    );
    await completeTurn(harness);
    await turn;
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
      payload: presentChatError('AGI local runtime exited'),
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

  it('reports the context the CLI measured against the catalog window, not the turn’s summed tokens', async () => {
    const harness = makeHarness();
    await harness.context.globalState.update('tierStatus.cachedTier', 'max');
    const model = MODEL_PICKER_OPTIONS.filter((option) => !isAutoPickerModelId(option.id)).find(
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
      inputTokens: 20_100,
      outputTokens: 200,
      contextTokens: 10_200,
    });
    await send;

    const contextPosts = harness.posted.filter((message) => message.type === 'contextUsage');
    expect(contextPosts).toEqual([
      {
        type: 'contextUsage',
        payload: { usedTokens: 10_200, contextWindow: MODEL_CONTEXT_LIMITS[model!.id] },
      },
    ]);
  });

  it('shows no context figure when the CLI did not measure one', async () => {
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
      inputTokens: 20_100,
      outputTokens: 200,
    });
    await send;

    const contextPosts = harness.posted.filter((message) => message.type === 'contextUsage');
    expect(contextPosts).toEqual([{ type: 'contextUsage', payload: { usedTokens: 0 } }]);

    vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce(undefined);
    await harness.manager.showSessionStatus();
    const rows = vi.mocked(vscode.window.showQuickPick).mock.calls.at(-1)?.[0] as Array<{
      label: string;
      description?: string;
    }>;
    expect(rows.find((entry) => entry.label.endsWith('Context'))?.description).toBe(
      'Not measured yet in this window',
    );
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
      contextTokens: 1_000,
    });
    await send;

    expect(harness.posted).toContainEqual({
      type: 'contextUsage',
      payload: { usedTokens: 1_000 },
    });
  });
});

describe('ChatStateManager session compaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vscode.workspace.isTrusted = true;
    vscode.window.activeTextEditor = undefined;
    vscode.workspace.workspaceFolders = [
      { name: 'workspace', index: 0, uri: vscode.Uri.file('/workspace') },
    ];
    setContextPanelInstance({ getContextFiles: () => [] } as unknown as ContextPanelProvider);
  });

  async function startedHarness() {
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
      inputTokens: 90_000,
      outputTokens: 10_000,
      contextTokens: 100_000,
    });
    await send;
    return harness;
  }

  it('summarizes the open session after the user confirms and reports the freed context', async () => {
    const harness = await startedHarness();
    const compactThread = vi.fn().mockResolvedValue({
      threadId: 'thread-1',
      compacted: true,
      messagesSummarized: 12,
      tokensBefore: 100_000,
      tokensAfter: 8_000,
    });
    Object.assign(harness.runtime, {
      compactThread,
      offers: vi.fn(async (capability: string) => capability === 'threadCompact'),
    });
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValueOnce('Summarize' as never);

    await harness.manager.compactConversation();

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      'Summarize this session to free context?',
      expect.objectContaining({
        modal: true,
        detail: expect.stringContaining('can no longer rewind or branch'),
      }),
      'Summarize',
    );
    expect(compactThread).toHaveBeenCalledWith('thread-1');
    expect(harness.posted).toContainEqual({
      type: 'contextUsage',
      payload: { usedTokens: 8_000 },
    });
    expect(harness.posted).toContainEqual({
      type: 'sessionNotice',
      payload: {
        message: `Summarized 12 earlier messages: context went from ${(100_000).toLocaleString()} to ${(8_000).toLocaleString()} tokens.`,
      },
    });
  });

  it('shows the session, model, mode and measured context in one status view', async () => {
    const harness = await startedHarness();
    vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce(undefined);

    await harness.manager.showSessionStatus();

    const rows = vi.mocked(vscode.window.showQuickPick).mock.calls.at(-1)?.[0] as Array<{
      label: string;
      description?: string;
      detail?: string;
    }>;
    const row = (label: string) => rows.find((entry) => entry.label.endsWith(label));
    expect(row('Session')?.detail).toContain('thread-1');
    expect(row('Context')?.description).toBe(`${(100_000).toLocaleString()} tokens used`);
    expect(row('Mode')?.description).toBeTruthy();
    expect(row('Model')?.description).toBeTruthy();
  });

  it('exports the open session as Markdown to the clipboard', async () => {
    const harness = await startedHarness();
    harness.runtime.readThread.mockResolvedValueOnce({
      thread: threadSummary({ id: 'thread-1', title: 'Inspect this project' }),
      messages: [
        { role: 'user', text: 'Inspect this project', index: 0 },
        { role: 'assistant', text: 'done', index: 1 },
      ],
      transcriptTruncated: false,
    });
    vi.mocked(vscode.window.showQuickPick).mockImplementationOnce(
      async (items: unknown) =>
        (items as Array<{ action: string }>).find((item) => item.action === 'copy') as never,
    );

    await harness.manager.exportConversation();

    expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith(
      '# Inspect this project\n\n## You\n\nInspect this project\n\n## AGI\n\ndone\n',
    );
  });

  it('revises the plan with only the notes written into the plan document', async () => {
    const harness = makeHarness();
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Plan the fix' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    harness.emit({
      type: 'tool_execution_start',
      threadId: 'thread-1',
      turnId: 'turn-1',
      sequence: 1,
      emittedAtMs: 1,
      toolCallId: 'call-plan',
      name: 'update_plan',
      category: 'other',
      summary: 'Plan',
      input: { plan: [{ step: 'Change the loop bound', status: 'pending' }] },
    } as never);
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'Here is the plan.',
      inputTokens: 1,
      outputTokens: 1,
    });
    await send;
    const planUri = vscode.Uri.parse('untitled:Untitled-1');
    vi.mocked(vscode.workspace.openTextDocument).mockResolvedValueOnce({ uri: planUri } as never);
    await harness.manager.openPlanDocument();
    const original = vi.mocked(vscode.workspace.openTextDocument).mock.calls.at(-1)?.[0] as {
      content: string;
    };
    expect(original.content).toBe('# Plan\n\n- [ ] Change the loop bound\n');

    const decidePlan = vi.fn().mockResolvedValue(undefined);
    Object.assign(harness.runtime, { decidePlan, offers: vi.fn().mockResolvedValue(true) });
    vscode.window.activeTextEditor = {
      document: {
        uri: planUri,
        getText: () => `${original.content}Keep the empty-array guard.\n`,
      },
    } as never;

    const revise = harness.manager.revisePlanFromDocument();

    await vi.waitFor(() =>
      expect(decidePlan).toHaveBeenCalledWith(
        'thread-1',
        'reject',
        'On "- [ ] Change the loop bound":\nKeep the empty-array guard.',
      ),
    );
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledTimes(2));
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'Revised.',
      inputTokens: 1,
      outputTokens: 1,
    });
    await revise;
    vscode.window.activeTextEditor = undefined;
  });

  it('changes nothing when the user does not confirm', async () => {
    const harness = await startedHarness();
    const compactThread = vi.fn();
    Object.assign(harness.runtime, { compactThread, offers: vi.fn().mockResolvedValue(true) });
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValueOnce(undefined as never);

    await harness.manager.compactConversation();

    expect(compactThread).not.toHaveBeenCalled();
  });

  it('asks for a newer CLI instead of calling a method the runtime does not offer', async () => {
    const harness = await startedHarness();
    const compactThread = vi.fn();
    Object.assign(harness.runtime, { compactThread });

    await harness.manager.compactConversation();

    expect(compactThread).not.toHaveBeenCalled();
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('cannot summarize a session'),
    );
  });

  it('says so when nothing was old enough to summarize', async () => {
    const harness = await startedHarness();
    Object.assign(harness.runtime, {
      compactThread: vi.fn().mockResolvedValue({
        threadId: 'thread-1',
        compacted: false,
        messagesSummarized: 0,
        tokensBefore: 100_000,
        tokensAfter: 100_000,
      }),
      offers: vi.fn().mockResolvedValue(true),
    });
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValueOnce('Summarize' as never);

    await harness.manager.compactConversation();

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      `${PRODUCT_NAMES.code}: nothing in this session is old enough to summarize yet.`,
    );
    expect(harness.posted.filter((message) => message.type === 'sessionNotice')).toHaveLength(0);
  });
});

describe('ChatStateManager side questions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vscode.workspace.isTrusted = true;
    vscode.window.activeTextEditor = undefined;
    vscode.workspace.workspaceFolders = [
      { name: 'workspace', index: 0, uri: vscode.Uri.file('/workspace') },
    ];
    setContextPanelInstance({ getContextFiles: () => [] } as unknown as ContextPanelProvider);
  });

  it('streams the answer from the open session without starting a turn', async () => {
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
      inputTokens: 1,
      outputTokens: 1,
    });
    await send;
    const askSideQuestion = vi.fn(async (_params: unknown, onDelta: (delta: string) => void) => {
      onDelta('It returns ');
      return { answer: 'It returns NaN.' };
    });
    Object.assign(harness.runtime, { askSideQuestion });

    await harness.manager.handleMessage({
      type: 'sideQuestion',
      payload: { question: 'What does average return for []?', requestId: 'side-1' },
    });

    expect(askSideQuestion).toHaveBeenCalledWith(
      { threadId: 'thread-1', question: 'What does average return for []?', requestId: 'side-1' },
      expect.any(Function),
    );
    expect(harness.posted).toContainEqual({
      type: 'sideQuestionDelta',
      payload: { requestId: 'side-1', delta: 'It returns ' },
    });
    expect(harness.posted).toContainEqual({
      type: 'sideQuestionAnswer',
      payload: { requestId: 'side-1', answer: 'It returns NaN.' },
    });
    expect(harness.runtime.startTurn).toHaveBeenCalledOnce();
  });

  it('explains that a side question needs a session first', async () => {
    const harness = makeHarness();

    await harness.manager.handleMessage({
      type: 'sideQuestion',
      payload: { question: 'Anything?', requestId: 'side-2' },
    });

    expect(harness.posted).toContainEqual({
      type: 'sideQuestionAnswer',
      payload: {
        requestId: 'side-2',
        error:
          'A side question is answered from this session, so send a first message before asking one.',
      },
    });
  });
});

describe('ChatStateManager slash commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vscode.workspace.isTrusted = true;
    vscode.workspace.workspaceFolders = [
      { name: 'workspace', index: 0, uri: vscode.Uri.file('/workspace') },
    ];
  });

  function harnessListing(commands: unknown[]) {
    const harness = makeHarness();
    Object.assign(harness.runtime, {
      listCommands: vi.fn().mockResolvedValue({ commands }),
      offers: vi.fn().mockResolvedValue(true),
      initialize: vi.fn().mockResolvedValue({ capabilities: { commands: true } }),
    });
    return harness;
  }

  const command = (
    name: string,
    extra: Partial<{ runnable: boolean; prompt: boolean; source: string; aliases: string[] }> = {},
  ) => ({
    name,
    description: `${name} from the CLI`,
    source: 'builtin',
    aliases: [],
    runnable: false,
    ...extra,
  });

  it('offers only commands that can run in VS Code', async () => {
    const harness = harnessListing([
      command('init'),
      command('btw'),
      command('compact'),
      command('permissions', { aliases: ['perms'] }),
      command('review', { prompt: true }),
    ]);

    await harness.manager.handleMessage({ type: 'requestSlashCommands' });

    const listed = harness.posted.find((message) => message.type === 'slashCommands');
    const names = (listed?.payload as { items: { name: string }[] }).items.map((item) => item.name);
    expect(names).not.toContain('/init');
    expect(names).toContain('/btw');
    expect(names).toContain('/compact');
    expect(names).toContain('/permissions');
    expect(names).toContain('/review');
  });

  it('runs a command the extension serves instead of asking the CLI for a terminal', async () => {
    const harness = harnessListing([command('compact')]);
    const runCommand = vi.fn();
    Object.assign(harness.runtime, { runCommand });

    const compact = vi.spyOn(harness.manager, 'compactConversation').mockResolvedValue();

    await harness.manager.handleMessage({ type: 'requestSlashCommands' });
    await harness.manager.handleMessage({ type: 'runSlashCommand', payload: { name: '/compact' } });

    expect(compact).toHaveBeenCalledOnce();
    expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
      'agi-workforce.compactConversation',
    );
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('runs /rewind, /status, /export and /model on the chat they were typed in', async () => {
    const harness = makeHarness();
    const rewind = vi.spyOn(harness.manager, 'showCheckpoints').mockResolvedValue();
    const status = vi.spyOn(harness.manager, 'showSessionStatus').mockResolvedValue();
    const exported = vi.spyOn(harness.manager, 'exportConversation').mockResolvedValue();

    for (const name of ['/rewind', '/status', '/export', '/model']) {
      await harness.manager.handleMessage({ type: 'runSlashCommand', payload: { name } });
    }

    expect(rewind).toHaveBeenCalledOnce();
    expect(status).toHaveBeenCalledOnce();
    expect(exported).toHaveBeenCalledOnce();
    expect(harness.posted).toContainEqual(expect.objectContaining({ type: 'modelPickerData' }));
    for (const command of [
      'agi-workforce.showCheckpoints',
      'agi-workforce.showSessionStatus',
      'agi-workforce.exportConversation',
      'agi-workforce.selectModel',
    ]) {
      expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(command);
    }
  });

  it('turns a prompt command into a draft rather than running it', async () => {
    const harness = harnessListing([command('review', { prompt: true })]);

    await harness.manager.handleMessage({ type: 'requestSlashCommands' });
    await harness.manager.handleMessage({ type: 'runSlashCommand', payload: { name: '/review' } });

    expect(harness.posted).toContainEqual({
      type: 'composerDraft',
      payload: { text: '/review ', references: [] },
    });
  });
});

describe('ChatStateManager error classification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vscode.workspace.isTrusted = true;
    vscode.window.activeTextEditor = undefined;
    vscode.workspace.workspaceFolders = [
      { name: 'workspace', index: 0, uri: vscode.Uri.file('/workspace') },
    ];
  });

  it('refuses a resume in an untrusted workspace as a permission failure', async () => {
    const harness = makeHarness({
      resolvedConversation: {
        thread: threadSummary({ id: 'history-1' }),
        messages: [],
        transcriptTruncated: false,
      },
    });
    vscode.workspace.isTrusted = false;

    await expect(harness.manager.resumeConversation('history-1')).resolves.toBe(false);

    expect(harness.posted).toContainEqual({
      type: 'error',
      payload: {
        category: 'permission',
        headline: 'Trust this workspace before resuming a developer session.',
        retryable: false,
      },
    });
  });

  it('offers the workspace trust control the error block cannot carry', async () => {
    const harness = makeHarness({
      resolvedConversation: {
        thread: threadSummary({ id: 'history-1' }),
        messages: [],
        transcriptTruncated: false,
      },
    });
    vscode.workspace.isTrusted = false;
    vscode.window.showWarningMessage.mockResolvedValueOnce('Manage Trust');

    await harness.manager.resumeConversation('history-1');
    await vi.waitFor(() =>
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.trust.manage'),
    );

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      `${PRODUCT_NAMES.code}: Trust this workspace before resuming a developer session.`,
      'Manage Trust',
    );
  });

  it('does not offer trust for a boundary refusal in a workspace that is already trusted', async () => {
    const harness = makeHarness({
      resolvedConversation: {
        thread: threadSummary({ id: 'legacy-1', trustMode: 'unknown', provider: undefined }),
        messages: [],
        transcriptTruncated: false,
      },
    });

    await expect(harness.manager.resumeConversation('legacy-1')).resolves.toBe(false);

    expect(harness.posted).toContainEqual({
      type: 'error',
      payload: expect.objectContaining({ category: 'permission', retryable: false }),
    });
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('no verified Local, BYOK, or Managed boundary'),
    );
  });

  it('gives a plan refusal an upgrade action rather than an unknown dead end', async () => {
    const harness = makeHarness();
    await api.setAccountToken(harness.context.secrets as never, 'signed-in-token');
    await harness.context.globalState.update('tierStatus.cachedTier', 'local');
    await harness.context.globalState.update('tierStatus.cachedAtMs', Date.now());
    const lockedModel = buildGroupedQuickPickItems('local').find(
      (item) => item.modelId !== undefined && item.disabled === true,
    );

    await harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Bypass the picker', model: lockedModel!.modelId! },
    });

    expect(harness.posted).toContainEqual({
      type: 'error',
      payload: {
        category: 'subscription',
        headline: 'This model is not available for your current plan or provider setup.',
        retryable: false,
        action: { kind: 'upgrade-plan', label: 'Upgrade your plan' },
      },
    });
  });

  it('routes a missing persisted model to the model picker', async () => {
    const harness = makeHarness({
      resolvedConversation: {
        thread: threadSummary({ id: 'unknown-model-1', model: 'removed-provider-model' }),
        messages: [],
        transcriptTruncated: false,
      },
    });

    await expect(harness.manager.resumeConversation('unknown-model-1')).resolves.toBe(false);

    expect(harness.posted).toContainEqual({
      type: 'error',
      payload: expect.objectContaining({
        category: 'provider',
        retryable: false,
        action: { kind: 'switch-model', label: 'Switch model' },
      }),
    });
  });

  it('names a missing session a runtime failure with nothing to click', async () => {
    const harness = makeHarness({
      resolvedConversation: {
        thread: threadSummary({ id: 'other-1' }),
        messages: [],
        transcriptTruncated: false,
      },
    });

    await expect(harness.manager.resumeConversation('missing-1')).resolves.toBe(false);

    expect(harness.posted).toContainEqual({
      type: 'error',
      payload: {
        category: 'runtime',
        headline: 'Developer session not found in the open workspace.',
        retryable: false,
      },
    });
  });

  it('leaves the typed app-server failure path untouched', async () => {
    const harness = makeHarness();
    const failure = {
      code: 'plan_excludes_model',
      message: 'Cloud chat requires Max plan',
      provider: 'anthropic',
      retryable: false,
      action: 'upgrade_plan',
    } as const;
    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Run tests' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());

    harness.emit({
      type: 'turn_failed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'failed',
      response: '',
      inputTokens: 0,
      outputTokens: 0,
      error: 'Cloud chat requires Max plan',
      failure,
    });
    await send;

    expect(harness.posted).toContainEqual({
      type: 'error',
      payload: presentTurnFailure(failure),
    });
  });
});

describe('ChatStateManager composer-bound conversation navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(vscode.window.showWarningMessage).mockReset();
    vi.mocked(vscode.window.showQuickPick).mockReset();
    vscode.workspace.isTrusted = true;
    vscode.window.activeTextEditor = undefined;
    vscode.workspace.workspaceFolders = [
      { name: 'workspace', index: 0, uri: vscode.Uri.file('/workspace') },
    ];
  });

  const composer = { instance: 'navigation-fixture', revision: 0, attachments: 0 };
  const rewindOutcome = {
    restoredFiles: [],
    removedFiles: [],
    skippedFiles: [],
    conversationRestored: true,
    prompt: 'Continue here',
  };

  async function navigationHarness(binding = true) {
    const persisted = {
      thread: threadSummary({ id: 'navigation-source' }),
      messages: [
        { role: 'user', text: 'First prompt', index: 0 },
        { role: 'assistant', text: 'First answer', index: 1 },
        { role: 'user', text: 'Continue here', index: 2 },
      ],
      transcriptTruncated: false,
    } satisfies ThreadReadResponse;
    const harness = makeHarness({ resolvedConversation: persisted });
    vi.mocked(harness.conversationTreeProvider!.resolveThread).mockImplementation(
      async (threadId) => ({
        response: { ...persisted, thread: threadSummary({ id: threadId }) },
        runtime: harness.runtime as unknown as LocalRuntimeClient,
        cwd: '/workspace',
      }),
    );
    const forkThread = vi.fn().mockResolvedValue(threadSummary({ id: 'navigation-fork' }));
    const rewindThread = vi.fn().mockResolvedValue(rewindOutcome);
    const listCheckpoints = vi.fn().mockResolvedValue({
      checkpoints: [
        {
          checkpointIndex: 0,
          messageIndex: 2,
          prompt: 'Continue here',
          createdAt: '2026-10-18T00:00:00Z',
          trackedFiles: 0,
        },
      ],
    });
    Object.assign(harness.runtime, { forkThread, rewindThread, listCheckpoints });
    harness.runtime.offers.mockImplementation(
      async (...args: unknown[]) => args[0] === 'forkAtMessage' || args[0] === 'checkpoints',
    );
    await expect(harness.manager.resumeConversation('navigation-source')).resolves.toBe(true);
    if (binding)
      await harness.manager.handleMessage({ type: 'composerState', payload: { ...composer } });
    harness.runtime.resumeThread.mockClear();
    harness.posted.length = 0;
    return { ...harness, forkThread, rewindThread, listCheckpoints };
  }

  function navigate(
    harness: Awaited<ReturnType<typeof navigationHarness>>,
    action: 'branch' | 'resend' | 'checkpoint',
  ) {
    if (action === 'checkpoint') {
      vi.mocked(vscode.window.showQuickPick).mockImplementation(
        async (items) => (await items)[0] as never,
      );
      vi.mocked(vscode.window.showWarningMessage).mockResolvedValueOnce('Rewind' as never);
      return harness.manager.showCheckpoints();
    }
    if (action === 'resend') {
      vi.mocked(vscode.window.showWarningMessage).mockImplementationOnce(
        async (_message, _options, item) => item as never,
      );
    }
    return harness.manager.handleMessage({
      type: 'messageAction',
      payload: { action, text: 'Continue here', occurrence: 0, composer: { ...composer } },
    });
  }

  it.each(['branch', 'resend', 'checkpoint'] as const)(
    'keeps a newer resume authoritative after delayed %s finishes',
    async (action) => {
      const harness = await navigationHarness();
      let release!: () => void;
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      const operation = action === 'branch' ? harness.forkThread : harness.rewindThread;
      operation.mockImplementationOnce(async () => {
        await pending;
        return action === 'branch' ? threadSummary({ id: 'navigation-fork' }) : rewindOutcome;
      });
      const navigation = navigate(harness, action);
      await vi.waitFor(() => expect(operation).toHaveBeenCalledOnce());
      await expect(harness.manager.resumeConversation('newer-history')).resolves.toBe(true);
      harness.posted.length = 0;
      release();
      await navigation;
      expect(harness.manager.activeThreadId()).toBe('newer-history');
      expect(harness.runtime.resumeThread.mock.calls).toEqual([['newer-history']]);
      expect(harness.posted).not.toContainEqual(expect.objectContaining({ type: 'composerDraft' }));
      expect(harness.posted).not.toContainEqual(
        expect.objectContaining({ type: 'conversationLoaded' }),
      );
    },
  );

  it.each(['branch', 'resend', 'checkpoint'] as const)(
    'cancels %s after the composer revision changes during the runtime operation',
    async (action) => {
      const harness = await navigationHarness();
      let release!: () => void;
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      const operation = action === 'branch' ? harness.forkThread : harness.rewindThread;
      operation.mockImplementationOnce(async () => {
        await pending;
        return action === 'branch' ? threadSummary({ id: 'navigation-fork' }) : rewindOutcome;
      });
      const navigation = navigate(harness, action);
      await vi.waitFor(() => expect(operation).toHaveBeenCalledOnce());
      await harness.manager.handleMessage({
        type: 'composerState',
        payload: { ...composer, revision: 1 },
      });
      release();
      await navigation;
      expect(harness.manager.activeThreadId()).toBe('navigation-source');
      expect(harness.runtime.resumeThread).not.toHaveBeenCalled();
      expect(harness.posted).not.toContainEqual(expect.objectContaining({ type: 'composerDraft' }));
      expect(harness.posted).not.toContainEqual(
        expect.objectContaining({ type: 'conversationLoaded' }),
      );
    },
  );

  it('invalidates a pending fork when the model is reselected without changing its value', async () => {
    const harness = await navigationHarness();
    let release!: () => void;
    harness.forkThread.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return threadSummary({ id: 'navigation-fork' });
    });
    const navigation = navigate(harness, 'branch');
    await vi.waitFor(() => expect(harness.forkThread).toHaveBeenCalledOnce());
    await harness.manager.handleMessage({ type: 'selectModel', payload: { modelId: 'auto' } });
    release();
    await navigation;
    expect(harness.runtime.resumeThread).not.toHaveBeenCalled();
    expect(harness.posted).not.toContainEqual(expect.objectContaining({ type: 'composerDraft' }));
  });

  it.each(['branch', 'resend', 'checkpoint'] as const)(
    'restores the draft for unchanged same-owner %s',
    async (action) => {
      const harness = await navigationHarness();
      await navigate(harness, action);
      expect(harness.runtime.resumeThread).toHaveBeenCalledWith(
        action === 'branch' ? 'navigation-fork' : 'navigation-source',
      );
      expect(harness.posted).toContainEqual({
        type: 'composerDraft',
        payload: {
          text: 'Continue here',
          references: [],
          submit: action === 'resend',
          expectedComposer: { ...composer, epoch: expect.any(Number) },
        },
      });
      expect(harness.runtime.startTurn).not.toHaveBeenCalled();
    },
  );

  it.each(['missing', 'staged', 'pending'] as const)(
    'refuses message actions and command checkpoints with %s composer binding or files',
    async (state) => {
      const harness = await navigationHarness(state !== 'missing');
      if (state === 'staged') {
        await harness.manager.handleMessage({
          type: 'composerState',
          payload: { ...composer, attachments: 1 },
        });
      }
      if (state === 'pending') {
        await harness.manager.handleMessage({
          type: 'attachFiles',
          payload: {
            files: [
              {
                name: 'note.txt',
                mimeType: 'text/plain',
                sizeBytes: 3,
                dataUrl: 'data:text/plain;base64,YWJj',
              },
            ],
          },
        });
        expect(harness.posted).toContainEqual(
          expect.objectContaining({
            type: 'attachFilesAck',
            payload: expect.objectContaining({
              added: [expect.objectContaining({ name: 'note.txt' })],
            }),
          }),
        );
      }
      await navigate(harness, 'branch');
      await navigate(harness, 'resend');
      await harness.manager.handleMessage({
        type: 'messageAction',
        payload: {
          action: 'branch',
          text: 'First prompt',
          occurrence: 0,
          composer: { ...composer },
        },
      });
      await harness.manager.showCheckpoints();
      expect(harness.manager.activeThreadId()).toBe('navigation-source');
      expect(harness.forkThread).not.toHaveBeenCalled();
      expect(harness.rewindThread).not.toHaveBeenCalled();
      expect(harness.listCheckpoints).not.toHaveBeenCalled();
      expect(harness.runtime.resumeThread).not.toHaveBeenCalled();
      expect(harness.posted).not.toContainEqual(expect.objectContaining({ type: 'composerDraft' }));
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining('remove staged files'),
      );
    },
  );

  it('refuses an action with no binding even when the host has a current composer', async () => {
    const harness = await navigationHarness();
    await harness.manager.handleMessage({
      type: 'messageAction',
      payload: { action: 'branch', text: 'Continue here', occurrence: 0 },
    });
    expect(harness.forkThread).not.toHaveBeenCalled();
    expect(harness.runtime.resumeThread).not.toHaveBeenCalled();
  });

  it.each(['trustMode', 'provider', 'model'] as const)(
    'refuses a fork whose resumed %s differs from its captured authority',
    async (field) => {
      const harness = await navigationHarness();
      const changed = threadSummary({
        id: 'navigation-fork',
        ...(field === 'trustMode' ? { trustMode: 'local' as const } : {}),
        ...(field === 'provider' ? { provider: 'ollama' } : {}),
        ...(field === 'model' ? { model: requireCatalogModel('anthropic').id } : {}),
      });
      harness.runtime.resumeThread.mockResolvedValueOnce(changed);
      await navigate(harness, 'branch');
      expect(harness.forkThread).toHaveBeenCalledOnce();
      expect(harness.runtime.resumeThread).toHaveBeenCalledWith('navigation-fork');
      expect(harness.manager.activeThreadId()).toBe('navigation-source');
      expect(harness.posted).not.toContainEqual(
        expect.objectContaining({ type: 'conversationLoaded' }),
      );
      expect(harness.posted).not.toContainEqual(expect.objectContaining({ type: 'composerDraft' }));
    },
  );

  it('invalidates a pending fork before model selection finishes resolving the tier', async () => {
    const harness = await navigationHarness();
    let releaseFork!: () => void;
    harness.forkThread.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        releaseFork = resolve;
      });
      return threadSummary({ id: 'navigation-fork' });
    });
    let releaseTier!: (tier: Awaited<ReturnType<typeof tierResolver.resolveTier>>) => void;
    const pendingTier = new Promise<Awaited<ReturnType<typeof tierResolver.resolveTier>>>(
      (resolve) => {
        releaseTier = resolve;
      },
    );
    const tier = vi.spyOn(tierResolver, 'resolveTier').mockReturnValueOnce(pendingTier);
    let selection: Promise<void> | undefined;
    try {
      const navigation = navigate(harness, 'branch');
      await vi.waitFor(() => expect(harness.forkThread).toHaveBeenCalledOnce());
      selection = harness.manager.handleMessage({
        type: 'selectModel',
        payload: { modelId: 'auto' },
      });
      expect(tier).toHaveBeenCalledWith(harness.context);
      expect(tier.mock.results[0]?.value).toBe(pendingTier);
      releaseFork();
      await navigation;
      expect(harness.manager.activeThreadId()).toBe('navigation-source');
      expect(harness.runtime.resumeThread).not.toHaveBeenCalled();
      expect(harness.posted).not.toContainEqual(expect.objectContaining({ type: 'composerDraft' }));
      expect(harness.posted).not.toContainEqual(
        expect.objectContaining({ type: 'conversationLoaded' }),
      );
    } finally {
      releaseTier('byok');
      await selection;
      tier.mockRestore();
    }
  });

  it('does not restore a fork draft after model selection while committed usage is pending', async () => {
    const harness = await navigationHarness();
    let release!: () => void;
    const usage = vi.spyOn(harness.manager, 'pushUsageMeter').mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    try {
      const navigation = navigate(harness, 'branch');
      await vi.waitFor(() => expect(usage).toHaveBeenCalledOnce());
      expect(harness.manager.activeThreadId()).toBe('navigation-fork');
      await harness.manager.handleMessage({ type: 'selectModel', payload: { modelId: 'auto' } });
      harness.posted.length = 0;
      release();
      await navigation;
      expect(harness.posted).not.toContainEqual(expect.objectContaining({ type: 'composerDraft' }));
    } finally {
      usage.mockRestore();
    }
  });

  it('preserves the captured binding across the intentional first-message reset', async () => {
    const harness = await navigationHarness();
    await harness.manager.handleMessage({
      type: 'messageAction',
      payload: { action: 'branch', text: 'First prompt', occurrence: 0, composer: { ...composer } },
    });
    expect(harness.manager.activeThreadId()).toBeUndefined();
    expect(harness.forkThread).not.toHaveBeenCalled();
    expect(harness.runtime.resumeThread).not.toHaveBeenCalled();
    expect(harness.posted).toContainEqual({
      type: 'composerDraft',
      payload: {
        text: 'First prompt',
        references: [],
        submit: false,
        expectedComposer: { ...composer, epoch: expect.any(Number) },
      },
    });
  });
});
