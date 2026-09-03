import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { z } from 'zod';
import { toIsoTimestamp } from '@/lib/server/iso-timestamps';
import type { SameKeys } from '@/lib/schema-key-guard';
import type {
  ObservedProviderUsage,
  ProviderUsageObservation,
} from '@/lib/services/managed-usage-accounting-service';

const OperationKindSchema = z.enum(['provider', 'tool']);
const RetrySafetySchema = z.enum(['safe', 'unsafe']);
const OperationStatusSchema = z.enum(['running', 'completed', 'failed', 'outcome_unknown']);
const JsonObjectSchema = z.record(z.string(), z.unknown());

const MIN_OPERATION_LEASE_SECONDS = 60;
const MAX_OPERATION_LEASE_SECONDS = 300;
const DEFAULT_OPERATION_LEASE_SECONDS = 240;
const MAX_OPERATION_REPLAY_ATTEMPTS = 5;
const OPERATION_REPLAY_LIMIT_ERROR = {
  code: 'operation_replay_limit_exceeded',
  message: 'The durable operation exceeded its maximum replay attempts.',
} as const;
const MILLISECONDS_PER_SECOND = 1000;
const OPERATION_LEASE_RENEWAL_SAFETY_DIVISOR = 2;
export const OPERATION_LEASE_RENEWAL_INTERVAL_SECONDS = Math.floor(
  MIN_OPERATION_LEASE_SECONDS / OPERATION_LEASE_RENEWAL_SAFETY_DIVISOR,
);

function clampLeaseSeconds(leaseSeconds: number | undefined): number {
  return Math.min(
    MAX_OPERATION_LEASE_SECONDS,
    Math.max(
      MIN_OPERATION_LEASE_SECONDS,
      Math.trunc(leaseSeconds ?? DEFAULT_OPERATION_LEASE_SECONDS),
    ),
  );
}

export type CloudAgentOperationKind = z.infer<typeof OperationKindSchema>;
export type CloudAgentRetrySafety = z.infer<typeof RetrySafetySchema>;
export type CloudAgentExecutionStatus = z.infer<typeof OperationStatusSchema>;

