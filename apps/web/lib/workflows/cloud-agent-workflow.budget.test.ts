import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('server-only', () => ({}));
vi.mock('workflow', () => ({
  FatalError: class FatalError extends Error {},
  RetryableError: class RetryableError extends Error {},
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { FatalError } from 'workflow';
import {
  CLOUD_AGENT_LOOP_REPEAT_THRESHOLD,
  CLOUD_AGENT_MAX_SUBAGENT_FANOUT,
  CLOUD_AGENT_RUN_BUDGET_DEFAULTS,
  authorizeCloudAgentSubagentDelegation,
} from '@/lib/services/cloud-agent-budget';
import { fingerprintCloudAgentOperation } from '@/lib/services/cloud-agent-execution-service';
import { executeCloudAgentOperation } from './cloud-agent-operation-executor';

const RUN_ID = '0190a000-0000-7000-8000-000000000001';
const OPERATION_ID = '0190a000-0000-7000-8000-000000000002';
const LEASE_TOKEN = '0190a000-0000-7000-8000-000000000003';
const USER_ID = 'user-1';
const ResultSchema = z.object({ answer: z.number() }).strict();

interface Scenario {
  toolCalls?: number;
  tailHashes?: string[];
  spentDollars?: number;
  delegations?: number;
  attempts?: number;
}

const BUDGET_ROW = {
  run_id: RUN_ID,
  user_id: USER_ID,
  parent_run_id: null,
  delegation_key: null,
  depth: 0,
  attempt: 1,
  max_cost_microusd: CLOUD_AGENT_RUN_BUDGET_DEFAULTS.maxCostMicrousd,
  max_tool_calls: CLOUD_AGENT_RUN_BUDGET_DEFAULTS.maxToolCalls,
  max_wall_clock_ms: CLOUD_AGENT_RUN_BUDGET_DEFAULTS.maxWallClockMs,
  started_at: new Date().toISOString(),
  refusal_code: null,
  refused_at: null,
};

function database(scenario: Scenario) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('from public.cloud_agent_run_budgets') && sql.includes('where run_id')) {
      return [BUDGET_ROW];
    }
    if (sql.includes('with tool_ops as')) {
      return [{ tool_calls: scenario.toolCalls ?? 0, tail_hashes: scenario.tailHashes ?? [] }];
    }
    if (sql.includes('from public.cloud_agent_runs')) {
      return [{ provider: 'fixture', model: 'fixture-model' }];
    }
    if (sql.includes('provider_usage_receipts')) {
      return [
        {
          provider_calls: scenario.spentDollars === undefined ? 0 : 1,
          input_tokens: 0,
          output_tokens: 0,
          cache_read_tokens: 0,
          cache_write_tokens: 0,
          cache_write_1h_tokens: 0,
          reasoning_tokens: 0,
          provider_usage_receipts:
            scenario.spentDollars === undefined
              ? []
              : [{ providerCostDollars: scenario.spentDollars }],
        },
      ];
    }
    if (sql.includes('count(distinct delegation_key)')) {
      return [{ delegations: scenario.delegations ?? 0, attempts: scenario.attempts ?? 0 }];
    }
    return [];
  });
  const db = { query, execute: vi.fn(), transaction: vi.fn(), withUser: vi.fn(), dispose: vi.fn() };
  return { db: db as unknown as DatabaseAdapter };
}

const claimMocks = vi.hoisted(() => ({ claim: vi.fn(), fail: vi.fn(), complete: vi.fn() }));

vi.mock('@/lib/services/cloud-agent-execution-service', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/services/cloud-agent-execution-service')
  >('@/lib/services/cloud-agent-execution-service');
  return {
    ...actual,
    claimCloudAgentExecutionOperation: claimMocks.claim,
    failCloudAgentExecutionOperation: claimMocks.fail,
    completeCloudAgentExecutionOperation: claimMocks.complete,
  };
});

