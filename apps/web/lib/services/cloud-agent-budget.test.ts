import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  CLOUD_AGENT_LOOP_REPEAT_THRESHOLD,
  CLOUD_AGENT_MAX_SUBAGENT_ATTEMPTS,
  CLOUD_AGENT_MAX_SUBAGENT_DEPTH,
  CLOUD_AGENT_MAX_SUBAGENT_FANOUT,
  CLOUD_AGENT_RUN_BUDGET_DEFAULTS,
  authorizeCloudAgentOperation,
  authorizeCloudAgentSubagentDelegation,
  ensureCloudAgentRunBudget,
  registerCloudAgentSubagentRun,
} from './cloud-agent-budget';

const RUN_ID = '0190a000-0000-7000-8000-000000000001';
const CHILD_RUN_ID = '0190a000-0000-7000-8000-000000000009';
const USER_ID = 'user-1';
const INPUT_HASH = 'a'.repeat(64);
const OTHER_HASH = 'b'.repeat(64);
const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..');

function budgetRow(overrides: Record<string, unknown> = {}) {
  return {
    run_id: RUN_ID,
    user_id: USER_ID,
    parent_run_id: null,
    delegation_key: null,
    depth: 0,
    attempt: 1,
    max_cost_microusd: CLOUD_AGENT_RUN_BUDGET_DEFAULTS.maxCostMicrousd,
    max_tool_calls: CLOUD_AGENT_RUN_BUDGET_DEFAULTS.maxToolCalls,
    max_wall_clock_ms: CLOUD_AGENT_RUN_BUDGET_DEFAULTS.maxWallClockMs,
    started_at: '2026-09-18T10:00:00.000Z',
    refusal_code: null,
    refused_at: null,
    ...overrides,
  };
}

interface Responder {
  match: (sql: string) => boolean;
  rows: unknown[];
}

function database(responders: Responder[]): {
  db: DatabaseAdapter;
  statements: { sql: string; params: unknown[] }[];
} {
  const statements: { sql: string; params: unknown[] }[] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    statements.push({ sql, params });
    const responder = responders.find((candidate) => candidate.match(sql));
    return responder ? responder.rows : [];
  });
  const db = { query, execute: vi.fn(), transaction: vi.fn(), withUser: vi.fn(), dispose: vi.fn() };
  return { db: db as unknown as DatabaseAdapter, statements };
}

const selectsBudget = (sql: string) =>
  sql.includes('from public.cloud_agent_run_budgets') && sql.includes('where run_id');
const insertsBudget = (sql: string) => sql.includes('insert into public.cloud_agent_run_budgets');
const countsOperations = (sql: string) => sql.includes('with tool_ops as');
const selectsRun = (sql: string) => sql.includes('from public.cloud_agent_runs');
const updatesRefusal = (sql: string) =>
  sql.includes('update public.cloud_agent_run_budgets') && sql.includes('refusal_code = $3');
const countsDelegations = (sql: string) => sql.includes('count(distinct delegation_key)');

