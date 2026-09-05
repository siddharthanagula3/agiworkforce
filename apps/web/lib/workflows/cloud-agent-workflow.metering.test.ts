import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * AGI-126, the metering half.
 *
 * Making the DEFAULT tier durable must not make it unlimited. `tool-loop.ts`
 * decides which budget to enforce by looking at the ProcessedRequest it is
 * handed: `processed.freeTrial` selects the free output-budget cap, and
 * `processed.managedUsage` selects the managed per-provider-step reservation.
 * The workflow invocation is the only place that rebuilds that object from the
 * serialized input, so this file pins what it rebuilds.
 *
 * The bug this guards: `managedUsage: { db, ...input.billing }` was applied
 * unconditionally. Any non-managed reservation came back as a fabricated managed
 * one, so a durable free turn matched NEITHER budget branch correctly -- it took
 * the managed path against a reservation that does not exist and skipped the free
 * cap entirely.
 */

const mocks = vi.hoisted(() => ({
  runToolLoop: vi.fn(),
  executeOperation: vi.fn(),
  settle: vi.fn(),
  appendEvent: vi.fn(),
  projectChunk: vi.fn(),
  writer: {
    write: vi.fn(async () => undefined),
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
  getWritable: () => ({ getWriter: () => mocks.writer }),
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => db }));
vi.mock('@/app/api/llm/v1/chat/completions/lib/tool-loop', () => ({
  runToolLoop: mocks.runToolLoop,
  mapWithConcurrency: vi.fn(),
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
  getCloudAgentRun: vi.fn(),
  isCloudAgentRunCancellationRequested: vi.fn(async () => false),
  saveCloudAgentApprovalCheckpoint: vi.fn(),
  saveCloudAgentInputCheckpoint: vi.fn(),
  completeCloudAgentApprovalCheckpoint: vi.fn(),
  readCloudAgentRunAssistantText: vi.fn(),
  recordCloudAgentRunSettledUsage: vi.fn(),
  transitionCloudAgentRun: vi.fn(),
}));
vi.mock('@/lib/user-connector-tools', () => ({
  makeUserConnectorExecutor: vi.fn(),
  withUserConnectorMcpHandle: vi.fn(),
}));

import type { ProcessedRequest } from '@/app/api/llm/v1/chat/completions/lib/request-processor';
// The REAL free-tier budget, not a stand-in. `tool-loop.ts` cannot be edited or
// imported here, but the function it calls at :2474 can be: running it against
// the object the durable invocation actually produced is the difference between
// asserting the cap would apply and proving that it does.
import { applyFreeTrialProviderBudget } from '@/lib/services/free-trial-service';
import { executeCloudAgentWorkflowInvocation } from './cloud-agent-workflow';
import type { CloudAgentWorkflowInput } from './cloud-agent-workflow-input';

const RUN_ID = '0190a000-0000-7000-8000-000000000001';

const MANAGED_BILLING = {
  kind: 'managed' as const,
  userId: 'user-1',
  idempotencyKey: 'agi.chat.web.send.paid-turn-1',
  requestHash: 'hash-1',
  leaseToken: '0190a000-0000-7000-8000-000000000002',
  estimatedCostCents: 12,
};

const FREE_BILLING = {
  kind: 'free_trial' as const,
  userId: 'user-1',
  requestId: 'agi.chat.web.send.free-turn-1',
  reservedMicrousd: 5_000,
};

function makeInput(billing: CloudAgentWorkflowInput['billing']): CloudAgentWorkflowInput {
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
    billing,
    mcpTools: [],
    approvalMode: 'manual',
  };
}

/** The ProcessedRequest the workflow handed the tool loop. */
function processedHandedToLoop(): ProcessedRequest {
  return mocks.runToolLoop.mock.calls[0]![0] as ProcessedRequest;
}

