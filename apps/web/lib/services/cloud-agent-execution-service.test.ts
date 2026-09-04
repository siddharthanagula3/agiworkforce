import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { listCanonicalModels } from '@agiworkforce/types';
import { calculateObservedProviderUsageCostDollars } from './managed-usage-accounting-service';
import { LLMCostCalculator } from './llm-cost-calculator';
import {
  CloudAgentExecutionConflictError,
  attachCloudAgentWorkflow,
  claimCloudAgentExecutionOperation,
  completeCloudAgentExecutionOperation,
  getCloudAgentExecutionUsage,
  renewCloudAgentExecutionOperationLease,
} from './cloud-agent-execution-service';

const RUN_ID = '0190a000-0000-7000-8000-000000000001';
const OPERATION_ID = '0190a000-0000-7000-8000-000000000002';
const LEASE_TOKEN = '0190a000-0000-7000-8000-000000000003';
const INPUT_HASH = 'a'.repeat(64);
const TIERED_MODEL = (() => {
  const candidate = listCanonicalModels().find(
    (model) => (model.inputTokenPricingTiers?.length ?? 0) > 0,
  );
  const firstTier = candidate?.inputTokenPricingTiers?.[0];
  if (!candidate || !firstTier) throw new Error('Expected a catalog tiered-pricing fixture');
  return { ...candidate, firstTier };
})();

const RUNNING_ROW = {
  id: OPERATION_ID,
  run_id: RUN_ID,
  user_id: 'user-1',
  operation_key: 'provider:1',
  operation_kind: 'provider',
  input_hash: INPUT_HASH,
  retry_safety: 'unsafe',
  status: 'running',
  attempt: 1,
  lease_token: LEASE_TOKEN,
  lease_expires_at: '2026-07-17T20:15:00.000Z',
  result: null,
  usage: null,
  error: null,
  completed_at: null,
  created_at: '2026-07-17T20:00:00.000Z',
  updated_at: '2026-07-17T20:00:00.000Z',
};

function database(): DatabaseAdapter {
  const db = {
    query: vi.fn(),
    execute: vi.fn(),
    transaction: vi.fn(),
    withUser: vi.fn(),
    dispose: vi.fn(),
  };
  db.transaction.mockImplementation(async (fn: (tx: DatabaseAdapter) => Promise<unknown>) =>
    fn(db as unknown as DatabaseAdapter),
  );
  return db as unknown as DatabaseAdapter;
}

