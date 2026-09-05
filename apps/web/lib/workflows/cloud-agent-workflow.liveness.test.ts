import { beforeEach, describe, expect, it, vi } from 'vitest';

const order: string[] = [];

const mocks = vi.hoisted(() => ({
  runToolLoop: vi.fn(),
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
  appendCloudAgentEvent: mocks.appendEvent,
  getCloudAgentRun: vi.fn(),
  isCloudAgentRunCancellationRequested: vi.fn(async () => false),
  saveCloudAgentApprovalCheckpoint: vi.fn(),
  saveCloudAgentInputCheckpoint: vi.fn(),
}));
vi.mock('@/lib/services/cloud-agent-event-journal', () => ({
  createCloudAgentEventJournal: () => ({
    append: vi.fn(async () => undefined),
    flush: vi.fn(async () => undefined),
  }),
}));
vi.mock('@/lib/user-connector-tools', () => ({ makeUserConnectorExecutor: vi.fn() }));

import { executeCloudAgentWorkflowInvocation } from './cloud-agent-workflow';
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
