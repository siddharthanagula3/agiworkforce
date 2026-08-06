import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  query: vi.fn(),
  usage: vi.fn(),
  finalize: vi.fn(),
  autoMemory: vi.fn(),
  transition: vi.fn(),
  completeCheckpoint: vi.fn(),
  assistantText: vi.fn(),
}));

const db = {
  execute: mocks.execute,
  query: mocks.query,
  transaction: vi.fn(),
  withUser: vi.fn(),
  dispose: vi.fn(),
};

vi.mock('workflow', () => ({
  FatalError: class FatalError extends Error {},
  RetryableError: class RetryableError extends Error {},
  getWritable: vi.fn(),
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => db }));
vi.mock('@/lib/services/cloud-agent-execution-service', () => ({
  getCloudAgentExecutionUsage: mocks.usage,
}));
vi.mock('@/lib/services/managed-usage-accounting-service', () => ({
  finalizeObservedManagedUsage: mocks.finalize,
}));
vi.mock('@/lib/services/managed-auto-memory-service', () => ({
  recordManagedAutoMemoryTurn: mocks.autoMemory,
}));
vi.mock('@/lib/services/cloud-agent-run-service', () => ({
  appendCloudAgentEvent: vi.fn(),
  completeCloudAgentApprovalCheckpoint: mocks.completeCheckpoint,
  getCloudAgentRun: vi.fn(),
  isCloudAgentRunCancellationRequested: vi.fn(),
  readCloudAgentRunAssistantText: mocks.assistantText,
  saveCloudAgentApprovalCheckpoint: vi.fn(),
  transitionCloudAgentRun: mocks.transition,
}));

import { settleWorkflowInvocation } from './steps/settle-workflow-invocation';
import type { CloudAgentWorkflowInput } from './cloud-agent-workflow-input';

const RUN_ID = '0190a000-0000-7000-8000-000000000001';
const CONVERSATION_ID = '0190a000-0000-7000-8000-000000000003';
const ASSISTANT_MESSAGE_ID = '0190a000-0000-7000-8000-000000000004';

function makeInput(
  overrides: Partial<CloudAgentWorkflowInput['processed']> = {},
): CloudAgentWorkflowInput {
  return {
    version: 1,
    runId: RUN_ID,
    userId: 'user-1',
    processed: {
      requestId: 'agi.chat.desktop.send.turn-1',
      chatRequest: { model: 'claude-test', messages: [], work_mode: 'agiwork' },
      conversationId: CONVERSATION_ID,
      assistantMessageId: ASSISTANT_MESSAGE_ID,
      requestedModel: 'claude-test',
      provider: 'anthropic',
      llmRequest: { model: 'claude-test', messages: [], max_tokens: 4096 },
      ...overrides,
    } as unknown as CloudAgentWorkflowInput['processed'],
    billing: {
      userId: 'user-1',
      idempotencyKey: 'agi.chat.desktop.turn-1',
      requestHash: 'hash-1',
      leaseToken: '0190a000-0000-7000-8000-000000000002',
      estimatedCostCents: 12,
    },
    mcpTools: [],
    approvalMode: 'manual',
  };
}

/** The single persisted row, decoded from the upsert's positional parameters. */
function persistedTurn() {
  const call = mocks.execute.mock.calls.find(([sql]) =>
    String(sql).includes('insert into web_messages'),
  );
  if (!call) return null;
  const params = call[1] as unknown[];
  return {
    messageId: params[0],
    conversationId: params[1],
    content: params[2],
    model: params[3],
    provider: params[4],
    inputTokens: params[5],
    outputTokens: params[6],
    metadata: JSON.parse(String(params[7])) as Record<string, unknown>,
  };
}

describe('durable cloud agent workflow settlement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.usage.mockResolvedValue({
      providerCalls: 2,
      inputTokens: 1_200,
      outputTokens: 340,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      cacheWrite1hTokens: 0,
      reasoningTokens: 0,
    });
    mocks.assistantText.mockResolvedValue({ text: 'The audit is clean.', lastSequence: 41 });
    mocks.execute.mockResolvedValue(undefined);
  });

  it('persists the journalled assistant text with a reattachable run reference', async () => {
    await settleWorkflowInvocation(makeInput(), 'completed');

    const turn = persistedTurn();
    expect(turn).not.toBeNull();
    expect(turn).toMatchObject({
      messageId: ASSISTANT_MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      content: 'The audit is clean.',
      model: 'claude-test',
      provider: 'anthropic',
      inputTokens: 1_200,
      outputTokens: 340,
    });
    // The exact key/shape desktop persists, so a server-saved turn reattaches
    // through the same path a client-saved one does.
    expect(turn?.metadata['cloudAgentRun']).toEqual({
      runId: RUN_ID,
      runPath: `/api/llm/v1/chat/completions/runs/${RUN_ID}`,
      lastSequence: 41,
      // Recorded so a client can skip asking the server about a finished run
      // every time it reopens the conversation.
      state: 'ready_for_review',
    });
    expect(turn?.metadata['truncated']).toBeUndefined();
  });

  it('marks a cancelled turn truncated but still saves what was generated', async () => {
    mocks.assistantText.mockResolvedValue({ text: 'Half an answ', lastSequence: 9 });

    await settleWorkflowInvocation(makeInput(), 'cancelled');

    const turn = persistedTurn();
    expect(turn?.content).toBe('Half an answ');
    expect(turn?.metadata).toMatchObject({ truncated: true, truncationReason: 'stream_cancelled' });
  });

  it('persists partial text un-truncated while a run waits on approval', async () => {
    mocks.assistantText.mockResolvedValue({ text: 'I need to run a command', lastSequence: 17 });

    await settleWorkflowInvocation(makeInput(), 'awaiting_input');

    const turn = persistedTurn();
    expect(turn?.content).toBe('I need to run a command');
    // Not truncated: the turn is mid-flight waiting on a human, not cut off.
    expect(turn?.metadata['truncated']).toBeUndefined();
    expect(turn?.metadata['cloudAgentRun']).toMatchObject({
      lastSequence: 17,
      state: 'awaiting_input',
    });
    // awaiting_input must NOT flip the run to a terminal state.
    expect(mocks.transition).not.toHaveBeenCalled();
  });

  it('writes the same row under the same id when a retried step settles twice', async () => {
    await settleWorkflowInvocation(makeInput(), 'completed');
    await settleWorkflowInvocation(makeInput(), 'completed');

    const writes = mocks.execute.mock.calls.filter(([sql]) =>
      String(sql).includes('insert into web_messages'),
    );
    expect(writes).toHaveLength(2);
    // Idempotency is the upsert key, not a guard in this module: both writes
    // target the caller-supplied assistant message id, so they collapse to one
    // row instead of duplicating the turn in the transcript.
    expect(writes[0]?.[1]).toEqual(writes[1]?.[1]);
    expect(String(writes[0]?.[0])).toContain('on conflict (id) do update');
  });

  it('skips persistence when the caller supplied no assistant message id', async () => {
    await settleWorkflowInvocation(makeInput({ assistantMessageId: undefined }), 'completed');

    expect(persistedTurn()).toBeNull();
    // Billing and lifecycle still settle; only the transcript write is skipped.
    expect(mocks.finalize).toHaveBeenCalledTimes(1);
    expect(mocks.transition).toHaveBeenCalledTimes(1);
  });

  it('never persists a Temporary Chat turn', async () => {
    await settleWorkflowInvocation(makeInput({ conversationIsTemporary: true }), 'completed');

    expect(persistedTurn()).toBeNull();
    expect(mocks.assistantText).not.toHaveBeenCalled();
  });
});