describe('cloud agent run budget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates the default envelope for a run that has none', async () => {
    const { db, statements } = database([
      { match: insertsBudget, rows: [budgetRow()] },
      { match: selectsBudget, rows: [] },
    ]);

    const budget = await ensureCloudAgentRunBudget(db, { userId: USER_ID, runId: RUN_ID });

    expect(budget.maxCostMicrousd).toBe(CLOUD_AGENT_RUN_BUDGET_DEFAULTS.maxCostMicrousd);
    expect(budget.depth).toBe(0);
    expect(budget.parentRunId).toBeNull();
    expect(statements.some((statement) => insertsBudget(statement.sql))).toBe(true);
  });

  it('allows an operation inside the envelope without a second write', async () => {
    const { db, statements } = database([
      { match: countsOperations, rows: [{ tool_calls: 3, tail_hashes: [OTHER_HASH] }] },
      { match: selectsBudget, rows: [budgetRow()] },
    ]);

    await expect(
      authorizeCloudAgentOperation(db, {
        userId: USER_ID,
        runId: RUN_ID,
        operationKey: 'tool:4',
        operationKind: 'tool',
        inputHash: INPUT_HASH,
        now: new Date('2026-09-18T10:05:00.000Z'),
      }),
    ).resolves.toEqual({ allowed: true });
    expect(statements.some((statement) => insertsBudget(statement.sql))).toBe(false);
  });

  it('refuses the tool call that would complete a repeat loop', async () => {
    const tail = Array.from({ length: CLOUD_AGENT_LOOP_REPEAT_THRESHOLD - 1 }, () => INPUT_HASH);
    const { db, statements } = database([
      { match: countsOperations, rows: [{ tool_calls: tail.length, tail_hashes: tail }] },
      { match: selectsBudget, rows: [budgetRow()] },
    ]);

    const decision = await authorizeCloudAgentOperation(db, {
      userId: USER_ID,
      runId: RUN_ID,
      operationKey: 'tool:5',
      operationKind: 'tool',
      inputHash: INPUT_HASH,
      now: new Date('2026-09-18T10:05:00.000Z'),
    });

    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error('expected a refusal');
    expect(decision.refusal.code).toBe('tool_loop');
    expect(decision.refusal.message).toContain(String(CLOUD_AGENT_LOOP_REPEAT_THRESHOLD));
    expect(statements.some((statement) => updatesRefusal(statement.sql))).toBe(true);
  });

  it('lets a differing tool call through at the same repeat count', async () => {
    const tail = Array.from({ length: CLOUD_AGENT_LOOP_REPEAT_THRESHOLD - 1 }, () => INPUT_HASH);
    const { db } = database([
      { match: countsOperations, rows: [{ tool_calls: tail.length, tail_hashes: tail }] },
      { match: selectsBudget, rows: [budgetRow()] },
    ]);

    await expect(
      authorizeCloudAgentOperation(db, {
        userId: USER_ID,
        runId: RUN_ID,
        operationKey: 'tool:5',
        operationKind: 'tool',
        inputHash: OTHER_HASH,
        now: new Date('2026-09-18T10:05:00.000Z'),
      }),
    ).resolves.toEqual({ allowed: true });
  });

  it('refuses a tool call once the run has spent its tool-call allowance', async () => {
    const { db } = database([
      {
        match: countsOperations,
        rows: [
          { tool_calls: CLOUD_AGENT_RUN_BUDGET_DEFAULTS.maxToolCalls, tail_hashes: [OTHER_HASH] },
        ],
      },
      { match: selectsBudget, rows: [budgetRow()] },
    ]);

    const decision = await authorizeCloudAgentOperation(db, {
      userId: USER_ID,
      runId: RUN_ID,
      operationKey: 'tool:501',
      operationKind: 'tool',
      inputHash: OTHER_HASH,
      now: new Date('2026-09-18T10:05:00.000Z'),
    });

    if (decision.allowed) throw new Error('expected a refusal');
    expect(decision.refusal.code).toBe('run_tool_call_cap');
    expect(decision.refusal.message).toContain(
      String(CLOUD_AGENT_RUN_BUDGET_DEFAULTS.maxToolCalls),
    );
  });

  it('refuses a provider call once the run has spent its money', async () => {
    const { db } = database([
      { match: selectsRun, rows: [{ provider: 'fixture', model: 'fixture-model' }] },
      {
        match: (sql) => sql.includes('provider_usage_receipts'),
        rows: [
          {
            provider_calls: 1,
            input_tokens: 0,
            output_tokens: 0,
            cache_read_tokens: 0,
            cache_write_tokens: 0,
            cache_write_1h_tokens: 0,
            reasoning_tokens: 0,
            provider_usage_receipts: [{ providerCostDollars: 25 }],
          },
        ],
      },
      { match: selectsBudget, rows: [budgetRow()] },
    ]);

    const decision = await authorizeCloudAgentOperation(db, {
      userId: USER_ID,
      runId: RUN_ID,
      operationKey: 'provider:9',
      operationKind: 'provider',
      inputHash: INPUT_HASH,
      now: new Date('2026-09-18T10:05:00.000Z'),
    });

    if (decision.allowed) throw new Error('expected a refusal');
    expect(decision.refusal.code).toBe('run_cost_cap');
    expect(decision.refusal.message).toContain('$20.00');
  });

  it('refuses any operation once the run has run out of wall clock', async () => {
    const { db } = database([{ match: selectsBudget, rows: [budgetRow()] }]);

    const decision = await authorizeCloudAgentOperation(db, {
      userId: USER_ID,
      runId: RUN_ID,
      operationKey: 'tool:2',
      operationKind: 'tool',
      inputHash: INPUT_HASH,
      now: new Date(
        Date.parse('2026-09-18T10:00:00.000Z') +
          CLOUD_AGENT_RUN_BUDGET_DEFAULTS.maxWallClockMs +
          1_000,
      ),
    });

    if (decision.allowed) throw new Error('expected a refusal');
    expect(decision.refusal.code).toBe('run_time_cap');
  });

  it('caps a child at its even share of what the parent has left', async () => {
    const { db } = database([
      { match: countsDelegations, rows: [{ delegations: 0, attempts: 0 }] },
      { match: selectsRun, rows: [{ provider: 'fixture', model: 'fixture-model' }] },
      {
        match: (sql) => sql.includes('provider_usage_receipts'),
        rows: [
          {
            provider_calls: 1,
            input_tokens: 0,
            output_tokens: 0,
            cache_read_tokens: 0,
            cache_write_tokens: 0,
            cache_write_1h_tokens: 0,
            reasoning_tokens: 0,
            provider_usage_receipts: [{ providerCostDollars: 6 }],
          },
        ],
      },
      { match: selectsBudget, rows: [budgetRow()] },
    ]);

    const decision = await authorizeCloudAgentSubagentDelegation(db, {
      userId: USER_ID,
      parentRunId: RUN_ID,
      delegationKey: 'research',
    });

    if (!decision.allowed) throw new Error(`expected an allowance: ${decision.refusal.code}`);
    expect(decision.grant.depth).toBe(1);
    expect(decision.grant.attempt).toBe(1);
    const remaining = CLOUD_AGENT_RUN_BUDGET_DEFAULTS.maxCostMicrousd - 6_000_000;
    expect(decision.grant.maxCostMicrousd).toBe(
      Math.floor(remaining / CLOUD_AGENT_MAX_SUBAGENT_FANOUT),
    );
    expect(
      (decision.grant.maxCostMicrousd ?? 0) * CLOUD_AGENT_MAX_SUBAGENT_FANOUT,
    ).toBeLessThanOrEqual(remaining);
  });

  it('refuses a delegation deeper than the subagent tree allows', async () => {
    const { db } = database([
      {
        match: selectsBudget,
        rows: [
          budgetRow({
            depth: CLOUD_AGENT_MAX_SUBAGENT_DEPTH,
            parent_run_id: CHILD_RUN_ID,
            delegation_key: 'research',
          }),
        ],
      },
    ]);

    const decision = await authorizeCloudAgentSubagentDelegation(db, {
      userId: USER_ID,
      parentRunId: RUN_ID,
      delegationKey: 'deeper',
    });

    if (decision.allowed) throw new Error('expected a refusal');
    expect(decision.refusal.code).toBe('subagent_depth_cap');
    expect(decision.refusal.message).toContain(String(CLOUD_AGENT_MAX_SUBAGENT_DEPTH));
  });

  it('refuses a new delegation past the fan-out cap but still retries an existing one', async () => {
    const atCap = (attempts: number) =>
      database([
        {
          match: countsDelegations,
          rows: [{ delegations: CLOUD_AGENT_MAX_SUBAGENT_FANOUT, attempts }],
        },
        { match: selectsRun, rows: [{ provider: 'fixture', model: 'fixture-model' }] },
        {
          match: (sql) => sql.includes('provider_usage_receipts'),
          rows: [
            {
              provider_calls: 0,
              input_tokens: 0,
              output_tokens: 0,
              cache_read_tokens: 0,
              cache_write_tokens: 0,
              cache_write_1h_tokens: 0,
              reasoning_tokens: 0,
              provider_usage_receipts: [],
            },
          ],
        },
        { match: selectsBudget, rows: [budgetRow()] },
      ]);

    const fresh = await authorizeCloudAgentSubagentDelegation(atCap(0).db, {
      userId: USER_ID,
      parentRunId: RUN_ID,
      delegationKey: 'eighth',
    });
    if (fresh.allowed) throw new Error('expected a refusal');
    expect(fresh.refusal.code).toBe('subagent_fanout_cap');

    const retry = await authorizeCloudAgentSubagentDelegation(atCap(1).db, {
      userId: USER_ID,
      parentRunId: RUN_ID,
      delegationKey: 'first',
    });
    if (!retry.allowed) throw new Error(`expected a retry to be allowed: ${retry.refusal.code}`);
    expect(retry.grant.attempt).toBe(2);
  });

  it('stops retrying a delegation that keeps failing', async () => {
    const { db } = database([
      {
        match: countsDelegations,
        rows: [{ delegations: 1, attempts: CLOUD_AGENT_MAX_SUBAGENT_ATTEMPTS }],
      },
      { match: selectsBudget, rows: [budgetRow()] },
    ]);

    const decision = await authorizeCloudAgentSubagentDelegation(db, {
      userId: USER_ID,
      parentRunId: RUN_ID,
      delegationKey: 'flaky',
    });

    if (decision.allowed) throw new Error('expected a refusal');
    expect(decision.refusal.code).toBe('subagent_attempt_cap');
  });

  it('writes a child budget that names its parent and its delegation', async () => {
    const { db, statements } = database([
      {
        match: insertsBudget,
        rows: [
          budgetRow({
            run_id: CHILD_RUN_ID,
            parent_run_id: RUN_ID,
            delegation_key: 'research',
            depth: 1,
            attempt: 2,
            max_cost_microusd: 1_000_000,
          }),
        ],
      },
      { match: selectsBudget, rows: [] },
    ]);

    const child = await registerCloudAgentSubagentRun(db, {
      userId: USER_ID,
      parentRunId: RUN_ID,
      childRunId: CHILD_RUN_ID,
      delegationKey: 'research',
      grant: {
        depth: 1,
        attempt: 2,
        maxCostMicrousd: 1_000_000,
        maxToolCalls: CLOUD_AGENT_RUN_BUDGET_DEFAULTS.maxToolCalls,
        maxWallClockMs: CLOUD_AGENT_RUN_BUDGET_DEFAULTS.maxWallClockMs,
      },
    });

    expect(child.parentRunId).toBe(RUN_ID);
    expect(child.delegationKey).toBe('research');
    expect(child.depth).toBe(1);
    const insert = statements.find((statement) => insertsBudget(statement.sql));
    expect(insert?.params).toEqual([
      CHILD_RUN_ID,
      USER_ID,
      RUN_ID,
      'research',
      1,
      2,
      1_000_000,
      CLOUD_AGENT_RUN_BUDGET_DEFAULTS.maxToolCalls,
      CLOUD_AGENT_RUN_BUDGET_DEFAULTS.maxWallClockMs,
    ]);
  });
});

