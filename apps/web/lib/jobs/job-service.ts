import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  DEFAULT_DATA_REGION,
  normaliseDataRegion,
  type DataRegionId,
} from '@agiworkforce/compliance';

import { withTraceCarrier } from '@/lib/observability/trace-propagation';

import {
  JOB_QUEUE_NAMES,
  JOB_QUEUE_POLICIES,
  computeJobBackoffSeconds,
  isJobQueueName,
  queueForJobKind,
  type JobKind,
  type JobQueueName,
} from './job-queues';

const MAX_CLAIM_BATCH = 100;
const CANDIDATE_POOL_PER_QUEUE = 500;
const MAX_ERROR_LENGTH = 2_000;
const MAX_LIST_PAGE = 100;
const MAX_PRUNE_BATCH = 500;
const CLAIM_LOCK_KEY = 'background-jobs-claim';

export type BackgroundJobStatus = 'queued' | 'running' | 'succeeded' | 'dead' | 'cancelled';

export interface BackgroundJob {
  id: string;
  queue: JobQueueName;
  kind: string;
  userId: string | null;
  organizationId: string | null;
  tenantKey: string;
  payload: Record<string, unknown>;
  priority: number;
  status: BackgroundJobStatus;
  attempts: number;
  maxAttempts: number;
  runAfter: string;
  leaseExpiresAt: string | null;
  idempotencyKey: string | null;
  lastError: string | null;
  deadReason: string | null;
  deadLetteredAt: string | null;
  /** Stamped from the workspace's own pin at enqueue; null is the home region. */
  originRegion: DataRegionId | null;
  createdAt: string;
  updatedAt: string;
}

interface JobRow extends Record<string, unknown> {
  id: string;
  queue: string;
  kind: string;
  user_id: string | null;
  organization_id: string | null;
  tenant_key: string;
  payload: Record<string, unknown> | null;
  priority: number;
  status: BackgroundJobStatus;
  attempts: number;
  max_attempts: number;
  run_after: string | Date;
  lease_expires_at: string | Date | null;
  idempotency_key: string | null;
  last_error: string | null;
  dead_reason: string | null;
  dead_lettered_at: string | Date | null;
  origin_region: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

const JOB_COLUMNS = `id, queue, kind, user_id, organization_id, tenant_key, payload, priority, status,
  attempts, max_attempts, run_after, lease_expires_at, idempotency_key, last_error, dead_reason,
  dead_lettered_at, origin_region, created_at, updated_at`;

export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentJobError';
  }
}

