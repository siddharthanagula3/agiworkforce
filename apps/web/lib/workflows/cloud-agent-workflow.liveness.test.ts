import { beforeEach, describe, expect, it, vi } from 'vitest';

type ToolLoopModule = typeof import('@/app/api/llm/v1/chat/completions/lib/tool-loop');
type WorkflowStreamModule = typeof import('./cloud-agent-workflow-stream');
type UserConnectorToolsModule = typeof import('@/lib/user-connector-tools');

const order: string[] = [];

const mocks = vi.hoisted(() => ({
  runToolLoop: vi.fn(),
  isCancellationRequested: vi.fn(async () => false),
  executeOperation: vi.fn(),
  settle: vi.fn(),
  appendEvent: vi.fn(),
  projectChunk: vi.fn(),
  getNeonDb: vi.fn(),
  writable: vi.fn(),
  writer: {
    write: vi.fn<(chunk: Uint8Array) => Promise<void>>(async () => undefined),
    releaseLock: vi.fn(),
    close: vi.fn(async () => undefined),
  },
}));

const db = { query: vi.fn(), execute: vi.fn(), transaction: vi.fn() };

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('workflow', () => ({
  FatalError: class FatalError extends Error {},
  RetryableError: class RetryableError extends Error {},
  getWritable: () => mocks.writable(),
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => mocks.getNeonDb() }));
vi.mock('@/app/api/llm/v1/chat/completions/lib/tool-loop', () => ({
  applyToolResultSecretPolicy: vi.fn(
    async (_userId: string, _name: string, content: string) => content,
  ),
  hasPrivateContext: vi.fn(() => false),
  hasUntrustedContext: vi.fn(() => false),
  toolResultEvent: vi.fn(() => ''),
  toolStatusEvent: vi.fn(() => ''),
  trimToolResultHistory: vi.fn(),
  runToolLoop: mocks.runToolLoop,
}));
vi.mock('./cloud-agent-operation-executor', () => ({
  executeCloudAgentOperation: mocks.executeOperation,
}));
vi.mock('./steps/settle-workflow-invocation', () => ({ settleWorkflowInvocation: mocks.settle }));
vi.mock('./cloud-agent-workflow-stream', () => ({
  projectCloudAgentWorkflowChunk: mocks.projectChunk,
}));
vi.mock('@/lib/services/cloud-agent-run-service', () => ({
  takeCloudAgentRunSteers: vi.fn(async () => []),
  APPROVAL_CHECKPOINT_TTL_HOURS: 24,
  saveCloudAgentDeviceCheckpoint: vi.fn(),
  appendCloudAgentEvent: mocks.appendEvent,
  appendCloudAgentEvents: vi.fn(),
  getCloudAgentRun: vi.fn(),
  isCloudAgentRunCancellationRequested: mocks.isCancellationRequested,
  isCloudAgentRunPauseRequested: vi.fn(async () => false),
  saveCloudAgentPauseCheckpoint: vi.fn(),
  saveCloudAgentApprovalCheckpoint: vi.fn(),
  saveCloudAgentInputCheckpoint: vi.fn(),
  completeCloudAgentApprovalCheckpoint: vi.fn(),
  readCloudAgentRunAssistantText: vi.fn(),
  recordCloudAgentRunSettledUsage: vi.fn(),
  transitionCloudAgentRun: vi.fn(),
}));
vi.mock('@/lib/services/cloud-agent-event-journal', () => ({
  createCloudAgentEventJournal: () => ({
    append: vi.fn(async () => undefined),
    flush: vi.fn(async () => undefined),
  }),
}));
vi.mock('@/lib/user-connector-tools', async (importOriginal) => {
  const actual = await importOriginal<UserConnectorToolsModule>();
  return { ...actual, makeUserConnectorExecutor: vi.fn() };
});

import { CLOUD_AGENT_STEP_INVOCATION_LIMIT_MS } from '@/lib/deadline-policy';
import { executeCloudAgentWorkflowInvocation } from './steps/execute-cloud-agent-invocation';
import type { CloudAgentWorkflowInput } from './cloud-agent-workflow-input';
import {
  claimLiveDurableStream,
  isDurableTransportCoolingDown,
  recordDurableTransportClaim,
  DURABLE_STREAM_OPEN_FRAME,
} from './durable-stream-liveness';

const RUN_ID = '0190a000-0000-7000-8000-000000000001';