describe('the two engines enforce one envelope', () => {
  function rustConstant(relativePath: string, name: string): number {
    const source = readFileSync(join(REPO_ROOT, relativePath), 'utf8');
    const match = new RegExp(`${name}:\\s*usize\\s*=\\s*(\\d+)`).exec(source);
    if (!match?.[1]) throw new Error(`${name} not found in ${relativePath}`);
    return Number(match[1]);
  }

  it('matches the CLI engine loop, depth, fan-out and retry limits', () => {
    expect(CLOUD_AGENT_LOOP_REPEAT_THRESHOLD).toBe(
      rustConstant('crates/agiworkforce-agent-core/src/runaway.rs', 'LOOP_DETECTION_THRESHOLD'),
    );
    expect(CLOUD_AGENT_MAX_SUBAGENT_DEPTH).toBe(
      rustConstant('apps/cli/src/subagent.rs', 'MAX_SUBAGENT_DEPTH'),
    );
    expect(CLOUD_AGENT_MAX_SUBAGENT_FANOUT).toBe(
      rustConstant('apps/cli/src/subagent.rs', 'DEFAULT_MAX_CONCURRENT'),
    );
    expect(CLOUD_AGENT_MAX_SUBAGENT_ATTEMPTS).toBe(
      rustConstant('apps/cli/src/subagent.rs', 'MAX_SUBAGENT_ATTEMPTS'),
    );
  });
});
