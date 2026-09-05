import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Ordering test for the terminal agent notification.
 *
 * The unit tests around `transitionCloudAgentRun` pass whether or not a user
 * ever hears that their agent finished: the bug was never inside one function,
 * it was the ORDER of two of them. The workflow appends the terminal
 * `task-state-changed` envelope, which itself moves `cloud_agent_runs.state`.
 * and only afterwards settles, so anything that decides from the settled state
 * alone sees a run that is already terminal and stays silent.
 *
 * So this file mocks neither `cloud-agent-run-service` nor the settle step. It
 * drives the real functions in the real order against a database double that
 * models the one thing the decision depends on: the row's committed pre-update
 * state.
 */

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  usage: vi.fn(),
  finalize: vi.fn(),
  autoMemory: vi.fn(),
  db: { current: undefined as unknown },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('workflow', () => ({
  FatalError: class FatalError extends Error {},
  RetryableError: class RetryableError extends Error {},
  getWritable: vi.fn(),
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => mocks.db.current }));
vi.mock('@/lib/services/agent-notification-service', () => ({
  notifyAgentRunEvent: (...args: unknown[]) => mocks.notify(...args),
}));
vi.mock('@/lib/services/cloud-agent-execution-service', () => ({
  getCloudAgentExecutionUsage: mocks.usage,
}));
vi.mock('@/lib/services/managed-usage-accounting-service', () => ({
  finalizeObservedManagedUsage: mocks.finalize,
  calculateObservedProviderUsageCostDollars: () => 0,
}));
vi.mock('@/lib/services/managed-usage-request-service', () => ({
  markManagedUsageClientDelivered: vi.fn(async () => undefined),
  markManagedUsageProviderStarted: vi.fn(),
  finalizeManagedUsageRequest: vi.fn(async () => undefined),
  UPGRADE_HREF: '/pricing',
  MANAGED_CHAT_CONTRACT_VERSION: 'fixture-contract-version',
  ManagedUsageRequestError: class ManagedUsageRequestError extends Error {
    constructor(
      message: string,
      public status: number,
      public code: string,
    ) {
      super(message);
      this.name = 'ManagedUsageRequestError';
    }
  },
  createManagedUsageErrorBody: vi.fn(),
  fingerprintManagedUsageRequest: vi.fn(() => 'fixture-fingerprint'),
  parseManagedUsageIdempotencyKey: vi.fn(
    (header: string | null) => header ?? 'fixture-idempotency-key',
  ),
  reserveManagedUsageRequest: vi.fn(),
  resolveManagedQuotaRecovery: vi.fn(() => null),
}));
vi.mock('@/lib/services/free-trial-service', () => ({
  settleFreeTrialRequest: vi.fn(async () => undefined),
  FREE_TRIAL_MODEL: 'fixture-free-trial-model',
  isFreePlanTier: () => false,
  isFreeTrialRequest: () => false,
  beginFreeTrialRequest: vi.fn(),
  applyFreeTrialProviderBudget: vi.fn(),
}));
vi.mock('@/lib/services/managed-auto-memory-service', () => ({
  recordManagedAutoMemoryTurn: mocks.autoMemory,
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { AgentEventEnvelope, AgentTaskState } from '@agiworkforce/types/protocol';

import { buildManagedAgentStream } from '@/app/api/llm/v1/chat/completions/lib/managed-agent-stream';
import type { ProcessedRequest } from '@/app/api/llm/v1/chat/completions/lib/request-processor';
import { appendCloudAgentEvent } from '@/lib/services/cloud-agent-run-service';
import type { CloudAgentWorkflowInput } from './cloud-agent-workflow-input';
import { settleWorkflowInvocation } from './steps/settle-workflow-invocation';

const RUN_ID = '0190a000-0000-7000-8000-000000000001';
const CONVERSATION_ID = '0190a000-0000-7000-8000-000000000099';
const REQUEST_ID = 'agi.chat.web.send.turn-1';

const RUN_ROW = {
  id: RUN_ID,
  user_id: 'user-1',
  request_id: REQUEST_ID,
  conversation_id: CONVERSATION_ID,
  origin_surface: 'web',
  work_mode: 'agiwork',
  state: 'running',
  provider: 'anthropic',
  model: 'claude-test',
  last_event_sequence: 2,
  cancellation_requested_at: null,
  completed_at: null,
  created_at: '2026-07-17T20:00:00.000Z',
  updated_at: '2026-07-17T20:00:01.000Z',
};

/**
 * Enough of `cloud_agent_runs`/`cloud_agent_events` to reproduce the two
 * behaviours the notification decision rests on: the `(run_id, sequence)`
 * uniqueness that swallows a replayed envelope, and the pre-update `state`
 * snapshot both state-moving statements return as `previous_state`.
 */
function createFakeDatabase(): DatabaseAdapter {
  const run: typeof RUN_ROW = { ...RUN_ROW };
  const storedSequences = new Set<number>();

  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    const text = String(sql);

    if (text.includes('insert into public.cloud_agent_events')) {
      const sequence = Number(params[2]);
      if (storedSequences.has(sequence)) return [];
      storedSequences.add(sequence);
      return [{ sequence }];
    }

    // The event-journal write: state moves only for an in-order envelope.
    if (text.includes('greatest(runs.last_event_sequence')) {
      const previousState = run.state;
      const sequence = Number(params[2]);
      const nextState = params[3] as string | null;
      if (nextState && sequence >= run.last_event_sequence) run.state = nextState;
      run.last_event_sequence = Math.max(run.last_event_sequence, sequence);
      return [{ ...run, previous_state: previousState }];
    }

    // `transitionCloudAgentRun`: an unconditional set of the requested state.
    if (text.includes('previous.state as previous_state')) {
      const previousState = run.state;
      run.state = String(params[2]);
      return [{ ...run, previous_state: previousState }];
    }

    if (text.includes('settled_usage')) return [{ ...run }];
    if (text.includes('select * from public.cloud_agent_runs')) return [{ ...run }];
    return [];
  });

  const db = {
    query,
    execute: vi.fn(async () => undefined),
    transaction: vi.fn(),
    withUser: vi.fn(),
    dispose: vi.fn(),
  };
  db.transaction.mockImplementation(async (fn: (tx: DatabaseAdapter) => Promise<unknown>) =>
    fn(db as unknown as DatabaseAdapter),
  );
  return db as unknown as DatabaseAdapter;
}

function taskStateEnvelope(sequence: number, state: AgentTaskState): AgentEventEnvelope {
  return {
    schemaVersion: 4,
    sessionId: CONVERSATION_ID,
    turnId: REQUEST_ID,
    sequence,
    emittedAtMs: 1_752_780_000_000,
    event: { type: 'task-state-changed', taskId: REQUEST_ID, state, summary: 'Agent work ended.' },
  };
}

/** Mirrors what the workflow hands `settleWorkflowInvocation` after the loop. */
function workflowInput(): CloudAgentWorkflowInput {
  return {
    version: 1,
    runId: RUN_ID,
    userId: 'user-1',
    processed: {
      requestId: REQUEST_ID,
      chatRequest: { model: 'claude-test', messages: [], work_mode: 'agiwork' },
      conversationId: CONVERSATION_ID,
      requestedModel: 'claude-test',
      provider: 'anthropic',
      llmRequest: { model: 'claude-test', messages: [], max_tokens: 4096 },
    } as unknown as CloudAgentWorkflowInput['processed'],
    billing: {
      kind: 'managed' as const,
      userId: 'user-1',
      idempotencyKey: 'agi.chat.web.send.turn-1',
      requestHash: 'hash-1',
      leaseToken: '0190a000-0000-7000-8000-000000000002',
      estimatedCostCents: 12,
    },
    mcpTools: [],
    approvalMode: 'manual',
  };
}

const streamProcessed = {
  requestId: REQUEST_ID,
  provider: 'anthropic',
  chatRequest: { model: 'claude-test' },
} as unknown as ProcessedRequest;

const NO_USAGE = {
  providerCalls: 1,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  cacheWrite1hTokens: 0,
  reasoningTokens: 0,
};

function agentEventChunk(envelope: AgentEventEnvelope): Uint8Array {
  return new TextEncoder().encode(
    `data: ${JSON.stringify({ choices: [{ delta: { x_agent_event: envelope } }] })}\n\n`,
  );
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<void> {
  const reader = stream.getReader();
  for (;;) {
    const { done } = await reader.read();
    if (done) return;
  }
}

function noticeEvents(): unknown[] {
  return mocks.notify.mock.calls.map(([, notice]) => (notice as { event: string }).event);
}

describe('terminal cloud agent notifications across the real termination order', () => {
  let db: DatabaseAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.notify.mockResolvedValue({ pushed: true });
    mocks.usage.mockResolvedValue({ ...NO_USAGE, providerCalls: 2 });
    mocks.finalize.mockResolvedValue({
      requestStatus: 'completed',
      operationResult: 'finalized',
      settlementStatus: 'succeeded',
      actualCostCents: 37,
    });
    mocks.autoMemory.mockResolvedValue(undefined);
    db = createFakeDatabase();
    mocks.db.current = db;
  });

  it('sends exactly one completion notice when the journal moves the run before the settle', async () => {
    await appendCloudAgentEvent(db, {
      userId: 'user-1',
      runId: RUN_ID,
      envelope: taskStateEnvelope(3, 'ready_for_review'),
    });
    await settleWorkflowInvocation(workflowInput(), 'completed');

    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.notify).toHaveBeenCalledWith(expect.anything(), {
      userId: 'user-1',
      runId: RUN_ID,
      event: 'completed',
    });
  });

  it('sends exactly one failure notice when the workflow fails and then settles', async () => {
    await appendCloudAgentEvent(db, {
      userId: 'user-1',
      runId: RUN_ID,
      envelope: taskStateEnvelope(3, 'failed'),
    });
    await settleWorkflowInvocation(workflowInput(), 'failed');

    expect(noticeEvents()).toEqual(['failed']);
  });

  it('still sends one notice when the terminal step re-executes on a workflow retry', async () => {
    const envelope = taskStateEnvelope(3, 'ready_for_review');

    await appendCloudAgentEvent(db, { userId: 'user-1', runId: RUN_ID, envelope });
    await settleWorkflowInvocation(workflowInput(), 'completed');
    await appendCloudAgentEvent(db, { userId: 'user-1', runId: RUN_ID, envelope });
    await settleWorkflowInvocation(workflowInput(), 'completed');

    expect(noticeEvents()).toEqual(['completed']);
  });

  it('notifies from the settle when no terminal envelope was journalled', async () => {
    await settleWorkflowInvocation(workflowInput(), 'completed');

    expect(noticeEvents()).toEqual(['completed']);
  });

  it('stays silent for a cancelled run', async () => {
    await appendCloudAgentEvent(db, {
      userId: 'user-1',
      runId: RUN_ID,
      envelope: taskStateEnvelope(3, 'cancelled'),
    });
    await settleWorkflowInvocation(workflowInput(), 'cancelled');

    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('sends exactly one completion notice on the managed in-request stream path', async () => {
    async function* generator(): AsyncGenerator<Uint8Array> {
      yield agentEventChunk(taskStateEnvelope(3, 'ready_for_review'));
      yield new TextEncoder().encode('data: [DONE]\n\n');
    }

    await readAll(
      buildManagedAgentStream({
        generator: generator(),
        processed: streamProcessed,
        usage: NO_USAGE,
        completionReason: 'tool_loop_completed',
        cancellationReason: 'client_cancelled_tool_loop',
        runJournal: { db, userId: 'user-1', runId: RUN_ID },
      }),
    );

    expect(noticeEvents()).toEqual(['completed']);
  });

  it('sends exactly one failure notice when the managed stream reports an upstream error', async () => {
    async function* generator(): AsyncGenerator<Uint8Array> {
      yield new TextEncoder().encode(
        'data: {"choices":[{"delta":{"x_stream_error":{"message":"upstream failed"}}}]}\n\n',
      );
      yield new TextEncoder().encode('data: [DONE]\n\n');
    }

    await readAll(
      buildManagedAgentStream({
        generator: generator(),
        processed: streamProcessed,
        usage: NO_USAGE,
        completionReason: 'tool_loop_completed',
        cancellationReason: 'client_cancelled_tool_loop',
        runJournal: { db, userId: 'user-1', runId: RUN_ID },
      }),
    );

    expect(noticeEvents()).toEqual(['failed']);
  });
});
