import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type {
  ManagedMediaImageAspectRatio,
  ManagedMediaImageOperation,
} from '@agiworkforce/cloud-contracts';

import {
  mediaJobDiagnostics,
  recordMediaAttempt,
  recordMediaGeneration,
  recordMediaPoll,
  type MediaAttemptOutcome,
  type MediaGenerationOutcome,
  type MediaJobDiagnosticsRecord,
} from '@/lib/observability/media-telemetry';

export type ImageJobProvider = 'openai' | 'google';
export type ImageJobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'canceled';
export type ImageJobSourceSurface = 'web' | 'mobile' | 'desktop' | 'cli';

export interface ImageGenerationPlan {
  aspectRatio: ManagedMediaImageAspectRatio;
  quality: string;
  legacySize: string;
  style?: string;
  negativePrompt?: string;
  transparentBackground: boolean;
  sourceAssetId?: string;
  maskAssetId?: string;
}

export interface ImageGenerationJob {
  id: string;
  userId: string;
  organizationId: string | null;
  conversationId: string | null;
  idempotencyKey: string;
  requestHash: string;
  billingLeaseToken: string;
  provider: ImageJobProvider;
  model: string;
  operation: ManagedMediaImageOperation;
  prompt: string;
  plan: ImageGenerationPlan;
  sourceImageSha256: string | null;
  maskImageSha256: string | null;
  imageCount: number;
  sourceSurface: ImageJobSourceSurface;
  estimatedCostMicrousd: number;
  actualCostMicrousd: number | null;
  status: ImageJobStatus;
  attempts: number;
  maxAttempts: number;
  attemptStartedAt: string | null;
  retryable: boolean;
  publicError: string | null;
  cancelRequestedAt: string | null;
  billingOutcome: 'completed' | 'released' | null;
  billingSettlementStatus: 'succeeded' | 'pending' | 'terminal' | null;
  nextAttemptAt: string;
  claimToken: string | null;
  claimExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  terminalAt: string | null;
}

type ImageGenerationJobRow = Record<string, unknown>;

const JOB_COLUMNS = `
  id, user_id, organization_id, conversation_id, idempotency_key, request_hash,
  billing_lease_token, provider, model, operation, prompt, plan,
  source_image_sha256, mask_image_sha256, image_count, source_surface,
  estimated_cost_microusd, actual_cost_microusd, status, attempts, max_attempts,
  attempt_started_at, retryable, public_error, cancel_requested_at,
  billing_outcome, billing_settlement_status, next_attempt_at, claim_token,
  claim_expires_at, created_at, updated_at, terminal_at
`;

export const IMAGE_JOB_MAX_ATTEMPTS = 3;
export const IMAGE_JOB_CLAIM_SECONDS = 180;
export const IMAGE_JOB_LEASE_SECONDS = 3600;

function timestamp(value: unknown): string {
  return new Date(value as string | number | Date).toISOString();
}