export type CloudAgentExecutionUsage = ObservedProviderUsage;

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
  const leaseSeconds = clampLeaseSeconds(input.leaseSeconds);
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

    if (operation.attempt >= MAX_OPERATION_REPLAY_ATTEMPTS) {
      const lastAttemptAgeSeconds = Math.max(
        0,
        Math.round((now.getTime() - Date.parse(operation.updatedAt)) / MILLISECONDS_PER_SECOND),
      );
      const exhaustedRows = await tx.query<CloudAgentExecutionOperationRow>(
        `update public.cloud_agent_execution_operations
            set status = 'failed',
                lease_token = null,
                lease_expires_at = null,
                error = jsonb_build_object(
                  'code', $3::text,
                  'message', $4::text,
                  'lastAttemptAgeSeconds', $5::int
                ),
                completed_at = now(),
                updated_at = now()
          where id = $1 and user_id = $2 and status = 'running'
          returning *`,
        [
          operation.id,
          input.userId,
          OPERATION_REPLAY_LIMIT_ERROR.code,
          OPERATION_REPLAY_LIMIT_ERROR.message,
          lastAttemptAgeSeconds,
        ],
      );
      return claimFromOperation(requireOperation(exhaustedRows));
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

export async function renewCloudAgentExecutionOperationLease(
  db: DatabaseAdapter,
  input: {
    userId: string;
    operationId: string;
    leaseToken: string;
    leaseSeconds?: number;
  },
): Promise<boolean> {
  const leaseSeconds = clampLeaseSeconds(input.leaseSeconds);
  const rows = await db.query<CloudAgentExecutionOperationRow>(
    `update public.cloud_agent_execution_operations
        set lease_expires_at = now() + make_interval(secs => $4),
            updated_at = now()
      where id = $1 and user_id = $2 and lease_token = $3 and status = 'running'
      returning *`,
    [input.operationId, input.userId, input.leaseToken, leaseSeconds],
  );
  return rows.length > 0;
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
  provider_usage_receipts: unknown;
}

const ProviderUsageObservationSchema = z
  .object({
    inputTokens: z.number().nonnegative(),
    outputTokens: z.number().nonnegative(),
    cacheReadTokens: z.number().nonnegative(),
    cacheWriteTokens: z.number().nonnegative(),
    cacheWrite1hTokens: z.number().nonnegative(),
    reasoningTokens: z.number().nonnegative(),
    provider: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    costDollars: z.number().finite().nonnegative().optional(),
    costSource: z.enum(['provider_reported', 'estimated']).optional(),
    routeId: z.string().min(1).nullable().optional(),
    upstreamProvider: z.string().min(1).optional(),
    providerReportedCostUsd: z.number().finite().nonnegative().optional(),
  })
  .strict();
const providerUsageObservationSchemaCoversObservation: SameKeys<
  z.infer<typeof ProviderUsageObservationSchema>,
  ProviderUsageObservation
> = true;
void providerUsageObservationSchemaCoversObservation;

const ProviderUsageReceiptSchema = z
  .object({
    inputTokens: z.number().nonnegative().default(0),
    outputTokens: z.number().nonnegative().default(0),
    cacheReadTokens: z.number().nonnegative().default(0),
    cacheWriteTokens: z.number().nonnegative().default(0),
    cacheWrite1hTokens: z.number().nonnegative().default(0),
    reasoningTokens: z.number().nonnegative().default(0),
    provider: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    providerCostDollars: z.number().finite().nonnegative().optional(),
    providerCallObservations: z.array(ProviderUsageObservationSchema).optional(),
  })
  .passthrough();

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
              then (usage->>'reasoningTokens')::bigint else 0 end), 0)::bigint as reasoning_tokens,
            coalesce(jsonb_agg(usage order by created_at, operation_key), '[]'::jsonb)
              as provider_usage_receipts
       from public.cloud_agent_execution_operations
      where run_id = $1 and user_id = $2
        and operation_kind = 'provider' and status = 'completed'
        and usage->>'billingIdempotencyKey' = $3`,
    [input.runId, input.userId, billingIdempotencyKey],
  );
  const row = rows[0];
  if (!row) throw new CloudAgentExecutionConflictError('Cloud agent execution usage unavailable');
  const counter = z.coerce.number().int().nonnegative().safe();
  const receipts = z.array(ProviderUsageReceiptSchema).parse(row.provider_usage_receipts);
  const providerCallObservations: ProviderUsageObservation[] = receipts.flatMap((receipt) => {
    if (receipt.providerCallObservations?.length) return receipt.providerCallObservations;
    return [
      {
        inputTokens: receipt.inputTokens,
        outputTokens: receipt.outputTokens,
        cacheReadTokens: receipt.cacheReadTokens,
        cacheWriteTokens: receipt.cacheWriteTokens,
        cacheWrite1hTokens: receipt.cacheWrite1hTokens,
        reasoningTokens: receipt.reasoningTokens,
        ...(receipt.provider ? { provider: receipt.provider } : {}),
        ...(receipt.model ? { model: receipt.model } : {}),
        ...(receipt.providerCostDollars !== undefined
          ? { costDollars: receipt.providerCostDollars }
          : {}),
      },
    ];
  });
  const recordedCosts = receipts
    .map((receipt) => receipt.providerCostDollars)
    .filter((cost): cost is number => cost !== undefined);
  return {
    providerCalls: counter.parse(row.provider_calls),
    inputTokens: counter.parse(row.input_tokens),
    outputTokens: counter.parse(row.output_tokens),
    cacheReadTokens: counter.parse(row.cache_read_tokens),
    cacheWriteTokens: counter.parse(row.cache_write_tokens),
    cacheWrite1hTokens: counter.parse(row.cache_write_1h_tokens),
    reasoningTokens: counter.parse(row.reasoning_tokens),
    ...(providerCallObservations.length > 0 ? { providerCallObservations } : {}),
    ...(recordedCosts.length > 0
      ? { providerCostDollars: recordedCosts.reduce((total, cost) => total + cost, 0) }
      : {}),
  };
}
