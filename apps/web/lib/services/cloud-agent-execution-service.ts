import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { z } from 'zod';
import { toIsoTimestamp } from '@/lib/server/iso-timestamps';

const OperationKindSchema = z.enum(['provider', 'tool']);
const RetrySafetySchema = z.enum(['safe', 'unsafe']);
const OperationStatusSchema = z.enum(['running', 'completed', 'failed', 'outcome_unknown']);
const JsonObjectSchema = z.record(z.string(), z.unknown());

export type CloudAgentOperationKind = z.infer<typeof OperationKindSchema>;
export type CloudAgentRetrySafety = z.infer<typeof RetrySafetySchema>;
export type CloudAgentExecutionStatus = z.infer<typeof OperationStatusSchema>;

export interface CloudAgentExecutionUsage {
  providerCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cacheWrite1hTokens: number;
  reasoningTokens: number;
}

interface CloudAgentExecutionOperationRow extends Record<string, unknown> {
  id: string;
  run_id: string;
  user_id: string;
  operation_key: string;
  operation_kind: string;
  input_hash: string;
  retry_safety: string;
  status: string;
  attempt: number | string;
  lease_token: string | null;
  lease_expires_at: string | Date | null;
  result: unknown;
  usage: unknown;
  error: unknown;
  completed_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface CloudAgentExecutionOperation {
  id: string;
  runId: string;
  userId: string;
  operationKey: string;
  operationKind: CloudAgentOperationKind;
  inputHash: string;
  retrySafety: CloudAgentRetrySafety;
  status: CloudAgentExecutionStatus;
  attempt: number;
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  result: Record<string, unknown> | null;
  usage: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CloudAgentExecutionClaim =
  | {
      disposition: 'acquired';
      operationId: string;
      leaseToken: string;
      attempt: number;
    }
  | {
      disposition: 'completed';
      result: Record<string, unknown>;
      usage: Record<string, unknown> | null;
    }
  | { disposition: 'failed'; error: Record<string, unknown> | null }
  | { disposition: 'in_progress' }
  | { disposition: 'outcome_unknown' };

export class CloudAgentExecutionConflictError extends Error {
  constructor(message = 'Cloud agent execution operation conflicts with its durable receipt') {
    super(message);
    this.name = 'CloudAgentExecutionConflictError';
  }
}

function mapOperation(row: CloudAgentExecutionOperationRow): CloudAgentExecutionOperation {
  return {
    id: z.string().uuid().parse(row.id),
    runId: z.string().uuid().parse(row.run_id),
    userId: z.string().min(1).parse(row.user_id),
    operationKey: z.string().min(1).max(255).parse(row.operation_key),
    operationKind: OperationKindSchema.parse(row.operation_kind),
    inputHash: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .parse(row.input_hash),
    retrySafety: RetrySafetySchema.parse(row.retry_safety),
    status: OperationStatusSchema.parse(row.status),
    attempt: z.coerce.number().int().positive().parse(row.attempt),
    leaseToken: z.string().uuid().nullable().parse(row.lease_token),
    leaseExpiresAt: z.string().datetime().nullable().parse(toIsoTimestamp(row.lease_expires_at)),
    result: row.result === null ? null : JsonObjectSchema.parse(row.result),
    usage: row.usage === null ? null : JsonObjectSchema.parse(row.usage),
    error: row.error === null ? null : JsonObjectSchema.parse(row.error),
    completedAt: z.string().datetime().nullable().parse(toIsoTimestamp(row.completed_at)),
    createdAt: z.string().datetime().parse(toIsoTimestamp(row.created_at)),
    updatedAt: z.string().datetime().parse(toIsoTimestamp(row.updated_at)),
  };
}

function requireOperation(rows: CloudAgentExecutionOperationRow[]): CloudAgentExecutionOperation {
  const row = rows[0];
  if (!row)
    throw new CloudAgentExecutionConflictError('Execution operation lease is no longer active');
  return mapOperation(row);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

/** Stable receipt hash independent of object insertion order. */
export function fingerprintCloudAgentOperation(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export async function attachCloudAgentWorkflow(
  db: DatabaseAdapter,
  input: { userId: string; runId: string; workflowRunId: string },
): Promise<void> {
  const workflowRunId = z.string().min(1).max(255).parse(input.workflowRunId);
  const rows = await db.query<{ id: string }>(
    `update public.cloud_agent_runs
        set workflow_run_id = $3, updated_at = now()
      where id = $1 and user_id = $2
      returning id`,
    [input.runId, input.userId, workflowRunId],
  );
  if (!rows[0]) throw new CloudAgentExecutionConflictError('Cloud agent run is not owned');
}

function claimFromOperation(operation: CloudAgentExecutionOperation): CloudAgentExecutionClaim {
  if (operation.status === 'completed' && operation.result) {
    return { disposition: 'completed', result: operation.result, usage: operation.usage };
  }
  if (operation.status === 'failed') return { disposition: 'failed', error: operation.error };
  if (operation.status === 'outcome_unknown') return { disposition: 'outcome_unknown' };
  if (!operation.leaseToken)
    throw new CloudAgentExecutionConflictError('Running operation has no lease');
  return {
    disposition: 'acquired',
    operationId: operation.id,
    leaseToken: operation.leaseToken,
    attempt: operation.attempt,
  };
}

export async function claimCloudAgentExecutionOperation(
  db: DatabaseAdapter,
  input: {
    userId: string;
    runId: string;
    operationKey: string;
    operationKind: CloudAgentOperationKind;
    inputHash: string;
    retrySafety: CloudAgentRetrySafety;
    leaseSeconds?: number;
    now?: Date;
  },
): Promise<CloudAgentExecutionClaim> {
  const operationKey = z.string().min(1).max(255).parse(input.operationKey);
  const operationKind = OperationKindSchema.parse(input.operationKind);
  const inputHash = z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .parse(input.inputHash);
  const retrySafety = RetrySafetySchema.parse(input.retrySafety);
  const leaseSeconds = Math.min(300, Math.max(60, Math.trunc(input.leaseSeconds ?? 240)));
  const now = input.now ?? new Date();

  return db.transaction(async (tx) => {
    let rows = await tx.query<CloudAgentExecutionOperationRow>(
      `select * from public.cloud_agent_execution_operations
        where run_id = $1 and user_id = $2 and operation_key = $3
        for update`,
      [input.runId, input.userId, operationKey],
    );

    if (!rows[0]) {
      const leaseToken = randomUUID();
      rows = await tx.query<CloudAgentExecutionOperationRow>(
        `insert into public.cloud_agent_execution_operations (
           run_id, user_id, operation_key, operation_kind, input_hash,
           retry_safety, status, lease_token, lease_expires_at
         ) values ($1, $2, $3, $4, $5, $6, 'running', $7,
           now() + make_interval(secs => $8))
         on conflict (run_id, operation_key) do nothing
         returning *`,
        [
          input.runId,
          input.userId,
          operationKey,
          operationKind,
          inputHash,
          retrySafety,
          leaseToken,
          leaseSeconds,
        ],
      );
      if (rows[0]) return claimFromOperation(mapOperation(rows[0]));

      rows = await tx.query<CloudAgentExecutionOperationRow>(
        `select * from public.cloud_agent_execution_operations
          where run_id = $1 and user_id = $2 and operation_key = $3
          for update`,
        [input.runId, input.userId, operationKey],
      );
    }

    const operation = requireOperation(rows);
    if (
      operation.inputHash !== inputHash ||
      operation.operationKind !== operationKind ||
      operation.retrySafety !== retrySafety
    ) {
      throw new CloudAgentExecutionConflictError();
    }
    if (operation.status !== 'running') return claimFromOperation(operation);

    const leaseExpiresAt = operation.leaseExpiresAt
      ? Date.parse(operation.leaseExpiresAt)
      : Number.NEGATIVE_INFINITY;
    if (leaseExpiresAt > now.getTime()) return { disposition: 'in_progress' };

    if (operation.retrySafety === 'unsafe') {
      const unknownRows = await tx.query<CloudAgentExecutionOperationRow>(
        `update public.cloud_agent_execution_operations
            set status = 'outcome_unknown',
                lease_token = null,
                lease_expires_at = null,
                error = jsonb_build_object(
                  'code', 'expired_unsafe_operation',
                  'message', 'The process stopped before the external outcome was recorded.'
                ),
                updated_at = now()
          where id = $1 and user_id = $2 and status = 'running'
          returning *`,
        [operation.id, input.userId],
      );
      requireOperation(unknownRows);
      return { disposition: 'outcome_unknown' };
    }

    const leaseToken = randomUUID();
    const reacquired = requireOperation(
      await tx.query<CloudAgentExecutionOperationRow>(
        `update public.cloud_agent_execution_operations
            set attempt = attempt + 1,
                lease_token = $3,
                lease_expires_at = now() + make_interval(secs => $4),
                updated_at = now()
          where id = $1 and user_id = $2 and status = 'running'
          returning *`,
        [operation.id, input.userId, leaseToken, leaseSeconds],
      ),
    );
    return claimFromOperation(reacquired);
  });
}

export async function completeCloudAgentExecutionOperation(
  db: DatabaseAdapter,
  input: {
    userId: string;
    operationId: string;
    leaseToken: string;
    result: Record<string, unknown>;
    usage?: Record<string, unknown> | null;
  },
): Promise<CloudAgentExecutionOperation> {
  const result = JsonObjectSchema.parse(input.result);
  const usage = input.usage == null ? null : JsonObjectSchema.parse(input.usage);
  return requireOperation(
    await db.query<CloudAgentExecutionOperationRow>(
      `update public.cloud_agent_execution_operations
          set status = 'completed',
              result = $4::jsonb,
              usage = $5::jsonb,
              error = null,
              lease_token = null,
              lease_expires_at = null,
              completed_at = now(),
              updated_at = now()
        where id = $1 and user_id = $2 and lease_token = $3 and status = 'running'
        returning *`,
      [input.operationId, input.userId, input.leaseToken, result, usage],
    ),
  );
}

export async function failCloudAgentExecutionOperation(
  db: DatabaseAdapter,
  input: {
    userId: string;
    operationId: string;
    leaseToken: string;
    error: Record<string, unknown>;
  },
): Promise<CloudAgentExecutionOperation> {
  const error = JsonObjectSchema.parse(input.error);
  return requireOperation(
    await db.query<CloudAgentExecutionOperationRow>(
      `update public.cloud_agent_execution_operations
          set status = 'failed',
              error = $4::jsonb,
              lease_token = null,
              lease_expires_at = null,
              completed_at = now(),
              updated_at = now()
        where id = $1 and user_id = $2 and lease_token = $3 and status = 'running'
        returning *`,
      [input.operationId, input.userId, input.leaseToken, error],
    ),
  );
}

interface CloudAgentExecutionUsageRow extends Record<string, unknown> {
  provider_calls: number | string;
  input_tokens: number | string;
  output_tokens: number | string;
  cache_read_tokens: number | string;
  cache_write_tokens: number | string;
  cache_write_1h_tokens: number | string;
  reasoning_tokens: number | string;
}

/**
 * Rebuild billable usage from completed provider receipts instead of process
 * memory. This remains correct after a step crash, retry, or deployment.
 */
export async function getCloudAgentExecutionUsage(
  db: DatabaseAdapter,
  input: { userId: string; runId: string; billingIdempotencyKey: string },
): Promise<CloudAgentExecutionUsage> {
  const billingIdempotencyKey = z.string().min(8).max(128).parse(input.billingIdempotencyKey);
  const rows = await db.query<CloudAgentExecutionUsageRow>(
    `select count(*)::bigint as provider_calls,
            coalesce(sum(case when jsonb_typeof(usage->'inputTokens') = 'number'
              then (usage->>'inputTokens')::bigint else 0 end), 0)::bigint as input_tokens,
            coalesce(sum(case when jsonb_typeof(usage->'outputTokens') = 'number'
              then (usage->>'outputTokens')::bigint else 0 end), 0)::bigint as output_tokens,
            coalesce(sum(case when jsonb_typeof(usage->'cacheReadTokens') = 'number'
              then (usage->>'cacheReadTokens')::bigint else 0 end), 0)::bigint as cache_read_tokens,
            coalesce(sum(case when jsonb_typeof(usage->'cacheWriteTokens') = 'number'
              then (usage->>'cacheWriteTokens')::bigint else 0 end), 0)::bigint as cache_write_tokens,
            coalesce(sum(case when jsonb_typeof(usage->'cacheWrite1hTokens') = 'number'
              then (usage->>'cacheWrite1hTokens')::bigint else 0 end), 0)::bigint
              as cache_write_1h_tokens,
            coalesce(sum(case when jsonb_typeof(usage->'reasoningTokens') = 'number'
              then (usage->>'reasoningTokens')::bigint else 0 end), 0)::bigint as reasoning_tokens
       from public.cloud_agent_execution_operations
      where run_id = $1 and user_id = $2
        and operation_kind = 'provider' and status = 'completed'
        and usage->>'billingIdempotencyKey' = $3`,
    [input.runId, input.userId, billingIdempotencyKey],
  );
  const row = rows[0];
  if (!row) throw new CloudAgentExecutionConflictError('Cloud agent execution usage unavailable');
  const counter = z.coerce.number().int().nonnegative().safe();
  return {
    providerCalls: counter.parse(row.provider_calls),
    inputTokens: counter.parse(row.input_tokens),
    outputTokens: counter.parse(row.output_tokens),
    cacheReadTokens: counter.parse(row.cache_read_tokens),
    cacheWriteTokens: counter.parse(row.cache_write_tokens),
    cacheWrite1hTokens: counter.parse(row.cache_write_1h_tokens),
    reasoningTokens: counter.parse(row.reasoning_tokens),
  };
}