function iso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapJob(row: JobRow): BackgroundJob {
  if (!isJobQueueName(row.queue)) throw new Error(`Unknown job queue: ${row.queue}`);
  return {
    id: row.id,
    queue: row.queue,
    kind: row.kind,
    userId: row.user_id,
    organizationId: row.organization_id,
    tenantKey: row.tenant_key,
    payload: row.payload ?? {},
    priority: Number(row.priority),
    status: row.status,
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    runAfter: iso(row.run_after) ?? '',
    leaseExpiresAt: iso(row.lease_expires_at),
    idempotencyKey: row.idempotency_key,
    lastError: row.last_error,
    deadReason: row.dead_reason,
    deadLetteredAt: iso(row.dead_lettered_at),
    originRegion: normaliseDataRegion(row.origin_region),
    createdAt: iso(row.created_at) ?? '',
    updatedAt: iso(row.updated_at) ?? '',
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function boundedError(message: string): string {
  const trimmed = message.trim() || 'Unknown error';
  return trimmed.slice(0, MAX_ERROR_LENGTH);
}

export interface EnqueueJobInput {
  kind: JobKind;
  payload: Record<string, unknown>;
  userId?: string | null;
  organizationId?: string | null;
  priority?: number;
  idempotencyKey?: string | null;
  runAfter?: Date | null;
  maxAttempts?: number;
  /** Omitted, the workspace's own pin decides, which a caller cannot get wrong. */
  originRegion?: DataRegionId | null;
}

export interface EnqueuedJob {
  id: string;
  status: BackgroundJobStatus;
  created: boolean;
}

export async function enqueueJob(
  db: DatabaseAdapter,
  input: EnqueueJobInput,
): Promise<EnqueuedJob> {
  const queue = queueForJobKind(input.kind);
  const policy = JOB_QUEUE_POLICIES[queue];
  const idempotencyKey = input.idempotencyKey?.trim() || null;
  if (idempotencyKey !== null && (idempotencyKey.length < 8 || idempotencyKey.length > 255)) {
    throw new Error('Job idempotency key must be 8-255 characters');
  }
  const maxAttempts = clamp(input.maxAttempts ?? policy.maxAttempts, 1, 50);
  const priority = clamp(input.priority ?? 0, -100, 100);
  const runAfter = input.runAfter ?? null;

  const [inserted] = await db.query<{ id: string; status: BackgroundJobStatus }>(
    `insert into public.background_jobs (
       queue, kind, user_id, organization_id, payload, priority, max_attempts,
       run_after, idempotency_key, origin_region
     ) values (
       $1, $2, $3, $4, $5::jsonb, $6, $7, coalesce($8::timestamptz, now()), $9,
       coalesce(
         $10::text,
         (select o.data_region from public.organizations o where o.id = $4::uuid),
         $11::text
       )
     )
     on conflict (queue, idempotency_key) where idempotency_key is not null do nothing
     returning id, status`,
    [
      queue,
      input.kind,
      input.userId ?? null,
      input.organizationId ?? null,
      JSON.stringify(withTraceCarrier(input.payload)),
      priority,
      maxAttempts,
      runAfter ? runAfter.toISOString() : null,
      idempotencyKey,
      input.originRegion ?? null,
      DEFAULT_DATA_REGION,
    ],
  );
  if (inserted) return { id: inserted.id, status: inserted.status, created: true };

  const [existing] = await db.query<{ id: string; status: BackgroundJobStatus }>(
    `select id, status from public.background_jobs
      where queue = $1 and idempotency_key = $2
        and (user_id is not distinct from $3)
      limit 1`,
    [queue, idempotencyKey, input.userId ?? null],
  );
  if (!existing) throw new Error('Job enqueue conflicted with a job owned by another subject');
  return { id: existing.id, status: existing.status, created: false };
}

export interface ClaimJobsOptions {
  queues?: readonly JobQueueName[];
  limit: number;
  /**
   * Named, the drain claims only work that originated there: a job carried out
   * in another jurisdiction has left the region its workspace was promised.
   */
  region?: DataRegionId | null;
}

export async function claimJobs(
  db: DatabaseAdapter,
  options: ClaimJobsOptions,
): Promise<BackgroundJob[]> {
  const queues = (options.queues ?? JOB_QUEUE_NAMES).filter(isJobQueueName);
  if (queues.length === 0) return [];
  const limit = clamp(options.limit, 1, MAX_CLAIM_BATCH);
  const concurrency = queues.map((queue) => JOB_QUEUE_POLICIES[queue].maxConcurrency);
  const leases = queues.map((queue) => JOB_QUEUE_POLICIES[queue].leaseSeconds);

  return db.transaction(async (tx) => {
    await tx.query(`select pg_advisory_xact_lock(hashtext($1))`, [CLAIM_LOCK_KEY]);
    const rows = await tx.query<JobRow>(
      `with policy as (
         select *
           from unnest($1::text[], $2::int[], $3::int[])
             as policy(queue, max_concurrency, lease_seconds)
       ), slots as (
         select policy.queue,
                policy.lease_seconds,
                policy.max_concurrency - (
                  select count(*)::int
                    from public.background_jobs as running
                   where running.queue = policy.queue
                     and running.status = 'running'
                ) as available
           from policy
       ), pool as (
         select candidate.id, candidate.queue, candidate.tenant_key,
                candidate.priority, candidate.run_after
           from slots
           cross join lateral (
             select job.id, job.queue, job.tenant_key, job.priority, job.run_after
               from public.background_jobs as job
              where job.queue = slots.queue
                and job.status = 'queued'
                and job.run_after <= now()
                and (
                  $6::text is null
                  or coalesce(job.origin_region, $7::text) = $6::text
                )
              order by job.priority desc, job.run_after asc, job.id asc
              limit $4
           ) as candidate
          where slots.available > 0
       ), tenant_ranked as (
         select pool.*,
                row_number() over (
                  partition by pool.queue, pool.tenant_key
                  order by pool.priority desc, pool.run_after asc, pool.id asc
                ) as tenant_turn
           from pool
       ), queue_ranked as (
         select tenant_ranked.*,
                row_number() over (
                  partition by tenant_ranked.queue
                  order by tenant_ranked.tenant_turn asc, tenant_ranked.priority desc,
                           tenant_ranked.run_after asc, tenant_ranked.id asc
                ) as queue_turn
           from tenant_ranked
       ), picked as (
         select queue_ranked.id
           from queue_ranked
           join slots on slots.queue = queue_ranked.queue
          where queue_ranked.queue_turn <= slots.available
          order by queue_ranked.tenant_turn asc, queue_ranked.priority desc,
                   queue_ranked.run_after asc, queue_ranked.id asc
          limit $5
       ), locked as (
         select job.id, job.queue
           from public.background_jobs as job
          where job.id in (select picked.id from picked)
            and job.status = 'queued'
          for update skip locked
       )
       update public.background_jobs as job
          set status = 'running',
              attempts = job.attempts + 1,
              lease_expires_at = now() + make_interval(secs => slots.lease_seconds),
              started_at = now(),
              updated_at = now()
         from locked
         join slots on slots.queue = locked.queue
        where job.id = locked.id
       returning job.id, job.queue, job.kind, job.user_id, job.organization_id, job.tenant_key,
                 job.payload, job.priority, job.status, job.attempts, job.max_attempts,
                 job.run_after, job.lease_expires_at, job.idempotency_key, job.last_error,
                 job.dead_reason, job.dead_lettered_at, job.origin_region, job.created_at,
                 job.updated_at`,
      [
        queues,
        concurrency,
        leases,
        CANDIDATE_POOL_PER_QUEUE,
        limit,
        options.region ?? null,
        DEFAULT_DATA_REGION,
      ],
    );
    return rows.map(mapJob).sort((left, right) => right.priority - left.priority);
  });
}

export async function completeJob(
  db: DatabaseAdapter,
  job: Pick<BackgroundJob, 'id' | 'attempts'>,
  result: Record<string, unknown> | null = null,
): Promise<boolean> {
  const affected = await db.execute(
    `update public.background_jobs
        set status = 'succeeded', result = $2::jsonb, lease_expires_at = null,
            last_error = null, completed_at = now(), updated_at = now()
      where id = $1 and status = 'running' and attempts = $3`,
    [job.id, JSON.stringify(result), job.attempts],
  );
  return affected === 1;
}

export type JobFailureOutcome = 'retry' | 'dead' | 'stale';

export async function failJob(
  db: DatabaseAdapter,
  job: Pick<BackgroundJob, 'id' | 'queue' | 'attempts' | 'maxAttempts'>,
  error: unknown,
  options: { random?: () => number } = {},
): Promise<JobFailureOutcome> {
  const message = boundedError(error instanceof Error ? error.message : String(error));
  const permanent = error instanceof PermanentJobError;
  const exhausted = job.attempts >= job.maxAttempts;

  if (permanent || exhausted) {
    const reason = permanent
      ? `Permanent failure: ${message}`
      : `Gave up after ${job.attempts} attempts: ${message}`;
    const affected = await db.execute(
      `update public.background_jobs
          set status = 'dead', last_error = $2, dead_reason = $3, dead_lettered_at = now(),
              lease_expires_at = null, completed_at = now(), updated_at = now()
        where id = $1 and status = 'running' and attempts = $4`,
      [job.id, message, boundedError(reason), job.attempts],
    );
    return affected === 1 ? 'dead' : 'stale';
  }

  const delaySeconds = computeJobBackoffSeconds(
    JOB_QUEUE_POLICIES[job.queue],
    job.attempts,
    options.random,
  );
  const affected = await db.execute(
    `update public.background_jobs
        set status = 'queued', last_error = $2,
            run_after = now() + make_interval(secs => $3),
            lease_expires_at = null, updated_at = now()
      where id = $1 and status = 'running' and attempts = $4`,
    [job.id, message, delaySeconds, job.attempts],
  );
  return affected === 1 ? 'retry' : 'stale';
}

export interface ReapSummary {
  requeued: number;
  deadLettered: number;
}

export async function reapExpiredJobLeases(db: DatabaseAdapter): Promise<ReapSummary> {
  let requeued = 0;
  let deadLettered = 0;
  for (const queue of JOB_QUEUE_NAMES) {
    const policy = JOB_QUEUE_POLICIES[queue];
    deadLettered += await db.execute(
      `update public.background_jobs
          set status = 'dead',
              last_error = 'Worker lease expired before the job reported a result',
              dead_reason = 'Gave up after ' || attempts || ' attempts: the worker lease expired on the final attempt',
              dead_lettered_at = now(), lease_expires_at = null,
              completed_at = now(), updated_at = now()
        where queue = $1 and status = 'running' and lease_expires_at < now()
          and attempts >= max_attempts`,
      [queue],
    );
    requeued += await db.execute(
      `update public.background_jobs
          set status = 'queued',
              last_error = 'Worker lease expired before the job reported a result',
              run_after = now() + make_interval(
                secs => least($3::double precision, $2::double precision * power(2, greatest(attempts - 1, 0)))
              ),
              lease_expires_at = null, updated_at = now()
        where queue = $1 and status = 'running' and lease_expires_at < now()
          and attempts < max_attempts`,
      [queue, policy.backoffBaseSeconds, policy.backoffMaxSeconds],
    );
  }
  return { requeued, deadLettered };
}

export async function pruneFinishedJobs(db: DatabaseAdapter): Promise<number> {
  let pruned = 0;
  for (const queue of JOB_QUEUE_NAMES) {
    pruned += await db.execute(
      `delete from public.background_jobs
        where id in (
          select id from public.background_jobs
           where queue = $1
             and status in ('succeeded', 'cancelled')
             and completed_at < now() - make_interval(days => $2)
           order by completed_at asc
           limit $3
        )`,
      [queue, JOB_QUEUE_POLICIES[queue].retainFinishedDays, MAX_PRUNE_BATCH],
    );
  }
  return pruned;
}

export interface JobQueueStats {
  queue: JobQueueName;
  queued: number;
  running: number;
  dead: number;
  maxConcurrency: number;
  oldestQueuedAt: string | null;
}

export async function readJobQueueStats(db: DatabaseAdapter): Promise<JobQueueStats[]> {
  const rows = await db.query<{
    queue: string;
    queued: string;
    running: string;
    dead: string;
    oldest_queued_at: string | Date | null;
  }>(
    `select queue,
            count(*) filter (where status = 'queued')::text as queued,
            count(*) filter (where status = 'running')::text as running,
            count(*) filter (where status = 'dead')::text as dead,
            min(run_after) filter (where status = 'queued') as oldest_queued_at
       from public.background_jobs
      where status in ('queued', 'running', 'dead')
      group by queue`,
    [],
  );
  const byQueue = new Map(rows.map((row) => [row.queue, row]));
  return JOB_QUEUE_NAMES.map((queue) => {
    const row = byQueue.get(queue);
    return {
      queue,
      queued: Number(row?.queued ?? 0),
      running: Number(row?.running ?? 0),
      dead: Number(row?.dead ?? 0),
      maxConcurrency: JOB_QUEUE_POLICIES[queue].maxConcurrency,
      oldestQueuedAt: iso(row?.oldest_queued_at ?? null),
    };
  });
}

export async function listDeadJobs(
  db: DatabaseAdapter,
  page: { limit: number; offset: number; queue?: JobQueueName | null },
): Promise<BackgroundJob[]> {
  const rows = await db.query<JobRow>(
    `select ${JOB_COLUMNS}
       from public.background_jobs
      where status = 'dead'
        and ($1::text is null or queue = $1)
      order by dead_lettered_at desc, id desc
      limit $2 offset $3`,
    [page.queue ?? null, clamp(page.limit, 1, MAX_LIST_PAGE), clamp(page.offset, 0, 10_000)],
  );
  return rows.map(mapJob);
}

export async function retryDeadJob(db: DatabaseAdapter, jobId: string): Promise<boolean> {
  const affected = await db.execute(
    `update public.background_jobs
        set status = 'queued', attempts = 0, run_after = now(), dead_reason = null,
            dead_lettered_at = null, completed_at = null, updated_at = now()
      where id = $1 and status = 'dead'`,
    [jobId],
  );
  return affected === 1;
}