function toolLoopOptions(): Record<string, unknown> {
  return mocks.runToolLoop.mock.calls[0]![1] as Record<string, unknown>;
}

function providerStepResult(): Record<string, unknown> {
  return {
    lines: [{ line: 'data: {}\n' }],
    finishReason: 'stop',
    pendingToolCalls: [],
    textContent: 'hello',
    publicTextTail: '',
    generatedFileRefs: [],
    thinkingBlocks: [],
    canonicalText: 'hello',
    usage: {
      providerCalls: 1,
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      cacheWrite1hTokens: 0,
      reasoningTokens: 0,
    },
  };
}

describe('durable invocation rebuilds the request on the side its reservation came from', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runToolLoop.mockReturnValue(
      (async function* () {
        // A turn that produces no chunks still settles; the metering assertions
        // below only need the arguments the loop was constructed with.
      })(),
    );
    mocks.settle.mockResolvedValue(undefined);
  });

  it('hands a free-trial turn the free reservation and no managed reservation', async () => {
    await executeCloudAgentWorkflowInvocation(makeInput(FREE_BILLING));

    const processed = processedHandedToLoop();
    // tool-loop.ts branches on exactly this property to apply the free-tier
    // output-budget cap. If it is undefined the cap never bites.
    expect(processed.freeTrial).toEqual(FREE_BILLING);
    // ...and on exactly this one to take the managed per-step reservation path.
    expect(processed.managedUsage).toBeUndefined();
  });

  it('hands a managed turn the managed reservation and no free reservation', async () => {
    await executeCloudAgentWorkflowInvocation(makeInput(MANAGED_BILLING));

    const processed = processedHandedToLoop();
    expect(processed.managedUsage).toMatchObject({
      // The service-pool db never binds request.jwt.claim.sub, so this must be
      // the run's claimed-user-scoped wrapper (createClaimedUserScopedDb), not
      // the raw db handed to executeCloudAgentWorkflowInvocation.
      db: expect.objectContaining({
        query: expect.any(Function),
        execute: expect.any(Function),
        transaction: expect.any(Function),
      }),
      userId: 'user-1',
      idempotencyKey: 'agi.chat.web.send.paid-turn-1',
      leaseToken: '0190a000-0000-7000-8000-000000000002',
      estimatedCostCents: 12,
    });
    expect(processed.managedUsage?.db).not.toBe(db);
    // The discriminant is a transport detail and must not leak into the
    // reservation the billing services are handed.
    expect(processed.managedUsage).not.toHaveProperty('kind');
    expect(processed.freeTrial).toBeUndefined();
  });

  it('keys the durable operation ledger by the free request id on a free turn', async () => {
    await executeCloudAgentWorkflowInvocation(makeInput(FREE_BILLING));

    const options = toolLoopOptions();
    const providerExecutor = options['providerExecutor'] as (input: unknown) => unknown;
    mocks.executeOperation.mockResolvedValue({});
    await providerExecutor({
      operationKey: 'provider:1',
      step: 1,
      request: {},
      execute: async () => ({}),
    });

    expect(mocks.executeOperation).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ billingIdempotencyKey: 'agi.chat.web.send.free-turn-1' }),
    );
  });

  it('keys the durable operation ledger by the idempotency key on a managed turn', async () => {
    await executeCloudAgentWorkflowInvocation(makeInput(MANAGED_BILLING));

    const options = toolLoopOptions();
    const toolExecutor = options['toolExecutor'] as (input: unknown) => unknown;
    mocks.executeOperation.mockResolvedValue({});
    await toolExecutor({
      operationKey: 'tool:1',
      retrySafety: 'safe',
      toolCall: { id: 'call_1', qualifiedName: 'web_search', args: {} },
      execute: async () => ({}),
    });

    expect(mocks.executeOperation).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ billingIdempotencyKey: 'agi.chat.web.send.paid-turn-1' }),
    );
  });

  it('keeps the provider step lines out of the ledger row and still reads the old ones', async () => {
    await executeCloudAgentWorkflowInvocation(makeInput(MANAGED_BILLING));

    const providerExecutor = toolLoopOptions()['providerExecutor'] as (input: unknown) => unknown;
    mocks.executeOperation.mockResolvedValue({});
    await providerExecutor({
      operationKey: 'provider:1',
      step: 1,
      request: {},
      execute: async () => providerStepResult(),
    });

    const ledgerRow = mocks.executeOperation.mock.calls[0]![1] as {
      execute: () => Promise<Record<string, unknown>>;
      resultSchema: { parse: (value: unknown) => unknown };
    };

    await expect(ledgerRow.execute()).resolves.not.toHaveProperty('lines');
    expect(() => ledgerRow.resultSchema.parse(providerStepResult())).not.toThrow();
  });
});

