import { beforeEach, describe, expect, it, vi } from 'vitest';

const order: string[] = [];

const mocks = vi.hoisted(() => ({
  runToolLoop: vi.fn(),
  executeOperation: vi.fn(),
  settle: vi.fn(),
  appendEvent: vi.fn(),
  projectChunk: vi.fn(),
  getNeonDb: vi.fn(),
  getRun: vi.fn(),
  writable: vi.fn(),
  journalAppend: vi.fn(async () => undefined),
  journalFlush: vi.fn(async () => undefined),
  warn: vi.fn(),
}));

const db = { query: vi.fn(), execute: vi.fn(), transaction: vi.fn() };

vi.mock('server-only', () => ({}));
vi.mock('@/lib/deadline-policy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/deadline-policy')>()),
  DURABLE_STREAM_WRITE_DEADLINE_MS: 25,
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: mocks.warn },
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
  appendCloudAgentEvents: vi.fn(),
  getCloudAgentRun: mocks.getRun,
  isCloudAgentRunCancellationRequested: vi.fn(async () => false),
  saveCloudAgentApprovalCheckpoint: vi.fn(),
  saveCloudAgentInputCheckpoint: vi.fn(),
  completeCloudAgentApprovalCheckpoint: vi.fn(),
  readCloudAgentRunAssistantText: vi.fn(),
  recordCloudAgentRunSettledUsage: vi.fn(),
  transitionCloudAgentRun: vi.fn(),
}));
vi.mock('@/lib/services/cloud-agent-event-journal', () => ({
  createCloudAgentEventJournal: () => ({
    append: mocks.journalAppend,
    flush: mocks.journalFlush,
  }),
}));
vi.mock('@/lib/user-connector-tools', () => ({ makeUserConnectorExecutor: vi.fn() }));

import {
  executeCloudAgentWorkflowInvocation,
  failCloudAgentWorkflow,
} from './cloud-agent-workflow';
import type { CloudAgentWorkflowInput } from './cloud-agent-workflow-input';

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

/** A writable whose reader has gone: every write is accepted and never drains. */
function writerThatNeverDrains(): { getWriter: () => unknown } {
  return {
    getWriter: () => ({
      write: vi.fn((chunk: Uint8Array) => {
        order.push(`write:${new TextDecoder().decode(chunk)}`);
        return new Promise<void>(() => undefined);
      }),
      releaseLock: vi.fn(),
      close: vi.fn(async () => undefined),
    }),
  };
}

function writerThatDrains(): { getWriter: () => unknown } {
  return {
    getWriter: () => ({
      write: vi.fn(async (chunk: Uint8Array) => {
        order.push(`write:${new TextDecoder().decode(chunk)}`);
      }),
      releaseLock: vi.fn(),
      close: vi.fn(async () => undefined),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;
  mocks.getNeonDb.mockReturnValue(db);
  mocks.settle.mockImplementation(async () => {
    order.push('settle');
  });
  mocks.journalAppend.mockImplementation(async () => {
    order.push('journal');
  });
  mocks.appendEvent.mockImplementation(async () => {
    order.push('journal');
  });
  mocks.getRun.mockResolvedValue({ run: { lastEventSequence: -1 } });
  mocks.projectChunk.mockReturnValue([
    {
      sse: 'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n',
      envelope: { sessionId: 's', turnId: 't', sequence: 0, event: { type: 'text-delta' } },
    },
  ]);
  mocks.runToolLoop.mockReturnValue(
    (async function* () {
      yield { type: 'text-delta', delta: 'hi' };
    })(),
  );
});

/**
 * The founder's 2026-09-07 turn and eight others sat in running for days. The
 * chat function was killed at its 300 s limit, which left the durable stream
 * with no reader, and every path that ends a run wrote to that stream before it
 * settled. A write with no reader never resolves, so the settle was never
 * reached, the platform killed the invocation at 800 s, and the replay repeated
 * the same thing every few minutes.
 */
describe('a durable turn whose reader has gone', () => {
  it('still settles when the terminal write cannot drain', async () => {
    mocks.writable.mockReturnValue(writerThatNeverDrains());

    await executeCloudAgentWorkflowInvocation(makeInput());

    expect(mocks.settle).toHaveBeenCalledTimes(1);
  });

  it('still settles the failure path when its events cannot drain', async () => {
    mocks.writable.mockReturnValue(writerThatNeverDrains());

    await failCloudAgentWorkflow(makeInput(), 'the model took too long', 'provider_timeout');

    expect(mocks.settle).toHaveBeenCalledWith(expect.anything(), 'failed');
  });

  it('journals every event even though the stream took none of them', async () => {
    mocks.writable.mockReturnValue(writerThatNeverDrains());

    await failCloudAgentWorkflow(makeInput(), 'the model took too long', 'provider_timeout');

    expect(mocks.appendEvent).toHaveBeenCalledTimes(3);
  });

  it('says once that the stream stopped taking events, rather than silently dropping them', async () => {
    mocks.writable.mockReturnValue(writerThatNeverDrains());

    await executeCloudAgentWorkflowInvocation(makeInput());

    expect(mocks.warn).toHaveBeenCalled();
  });
});

describe('a durable turn whose reader is still there', () => {
  it('journals each event before it puts it on the wire', async () => {
    mocks.writable.mockReturnValue(writerThatDrains());

    await executeCloudAgentWorkflowInvocation(makeInput());

    const projected = order.findIndex((step) => step.startsWith('write:data:'));
    expect(projected).toBeGreaterThan(-1);
    expect(order.indexOf('journal')).toBeLessThan(projected);
  });

  it('still opens the stream before anything else', async () => {
    mocks.writable.mockReturnValue(writerThatDrains());

    await executeCloudAgentWorkflowInvocation(makeInput());

    expect(order[0]).toBe('write:: durable-open\n\n');
  });

  it('settles after the stream has taken the turn, not before', async () => {
    mocks.writable.mockReturnValue(writerThatDrains());

    await executeCloudAgentWorkflowInvocation(makeInput());

    const projected = order.findIndex((step) => step.startsWith('write:data:'));
    expect(projected).toBeLessThan(order.indexOf('settle'));
  });
});