function makeInput(): CloudAgentWorkflowInput {
  return {
    version: 1,
    runId: RUN_ID,
    userId: 'user-1',
    processed: {
      requestId: 'agi.chat.web.send.turn-1',
      chatRequest: { model: 'claude-test', messages: [], work_mode: 'agiwork' },
      requestedModel: 'claude-test',
      provider: 'anthropic',
      estimatedCostCents: 0,
      estimatedPromptTokens: 100,
      maxTokens: 4096,
      usedFallback: false,
      originalModel: 'claude-test',
      resolvedTaskType: 'coding',
      classifierConfidence: 1,
      resolvedSlot: null,
      quotaFeature: 'chat',
      quotaWarningHeader: null,
      isFlagshipRequest: false,
      indicResult: {},
      llmRequest: { model: 'claude-test', messages: [], max_tokens: 4096 },
    } as unknown as CloudAgentWorkflowInput['processed'],
    billing: {
      kind: 'free_trial',
      userId: 'user-1',
      requestId: 'agi.chat.web.send.free-turn-1',
      reservedMicrousd: 5_000,
    },
    mcpTools: [],
    approvalMode: 'manual',
  };
}

function decode(chunk: unknown): string {
  return new TextDecoder().decode(chunk as Uint8Array);
}

describe('the durable invocation opens its stream before it does any work', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    order.length = 0;
    mocks.writable.mockReturnValue({ getWriter: () => mocks.writer });
    mocks.writer.write.mockImplementation(async (chunk: unknown) => {
      order.push(`write:${decode(chunk)}`);
    });
    mocks.getNeonDb.mockImplementation(() => {
      order.push('db');
      return db;
    });
    mocks.runToolLoop.mockImplementation(() => {
      order.push('tool-loop');
      return (async function* () {})();
    });
    mocks.settle.mockResolvedValue(undefined);
  });

  it('writes the open frame as the first byte on the wire', async () => {
    await executeCloudAgentWorkflowInvocation(makeInput());

    expect(mocks.writer.write.mock.calls[0]).toBeDefined();
    expect(decode(mocks.writer.write.mock.calls[0]![0])).toBe(DURABLE_STREAM_OPEN_FRAME);
  });

  it('opens the stream before it reaches the database or the tool loop', async () => {
    await executeCloudAgentWorkflowInvocation(makeInput());

    expect(order[0]).toBe(`write:${DURABLE_STREAM_OPEN_FRAME}`);
    expect(order.indexOf('db')).toBeGreaterThan(0);
    expect(order.indexOf('tool-loop')).toBeGreaterThan(0);
  });

  it('releases the writer lock so the projection loop can claim it', async () => {
    await executeCloudAgentWorkflowInvocation(makeInput());

    expect(mocks.writer.releaseLock).toHaveBeenCalled();
  });
});

describe('the liveness probe clears the handoff without waiting for the model', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getNeonDb.mockReturnValue(db);
    mocks.settle.mockResolvedValue(undefined);
  });

  it('claims the stream while the provider is still silent', async () => {
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    mocks.writable.mockReturnValue(writable);

    let releaseModel = (): void => undefined;
    const modelAnswered = new Promise<void>((resolve) => {
      releaseModel = resolve;
    });
    mocks.runToolLoop.mockReturnValue(
      (async function* () {
        await modelAnswered;
        yield* [];
      })(),
    );

    const invocation = executeCloudAgentWorkflowInvocation(makeInput());
    const live = await claimLiveDurableStream(readable, 200);

    expect(live).not.toBeNull();
    await expect(isDurableTransportCoolingDown()).resolves.toBe(false);

    releaseModel();
    await invocation;
  });

  it('opens the breaker when the workflow never reaches its first line', async () => {
    const stalled = new ReadableStream<Uint8Array>({ start() {} });

    expect(await claimLiveDurableStream(stalled, 50)).toBeNull();
    await expect(isDurableTransportCoolingDown()).resolves.toBe(true);
    recordDurableTransportClaim();
  });
});

/**
 * Stop wrote `cancellation_requested_at`, the step saw it, and aborted a
 * controller that reached only `createFailoverPlan`. The provider call the
 * cancel was meant to end kept streaming to the end of the step, so a stopped
 * durable turn still cost a whole invocation.
 */