describe('cloud agent execution service', () => {
  let db: DatabaseAdapter;

  beforeEach(() => {
    db = database();
  });

  it('replaces the active Vercel Workflow id when an owned run resumes', async () => {
    vi.mocked(db.query).mockResolvedValueOnce([{ id: RUN_ID }]);

    await attachCloudAgentWorkflow(db, {
      userId: 'user-1',
      runId: RUN_ID,
      workflowRunId: 'wrun_123',
    });

    expect(db.query).toHaveBeenCalledWith(
      expect.not.stringMatching(/coalesce\s*\(\s*workflow_run_id/i),
      [RUN_ID, 'user-1', 'wrun_123'],
    );
  });

  it('acquires a new operation under a bounded lease', async () => {
    vi.mocked(db.query).mockResolvedValueOnce([]).mockResolvedValueOnce([RUNNING_ROW]);

    const claim = await claimCloudAgentExecutionOperation(db, {
      userId: 'user-1',
      runId: RUN_ID,
      operationKey: 'provider:1',
      operationKind: 'provider',
      inputHash: INPUT_HASH,
      retrySafety: 'unsafe',
      leaseSeconds: 240,
    });

    expect(claim).toMatchObject({ disposition: 'acquired', leaseToken: LEASE_TOKEN });
    expect(db.query).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/insert into public\.cloud_agent_execution_operations/i),
      expect.arrayContaining([RUN_ID, 'user-1', 'provider:1', 'provider', INPUT_HASH, 'unsafe']),
    );
  });

  it('normalizes PostgreSQL Date timestamps on acquired operations', async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          ...RUNNING_ROW,
          lease_expires_at: new Date(RUNNING_ROW.lease_expires_at),
          created_at: new Date(RUNNING_ROW.created_at),
          updated_at: new Date(RUNNING_ROW.updated_at),
        },
      ]);

    const claim = await claimCloudAgentExecutionOperation(db, {
      userId: 'user-1',
      runId: RUN_ID,
      operationKey: 'provider:1',
      operationKind: 'provider',
      inputHash: INPUT_HASH,
      retrySafety: 'unsafe',
      leaseSeconds: 240,
    });

    expect(claim).toMatchObject({ disposition: 'acquired', leaseToken: LEASE_TOKEN });
  });

  it('replays a completed receipt without reacquiring or repeating the side effect', async () => {
    vi.mocked(db.query).mockResolvedValueOnce([
      {
        ...RUNNING_ROW,
        status: 'completed',
        result: { finishReason: 'stop' },
        usage: { providerCalls: 1, inputTokens: 10, outputTokens: 2 },
        lease_token: null,
        lease_expires_at: null,
        completed_at: '2026-07-17T20:01:00.000Z',
      },
    ]);

    const claim = await claimCloudAgentExecutionOperation(db, {
      userId: 'user-1',
      runId: RUN_ID,
      operationKey: 'provider:1',
      operationKind: 'provider',
      inputHash: INPUT_HASH,
      retrySafety: 'unsafe',
    });

    expect(claim).toEqual({
      disposition: 'completed',
      result: { finishReason: 'stop' },
      usage: { providerCalls: 1, inputTokens: 10, outputTokens: 2 },
    });
    expect(db.query).toHaveBeenCalledOnce();
  });

  it('reports an active lease as in progress instead of racing another attempt', async () => {
    vi.mocked(db.query).mockResolvedValueOnce([RUNNING_ROW]);

    const claim = await claimCloudAgentExecutionOperation(db, {
      userId: 'user-1',
      runId: RUN_ID,
      operationKey: 'provider:1',
      operationKind: 'provider',
      inputHash: INPUT_HASH,
      retrySafety: 'unsafe',
      now: new Date('2026-07-17T20:10:00.000Z'),
    });

    expect(claim).toEqual({ disposition: 'in_progress' });
    expect(db.query).toHaveBeenCalledOnce();
  });

  it('reacquires an expired safe operation', async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce([
        {
          ...RUNNING_ROW,
          operation_key: 'tool:call-1',
          operation_kind: 'tool',
          retry_safety: 'safe',
          lease_expires_at: '2026-07-17T20:05:00.000Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          ...RUNNING_ROW,
          operation_key: 'tool:call-1',
          operation_kind: 'tool',
          retry_safety: 'safe',
          attempt: 2,
        },
      ]);

    const claim = await claimCloudAgentExecutionOperation(db, {
      userId: 'user-1',
      runId: RUN_ID,
      operationKey: 'tool:call-1',
      operationKind: 'tool',
      inputHash: INPUT_HASH,
      retrySafety: 'safe',
      now: new Date('2026-07-17T20:10:00.000Z'),
    });

    expect(claim).toMatchObject({ disposition: 'acquired', attempt: 2 });
    expect(db.query).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/attempt = attempt \+ 1/i),
      expect.arrayContaining([OPERATION_ID, 'user-1']),
    );
  });

  it('marks an expired unsafe operation outcome unknown instead of executing it again', async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce([{ ...RUNNING_ROW, lease_expires_at: '2026-07-17T20:05:00.000Z' }])
      .mockResolvedValueOnce([{ ...RUNNING_ROW, status: 'outcome_unknown' }]);

    const claim = await claimCloudAgentExecutionOperation(db, {
      userId: 'user-1',
      runId: RUN_ID,
      operationKey: 'provider:1',
      operationKind: 'provider',
      inputHash: INPUT_HASH,
      retrySafety: 'unsafe',
      now: new Date('2026-07-17T20:10:00.000Z'),
    });

    expect(claim).toEqual({ disposition: 'outcome_unknown' });
    expect(db.query).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/status = 'outcome_unknown'/i),
      expect.arrayContaining([OPERATION_ID, 'user-1']),
    );
  });

  it('reacquires a stale safe operation lease within the replay attempt limit', async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce([
        {
          ...RUNNING_ROW,
          operation_key: 'tool:call-1',
          operation_kind: 'tool',
          retry_safety: 'safe',
          attempt: 4,
          lease_expires_at: '2026-07-17T20:05:00.000Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          ...RUNNING_ROW,
          operation_key: 'tool:call-1',
          operation_kind: 'tool',
          retry_safety: 'safe',
          attempt: 5,
        },
      ]);

    const claim = await claimCloudAgentExecutionOperation(db, {
      userId: 'user-1',
      runId: RUN_ID,
      operationKey: 'tool:call-1',
      operationKind: 'tool',
      inputHash: INPUT_HASH,
      retrySafety: 'safe',
      now: new Date('2026-07-17T20:10:00.000Z'),
    });

    expect(claim).toMatchObject({ disposition: 'acquired', attempt: 5 });
  });

  it('fails a safe operation closed once its stale lease exceeds the replay attempt limit', async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce([
        {
          ...RUNNING_ROW,
          operation_key: 'tool:call-1',
          operation_kind: 'tool',
          retry_safety: 'safe',
          attempt: 5,
          lease_expires_at: '2026-07-17T20:05:00.000Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          ...RUNNING_ROW,
          operation_key: 'tool:call-1',
          operation_kind: 'tool',
          retry_safety: 'safe',
          status: 'failed',
          attempt: 5,
          lease_token: null,
          lease_expires_at: null,
          error: { code: 'operation_replay_limit_exceeded', message: 'exceeded' },
        },
      ]);

    const claim = await claimCloudAgentExecutionOperation(db, {
      userId: 'user-1',
      runId: RUN_ID,
      operationKey: 'tool:call-1',
      operationKind: 'tool',
      inputHash: INPUT_HASH,
      retrySafety: 'safe',
      now: new Date('2026-07-17T20:10:00.000Z'),
    });

    expect(claim).toMatchObject({
      disposition: 'failed',
      error: { code: 'operation_replay_limit_exceeded' },
    });
    expect(db.query).toHaveBeenNthCalledWith(2, expect.stringMatching(/status = 'failed'/i), [
      OPERATION_ID,
      'user-1',
      'operation_replay_limit_exceeded',
      'The durable operation exceeded its maximum replay attempts.',
      600,
    ]);
    expect(db.query).not.toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/attempt = attempt \+ 1/i),
      expect.anything(),
    );
  });

  it('keeps a heartbeat-renewed lease waiting instead of reclaiming it as stale', async () => {
    vi.mocked(db.query).mockResolvedValueOnce([
      { ...RUNNING_ROW, lease_expires_at: '2026-07-17T20:20:00.000Z' },
    ]);

    const claim = await claimCloudAgentExecutionOperation(db, {
      userId: 'user-1',
      runId: RUN_ID,
      operationKey: 'provider:1',
      operationKind: 'provider',
      inputHash: INPUT_HASH,
      retrySafety: 'unsafe',
      now: new Date('2026-07-17T20:10:00.000Z'),
    });

    expect(claim).toEqual({ disposition: 'in_progress' });
    expect(db.query).toHaveBeenCalledOnce();
  });

  it('renews an active lease without touching its attempt count', async () => {
    vi.mocked(db.query).mockResolvedValueOnce([
      { ...RUNNING_ROW, lease_expires_at: '2026-07-17T20:20:00.000Z' },
    ]);

    const renewed = await renewCloudAgentExecutionOperationLease(db, {
      userId: 'user-1',
      operationId: OPERATION_ID,
      leaseToken: LEASE_TOKEN,
    });

    expect(renewed).toBe(true);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringMatching(/set lease_expires_at = now\(\) \+ make_interval/i),
      [OPERATION_ID, 'user-1', LEASE_TOKEN, 240],
    );
  });

  it('reports a lost lease instead of renewing an operation another claimant already reclaimed', async () => {
    vi.mocked(db.query).mockResolvedValueOnce([]);

    const renewed = await renewCloudAgentExecutionOperationLease(db, {
      userId: 'user-1',
      operationId: OPERATION_ID,
      leaseToken: LEASE_TOKEN,
    });

    expect(renewed).toBe(false);
  });

  it('rejects reuse of an operation key for different input', async () => {
    vi.mocked(db.query).mockResolvedValueOnce([RUNNING_ROW]);

    await expect(
      claimCloudAgentExecutionOperation(db, {
        userId: 'user-1',
        runId: RUN_ID,
        operationKey: 'provider:1',
        operationKind: 'provider',
        inputHash: 'b'.repeat(64),
        retrySafety: 'unsafe',
      }),
    ).rejects.toBeInstanceOf(CloudAgentExecutionConflictError);
  });

  it('completes only the matching active lease and stores its replay payload', async () => {
    vi.mocked(db.query).mockResolvedValueOnce([
      {
        ...RUNNING_ROW,
        status: 'completed',
        result: { answer: 42 },
        usage: { providerCalls: 1 },
        lease_token: null,
        lease_expires_at: null,
        completed_at: '2026-07-17T20:01:00.000Z',
      },
    ]);

    const operation = await completeCloudAgentExecutionOperation(db, {
      userId: 'user-1',
      operationId: OPERATION_ID,
      leaseToken: LEASE_TOKEN,
      result: { answer: 42 },
      usage: { providerCalls: 1 },
    });

    expect(operation.status).toBe('completed');
    expect(operation.result).toEqual({ answer: 42 });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringMatching(/where id = \$1[\s\S]*lease_token = \$3[\s\S]*status = 'running'/i),
      [OPERATION_ID, 'user-1', LEASE_TOKEN, { answer: 42 }, { providerCalls: 1 }],
    );
  });

  it('sums completed provider receipts for restart-safe final billing', async () => {
    vi.mocked(db.query).mockResolvedValueOnce([
      {
        provider_calls: '2',
        input_tokens: '130',
        output_tokens: '34',
        cache_read_tokens: '20',
        cache_write_tokens: '7',
        cache_write_1h_tokens: '3',
        reasoning_tokens: '11',
        provider_usage_receipts: [],
      },
    ]);

    await expect(
      getCloudAgentExecutionUsage(db, {
        userId: 'user-1',
        runId: RUN_ID,
        billingIdempotencyKey: 'agi.chat.web.request-1',
      }),
    ).resolves.toEqual({
      providerCalls: 2,
      inputTokens: 130,
      outputTokens: 34,
      cacheReadTokens: 20,
      cacheWriteTokens: 7,
      cacheWrite1hTokens: 3,
      reasoningTokens: 11,
    });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringMatching(
        /jsonb_agg\(usage order by created_at, operation_key\)[\s\S]*operation_kind = 'provider'[\s\S]*status = 'completed'/i,
      ),
      [RUN_ID, 'user-1', 'agi.chat.web.request-1'],
    );
  });

  it('rebuilds two subthreshold call observations from durable provider receipts', async () => {
    const observation = (costDollars: number) => ({
      inputTokens: 75,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      cacheWrite1hTokens: 0,
      reasoningTokens: 0,
      provider: 'fixture-provider',
      model: 'fixture-tiered-model',
      costDollars,
    });
    vi.mocked(db.query).mockResolvedValueOnce([
      {
        provider_calls: '2',
        input_tokens: '150',
        output_tokens: '0',
        cache_read_tokens: '0',
        cache_write_tokens: '0',
        cache_write_1h_tokens: '0',
        reasoning_tokens: '0',
        provider_usage_receipts: [
          {
            providerCostDollars: 0.00375,
            providerCallObservations: [observation(0.00375)],
          },
          {
            providerCostDollars: 0.00375,
            providerCallObservations: [observation(0.00375)],
          },
        ],
      },
    ]);

    await expect(
      getCloudAgentExecutionUsage(db, {
        userId: 'user-1',
        runId: RUN_ID,
        billingIdempotencyKey: 'agi.chat.web.request-2',
      }),
    ).resolves.toMatchObject({
      providerCalls: 2,
      inputTokens: 150,
      providerCostDollars: 0.0075,
      providerCallObservations: [observation(0.00375), observation(0.00375)],
    });
  });

  it('accepts a stored observation carrying routeId, costSource, upstreamProvider, and providerReportedCostUsd', async () => {
    const observation = {
      inputTokens: 75,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      cacheWrite1hTokens: 0,
      reasoningTokens: 0,
      provider: 'google',
      model: 'fixture-flash-model',
      costDollars: 0.002,
      costSource: 'estimated',
      routeId: 'google/fixture-flash-model',
      upstreamProvider: 'anthropic',
      providerReportedCostUsd: 0.0019,
    };
    vi.mocked(db.query).mockResolvedValueOnce([
      {
        provider_calls: '1',
        input_tokens: '75',
        output_tokens: '0',
        cache_read_tokens: '0',
        cache_write_tokens: '0',
        cache_write_1h_tokens: '0',
        reasoning_tokens: '0',
        provider_usage_receipts: [
          { providerCostDollars: 0.002, providerCallObservations: [observation] },
        ],
      },
    ]);

    await expect(
      getCloudAgentExecutionUsage(db, {
        userId: 'user-1',
        runId: RUN_ID,
        billingIdempotencyKey: 'agi.chat.web.request-3',
      }),
    ).resolves.toMatchObject({ providerCallObservations: [observation] });
  });

  it('synthesizes request boundaries from historical top-level usage receipts', async () => {
    const subthresholdTokens = Math.floor(TIERED_MODEL.firstTier.thresholdTokens * 0.75);
    const legacyReceipt = {
      inputTokens: subthresholdTokens,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      cacheWrite1hTokens: 0,
      reasoningTokens: 0,
    };
    vi.mocked(db.query).mockResolvedValueOnce([
      {
        provider_calls: '2',
        input_tokens: String(subthresholdTokens * 2),
        output_tokens: '0',
        cache_read_tokens: '0',
        cache_write_tokens: '0',
        cache_write_1h_tokens: '0',
        reasoning_tokens: '0',
        provider_usage_receipts: [legacyReceipt, legacyReceipt],
      },
    ]);

    const usage = await getCloudAgentExecutionUsage(db, {
      userId: 'user-1',
      runId: RUN_ID,
      billingIdempotencyKey: 'agi.chat.web.request-legacy',
    });
    expect(usage.providerCallObservations?.map((call) => call.inputTokens)).toEqual([
      subthresholdTokens,
      subthresholdTokens,
    ]);

    const fallbackPricing = {
      provider: TIERED_MODEL.provider,
      model: TIERED_MODEL.id,
    };
    const separatedCost = calculateObservedProviderUsageCostDollars(usage, fallbackPricing);
    const incorrectlyAggregatedCost = LLMCostCalculator.calculateCostDollars(
      fallbackPricing.provider,
      fallbackPricing.model,
      {
        promptTokens: subthresholdTokens * 2,
        completionTokens: 0,
        totalTokens: subthresholdTokens * 2,
      },
    );
    expect(incorrectlyAggregatedCost).toBeGreaterThan(separatedCost);
  });
});