/**
 * The end of the metering argument. The three tests above prove the durable
 * invocation puts the free reservation on `processed.freeTrial`. These prove that
 * the object it produced is one the real free-tier cap can actually bite on --
 * that `freeTrial` is not merely present but carries the `reservedMicrousd` the
 * budget is computed from.
 *
 * `tool-loop.ts` is owned by another agent and cannot be edited or imported here,
 * so the cap is exercised at the boundary instead: the exact ProcessedRequest the
 * durable invocation handed `runToolLoop`, fed to the exact function the loop
 * calls on it.
 */
describe('the free-tier output cap bites on a durable free turn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runToolLoop.mockReturnValue((async function* () {})());
    mocks.settle.mockResolvedValue(undefined);
  });

  /** Exactly the call `tool-loop.ts` makes at :2474, on the rehydrated request. */
  function applyCapTo(processed: ProcessedRequest, maxTokens: number) {
    if (!processed.freeTrial) {
      throw new Error(
        'processed.freeTrial is undefined: the durable free turn would skip the cap entirely',
      );
    }
    const request = {
      model: processed.llmRequest.model,
      messages: [{ role: 'user', content: 'x'.repeat(200) }],
      max_tokens: maxTokens,
    };
    const result = applyFreeTrialProviderBudget({
      reservation: processed.freeTrial,
      provider: processed.provider,
      request,
    });
    return { result, request };
  }

  it('clamps the requested output budget down to what the reservation can pay for', async () => {
    await executeCloudAgentWorkflowInvocation(makeInput(FREE_BILLING));

    const { result, request } = applyCapTo(processedHandedToLoop(), 4_096);

    expect(result.ok).toBe(true);
    // The cap rewrote the request in place. An unmetered turn would have kept 4096.
    expect(request.max_tokens).toBeLessThan(4_096);
    expect(request.max_tokens).toBeGreaterThan(0);
  });

  it('refuses the step outright once the free reservation is spent', async () => {
    await executeCloudAgentWorkflowInvocation(makeInput({ ...FREE_BILLING, reservedMicrousd: 1 }));

    const { result } = applyCapTo(processedHandedToLoop(), 4_096);

    expect(result).toEqual({ ok: false, code: 'budget_reached' });
  });

  it('carries the reserved micro-USD across the boundary intact, not a default', async () => {
    await executeCloudAgentWorkflowInvocation(
      makeInput({ ...FREE_BILLING, reservedMicrousd: 777 }),
    );

    expect(processedHandedToLoop().freeTrial?.reservedMicrousd).toBe(777);
  });

  it('leaves a managed turn out of the free branch entirely', async () => {
    await executeCloudAgentWorkflowInvocation(makeInput(MANAGED_BILLING));

    // `if (processed.freeTrial)` must be false for a managed turn, or a paid turn
    // would be clamped to a free budget it never reserved.
    expect(processedHandedToLoop().freeTrial).toBeUndefined();
    expect(() => applyCapTo(processedHandedToLoop(), 4_096)).toThrow(/skip the cap entirely/);
  });
});