describe('a cancel reaches the provider call, not only the failover plan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.writable.mockReturnValue({ getWriter: () => mocks.writer });
    mocks.writer.write.mockResolvedValue(undefined);
    mocks.getNeonDb.mockReturnValue(db);
    mocks.settle.mockResolvedValue(undefined);
    mocks.isCancellationRequested.mockResolvedValue(false);
    mocks.runToolLoop.mockReturnValue((async function* () {})());
  });

  it('hands the tool loop the same signal the cancellation poll aborts', async () => {
    mocks.isCancellationRequested.mockResolvedValue(true);

    await executeCloudAgentWorkflowInvocation(makeInput());

    const options = mocks.runToolLoop.mock.calls[0]?.[1] as {
      signal?: AbortSignal;
      isCancellationRequested?: () => Promise<boolean>;
      maxDurationMs?: number;
    };
    expect(options.signal, 'the durable step must pass a signal into the tool loop').toBeDefined();
    expect(options.signal!.aborted).toBe(false);

    await options.isCancellationRequested!();

    expect(options.signal!.aborted).toBe(true);
  });

  it('bounds the step from the shared policy rather than a literal at the call site', async () => {
    await executeCloudAgentWorkflowInvocation(makeInput());

    const options = mocks.runToolLoop.mock.calls[0]?.[1] as { maxDurationMs?: number };
    expect(options.maxDurationMs).toBe(CLOUD_AGENT_STEP_INVOCATION_LIMIT_MS);
  });

  it.each([true, false])(
    'the real tool loop observes a persisted cancellation change: %s',
    async (cancelRequested) => {
      const actualLoop = await vi.importActual<ToolLoopModule>(
        '@/app/api/llm/v1/chat/completions/lib/tool-loop',
      );
      const actualStream = await vi.importActual<WorkflowStreamModule>(
        './cloud-agent-workflow-stream',
      );
      const input = makeInput();
      input.approvalMode = 'auto';
      input.processed.chatRequest.work_mode = 'chat';
      input.mcpTools = [
        {
          qualifiedName: 'mcp__github__get_pull_request_diff',
          serverId: 'github',
          toolName: 'get_pull_request_diff',
          description: 'Read a pull request diff',
          origin: 'operator',
          inputSchema: { type: 'object' },
        },
      ];
      let flag = false;
      mocks.isCancellationRequested.mockImplementation(async () => flag);
      mocks.projectChunk.mockImplementation(actualStream.projectCloudAgentWorkflowChunk);
      let signal: AbortSignal | undefined;
      mocks.runToolLoop.mockImplementation((...args: Parameters<ToolLoopModule['runToolLoop']>) => {
        signal = args[1]?.signal;
        return actualLoop.runToolLoop(...args);
      });
      let releaseProvider!: () => void;
      const providerPending = new Promise<void>((resolve) => {
        releaseProvider = resolve;
      });
      let enteredProvider!: () => void;
      const providerEntered = new Promise<void>((resolve) => {
        enteredProvider = resolve;
      });
      let providerCalls = 0;
      let toolCalls = 0;
      mocks.executeOperation.mockImplementation(
        async (_db: unknown, operation: { operationKind: 'provider' | 'tool' }) => {
          if (operation.operationKind === 'tool') {
            toolCalls += 1;
            return { content: 'fixture diff', isError: false };
          }
          providerCalls += 1;
          if (providerCalls === 1) {
            enteredProvider();
            await providerPending;
          }
          const first = providerCalls === 1;
          return {
            lines: [],
            finishReason: first ? 'tool_calls' : 'stop',
            pendingToolCalls: first
              ? [
                  {
                    id: 'fixture-read-diff',
                    qualifiedName: input.mcpTools[0]!.qualifiedName,
                    args: {},
                  },
                ]
              : [],
            textContent: first ? '' : 'The diff is ready.',
            publicTextTail: first ? '' : 'The diff is ready.',
            canonicalText: first ? '' : 'The diff is ready.',
            thinkingBlocks: [],
            generatedFileRefs: [],
            usage: {
              providerCalls: 1,
              inputTokens: 0,
              outputTokens: 0,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
              cacheWrite1hTokens: 0,
              reasoningTokens: 0,
              providerCostDollars: 0,
            },
          };
        },
      );
      let settled = false;
      const invocation = executeCloudAgentWorkflowInvocation(input).finally(() => {
        settled = true;
      });
      try {
        await providerEntered;
        expect(settled).toBe(false);
        expect(providerCalls).toBe(1);
        expect(toolCalls).toBe(0);
        expect(signal).toBeDefined();
        expect(signal!.aborted).toBe(false);
        expect(mocks.isCancellationRequested).toHaveBeenCalledWith(db, {
          userId: input.userId,
          runId: input.runId,
        });
        flag = cancelRequested;
        releaseProvider();
        await expect(invocation).resolves.toEqual({
          kind: 'terminal',
          outcome: cancelRequested ? 'cancelled' : 'completed',
        });
        expect(signal!.aborted).toBe(cancelRequested);
        expect(providerCalls).toBe(cancelRequested ? 1 : 2);
        expect(toolCalls).toBe(cancelRequested ? 0 : 1);
        expect(mocks.settle).toHaveBeenCalledWith(
          input,
          cancelRequested ? 'cancelled' : 'completed',
          expect.any(Object),
          undefined,
        );
      } finally {
        releaseProvider();
        await invocation;
      }
    },
  );
});
