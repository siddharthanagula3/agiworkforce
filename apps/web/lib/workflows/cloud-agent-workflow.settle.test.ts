import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  query: vi.fn(),
  usage: vi.fn(),
  finalize: vi.fn(),
  settleFreeTrial: vi.fn(),
  autoMemory: vi.fn(),
  transition: vi.fn(),
  completeCheckpoint: vi.fn(),
  assistantText: vi.fn(),
  recordRunUsage: vi.fn(),
}));

const db = {
  execute: mocks.execute,
  query: mocks.query,
  transaction: vi.fn((run: (tx: unknown) => Promise<unknown>) => run(db)),
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
  OPERATION_LEASE_RENEWAL_INTERVAL_SECONDS: 30,
  claimCloudAgentExecutionOperation: vi.fn(),
  completeCloudAgentExecutionOperation: vi.fn(),
  failCloudAgentExecutionOperation: vi.fn(),
  fingerprintCloudAgentOperation: vi.fn(),
  renewCloudAgentExecutionOperationLease: vi.fn(),
}));
vi.mock('@/lib/services/managed-usage-accounting-service', () => ({
  finalizeObservedManagedUsage: mocks.finalize,
  calculateObservedProviderUsageCostDollars: () => 0.0042,
  createObservedProviderUsage: vi.fn(),
  mergeObservedProviderUsage: vi.fn(),
}));
vi.mock('@/lib/services/free-trial-service', () => ({
  settleFreeTrialRequest: mocks.settleFreeTrial,
  applyFreeTrialProviderBudget: vi.fn(),
}));
vi.mock('@/lib/services/managed-auto-memory-service', () => ({
  recordManagedAutoMemoryTurn: mocks.autoMemory,
}));
vi.mock('@/lib/services/cloud-agent-run-service', () => ({
  appendCloudAgentEvent: vi.fn(),
  appendCloudAgentEvents: vi.fn(),
  completeCloudAgentApprovalCheckpoint: mocks.completeCheckpoint,
  getCloudAgentRun: vi.fn(),
  isCloudAgentRunCancellationRequested: vi.fn(),
  readCloudAgentRunAssistantText: mocks.assistantText,
  recordCloudAgentRunSettledUsage: mocks.recordRunUsage,
  saveCloudAgentApprovalCheckpoint: vi.fn(),
  saveCloudAgentInputCheckpoint: vi.fn(),
  transitionCloudAgentRun: mocks.transition,
}));

