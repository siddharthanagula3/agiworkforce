import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TERMINAL_AGENT_TASK_STATES } from '@agiworkforce/types';
import type { ManagedCloudAgentRunReference } from '@agiworkforce/cloud-contracts';
import { MANAGED_RUN_CANCELLATION_TIMEOUT_MS } from '../src/features/cloud-bridge/managedRunControl';
import { withTimeout } from '../src/utils';
import { sameManagedCloudOwner } from '../src/features/cloud-bridge/managedCloudAuthority';
import {
  applyStreamFailure,
  hydrateStoredChatMessage,
  reconcileManagedRunActivity,
  resolveComposerPrompt,
  type SidePanelChatMessage,
} from '../src/features/side-panel/chat-state';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/side_panel.ts'),
  'utf8',
);
const program = ts.createSourceFile('side_panel.ts', source, ts.ScriptTarget.Latest, true);
const start = source.indexOf('interface PendingStreamCancellation');
const end = source.indexOf('function stopManagedChatKeepalive', start);
if (start < 0 || end < start) throw new Error('Production cancellation scope was not found');
const names = [
  'cancelCurrentManagedStream',
  'canAdmitComposerMessage',
  'retryFailedMessage',
  'serializeMessagesForHistory',
];
const functions = program.statements
  .filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? ''))
  .map((node) => node.getText(program));
if (functions.length !== names.length)
  throw new Error('Production cancellation admission functions were not found');
const cancelled: ManagedCloudAgentRunReference = {
  runId: '11111111-1111-4111-8111-111111111111',
  runPath: '/api/llm/v1/chat/completions/runs/11111111-1111-4111-8111-111111111111',
  lastSequence: 1,
  state: 'cancelled',
};
type Response = {
  success: boolean;
  error?: string;
  cancellationConfirmed?: boolean;
  cloudRun?: ManagedCloudAgentRunReference;
};

function harness() {
  const owner = { accountId: 'account-a', authIncarnation: 'session-a' };
  const assistant: SidePanelChatMessage = {
    id: 'stream-a',
    role: 'assistant',
    content: 'The partial reply stays visible.',
    streaming: true,
    runtime: 'managed-cloud',
    timestamp: 1,
    cloudAgentRun: { ...cancelled, state: 'running' },
  };
  const context = {
    managedCloudOwner: owner,
    conversationId: 'conversation-a',
    conversationGeneration: 1,
    currentStreamId: assistant.id as string | null,
    isStreaming: true,
    streamTimeoutHandle: null,
    messages: [assistant],
    needsMessageRebuild: false,
  };
  const responses: Array<{ settle(value: Response): void; reject(reason: Error): void }> = [];
  const send = vi.fn(
    () => new Promise<Response>((settle, reject) => responses.push({ settle, reject })),
  );
  const saveMessages = vi.fn(),
    renderMessages = vi.fn(),
    sendPrompt = vi.fn();
  const dependencies = {
    _ctx: context,
    ownerByStreamId: new Map([[assistant.id, owner]]),
    cloudRunsByStreamId: new Map([[assistant.id, assistant.cloudAgentRun]]),
    sameManagedCloudOwner,
    applyStreamFailure,
    reconcileManagedRunActivity,
    saveMessages,
    renderMessages,
    updateSendButton: vi.fn(),
    SIDE_PANEL_CLIENT_INSTANCE_ID: 'panel-a',
    chrome: { runtime: { sendMessage: send } },
    MAX_STORED_MESSAGES: 50,
    TERMINAL_AGENT_TASK_STATES,
    MANAGED_RUN_CANCELLATION_TIMEOUT_MS,
    withTimeout,
    logger: { warn: vi.fn() },
    streamStartedAtById: new Map(),
    updateAttachmentPreview: vi.fn(),
    composerBrowserRun: null,
    cancelComposerBrowserTask: vi.fn(),
    stopManagedChatKeepalive: vi.fn(),
    removeThinking: vi.fn(),
    resolvedRouteByStreamId: new Map(),
    quickModeByStreamId: new Map(),
    managedCloudChatState: 'ready',
    historyRestoreInProgress: false,
    stoppingStreamId: null,
    composerAttachmentIntakes: new Set(),
    composerDocumentsSettled: () => true,
    pendingAttachmentCount: () => 0,
    pendingAttachments: [],
    resolveComposerPrompt,
    sendMessage: sendPrompt,
  };
  const compiled = ts.transpileModule(
    `${source.slice(start, end)}\n${functions.join('\n')}\nreturn { stop: () => cancelCurrentManagedStream(false), canAdmitComposerMessage, retryFailedMessage, serializeMessagesForHistory };`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  );
  // llm-guardrail-allow: executes repository-owned browser code inside this isolated test fixture.
  const api = new Function(...Object.keys(dependencies), compiled.outputText)(
    ...Object.values(dependencies),
  ) as {
    stop(): void;
    canAdmitComposerMessage(text: string): boolean;
    retryFailedMessage(id: string): void;
    serializeMessagesForHistory(): Array<SidePanelChatMessage>;
  };
  return { assistant, context, responses, saveMessages, renderMessages, send, sendPrompt, ...api };
}

