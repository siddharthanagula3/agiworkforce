import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
  ChatStateManager,
  type ExtToWebviewMessage,
} from '../features/sidebar-webview/ChatStateManager';
import type { LocalRuntimeClient, LocalRuntimeEvent } from '../integrations/localRuntimeClient';
import type { LocalRuntimePool } from '../integrations/localRuntimePool';
import {
  setContextPanelInstance,
  type ContextPanelProvider,
} from '../features/trees/contextPanelProvider';

function makeHarness(
  options: {
    approvalFailure?: Error;
    startTurn?: Promise<{ id: string }>;
    localModels?: Array<{ id: string; provider: 'ollama' | 'lmstudio' }>;
    localModelError?: Error;
  } = {},
) {
  const listeners = new Set<(event: LocalRuntimeEvent) => void>();
  const runtime = {
    startThread: vi.fn().mockResolvedValue({ id: 'thread-1' }),
    listLocalModels:
      options.localModelError === undefined
        ? vi.fn().mockResolvedValue({ models: options.localModels ?? [] })
        : vi.fn().mockRejectedValue(options.localModelError),
    startTurn: vi.fn(() => options.startTurn ?? Promise.resolve({ id: 'turn-1' })),
    interruptTurn: vi.fn().mockResolvedValue(undefined),
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
  const manager = new ChatStateManager(
    context.secrets,
    context,
    (message) => posted.push(message),
    undefined,
    context.workspaceState,
    pool,
  );
  return {
    manager,
    runtime,
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
    vscode.workspace.workspaceFolders = [
      { name: 'workspace', index: 0, uri: vscode.Uri.file('/workspace') },
    ];
    setContextPanelInstance({
      getContextFiles: () => ['/workspace/src/context.ts'],
    } as ContextPanelProvider);
  });

  it('does not launch the privileged local runtime for an untrusted workspace', async () => {
    const harness = makeHarness();
    vscode.workspace.isTrusted = false;

    await harness.manager.handleMessage({ type: 'sendMessage', payload: { text: 'Run tests' } });

    expect(harness.runtime.startThread).not.toHaveBeenCalled();
    expect(harness.posted).toContainEqual({
      type: 'error',
      payload: { message: 'Trust this workspace before starting a local developer session.' },
    });
  });

  it('does not mislabel unresolved Auto routing as AGI Cloud', async () => {
    const harness = makeHarness();

    await harness.manager.handleMessage({ type: 'ready' });

    expect(harness.posted).toContainEqual({
      type: 'providerBadge',
      payload: { providerLabel: '', brandColor: 'transparent' },
    });
    expect(harness.posted).not.toContainEqual(
      expect.objectContaining({
        type: 'providerBadge',
        payload: expect.objectContaining({ providerLabel: 'AGI Cloud' }),
      }),
    );
  });

  it('shows CLI-discovered local models in the inline picker', async () => {
    const harness = makeHarness({
      localModels: [{ id: 'gemma4:e4b', provider: 'ollama' }],
    });

    await harness.manager.handleMessage({ type: 'openModelPopover' });

    expect(harness.posted).toContainEqual({
      type: 'modelPickerData',
      payload: expect.objectContaining({
        groups: expect.arrayContaining([
          {
            label: 'Local',
            models: [
              {
                id: 'gemma4:e4b',
                label: 'gemma4:e4b',
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
        message: 'Install or update the AGI CLI, then configure its path in Settings.',
      },
    });
  });

  it('passes the trusted discovered provider with a selected local model', async () => {
    const harness = makeHarness({
      localModels: [{ id: 'gemma4:e4b', provider: 'ollama' }],
    });
    await harness.manager.handleMessage({ type: 'openModelPopover' });
    await harness.manager.handleMessage({
      type: 'selectModel',
      payload: { modelId: 'gemma4:e4b' },
    });

    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Say hello' },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    expect(harness.runtime.startThread).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemma4:e4b', provider: 'ollama' }),
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
      localModels: [{ id: 'gemma4:e4b', provider: 'ollama' }],
    });
    await harness.manager.handleMessage({ type: 'openModelPopover' });
    await harness.manager.handleMessage({
      type: 'selectModel',
      payload: { modelId: 'gemma4:e4b' },
    });

    const send = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Say hello', model: '' },
    });

    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledOnce());
    expect(harness.runtime.startThread).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemma4:e4b', provider: 'ollama' }),
    );
    expect(harness.runtime.startTurn).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemma4:e4b' }),
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
      }),
    );
    expect(harness.runtime.startTurn).not.toHaveBeenCalledWith(
      expect.objectContaining({ routingTaskType: expect.anything() }),
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
    expect(harness.posted).toContainEqual({ type: 'attachmentsConsumed' });
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