async function runOperation(
  db: DatabaseAdapter,
  overrides: { operationKind: 'provider' | 'tool'; operationKey: string; payload: unknown },
) {
  return executeCloudAgentOperation(db, {
    userId: USER_ID,
    runId: RUN_ID,
    billingIdempotencyKey: 'agi.chat.web.request-1',
    retrySafety: 'safe',
    resultSchema: ResultSchema,
    execute: async () => ({ answer: 1 }),
    ...overrides,
  });
}

describe('the cloud Work runtime enforces the CLI safety envelope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    claimMocks.claim.mockResolvedValue({
      disposition: 'acquired',
      operationId: OPERATION_ID,
      leaseToken: LEASE_TOKEN,
      attempt: 1,
    });
    claimMocks.fail.mockResolvedValue({ status: 'failed' });
    claimMocks.complete.mockResolvedValue({ status: 'completed' });
  });

  it('stops a run that has spent its budget before the next provider call', async () => {
    const { db } = database({ spentDollars: 25 });

    await expect(
      runOperation(db, {
        operationKind: 'provider',
        operationKey: 'provider:9',
        payload: { model: 'fixture-model' },
      }),
    ).rejects.toThrow(/spend limit of \$20\.00/);
    expect(claimMocks.fail).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ error: expect.objectContaining({ code: 'run_cost_cap' }) }),
    );
  });

  it('aborts the tool call that would repeat itself one time too many', async () => {
    const payload = { qualifiedName: 'search', args: { q: 'same' } };
    // The guard compares the fingerprint the executor itself computes, so the
    // fixture tail is that fingerprint rather than an arbitrary hash.
    const repeated = fingerprintCloudAgentOperation({
      operationKind: 'tool',
      operationKey: 'tool:5',
      payload,
    });
    const { db } = database({
      toolCalls: CLOUD_AGENT_LOOP_REPEAT_THRESHOLD - 1,
      tailHashes: Array.from({ length: CLOUD_AGENT_LOOP_REPEAT_THRESHOLD - 1 }, () => repeated),
    });

    const error = await runOperation(db, {
      operationKind: 'tool',
      operationKey: 'tool:5',
      payload,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(FatalError);
    expect(String(error)).toContain(`${CLOUD_AGENT_LOOP_REPEAT_THRESHOLD}th time in a row`);
  });

  it('lets a run keep working while its tool calls differ', async () => {
    const { db } = database({
      toolCalls: CLOUD_AGENT_LOOP_REPEAT_THRESHOLD - 1,
      tailHashes: Array.from({ length: CLOUD_AGENT_LOOP_REPEAT_THRESHOLD - 1 }, () =>
        'b'.repeat(64),
      ),
    });

    await expect(
      runOperation(db, {
        operationKind: 'tool',
        operationKey: 'tool:5',
        payload: { qualifiedName: 'search', args: { q: 'different' } },
      }),
    ).resolves.toEqual({ answer: 1 });
  });

  it('bounds subagent delegation by fan-out and by what the parent has left', async () => {
    const { db } = database({ spentDollars: 0 });
    const first = await authorizeCloudAgentSubagentDelegation(db, {
      userId: USER_ID,
      parentRunId: RUN_ID,
      delegationKey: 'research',
    });
    if (!first.allowed) throw new Error(`expected an allowance: ${first.refusal.code}`);
    expect(first.grant.depth).toBe(1);
    expect(first.grant.maxCostMicrousd).toBe(
      Math.floor(CLOUD_AGENT_RUN_BUDGET_DEFAULTS.maxCostMicrousd / CLOUD_AGENT_MAX_SUBAGENT_FANOUT),
    );

    const { db: saturated } = database({ delegations: CLOUD_AGENT_MAX_SUBAGENT_FANOUT });
    const refused = await authorizeCloudAgentSubagentDelegation(saturated, {
      userId: USER_ID,
      parentRunId: RUN_ID,
      delegationKey: 'one-too-many',
    });
    if (refused.allowed) throw new Error('expected a refusal');
    expect(refused.refusal.code).toBe('subagent_fanout_cap');
  });
});