afterEach(() => vi.useRealTimers());

describe('side panel Stop admission and recovery', () => {
  it('stops local output immediately and blocks the dependent next turn until terminal confirmation', async () => {
    const test = harness();
    test.stop();
    expect(test.context.currentStreamId).toBeNull();
    expect(test.context.isStreaming).toBe(false);
    expect(test.canAdmitComposerMessage('Next step')).toBe(false);
    expect(test.assistant.streamCancellation).toBe('pending');
    test.responses[0]!.settle({ success: true, cancellationConfirmed: true, cloudRun: cancelled });
    await vi.waitFor(() => expect(test.assistant.streamCancellation).toBeUndefined());
    expect(test.canAdmitComposerMessage('Next step')).toBe(true);
    expect(test.assistant.content).toBe('The partial reply stays visible.');
    expect(test.assistant.errorText).toBeUndefined();
  });

  it('persists a refusal and makes Retry retry Stop without resending the prompt', async () => {
    const test = harness();
    test.stop();
    test.responses[0]!.settle({ success: false, error: 'Server refused Stop.' });
    await vi.waitFor(() => expect(test.assistant.streamCancellation).toBe('unconfirmed'));
    expect(test.assistant.errorText).toContain('Server refused Stop.');
    expect(test.assistant.errorText).toContain('Use Retry to retry Stop');
    expect(test.canAdmitComposerMessage('Dependent task')).toBe(false);
    const stored = test.serializeMessagesForHistory()[0]!;
    expect(stored.errorText).toBe(test.assistant.errorText);
    expect(hydrateStoredChatMessage(stored, 'restored').errorText).toBe(test.assistant.errorText);
    test.retryFailedMessage(test.assistant.id);
    expect(test.send).toHaveBeenCalledTimes(2);
    expect(test.sendPrompt).not.toHaveBeenCalled();
    test.responses[1]!.settle({ success: true, cancellationConfirmed: true, cloudRun: cancelled });
    await vi.waitFor(() => expect(test.canAdmitComposerMessage('Dependent task')).toBe(true));
    expect(test.assistant.content).toBe('The partial reply stays visible.');
  });

  it('does not equate an accepted cancellation request with a stopped remote run', async () => {
    const test = harness();
    test.stop();
    test.responses[0]!.settle({
      success: true,
      cancellationConfirmed: false,
      cloudRun: { ...cancelled, state: 'running' },
    });
    await vi.waitFor(() => expect(test.assistant.streamCancellation).toBe('unconfirmed'));
    expect(test.canAdmitComposerMessage('Dependent task')).toBe(false);
    expect(test.assistant.errorText).toContain('has not confirmed');
  });

  it('reports a lost worker response and keeps the same chat gated', async () => {
    const test = harness();
    test.stop();
    test.responses[0]!.reject(new Error('Message port closed'));
    await vi.waitFor(() => expect(test.assistant.streamCancellation).toBe('unconfirmed'));
    expect(test.assistant.content).toBe('The partial reply stays visible.');
    expect(test.assistant.errorText).toContain('Message port closed');
    expect(test.canAdmitComposerMessage('Dependent task')).toBe(false);
  });

  it('bounds a lost pending reply and ignores its late success after a retry owns the request', async () => {
    vi.useFakeTimers();
    const test = harness();
    test.stop();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(test.assistant.streamCancellation).toBe('unconfirmed');
    test.retryFailedMessage(test.assistant.id);
    test.responses[0]!.settle({ success: true, cancellationConfirmed: true, cloudRun: cancelled });
    await vi.advanceTimersByTimeAsync(0);
    expect(test.assistant.streamCancellation).toBe('pending');
    test.responses[1]!.settle({ success: true, cancellationConfirmed: true, cloudRun: cancelled });
    await vi.advanceTimersByTimeAsync(0);
    expect(test.assistant.streamCancellation).toBeUndefined();
  });

  it.each(['owner', 'chat', 'generation'])(
    'does not attach a deferred refusal or block an independent %s scope',
    async (change) => {
      const test = harness();
      test.stop();
      if (change === 'owner')
        test.context.managedCloudOwner = { accountId: 'account-b', authIncarnation: 'session-b' };
      if (change === 'chat') test.context.conversationId = 'conversation-b';
      if (change === 'generation') test.context.conversationGeneration++;
      const saveCount = test.saveMessages.mock.calls.length;
      test.responses[0]!.settle({ success: false, error: 'Old request refused' });
      await Promise.resolve();
      expect(test.assistant.errorText).not.toContain('Old request refused');
      expect(test.saveMessages).toHaveBeenCalledTimes(saveCount);
      expect(test.canAdmitComposerMessage('Independent task')).toBe(true);
    },
  );

  it('never starts a duplicate cancellation while its current attempt is pending', async () => {
    const test = harness();
    test.stop();
    test.retryFailedMessage(test.assistant.id);
    expect(test.send).toHaveBeenCalledOnce();
    test.responses[0]!.settle({ success: true, cancellationConfirmed: true, cloudRun: cancelled });
    await Promise.resolve();
  });
});
