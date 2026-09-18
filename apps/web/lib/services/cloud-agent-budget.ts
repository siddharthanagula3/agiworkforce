import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { z } from 'zod';

import { toIsoTimestamp } from '@/lib/server/iso-timestamps';
import {
  getCloudAgentRunUsage,
  type CloudAgentOperationKind,
} from '@/lib/services/cloud-agent-execution-service';
import { calculateObservedProviderUsageCostDollars } from '@/lib/services/managed-usage-accounting-service';

/**
 * The cloud Work runtime enforces the same envelope the CLI engine does. These
 * four mirror crates/agiworkforce-agent-core/src/runaway.rs and
 * apps/cli/src/subagent.rs; cloud-agent-budget.test.ts reads those files and
 * fails when the two engines drift apart.
 */
export const CLOUD_AGENT_LOOP_REPEAT_THRESHOLD = 5;
export const CLOUD_AGENT_MAX_SUBAGENT_DEPTH = 3;
export const CLOUD_AGENT_MAX_SUBAGENT_FANOUT = 7;
export const CLOUD_AGENT_MAX_SUBAGENT_ATTEMPTS = 2;

const MICROUSD_PER_DOLLAR = 1_000_000;

export const CLOUD_AGENT_RUN_BUDGET_DEFAULTS = {
  maxCostMicrousd: 20 * MICROUSD_PER_DOLLAR,
  maxToolCalls: 500,
  maxWallClockMs: 6 * 60 * 60_000,
} as const;

export const CLOUD_AGENT_BUDGET_REFUSAL_CODES = [
  'run_cost_cap',
  'run_tool_call_cap',
  'run_time_cap',
  'tool_loop',
  'subagent_depth_cap',
  'subagent_fanout_cap',
  'subagent_attempt_cap',
] as const;

export type CloudAgentBudgetRefusalCode = (typeof CLOUD_AGENT_BUDGET_REFUSAL_CODES)[number];

export interface CloudAgentBudgetRefusal {
  code: CloudAgentBudgetRefusalCode;
  message: string;
}

export type CloudAgentBudgetDecision =
  { allowed: true } | { allowed: false; refusal: CloudAgentBudgetRefusal };

export interface CloudAgentSubagentGrant {
  depth: number;
  attempt: number;
  maxCostMicrousd: number | null;
  maxToolCalls: number;
  maxWallClockMs: number;
}

export type CloudAgentSubagentDecision =
  | { allowed: true; grant: CloudAgentSubagentGrant }
  | { allowed: false; refusal: CloudAgentBudgetRefusal };

export interface CloudAgentRunBudget {
  runId: string;
  userId: string;
  parentRunId: string | null;
  delegationKey: string | null;
  depth: number;
  attempt: number;
  maxCostMicrousd: number | null;
  maxToolCalls: number;
  maxWallClockMs: number;
  startedAt: string;
  refusalCode: CloudAgentBudgetRefusalCode | null;
  refusedAt: string | null;
}

interface CloudAgentRunBudgetRow extends Record<string, unknown> {
  run_id: string;
  user_id: string;
  parent_run_id: string | null;
  delegation_key: string | null;
  depth: number | string;
  attempt: number | string;
  max_cost_microusd: number | string | null;
  max_tool_calls: number | string;
  max_wall_clock_ms: number | string;
  started_at: string | Date;
  refusal_code: string | null;
  refused_at: string | Date | null;
}

const RefusalCodeSchema = z.enum(CLOUD_AGENT_BUDGET_REFUSAL_CODES);
const counter = z.coerce.number().int().nonnegative();

function mapBudget(row: CloudAgentRunBudgetRow): CloudAgentRunBudget {
  return {
    runId: z.string().uuid().parse(row.run_id),
    userId: z.string().min(1).parse(row.user_id),
    parentRunId: z.string().uuid().nullable().parse(row.parent_run_id),
    delegationKey: z.string().min(1).max(255).nullable().parse(row.delegation_key),
    depth: counter.parse(row.depth),
    attempt: z.coerce.number().int().positive().parse(row.attempt),
    maxCostMicrousd: row.max_cost_microusd === null ? null : counter.parse(row.max_cost_microusd),
    maxToolCalls: z.coerce.number().int().positive().parse(row.max_tool_calls),
    maxWallClockMs: z.coerce.number().int().positive().parse(row.max_wall_clock_ms),
    startedAt: z.string().datetime().parse(toIsoTimestamp(row.started_at)),
    refusalCode: row.refusal_code === null ? null : RefusalCodeSchema.parse(row.refusal_code),
    refusedAt: z.string().datetime().nullable().parse(toIsoTimestamp(row.refused_at)),
  };
}

