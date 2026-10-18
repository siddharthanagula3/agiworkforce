import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  CLOUD_AGENT_LOOP_REPEAT_THRESHOLD,
  CLOUD_AGENT_RUN_BUDGET_DEFAULTS,
  authorizeCloudAgentOperation,
  ensureCloudAgentRunBudget,
} from './cloud-agent-budget';

const RUN_ID = '0190a000-0000-7000-8000-000000000001';
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
    const insert = statements.find((statement) => insertsBudget(statement.sql));
    expect(insert?.params).toEqual([
      RUN_ID,
      USER_ID,
      CLOUD_AGENT_RUN_BUDGET_DEFAULTS.maxCostMicrousd,
      CLOUD_AGENT_RUN_BUDGET_DEFAULTS.maxToolCalls,
      CLOUD_AGENT_RUN_BUDGET_DEFAULTS.maxWallClockMs,
    ]);
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
            tool_spend_microusd: 0,
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
    expect(decision.refusal.message).toContain('spend limit of 4,000 credits');
    expect(decision.refusal.message).not.toContain('$');
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
});

describe('the two engines enforce one envelope', () => {
  function rustConstant(relativePath: string, name: string): number {
    const source = readFileSync(join(REPO_ROOT, relativePath), 'utf8');
    const match = new RegExp(`${name}:\\s*usize\\s*=\\s*(\\d+)`).exec(source);
    if (!match?.[1]) throw new Error(`${name} not found in ${relativePath}`);
    return Number(match[1]);
  }

  it('matches the CLI engine loop limit', () => {
    expect(CLOUD_AGENT_LOOP_REPEAT_THRESHOLD).toBe(
      rustConstant('crates/agiworkforce-agent-core/src/runaway.rs', 'LOOP_DETECTION_THRESHOLD'),
    );
  });
});