function epoch(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function imageJobDiagnostics(job: ImageGenerationJob): MediaJobDiagnosticsRecord {
  return mediaJobDiagnostics({
    media: 'image',
    jobId: job.id,
    status: job.status,
    provider: job.provider,
    model: job.model,
    attempt: job.attempts,
    maxAttempts: job.maxAttempts,
    ...(epoch(job.createdAt) === undefined ? {} : { createdAtMs: epoch(job.createdAt) }),
    ...(epoch(job.terminalAt) === undefined ? {} : { settledAtMs: epoch(job.terminalAt) }),
  });
}

function reportImageAttempt(job: ImageGenerationJob, outcome: MediaAttemptOutcome): void {
  const startedAt = epoch(job.attemptStartedAt);
  recordMediaAttempt({
    media: 'image',
    outcome,
    attempt: job.attempts,
    provider: job.provider,
    model: job.model,
    ...(outcome === 'started' || startedAt === undefined
      ? {}
      : { latencyMs: Date.now() - startedAt }),
  });
}

function reportImageGeneration(job: ImageGenerationJob, outcome: MediaGenerationOutcome): void {
  const diagnostics = imageJobDiagnostics(job);
  recordMediaGeneration({
    media: 'image',
    outcome,
    provider: job.provider,
    model: job.model,
    surface: job.sourceSurface,
    mode: job.plan.sourceAssetId ? 'edit' : 'async',
    ...(diagnostics.latencyMs === undefined ? {} : { latencyMs: diagnostics.latencyMs }),
  });
}

function nullableTimestamp(value: unknown): string | null {
  return value == null ? null : timestamp(value);
}

function parsePlan(value: unknown): ImageGenerationPlan {
  const plan = (
    typeof value === 'string' ? JSON.parse(value) : value
  ) as Partial<ImageGenerationPlan> | null;
  return {
    aspectRatio: (plan?.aspectRatio ?? '1:1') as ManagedMediaImageAspectRatio,
    quality: plan?.quality ?? 'standard',
    legacySize: plan?.legacySize ?? '1024x1024',
    transparentBackground: plan?.transparentBackground === true,
    ...(plan?.style ? { style: plan.style } : {}),
    ...(plan?.negativePrompt ? { negativePrompt: plan.negativePrompt } : {}),
    ...(plan?.sourceAssetId ? { sourceAssetId: plan.sourceAssetId } : {}),
    ...(plan?.maskAssetId ? { maskAssetId: plan.maskAssetId } : {}),
  };
}

function mapImageGenerationJob(row: ImageGenerationJobRow): ImageGenerationJob {
  return {
    id: String(row['id']),
    userId: String(row['user_id']),
    organizationId: row['organization_id'] == null ? null : String(row['organization_id']),
    conversationId: row['conversation_id'] == null ? null : String(row['conversation_id']),
    idempotencyKey: String(row['idempotency_key']),
    requestHash: String(row['request_hash']),
    billingLeaseToken: String(row['billing_lease_token']),
    provider: String(row['provider']) as ImageJobProvider,
    model: String(row['model']),
    operation: String(row['operation']) as ManagedMediaImageOperation,
    prompt: String(row['prompt']),
    plan: parsePlan(row['plan']),
    sourceImageSha256:
      row['source_image_sha256'] == null ? null : String(row['source_image_sha256']),
    maskImageSha256: row['mask_image_sha256'] == null ? null : String(row['mask_image_sha256']),
    imageCount: Number(row['image_count']),
    sourceSurface: String(row['source_surface']) as ImageJobSourceSurface,
    estimatedCostMicrousd: Number(row['estimated_cost_microusd']),
    actualCostMicrousd:
      row['actual_cost_microusd'] == null ? null : Number(row['actual_cost_microusd']),
    status: String(row['status']) as ImageJobStatus,
    attempts: Number(row['attempts']),
    maxAttempts: Number(row['max_attempts']),
    attemptStartedAt: nullableTimestamp(row['attempt_started_at']),
    retryable: row['retryable'] === true,
    publicError: row['public_error'] == null ? null : String(row['public_error']),
    cancelRequestedAt: nullableTimestamp(row['cancel_requested_at']),
    billingOutcome:
      row['billing_outcome'] == null
        ? null
        : (String(row['billing_outcome']) as ImageGenerationJob['billingOutcome']),
    billingSettlementStatus:
      row['billing_settlement_status'] == null
        ? null
        : (String(
            row['billing_settlement_status'],
          ) as ImageGenerationJob['billingSettlementStatus']),
    nextAttemptAt: timestamp(row['next_attempt_at']),
    claimToken: row['claim_token'] == null ? null : String(row['claim_token']),
    claimExpiresAt: nullableTimestamp(row['claim_expires_at']),
    createdAt: timestamp(row['created_at']),
    updatedAt: timestamp(row['updated_at']),
    terminalAt: nullableTimestamp(row['terminal_at']),
  };
}

async function queryJob(
  db: DatabaseAdapter,
  sql: string,
  params: unknown[],
): Promise<ImageGenerationJob | null> {
  const rows = await db.query<ImageGenerationJobRow>(sql, params);
  return rows[0] ? mapImageGenerationJob(rows[0]) : null;
}

/**
 * Whether 0226 is applied. Image generation predates the durable job model and
 * is live on every surface, so an unapplied migration degrades the request to
 * the synchronous path rather than taking the capability down; only a caller
 * that explicitly asked for a job handle is refused.
 */
export async function isImageJobStoreReady(db: DatabaseAdapter): Promise<boolean> {
  const rows = await db.query<{ provisioned: boolean }>(
    `select to_regclass('public.image_generation_jobs') is not null
        and to_regclass('public.image_generation_job_assets') is not null as provisioned`,
  );
  return rows[0]?.provisioned === true;
}

export async function createImageGenerationJob(input: {
  db: DatabaseAdapter;
  id: string;
  userId: string;
  organizationId: string | null;
  conversationId?: string | null;
  idempotencyKey: string;
  requestHash: string;
  billingLeaseToken: string;
  provider: ImageJobProvider;
  model: string;
  operation: ManagedMediaImageOperation;
  prompt: string;
  plan: ImageGenerationPlan;
  sourceImageSha256?: string | null;
  maskImageSha256?: string | null;
  imageCount: number;
  sourceSurface: ImageJobSourceSurface;
  estimatedCostMicrousd: number;
  maxAttempts?: number;
}): Promise<ImageGenerationJob> {
  const job = await queryJob(
    input.db,
    `insert into public.image_generation_jobs (
       id, user_id, organization_id, conversation_id, idempotency_key, request_hash,
       billing_lease_token, provider, model, operation, prompt, plan,
       source_image_sha256, mask_image_sha256, image_count, source_surface,
       estimated_cost_microusd, max_attempts
     ) values (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15, $16, $17, $18
     )
     returning ${JOB_COLUMNS}`,
    [
      input.id,
      input.userId,
      input.organizationId,
      input.conversationId ?? null,
      input.idempotencyKey,
      input.requestHash,
      input.billingLeaseToken,
      input.provider,
      input.model,
      input.operation,
      input.prompt,
      JSON.stringify(input.plan),
      input.sourceImageSha256 ?? null,
      input.maskImageSha256 ?? null,
      input.imageCount,
      input.sourceSurface,
      input.estimatedCostMicrousd,
      input.maxAttempts ?? IMAGE_JOB_MAX_ATTEMPTS,
    ],
  );
  if (!job) throw new Error('Image generation job was not persisted.');
  reportImageGeneration(job, 'accepted');
  return job;
}

export function getImageGenerationJob(
  db: DatabaseAdapter,
  jobId: string,
  userId: string,
): Promise<ImageGenerationJob | null> {
  return queryJob(
    db,
    `select ${JOB_COLUMNS}
       from public.image_generation_jobs
      where id = $1 and user_id = $2
      limit 1`,
    [jobId, userId],
  );
}

export function getImageGenerationJobByIdempotencyKey(
  db: DatabaseAdapter,
  userId: string,
  idempotencyKey: string,
): Promise<ImageGenerationJob | null> {
  return queryJob(
    db,
    `select ${JOB_COLUMNS}
       from public.image_generation_jobs
      where user_id = $1 and idempotency_key = $2
      limit 1`,
    [userId, idempotencyKey],
  );
}

export async function listImageGenerationJobAssetIds(
  db: DatabaseAdapter,
  jobId: string,
): Promise<string[]> {
  const rows = await db.query<{ asset_id: string }>(
    `select asset_id
       from public.image_generation_job_assets
      where job_id = $1
      order by candidate_index`,
    [jobId],
  );
  return rows.map((row) => String(row.asset_id));
}

/**
 * Take the single right to run the next attempt.
 *
 * The claim is the update itself: a lapsed claim is what lets a later status
 * poll pick up work an interrupted request abandoned, and a live claim is what
 * stops two of them running the same paid attempt at once.
 */
export async function claimImageGenerationJobAttempt(input: {
  db: DatabaseAdapter;
  jobId: string;
  userId: string;
  claimToken: string;
  claimSeconds?: number;
}): Promise<ImageGenerationJob | null> {
  const claimed = await queryJob(
    input.db,
    `update public.image_generation_jobs
        set status = 'processing',
            attempts = attempts + 1,
            attempt_started_at = now(),
            retryable = false,
            claim_token = $3,
            claim_expires_at = now() + make_interval(secs => $4),
            updated_at = now()
      where id = $1
        and user_id = $2
        and status in ('queued', 'processing', 'failed')
        and terminal_at is null
        and cancel_requested_at is null
        and attempts < max_attempts
        and next_attempt_at <= now()
        and (claim_expires_at is null or claim_expires_at <= now())
      returning ${JOB_COLUMNS}`,
    [
      input.jobId,
      input.userId,
      input.claimToken,
      Math.max(30, Math.min(Math.trunc(input.claimSeconds ?? IMAGE_JOB_CLAIM_SECONDS), 600)),
    ],
  );
  recordMediaPoll({ media: 'image', outcome: claimed ? 'claimed' : 'pending' });
  if (claimed) reportImageAttempt(claimed, 'started');
  return claimed;
}

// Parks the attempt without settling the reservation, so the next attempt costs nothing.
export async function deferImageGenerationJobFailure(input: {
  db: DatabaseAdapter;
  jobId: string;
  claimToken: string;
  publicError: string;
  retryAfterSeconds: number;
}): Promise<ImageGenerationJob> {
  const job = await queryJob(
    input.db,
    `update public.image_generation_jobs
        set status = 'failed',
            retryable = true,
            public_error = left($3, 500),
            next_attempt_at = now() + make_interval(secs => $4),
            claim_token = null,
            claim_expires_at = null,
            updated_at = now()
      where id = $1
        and claim_token = $2
        and claim_expires_at > now()
        and status = 'processing'
        and attempts < max_attempts
      returning ${JOB_COLUMNS}`,
    [
      input.jobId,
      input.claimToken,
      input.publicError,
      Math.max(1, Math.min(Math.trunc(input.retryAfterSeconds), 600)),
    ],
  );
  if (!job) throw new Error('Image attempt claim was lost before it could be deferred.');
  reportImageAttempt(job, 'deferred');
  return job;
}

export async function failImageGenerationJob(input: {
  db: DatabaseAdapter;
  jobId: string;
  claimToken: string;
  publicError: string;
  billingOutcome: 'released' | null;
  billingSettlementStatus: 'succeeded' | 'pending' | 'terminal' | null;
}): Promise<ImageGenerationJob> {
  const job = await queryJob(
    input.db,
    `update public.image_generation_jobs
        set status = 'failed',
            retryable = false,
            public_error = left($3, 500),
            billing_outcome = $4,
            billing_settlement_status = $5,
            claim_token = null,
            claim_expires_at = null,
            terminal_at = now(),
            updated_at = now()
      where id = $1
        and claim_token = $2
        and claim_expires_at > now()
        and status = 'processing'
      returning ${JOB_COLUMNS}`,
    [
      input.jobId,
      input.claimToken,
      input.publicError,
      input.billingOutcome,
      input.billingSettlementStatus,
    ],
  );
  if (!job) throw new Error('Image attempt claim was lost before the failure was recorded.');
  reportImageAttempt(job, 'failed');
  reportImageGeneration(job, 'failed');
  return job;
}

/**
 * Bind the delivered candidates to the job and close it in one transaction, so
 * a completed job can never claim images the library does not hold.
 */
export async function completeImageGenerationJob(input: {
  db: DatabaseAdapter;
  jobId: string;
  claimToken: string;
  assetIds: readonly string[];
  actualCostMicrousd: number;
  billingSettlementStatus: 'succeeded' | 'pending' | 'terminal' | null;
}): Promise<ImageGenerationJob> {
  if (input.assetIds.length === 0) {
    throw new Error('A completed image job requires at least one delivered asset.');
  }
  const job = await input.db.transaction(async (tx) => {
    const closed = await queryJob(
      tx,
      `update public.image_generation_jobs
          set status = 'completed',
              retryable = false,
              public_error = null,
              actual_cost_microusd = $3,
              billing_outcome = 'completed',
              billing_settlement_status = $4,
              claim_token = null,
              claim_expires_at = null,
              terminal_at = now(),
              updated_at = now()
        where id = $1
          and claim_token = $2
          and claim_expires_at > now()
          and status = 'processing'
        returning ${JOB_COLUMNS}`,
      [input.jobId, input.claimToken, input.actualCostMicrousd, input.billingSettlementStatus],
    );
    if (!closed) throw new Error('Image attempt claim was lost before delivery was recorded.');

    for (const [candidateIndex, assetId] of input.assetIds.entries()) {
      await tx.execute(
        `insert into public.image_generation_job_assets (
           job_id, candidate_index, asset_id, user_id, organization_id
         ) values ($1, $2, $3, $4, $5)
         on conflict (job_id, candidate_index) do nothing`,
        [input.jobId, candidateIndex, assetId, closed.userId, closed.organizationId],
      );
    }
    return closed;
  });
  if (!job) throw new Error('Image job completion was not persisted.');
  reportImageAttempt(job, 'completed');
  reportImageGeneration(job, 'completed');
  return job;
}

/**
 * Re-queue a retryable failure for the same reservation. Returns null when the
 * job is terminal, out of attempts or already running, so the caller can say
 * why instead of silently doing nothing.
 */
export function requeueImageGenerationJob(input: {
  db: DatabaseAdapter;
  jobId: string;
  userId: string;
}): Promise<ImageGenerationJob | null> {
  return queryJob(
    input.db,
    `update public.image_generation_jobs
        set status = 'queued',
            next_attempt_at = now(),
            claim_token = null,
            claim_expires_at = null,
            updated_at = now()
      where id = $1
        and user_id = $2
        and status = 'failed'
        and retryable
        and terminal_at is null
        and cancel_requested_at is null
        and attempts < max_attempts
      returning ${JOB_COLUMNS}`,
    [input.jobId, input.userId],
  );
}

export function requestImageGenerationCancellation(input: {
  db: DatabaseAdapter;
  jobId: string;
  userId: string;
}): Promise<ImageGenerationJob | null> {
  return queryJob(
    input.db,
    `update public.image_generation_jobs
        set cancel_requested_at = coalesce(cancel_requested_at, now()),
            updated_at = now()
      where id = $1
        and user_id = $2
        and terminal_at is null
      returning ${JOB_COLUMNS}`,
    [input.jobId, input.userId],
  );
}

/**
 * Close a cancelled job that no attempt currently holds. An attempt in flight
 * keeps its claim; the executor sees cancel_requested_at and closes it itself,
 * because the provider call it already paid for cannot be un-made from here.
 */
export async function closeCancelledImageGenerationJob(input: {
  db: DatabaseAdapter;
  jobId: string;
  userId: string;
  billingOutcome: 'released' | null;
  billingSettlementStatus: 'succeeded' | 'pending' | 'terminal' | null;
}): Promise<ImageGenerationJob | null> {
  const job = await queryJob(
    input.db,
    `update public.image_generation_jobs
        set status = 'canceled',
            retryable = false,
            billing_outcome = $3,
            billing_settlement_status = $4,
            claim_token = null,
            claim_expires_at = null,
            terminal_at = now(),
            updated_at = now()
      where id = $1
        and user_id = $2
        and cancel_requested_at is not null
        and terminal_at is null
        and (claim_expires_at is null or claim_expires_at <= now())
      returning ${JOB_COLUMNS}`,
    [input.jobId, input.userId, input.billingOutcome, input.billingSettlementStatus],
  );
  if (job) reportImageGeneration(job, 'canceled');
  return job;
}

export async function listDueImageGenerationJobIds(
  db: DatabaseAdapter,
  userId: string,
  limit = 10,
): Promise<string[]> {
  const boundedLimit = Math.max(1, Math.min(Math.trunc(limit), 50));
  const rows = await db.query<{ id: string }>(
    `select id
       from public.image_generation_jobs
      where user_id = $1
        and terminal_at is null
        and attempts < max_attempts
        and next_attempt_at <= now()
        and (claim_expires_at is null or claim_expires_at <= now())
      order by next_attempt_at, created_at
      limit $2`,
    [userId, boundedLimit],
  );
  return rows.map((row) => String(row.id));
}

/** True while another attempt can still run, which is what "Try again" needs. */
export function isImageGenerationJobRetryable(job: ImageGenerationJob): boolean {
  return (
    job.status === 'failed' &&
    job.retryable &&
    job.terminalAt === null &&
    job.cancelRequestedAt === null &&
    job.attempts < job.maxAttempts
  );
}