const BUDGET_COLUMNS = `run_id, user_id, parent_run_id, delegation_key, depth, attempt,
   max_cost_microusd, max_tool_calls, max_wall_clock_ms, started_at, refusal_code, refused_at`;

function dollarsToMicrousd(dollars: number): number {
  return Math.max(0, Math.round(dollars * MICROUSD_PER_DOLLAR));
}

function formatDollars(microusd: number): string {
  return `$${(microusd / MICROUSD_PER_DOLLAR).toFixed(2)}`;
}

function formatMinutes(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

function refusal(code: CloudAgentBudgetRefusalCode, message: string): CloudAgentBudgetRefusal {
  return { code, message };
}

/**
 * The run's envelope, created on first use. A run that predates this table gets
 * the default envelope the moment it next runs an operation, so no run stays
 * uncapped because it started earlier.
 */
export async function ensureCloudAgentRunBudget(
  db: DatabaseAdapter,
  input: {
    userId: string;
    runId: string;
    parentRunId?: string | null;
    delegationKey?: string | null;
    depth?: number;
    attempt?: number;
    maxCostMicrousd?: number | null;
    maxToolCalls?: number;
    maxWallClockMs?: number;
  },
): Promise<CloudAgentRunBudget> {
  const parentRunId = input.parentRunId ?? null;
  const delegationKey = parentRunId === null ? null : (input.delegationKey ?? null);
  const depth = parentRunId === null ? 0 : (input.depth ?? 1);
  const maxCostMicrousd =
    input.maxCostMicrousd === undefined
      ? CLOUD_AGENT_RUN_BUDGET_DEFAULTS.maxCostMicrousd
      : input.maxCostMicrousd;

  const existing = await readCloudAgentRunBudget(db, input);
  if (existing) return existing;

  const rows = await db.query<CloudAgentRunBudgetRow>(
    `insert into public.cloud_agent_run_budgets (
       run_id, user_id, parent_run_id, delegation_key, depth, attempt,
       max_cost_microusd, max_tool_calls, max_wall_clock_ms
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (run_id) do nothing
     returning ${BUDGET_COLUMNS}`,
    [
      input.runId,
      input.userId,
      parentRunId,
      delegationKey,
      depth,
      input.attempt ?? 1,
      maxCostMicrousd,
      input.maxToolCalls ?? CLOUD_AGENT_RUN_BUDGET_DEFAULTS.maxToolCalls,
      input.maxWallClockMs ?? CLOUD_AGENT_RUN_BUDGET_DEFAULTS.maxWallClockMs,
    ],
  );
  if (rows[0]) return mapBudget(rows[0]);

  const raced = await readCloudAgentRunBudget(db, input);
  if (!raced) throw new Error('Cloud agent run budget could not be created');
  return raced;
}

export async function readCloudAgentRunBudget(
  db: DatabaseAdapter,
  input: { userId: string; runId: string },
): Promise<CloudAgentRunBudget | null> {
  const rows = await db.query<CloudAgentRunBudgetRow>(
    `select ${BUDGET_COLUMNS} from public.cloud_agent_run_budgets
      where run_id = $1 and user_id = $2`,
    [input.runId, input.userId],
  );
  return rows[0] ? mapBudget(rows[0]) : null;
}

/**
 * Record which cap stopped this run. First refusal wins: the reason the user
 * was given must not be overwritten by a later step hitting a second cap.
 */
export async function recordCloudAgentBudgetRefusal(
  db: DatabaseAdapter,
  input: { userId: string; runId: string; code: CloudAgentBudgetRefusalCode },
): Promise<void> {
  await db.query(
    `update public.cloud_agent_run_budgets
        set refusal_code = $3, refused_at = now()
      where run_id = $1 and user_id = $2 and refusal_code is null`,
    [input.runId, input.userId, RefusalCodeSchema.parse(input.code)],
  );
}

async function spentMicrousd(
  db: DatabaseAdapter,
  input: { userId: string; runId: string },
): Promise<number> {
  const rows = await db.query<{ provider: string; model: string }>(
    `select provider, model from public.cloud_agent_runs where id = $1 and user_id = $2`,
    [input.runId, input.userId],
  );
  const run = rows[0];
  if (!run) return 0;
  const usage = await getCloudAgentRunUsage(db, input);
  if (usage.providerCalls === 0) return 0;
  return dollarsToMicrousd(
    calculateObservedProviderUsageCostDollars(usage, {
      provider: run.provider,
      model: run.model,
    }),
  );
}

interface OperationCountersRow extends Record<string, unknown> {
  tool_calls: number | string;
  tail_hashes: unknown;
}

// The operation being authorised is already claimed, so it is excluded here:
// counting it would spend the cap one call early and shorten the loop window.
async function operationCounters(
  db: DatabaseAdapter,
  input: { userId: string; runId: string; operationKey: string },
): Promise<{ toolCalls: number; tailHashes: string[] }> {
  const rows = await db.query<OperationCountersRow>(
    `with tool_ops as (
       select input_hash, created_at
         from public.cloud_agent_execution_operations
        where run_id = $1 and user_id = $2 and operation_kind = 'tool'
          and operation_key <> $4
     ), tail as (
       select input_hash from tool_ops order by created_at desc, input_hash desc limit $3
     )
     select (select count(*) from tool_ops)::bigint as tool_calls,
            coalesce((select json_agg(input_hash) from tail), '[]'::json) as tail_hashes`,
    [input.runId, input.userId, CLOUD_AGENT_LOOP_REPEAT_THRESHOLD - 1, input.operationKey],
  );
  const row = rows[0];
  if (!row) return { toolCalls: 0, tailHashes: [] };
  return {
    toolCalls: counter.parse(row.tool_calls),
    tailHashes: z.array(z.string()).parse(row.tail_hashes),
  };
}

/**
 * Authorise one durable operation against the run's envelope, before the side
 * effect happens. Every refusal names the cap that stopped the run, because a
 * run that stops without saying why is indistinguishable from one that broke.
 */
export async function authorizeCloudAgentOperation(
  db: DatabaseAdapter,
  input: {
    userId: string;
    runId: string;
    operationKey: string;
    operationKind: CloudAgentOperationKind;
    inputHash: string;
    now?: Date;
  },
): Promise<CloudAgentBudgetDecision> {
  const budget = await ensureCloudAgentRunBudget(db, {
    userId: input.userId,
    runId: input.runId,
  });
  const now = input.now ?? new Date();

  const elapsedMs = now.getTime() - Date.parse(budget.startedAt);
  if (Number.isFinite(elapsedMs) && elapsedMs > budget.maxWallClockMs) {
    return deny(db, input, 'run_time_cap', {
      message: `This run reached its time limit of ${formatMinutes(budget.maxWallClockMs)}, so AGI stopped instead of starting another step.`,
    });
  }

  if (input.operationKind === 'tool') {
    const { toolCalls, tailHashes } = await operationCounters(db, input);
    if (toolCalls >= budget.maxToolCalls) {
      return deny(db, input, 'run_tool_call_cap', {
        message: `This run reached its limit of ${budget.maxToolCalls} tool calls, so AGI stopped instead of running another one.`,
      });
    }
    if (
      tailHashes.length === CLOUD_AGENT_LOOP_REPEAT_THRESHOLD - 1 &&
      tailHashes.every((hash) => hash === input.inputHash)
    ) {
      return deny(db, input, 'tool_loop', {
        message: `AGI was about to make the same tool call for the ${CLOUD_AGENT_LOOP_REPEAT_THRESHOLD}th time in a row, so this run was stopped instead of looping.`,
      });
    }
  }

  // Spend is recorded on provider receipts, so the cap is measured where the
  // money is about to be spent, matching the CLI engine's guard placement.
  if (input.operationKind === 'provider' && budget.maxCostMicrousd !== null) {
    const spent = await spentMicrousd(db, input);
    if (spent >= budget.maxCostMicrousd) {
      return deny(db, input, 'run_cost_cap', {
        message: `This run reached its spend limit of ${formatDollars(budget.maxCostMicrousd)}, so AGI stopped before spending more.`,
      });
    }
  }

  return { allowed: true };
}

async function deny(
  db: DatabaseAdapter,
  input: { userId: string; runId: string },
  code: CloudAgentBudgetRefusalCode,
  detail: { message: string },
): Promise<CloudAgentBudgetDecision> {
  await recordCloudAgentBudgetRefusal(db, { ...input, code });
  return { allowed: false, refusal: refusal(code, detail.message) };
}

interface DelegationCountersRow extends Record<string, unknown> {
  delegations: number | string;
  attempts: number | string;
}

/**
 * Authorise a subagent delegation from a parent run. Depth and fan-out are the
 * CLI's, and a child is capped at its even share of what the parent has left so
 * a fan-out cannot together outspend the run that delegated it. A retry reuses
 * its delegation key and so does not consume a second fan-out slot.
 */
export async function authorizeCloudAgentSubagentDelegation(
  db: DatabaseAdapter,
  input: { userId: string; parentRunId: string; delegationKey: string },
): Promise<CloudAgentSubagentDecision> {
  const delegationKey = z.string().min(1).max(255).parse(input.delegationKey);
  const parent = await ensureCloudAgentRunBudget(db, {
    userId: input.userId,
    runId: input.parentRunId,
  });

  if (parent.depth >= CLOUD_AGENT_MAX_SUBAGENT_DEPTH) {
    return {
      allowed: false,
      refusal: refusal(
        'subagent_depth_cap',
        `Subagents may nest ${CLOUD_AGENT_MAX_SUBAGENT_DEPTH} levels deep. This one is already at level ${parent.depth}, so it cannot delegate further.`,
      ),
    };
  }

  const rows = await db.query<DelegationCountersRow>(
    `select count(distinct delegation_key)::bigint as delegations,
            count(*) filter (where delegation_key = $3)::bigint as attempts
       from public.cloud_agent_run_budgets
      where parent_run_id = $1 and user_id = $2`,
    [input.parentRunId, input.userId, delegationKey],
  );
  const delegations = counter.parse(rows[0]?.delegations ?? 0);
  const attempts = counter.parse(rows[0]?.attempts ?? 0);

  if (attempts >= CLOUD_AGENT_MAX_SUBAGENT_ATTEMPTS) {
    return {
      allowed: false,
      refusal: refusal(
        'subagent_attempt_cap',
        `This subagent already ran ${attempts} times without succeeding, so AGI stopped retrying it.`,
      ),
    };
  }
  if (attempts === 0 && delegations >= CLOUD_AGENT_MAX_SUBAGENT_FANOUT) {
    return {
      allowed: false,
      refusal: refusal(
        'subagent_fanout_cap',
        `This run already delegated to ${CLOUD_AGENT_MAX_SUBAGENT_FANOUT} subagents, so another was refused.`,
      ),
    };
  }

  let childCostMicrousd: number | null = null;
  if (parent.maxCostMicrousd !== null) {
    const spent = await spentMicrousd(db, {
      userId: input.userId,
      runId: input.parentRunId,
    });
    const remaining = Math.max(0, parent.maxCostMicrousd - spent);
    childCostMicrousd = Math.floor(remaining / CLOUD_AGENT_MAX_SUBAGENT_FANOUT);
    if (childCostMicrousd <= 0) {
      return {
        allowed: false,
        refusal: refusal(
          'run_cost_cap',
          `This run reached its spend limit of ${formatDollars(parent.maxCostMicrousd)}, so it cannot pay for another subagent.`,
        ),
      };
    }
  }

  return {
    allowed: true,
    grant: {
      depth: parent.depth + 1,
      attempt: attempts + 1,
      maxCostMicrousd: childCostMicrousd,
      maxToolCalls: parent.maxToolCalls,
      maxWallClockMs: parent.maxWallClockMs,
    },
  };
}

/**
 * Give an authorised child run its own envelope. Called once the child run row
 * exists, so the budget can carry the foreign key that keeps the subtree inside
 * one tenant.
 */
export async function registerCloudAgentSubagentRun(
  db: DatabaseAdapter,
  input: {
    userId: string;
    parentRunId: string;
    childRunId: string;
    delegationKey: string;
    grant: CloudAgentSubagentGrant;
  },
): Promise<CloudAgentRunBudget> {
  return ensureCloudAgentRunBudget(db, {
    userId: input.userId,
    runId: input.childRunId,
    parentRunId: input.parentRunId,
    delegationKey: z.string().min(1).max(255).parse(input.delegationKey),
    depth: input.grant.depth,
    attempt: input.grant.attempt,
    maxCostMicrousd: input.grant.maxCostMicrousd,
    maxToolCalls: input.grant.maxToolCalls,
    maxWallClockMs: input.grant.maxWallClockMs,
  });
}