import { settleWorkflowInvocation } from './steps/settle-workflow-invocation';
import type { CloudAgentWorkflowInput } from './cloud-agent-workflow-input';
import { parseInteractiveCardDelta } from '@agiworkforce/cloud-contracts';

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
      kind: 'managed' as const,
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
    // A conversation that has never branched: the single-statement write.
    mocks.query.mockResolvedValue([{ active_leaf_message_id: null }]);
    mocks.usage.mockResolvedValue({
      providerCalls: 2,
      inputTokens: 1_200,
      outputTokens: 340,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      cacheWrite1hTokens: 0,
      reasoningTokens: 96,
    });
    mocks.finalize.mockResolvedValue({
      requestStatus: 'completed',
      operationResult: 'finalized',
      settlementStatus: 'succeeded',
      actualCostCents: 37,
    });
    mocks.assistantText.mockResolvedValue({
      text: 'The audit is clean.',
      lastSequence: 41,
      interactiveCards: [],
    });
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
    expect(turn?.metadata['cloudAgentRun']).toEqual({
      runId: RUN_ID,
      runPath: `/api/llm/v1/chat/completions/runs/${RUN_ID}`,
      lastSequence: 41,
      state: 'ready_for_review',
    });
    expect(turn?.metadata['truncated']).toBeUndefined();
  });

  it('marks a cancelled turn truncated but still saves what was generated', async () => {
    mocks.assistantText.mockResolvedValue({
      text: 'Half an answ',
      lastSequence: 9,
      interactiveCards: [],
    });

    await settleWorkflowInvocation(makeInput(), 'cancelled');

    const turn = persistedTurn();
    expect(turn?.content).toBe('Half an answ');
    expect(turn?.metadata).toMatchObject({ truncated: true, truncationReason: 'stream_cancelled' });
  });

  it('persists partial text un-truncated while a run waits on approval', async () => {
    mocks.assistantText.mockResolvedValue({
      text: 'I need to run a command',
      lastSequence: 17,
      interactiveCards: [],
    });

    await settleWorkflowInvocation(makeInput(), 'awaiting_input');

    const turn = persistedTurn();
    expect(turn?.content).toBe('I need to run a command');
    expect(turn?.metadata['truncated']).toBeUndefined();
    expect(turn?.metadata['cloudAgentRun']).toMatchObject({
      lastSequence: 17,
      state: 'awaiting_input',
    });
    expect(mocks.transition).not.toHaveBeenCalled();
  });

  it('persists validated interactive cards recovered from durable tool receipts', async () => {
    const card = parseInteractiveCardDelta({
      card: {
        schemaVersion: 1,
        cardId: 'tool-call-map-fixture',
        kind: 'map-search.v1',
        createdAt: '2026-08-11T00:00:00.000Z',
        fallback: { headline: 'Map search', text: 'Map search: coffee near Austin' },
        producedBy: { toolCallId: 'tool-call-map-fixture', toolName: 'search_maps' },
        body: {
          title: 'Coffee near Austin',
          query: 'coffee near Austin',
          actions: [
            {
              provider: 'openstreetmap',
              label: 'Open in OpenStreetMap',
              url: 'https://www.openstreetmap.org/search?query=coffee%20near%20Austin',
            },
          ],
        },
      },
    });
    if (!card) throw new Error('card fixture did not parse');
    mocks.assistantText.mockResolvedValue({
      text: 'Choose a map provider.',
      lastSequence: 12,
      interactiveCards: [card],
    });

    await settleWorkflowInvocation(makeInput(), 'completed');

    expect(persistedTurn()?.metadata['interactiveCards']).toEqual([card]);
  });

  it('writes the same row under the same id when a retried step settles twice', async () => {
    await settleWorkflowInvocation(makeInput(), 'completed');
    await settleWorkflowInvocation(makeInput(), 'completed');

    const writes = mocks.execute.mock.calls.filter(([sql]) =>
      String(sql).includes('insert into web_messages'),
    );
    expect(writes).toHaveLength(2);
    expect(writes[0]?.[1]).toEqual(writes[1]?.[1]);
    expect(String(writes[0]?.[0])).toContain('on conflict (id) do update');
  });

  it('skips persistence when the caller supplied no assistant message id', async () => {
    await settleWorkflowInvocation(makeInput({ assistantMessageId: undefined }), 'completed');

    expect(persistedTurn()).toBeNull();
    expect(mocks.finalize).toHaveBeenCalledTimes(1);
    expect(mocks.transition).toHaveBeenCalledTimes(1);
  });

  it('records the charged cost and observed usage on the run under its billing key', async () => {
    await settleWorkflowInvocation(makeInput(), 'completed');

    expect(mocks.recordRunUsage).toHaveBeenCalledWith(db, {
      userId: 'user-1',
      runId: RUN_ID,
      billingIdempotencyKey: 'agi.chat.desktop.turn-1',
      usage: {
        providerCalls: 2,
        inputTokens: 1_200,
        outputTokens: 340,
        reasoningTokens: 96,
        costCents: 37,
      },
    });
  });

  it('prices a run that was cancelled before any provider call at zero', async () => {
    mocks.usage.mockResolvedValue({
      providerCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      cacheWrite1hTokens: 0,
      reasoningTokens: 0,
    });
    mocks.finalize.mockResolvedValue({
      requestStatus: 'released',
      operationResult: 'finalized',
      settlementStatus: null,
      actualCostCents: 0,
    });

    await settleWorkflowInvocation(makeInput(), 'cancelled');

    expect(mocks.recordRunUsage).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ usage: expect.objectContaining({ costCents: 0 }) }),
    );
  });

  it('never persists a Temporary Chat turn', async () => {
    await settleWorkflowInvocation(makeInput({ conversationIsTemporary: true }), 'completed');

    expect(persistedTurn()).toBeNull();
    expect(mocks.assistantText).not.toHaveBeenCalled();
  });

  /**
   * AGI-126. Making the DEFAULT tier durable is not the same as making it
   * unlimited. Before the billing discriminant, `settleWorkflowInvocation`
   * spread `input.billing` into a managed reservation unconditionally, so a
   * durable free turn would have been finalized against a managed reservation
   * that does not exist while its free reservation row was never released --
   * the free budget would have leaked a little on every turn and the tier's
   * cap would never have been reached.
   */
  describe('free-trial durable settlement', () => {
    function freeInput(): CloudAgentWorkflowInput {
      return {
        ...makeInput(),
        billing: {
          kind: 'free_trial',
          userId: 'user-1',
          requestId: 'agi.chat.web.send.free-turn-1',
          reservedMicrousd: 5_000,
        },
      };
    }

    it('releases the free reservation and never touches managed billing', async () => {
      await settleWorkflowInvocation(freeInput(), 'completed');

      expect(mocks.finalize).not.toHaveBeenCalled();
      expect(mocks.settleFreeTrial).toHaveBeenCalledTimes(1);
      expect(mocks.settleFreeTrial).toHaveBeenCalledWith({
        reservation: {
          kind: 'free_trial',
          userId: 'user-1',
          requestId: 'agi.chat.web.send.free-turn-1',
          reservedMicrousd: 5_000,
        },
        outcome: 'completed',
        provider: 'anthropic',
        model: 'claude-test',
        measuredCostDollars: 0.0042,
        usage: {
          promptTokens: 1_200,
          completionTokens: 340,
          totalTokens: 1_540,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
          cacheCreation1hInputTokens: 0,
        },
      });
    });

    it('reads and records the operation ledger under the free request id', async () => {
      await settleWorkflowInvocation(freeInput(), 'completed');

      expect(mocks.usage).toHaveBeenCalledWith(db, {
        userId: 'user-1',
        runId: RUN_ID,
        billingIdempotencyKey: 'agi.chat.web.send.free-turn-1',
      });
      // Free turns are budgeted in micro-USD, not billed in cents, so the run
      // records no charged cost -- the same `null` the inline free path records.
      expect(mocks.recordRunUsage).toHaveBeenCalledWith(db, {
        userId: 'user-1',
        runId: RUN_ID,
        billingIdempotencyKey: 'agi.chat.web.send.free-turn-1',
        usage: {
          providerCalls: 2,
          inputTokens: 1_200,
          outputTokens: 340,
          reasoningTokens: 96,
          costCents: null,
        },
      });
    });

    it('settles a free turn parked on an approval so its budget is not held hostage', async () => {
      await settleWorkflowInvocation(freeInput(), 'awaiting_input');

      expect(mocks.settleFreeTrial).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'completed' }),
      );
      expect(mocks.finalize).not.toHaveBeenCalled();
    });

    it('propagates a cancelled free turn as cancelled, not as a completed charge', async () => {
      await settleWorkflowInvocation(freeInput(), 'cancelled');

      expect(mocks.settleFreeTrial).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'cancelled' }),
      );
    });

    it('leaves the managed path untouched: a managed turn never settles as free', async () => {
      await settleWorkflowInvocation(makeInput(), 'completed');

      expect(mocks.settleFreeTrial).not.toHaveBeenCalled();
      expect(mocks.finalize).toHaveBeenCalledTimes(1);
    });
  });
});
