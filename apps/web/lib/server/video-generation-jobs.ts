import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

export type VideoJobProvider = 'google' | 'runway' | 'openrouter';
export type VideoJobStatus =
  | 'submitting'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'outcome_unknown';
export type VideoJobResolution = '480p' | '720p' | '1080p' | '4k';
export type VideoJobAspectRatio = '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | '21:9';
export type VideoJobSourceSurface = 'web' | 'mobile' | 'desktop';

export interface VideoGenerationJob {
  id: string;
  userId: string;
  organizationId: string | null;
  conversationId?: string | null;
  assistantMessageId?: string | null;
  idempotencyKey: string;
  requestHash: string;
  billingLeaseToken: string;
  provider: VideoJobProvider;
  model: string;
  workflowRunId: string | null;
  providerTaskId: string | null;
  providerFailureCode?: string | null;
  prompt: string;
  durationSecs: number;
  resolution: VideoJobResolution;
  aspectRatio?: VideoJobAspectRatio;
  generateAudio?: boolean;
  sourceSurface: VideoJobSourceSurface;
  estimatedCostCents: number;
  actualCostCents?: number | null;
  estimatedDurationSecs: number;
  status: VideoJobStatus;
  providerStartedAt: string | null;
  cancelRequestedAt: string | null;
  providerCancelAttemptedAt: string | null;
  providerCancelAcknowledgedAt: string | null;
  cancelAttempts: number;
  cancelLastError: string | null;
  progress: number | null;
  assetId: string | null;
  publicError: string | null;
  billingOutcome: 'completed' | 'released' | 'outcome_unknown' | null;
  billingSettlementStatus?: 'succeeded' | 'pending' | 'terminal' | null;
  incidentAlertStatus?: 'pending' | 'delivered' | 'exhausted' | null;
  incidentAlertAttempts?: number;
  incidentAlertLastError?: string | null;
  incidentAlertClaimToken?: string | null;
  incidentAlertClaimExpiresAt?: string | null;
  reconcileFailures: number;
  nextAttemptAt: string;
  reconcileClaimToken: string | null;
  reconcileClaimExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  terminalAt: string | null;
}

export interface VideoSettlementIncident {
  id: string;
  alertStatus: 'pending' | 'delivered' | 'exhausted' | null;
  alertAttempts: number;
  alertLastError: string | null;
  alertClaimToken: string | null;
  alertClaimExpiresAt: string | null;
  completedAt: string | null;
}

type VideoGenerationJobRow = Record<string, unknown>;

const JOB_COLUMNS = `
  id, user_id, organization_id, conversation_id, assistant_message_id,
  idempotency_key, request_hash,
  billing_lease_token, provider, model, workflow_run_id, provider_task_id,
  provider_failure_code, prompt,
  duration_secs, resolution, aspect_ratio, generate_audio, source_surface,
  estimated_cost_cents, actual_cost_cents,
  estimated_duration_secs, status, provider_started_at, cancel_requested_at,
  provider_cancel_attempted_at, provider_cancel_acknowledged_at,
  cancel_attempts, cancel_last_error,
  progress, asset_id, public_error,
  billing_outcome, billing_settlement_status, incident_alert_status,
  incident_alert_attempts, incident_alert_last_error, incident_alert_claim_token,
  incident_alert_claim_expires_at,
  reconcile_failures, next_attempt_at,
  reconcile_claim_token, reconcile_claim_expires_at, created_at, updated_at,
  terminal_at
`;

function timestamp(value: unknown): string {
  return new Date(value as string | number | Date).toISOString();
}

function nullableTimestamp(value: unknown): string | null {
  return value == null ? null : timestamp(value);
}

function mapVideoGenerationJob(row: VideoGenerationJobRow): VideoGenerationJob {
  return {
    id: String(row['id']),
    userId: String(row['user_id']),
    organizationId: row['organization_id'] == null ? null : String(row['organization_id']),
    conversationId: row['conversation_id'] == null ? null : String(row['conversation_id']),
    assistantMessageId:
      row['assistant_message_id'] == null ? null : String(row['assistant_message_id']),
    idempotencyKey: String(row['idempotency_key']),
    requestHash: String(row['request_hash']),
    billingLeaseToken: String(row['billing_lease_token']),
    provider: String(row['provider']) as VideoJobProvider,
    model: String(row['model']),
    workflowRunId: row['workflow_run_id'] == null ? null : String(row['workflow_run_id']),
    providerTaskId: row['provider_task_id'] == null ? null : String(row['provider_task_id']),
    providerFailureCode:
      row['provider_failure_code'] == null ? null : String(row['provider_failure_code']),
    prompt: String(row['prompt']),
    durationSecs: Number(row['duration_secs']),
    resolution: String(row['resolution']) as VideoJobResolution,
    aspectRatio: String(row['aspect_ratio']) as VideoJobAspectRatio,
    generateAudio: row['generate_audio'] === true,
    sourceSurface: String(row['source_surface']) as VideoJobSourceSurface,
    estimatedCostCents: Number(row['estimated_cost_cents']),
    actualCostCents: row['actual_cost_cents'] == null ? null : Number(row['actual_cost_cents']),
    estimatedDurationSecs: Number(row['estimated_duration_secs']),
    status: String(row['status']) as VideoJobStatus,
    providerStartedAt: nullableTimestamp(row['provider_started_at']),
    cancelRequestedAt: nullableTimestamp(row['cancel_requested_at']),
    providerCancelAttemptedAt: nullableTimestamp(row['provider_cancel_attempted_at']),
    providerCancelAcknowledgedAt: nullableTimestamp(row['provider_cancel_acknowledged_at']),
    cancelAttempts: Number(row['cancel_attempts']),
    cancelLastError: row['cancel_last_error'] == null ? null : String(row['cancel_last_error']),
    progress: row['progress'] == null ? null : Number(row['progress']),
    assetId: row['asset_id'] == null ? null : String(row['asset_id']),
    publicError: row['public_error'] == null ? null : String(row['public_error']),
    billingOutcome:
      row['billing_outcome'] == null
        ? null
        : (String(row['billing_outcome']) as VideoGenerationJob['billingOutcome']),
    billingSettlementStatus:
      row['billing_settlement_status'] == null
        ? null
        : (String(
            row['billing_settlement_status'],
          ) as VideoGenerationJob['billingSettlementStatus']),
    incidentAlertStatus:
      row['incident_alert_status'] == null
        ? null
        : (String(row['incident_alert_status']) as VideoGenerationJob['incidentAlertStatus']),
    incidentAlertAttempts: Number(row['incident_alert_attempts']),
    incidentAlertLastError:
      row['incident_alert_last_error'] == null ? null : String(row['incident_alert_last_error']),
    incidentAlertClaimToken:
      row['incident_alert_claim_token'] == null ? null : String(row['incident_alert_claim_token']),
    incidentAlertClaimExpiresAt: nullableTimestamp(row['incident_alert_claim_expires_at']),
    reconcileFailures: Number(row['reconcile_failures']),
    nextAttemptAt: timestamp(row['next_attempt_at']),
    reconcileClaimToken:
      row['reconcile_claim_token'] == null ? null : String(row['reconcile_claim_token']),
    reconcileClaimExpiresAt: nullableTimestamp(row['reconcile_claim_expires_at']),
    createdAt: timestamp(row['created_at']),
    updatedAt: timestamp(row['updated_at']),
    terminalAt: nullableTimestamp(row['terminal_at']),
  };
}

function mapVideoSettlementIncident(row: VideoGenerationJobRow): VideoSettlementIncident {
  return {
    id: String(row['id']),
    alertStatus:
      row['video_incident_alert_status'] == null
        ? null
        : (String(row['video_incident_alert_status']) as VideoSettlementIncident['alertStatus']),
    alertAttempts: Number(row['video_incident_alert_attempts']),
    alertLastError:
      row['video_incident_alert_last_error'] == null
        ? null
        : String(row['video_incident_alert_last_error']),
    alertClaimToken:
      row['video_incident_alert_claim_token'] == null
        ? null
        : String(row['video_incident_alert_claim_token']),
    alertClaimExpiresAt: nullableTimestamp(row['video_incident_alert_claim_expires_at']),
    completedAt: nullableTimestamp(row['completed_at']),
  };
}

async function queryVideoSettlementIncident(
  db: DatabaseAdapter,
  sql: string,
  params: unknown[],
): Promise<VideoSettlementIncident | null> {
  const rows = await db.query<VideoGenerationJobRow>(sql, params);
  return rows[0] ? mapVideoSettlementIncident(rows[0]) : null;
}

async function queryJob(
  db: DatabaseAdapter,
  sql: string,
  params: unknown[],
): Promise<VideoGenerationJob | null> {
  const rows = await db.query<VideoGenerationJobRow>(sql, params);
  return rows[0] ? mapVideoGenerationJob(rows[0]) : null;
}

/**
 * Serialize the credit reservation -> durable job boundary with both account
 * and data-only erasure. The token expires so a crashed request cannot disable
 * video indefinitely; stale managed-usage recovery remains the reservation
 * owner after expiry.
 */
export async function acquireVideoGenerationAdmission(input: {
  db: DatabaseAdapter;
  userId: string;
  admissionToken: string;
  admissionSeconds?: number;
}): Promise<boolean> {
  const rows = await input.db.query<{ id: string }>(
    `update public.profiles
        set video_generation_admission_token = $2,
            video_generation_admission_expires_at = now() + make_interval(
              secs => greatest(60, least($3, 600))
            )
      where id = $1
        and deletion_requested_at is null
        and deletion_scheduled_for is null
        and (
          video_generation_erasure_fence_token is null
          or video_generation_erasure_fence_expires_at <= now()
        )
        and (
          video_generation_admission_token is null
          or video_generation_admission_expires_at <= now()
        )
      returning id`,
    [input.userId, input.admissionToken, input.admissionSeconds ?? 300],
  );
  return Boolean(rows[0]);
}

export async function releaseVideoGenerationAdmission(input: {
  db: DatabaseAdapter;
  userId: string;
  admissionToken: string;
}): Promise<void> {
  await input.db.execute(
    `update public.profiles
        set video_generation_admission_token = null,
            video_generation_admission_expires_at = null
      where id = $1
        and video_generation_admission_token = $2`,
    [input.userId, input.admissionToken],
  );
}

export async function createVideoGenerationJob(input: {
  db: DatabaseAdapter;
  id: string;
  userId: string;
  organizationId: string | null;
  conversationId?: string | null;
  assistantMessageId?: string | null;
  idempotencyKey: string;
  requestHash: string;
  billingLeaseToken: string;
  provider: VideoJobProvider;
  model: string;
  prompt: string;
  durationSecs: number;
  resolution: VideoJobResolution;
  aspectRatio: VideoJobAspectRatio;
  generateAudio: boolean;
  sourceSurface: VideoJobSourceSurface;
  estimatedCostCents: number;
  estimatedDurationSecs: number;
  admissionToken: string;
  workflowRunId: string;
}): Promise<VideoGenerationJob> {
  const job = await input.db.transaction(async (tx) => {
    // Serialize with account erasure's profile deletion fence. If generation
    // wins this row lock, erasure waits and then observes the active job; if
    // erasure wins, its durable deletion flags make this insert fail closed.
    const profiles = await tx.query<{
      id: string;
    }>(
      `select id
         from public.profiles
        where id = $1
          and deletion_requested_at is null
          and deletion_scheduled_for is null
          and (
            video_generation_erasure_fence_token is null
            or video_generation_erasure_fence_expires_at <= now()
          )
          and video_generation_admission_token = $2
          and video_generation_admission_expires_at > now()
        for update`,
      [input.userId, input.admissionToken],
    );
    const profile = profiles[0];
    if (!profile) {
      throw new Error('Video generation is unavailable while account erasure is pending.');
    }

    const conversationId = input.conversationId ?? null;
    const assistantMessageId = input.assistantMessageId ?? null;
    if ((conversationId === null) !== (assistantMessageId === null)) {
      throw new Error('Video chat generation requires both conversation and assistant message.');
    }
    if (conversationId && assistantMessageId) {
      const transcriptRows = await tx.query<{ id: string }>(
        `select message.id
           from public.web_messages message
           join public.web_conversations conversation
             on conversation.id = message.conversation_id
          where conversation.id = $1
            and conversation.user_id = $2
            and conversation.deleted_at is null
            and message.id = $3
            and message.conversation_id = conversation.id
            and message.role = 'assistant'
          for update of message`,
        [conversationId, input.userId, assistantMessageId],
      );
      if (!transcriptRows[0]) {
        throw new Error('Video chat placeholder is missing or belongs to another account.');
      }
    }

    const persisted = await queryJob(
      tx,
      `insert into public.video_generation_jobs (
         id, user_id, organization_id, conversation_id, assistant_message_id,
         idempotency_key, request_hash, billing_lease_token, provider, model,
         workflow_run_id, prompt, duration_secs, resolution, aspect_ratio,
         generate_audio, source_surface, estimated_cost_cents, estimated_duration_secs
       ) values (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
         $15, $16, $17, $18, $19
       )
       returning ${JOB_COLUMNS}`,
      [
        input.id,
        input.userId,
        input.organizationId,
        conversationId,
        assistantMessageId,
        input.idempotencyKey,
        input.requestHash,
        input.billingLeaseToken,
        input.provider,
        input.model,
        input.workflowRunId,
        input.prompt,
        input.durationSecs,
        input.resolution,
        input.aspectRatio,
        input.generateAudio,
        input.sourceSurface,
        input.estimatedCostCents,
        input.estimatedDurationSecs,
      ],
    );
    if (!persisted) throw new Error('Video generation job was not persisted.');

    if (conversationId && assistantMessageId) {
      const transcriptPatch = JSON.stringify({
        toolType: 'video-generation',
        videoTaskId: persisted.id,
        videoStatus: 'queued',
        videoProvider: persisted.provider,
        videoModel: persisted.model,
      });
      const updatedMessages = await tx.query<{ id: string }>(
        `update public.web_messages message
            set model = $4,
                provider = $5,
                metadata = coalesce(message.metadata, '{}'::jsonb) || $6::jsonb
           from public.web_conversations conversation
          where message.id = $1
            and message.conversation_id = $2
            and message.role = 'assistant'
            and conversation.id = message.conversation_id
            and conversation.user_id = $3
            and conversation.deleted_at is null
          returning message.id`,
        [
          assistantMessageId,
          conversationId,
          input.userId,
          persisted.model,
          persisted.provider,
          transcriptPatch,
        ],
      );
      if (!updatedMessages[0]) {
        throw new Error('Video chat placeholder could not be bound to the durable task.');
      }
    }

    const released = await tx.query<{ id: string }>(
      `update public.profiles
          set video_generation_admission_token = null,
              video_generation_admission_expires_at = null
        where id = $1
          and video_generation_admission_token = $2
      returning id`,
      [input.userId, input.admissionToken],
    );
    if (!released[0]) {
      throw new Error('Video generation admission was lost before job persistence committed.');
    }
    return persisted;
  });
  if (!job) throw new Error('Video generation job was not persisted.');
  return job;
}

/** Bind the Vercel Workflow owner before any non-idempotent provider egress. */
export async function attachVideoGenerationWorkflow(input: {
  db: DatabaseAdapter;
  jobId: string;
  userId: string;
  workflowRunId: string;
}): Promise<VideoGenerationJob> {
  const job = await queryJob(
    input.db,
    `update public.video_generation_jobs
        set workflow_run_id = $3,
            updated_at = now()
      where id = $1
        and user_id = $2
        and status = 'submitting'
        and provider_started_at is null
        and provider_task_id is null
        and (workflow_run_id is null or workflow_run_id = $3)
      returning ${JOB_COLUMNS}`,
    [input.jobId, input.userId, input.workflowRunId],
  );
  if (job) return job;

  const existing = await queryJob(
    input.db,
    `select ${JOB_COLUMNS}
       from public.video_generation_jobs
      where id = $1 and user_id = $2 and workflow_run_id = $3
      limit 1`,
    [input.jobId, input.userId, input.workflowRunId],
  );
  if (existing) return existing;
  throw new Error('Video workflow could not be attached before provider submission.');
}

/** Record a pre-provider workflow-start failure after managed usage was settled. */
export async function failVideoGenerationBeforeProviderStart(input: {
  db: DatabaseAdapter;
  jobId: string;
  userId: string;
  publicError: string;
  billingOutcome: 'released' | 'outcome_unknown' | null;
  billingSettlementStatus: 'succeeded' | 'pending' | 'terminal' | null;
}): Promise<VideoGenerationJob | null> {
  return queryJob(
    input.db,
    `update public.video_generation_jobs
        set status = 'failed',
            public_error = left($3, 500),
            billing_outcome = $4,
            billing_settlement_status = $5,
            incident_alert_status = case
              when $5 = 'terminal' then 'pending'
              else incident_alert_status
            end,
            reconcile_claim_token = null,
            reconcile_claim_expires_at = null,
            terminal_at = now(),
            updated_at = now()
      where id = $1
        and user_id = $2
        and status = 'submitting'
        and provider_started_at is null
        and provider_task_id is null
      returning ${JOB_COLUMNS}`,
    [
      input.jobId,
      input.userId,
      input.publicError,
      input.billingOutcome,
      input.billingSettlementStatus,
    ],
  );
}

export async function recordVideoProviderTask(input: {
  db: DatabaseAdapter;
  jobId: string;
  userId: string;
  claimToken: string;
  providerTaskId: string;
}): Promise<VideoGenerationJob> {
  const job = await queryJob(
    input.db,
    `update public.video_generation_jobs
        set provider_task_id = $3,
            status = 'queued',
            next_attempt_at = now(),
            reconcile_claim_token = null,
            reconcile_claim_expires_at = null,
            updated_at = now()
      where id = $1
        and user_id = $2
        and status = 'submitting'
        and provider_started_at is not null
        and (provider_task_id is null or provider_task_id = $3)
        and reconcile_claim_token = $4
        and reconcile_claim_expires_at > now()
      returning ${JOB_COLUMNS}`,
    [input.jobId, input.userId, input.providerTaskId, input.claimToken],
  );
  if (job) return job;

  // The update may have committed while its response was lost. Re-read the
  // exact identity without mutating an active reconciliation claim; returning
  // the same attachment is idempotent, a different attachment fails closed.
  const existing = await queryJob(
    input.db,
    `select ${JOB_COLUMNS}
       from public.video_generation_jobs
      where id = $1
        and user_id = $2
        and provider_task_id = $3
        and status in ('queued', 'processing', 'completed')
      limit 1`,
    [input.jobId, input.userId, input.providerTaskId],
  );
  if (existing) return existing;
  throw new Error('Video provider task could not be attached to its durable job.');
}

/**
 * Durable recovery path whose Workflow input already contains the accepted
 * provider identity. It may outlive the short request claim, but it can attach
 * only to the exact owner/job that crossed the provider-start boundary and has
 * an attached primary workflow.
 */
export async function recoverVideoProviderTaskAttachment(input: {
  db: DatabaseAdapter;
  jobId: string;
  userId: string;
  providerTaskId: string;
}): Promise<VideoGenerationJob> {
  const job = await queryJob(
    input.db,
    `update public.video_generation_jobs
        set provider_task_id = coalesce(provider_task_id, $3),
            status = 'queued',
            next_attempt_at = now(),
            reconcile_claim_token = null,
            reconcile_claim_expires_at = null,
            updated_at = now()
      where id = $1
        and user_id = $2
        and status = 'submitting'
        and provider_started_at is not null
        and workflow_run_id is not null
        and (provider_task_id is null or provider_task_id = $3)
      returning ${JOB_COLUMNS}`,
    [input.jobId, input.userId, input.providerTaskId],
  );
  if (job) return job;

  const existing = await queryJob(
    input.db,
    `select ${JOB_COLUMNS}
       from public.video_generation_jobs
      where id = $1
        and user_id = $2
        and provider_task_id = $3
        and status in ('queued', 'processing', 'completed')
      limit 1`,
    [input.jobId, input.userId, input.providerTaskId],
  );
  if (existing) return existing;
  throw new Error('Accepted provider task attachment recovery is not yet available.');
}

export function beginVideoProviderSubmission(input: {
  db: DatabaseAdapter;
  jobId: string;
  userId: string;
  claimToken: string;
  claimSeconds?: number;
}): Promise<VideoGenerationJob | null> {
  return queryJob(
    input.db,
    `select * from public.begin_video_generation_provider_submission(
       $1::uuid, $2::text, $3::text, $4::integer
     )`,
    [input.jobId, input.userId, input.claimToken, input.claimSeconds ?? 120],
  );
}

export function getVideoGenerationJob(
  db: DatabaseAdapter,
  jobId: string,
  userId: string,
): Promise<VideoGenerationJob | null> {
  return queryJob(
    db,
    `select ${JOB_COLUMNS}
       from public.video_generation_jobs
      where id = $1 and user_id = $2
      limit 1`,
    [jobId, userId],
  );
}

export function getVideoGenerationJobByIdempotencyKey(
  db: DatabaseAdapter,
  userId: string,
  idempotencyKey: string,
): Promise<VideoGenerationJob | null> {
  return queryJob(
    db,
    `select ${JOB_COLUMNS}
       from public.video_generation_jobs
      where user_id = $1 and idempotency_key = $2
      limit 1`,
    [userId, idempotencyKey],
  );
}

export function requestVideoGenerationCancellation(input: {
  db: DatabaseAdapter;
  jobId: string;
  userId: string;
}): Promise<VideoGenerationJob | null> {
  return queryJob(
    input.db,
    `update public.video_generation_jobs
        set cancel_requested_at = coalesce(cancel_requested_at, now()),
            next_attempt_at = least(next_attempt_at, now()),
            updated_at = now()
      where id = $1
        and user_id = $2
        and status in ('submitting', 'queued', 'processing')
      returning ${JOB_COLUMNS}`,
    [input.jobId, input.userId],
  );
}

export async function recordVideoProviderCancellationAttempt(input: {
  db: DatabaseAdapter;
  jobId: string;
  claimToken: string;
  acknowledged: boolean;
  publicError?: string;
  exhausted?: boolean;
  retryAfterSeconds?: number;
}): Promise<VideoGenerationJob> {
  const job = await queryJob(
    input.db,
    `update public.video_generation_jobs
        set provider_cancel_acknowledged_at = case
              when $3 then coalesce(provider_cancel_acknowledged_at, now())
              else provider_cancel_acknowledged_at
            end,
            cancel_attempts = case when $5 then 5 else greatest(cancel_attempts, 1) end,
            cancel_last_error = case when $3 then null else left($4, 500) end,
            next_attempt_at = now() + make_interval(secs => $6),
            reconcile_claim_token = null,
            reconcile_claim_expires_at = null,
            updated_at = now()
      where id = $1
        and reconcile_claim_token = $2
        and reconcile_claim_expires_at > now()
        and status in ('submitting', 'queued', 'processing')
      returning ${JOB_COLUMNS}`,
    [
      input.jobId,
      input.claimToken,
      input.acknowledged,
      input.publicError ?? null,
      input.exhausted ?? false,
      Math.max(5, Math.min(Math.trunc(input.retryAfterSeconds ?? 10), 600)),
    ],
  );
  if (!job) throw new Error('Video cancellation claim was lost before recording the attempt.');
  return job;
}

/**
 * Persist the one-shot Runway cancellation boundary before DELETE egress. The
 * endpoint cancels active tasks but deletes terminal ones, so an ambiguous
 * response must never be replayed automatically.
 */
export async function beginVideoProviderCancellationAttempt(input: {
  db: DatabaseAdapter;
  jobId: string;
  claimToken: string;
}): Promise<VideoGenerationJob> {
  const job = await queryJob(
    input.db,
    `update public.video_generation_jobs
        set provider_cancel_attempted_at = coalesce(provider_cancel_attempted_at, now()),
            cancel_attempts = greatest(cancel_attempts, 1),
            cancel_last_error = null,
            updated_at = now()
      where id = $1
        and reconcile_claim_token = $2
        and reconcile_claim_expires_at > now()
        and cancel_requested_at is not null
        and provider_cancel_attempted_at is null
        and status in ('submitting', 'queued', 'processing')
      returning ${JOB_COLUMNS}`,
    [input.jobId, input.claimToken],
  );
  if (!job) throw new Error('Video cancellation attempt boundary could not be persisted.');
  return job;
}

export function getVideoGenerationJobForSystem(
  db: DatabaseAdapter,
  jobId: string,
): Promise<VideoGenerationJob | null> {
  return queryJob(
    db,
    `select ${JOB_COLUMNS}
       from public.video_generation_jobs
      where id = $1
      limit 1`,
    [jobId],
  );
}

export async function listDueVideoGenerationJobIds(
  db: DatabaseAdapter,
  limit = 10,
): Promise<string[]> {
  const boundedLimit = Math.max(1, Math.min(Math.trunc(limit), 50));
  const rows = await db.query<{ id: string }>(
    `select id
       from public.video_generation_jobs
      where status in ('submitting', 'queued', 'processing')
        and next_attempt_at <= now()
        and (reconcile_claim_expires_at is null or reconcile_claim_expires_at <= now())
      order by next_attempt_at, created_at
      limit $1`,
    [boundedLimit],
  );
  return rows.map((row) => String(row.id));
}

export function claimVideoGenerationJob(input: {
  db: DatabaseAdapter;
  jobId: string;
  claimToken: string;
  claimSeconds?: number;
}): Promise<VideoGenerationJob | null> {
  return queryJob(
    input.db,
    'select * from public.claim_video_generation_job($1::uuid, $2::text, $3::integer)',
    [input.jobId, input.claimToken, input.claimSeconds ?? 180],
  );
}

export async function deferVideoGenerationJob(input: {
  db: DatabaseAdapter;
  jobId: string;
  claimToken: string;
  status: 'submitting' | 'queued' | 'processing';
  progress?: number;
  retryAfterSeconds: number;
  /** Escalate a still-live provider task without falsely terminalizing it. */
  raiseIncident?: boolean;
}): Promise<VideoGenerationJob> {
  const job = await queryJob(
    input.db,
    `update public.video_generation_jobs
        set status = $3,
            progress = $4,
            reconcile_failures = 0,
            next_attempt_at = now() + make_interval(secs => $5),
            reconcile_claim_token = null,
            reconcile_claim_expires_at = null,
            incident_alert_status = case
              when $6 and incident_alert_status is null then 'pending'
              else incident_alert_status
            end,
            updated_at = now()
      where id = $1
        and reconcile_claim_token = $2
        and reconcile_claim_expires_at > now()
        and status in ('submitting', 'queued', 'processing')
      returning ${JOB_COLUMNS}`,
    [
      input.jobId,
      input.claimToken,
      input.status,
      input.progress == null ? null : Math.max(0, Math.min(Math.trunc(input.progress), 99)),
      Math.max(5, Math.min(Math.trunc(input.retryAfterSeconds), 600)),
      input.raiseIncident ?? false,
    ],
  );
  if (!job) throw new Error('Video reconciliation claim was lost before it could be deferred.');
  return job;
}

export async function deferVideoGenerationJobFailure(input: {
  db: DatabaseAdapter;
  jobId: string;
  claimToken: string;
  retryAfterSeconds: number;
  publicError: string;
}): Promise<VideoGenerationJob> {
  const job = await queryJob(
    input.db,
    `update public.video_generation_jobs
        set reconcile_failures = reconcile_failures + 1,
            public_error = left($3, 500),
            next_attempt_at = now() + make_interval(secs => $4),
            reconcile_claim_token = null,
            reconcile_claim_expires_at = null,
            updated_at = now()
      where id = $1
        and reconcile_claim_token = $2
        and reconcile_claim_expires_at > now()
        and status in ('submitting', 'queued', 'processing')
      returning ${JOB_COLUMNS}`,
    [
      input.jobId,
      input.claimToken,
      input.publicError,
      Math.max(5, Math.min(Math.trunc(input.retryAfterSeconds), 600)),
    ],
  );
  if (!job) throw new Error('Video reconciliation claim was lost before retry scheduling.');
  return job;
}

export function finalizeVideoGenerationJob(input: {
  db: DatabaseAdapter;
  jobId: string;
  claimToken: string;
  outcome: 'completed' | 'failed';
  assetId?: string;
  publicError?: string;
  actualCostCents?: number;
}): Promise<VideoGenerationJob | null> {
  return queryJob(
    input.db,
    `select * from public.finalize_video_generation_job(
       $1::uuid, $2::text, $3::text, $4::uuid, $5::text, $6::integer
     )`,
    [
      input.jobId,
      input.claimToken,
      input.outcome,
      input.assetId ?? null,
      input.publicError ?? null,
      input.actualCostCents ?? null,
    ],
  );
}

/**
 * Deduplicate one signed terminal provider event and make the durable Workflow
 * poll immediately. The webhook never downloads, settles, or trusts payload
 * output; those mechanics stay in the claimed reconciler.
 */
export async function nudgeVideoGenerationJobFromProviderEvent(input: {
  db: DatabaseAdapter;
  provider: VideoJobProvider;
  providerTaskId: string;
  eventKey: string;
}): Promise<'nudged' | 'duplicate' | 'not_found'> {
  const rows = await input.db.query<{ disposition: string }>(
    `with target as (
       select id, last_provider_event_key
         from public.video_generation_jobs
        where provider = $1
          and provider_task_id = $2
        for update
     ), updated as (
       update public.video_generation_jobs job
          set last_provider_event_key = $3,
              last_provider_event_at = now(),
              next_attempt_at = least(job.next_attempt_at, now()),
              updated_at = now()
         from target
        where job.id = target.id
          and target.last_provider_event_key is distinct from $3
          and job.status in ('submitting', 'queued', 'processing')
       returning job.id
     )
     select case
       when exists (select 1 from updated) then 'nudged'
       when exists (select 1 from target) then 'duplicate'
       else 'not_found'
     end as disposition`,
    [input.provider, input.providerTaskId, input.eventKey],
  );
  const disposition = rows[0]?.disposition;
  return disposition === 'nudged' || disposition === 'duplicate' ? disposition : 'not_found';
}

export function markVideoGenerationOutcomeUnknown(input: {
  db: DatabaseAdapter;
  jobId: string;
  claimToken: string;
  publicError: string;
  providerTaskId?: string;
  providerFailureCode?: string;
}): Promise<VideoGenerationJob | null> {
  return queryJob(
    input.db,
    `select * from public.mark_video_generation_outcome_unknown(
       $1::uuid, $2::text, $3::text, $4::text, $5::text
     )`,
    [
      input.jobId,
      input.claimToken,
      input.publicError,
      input.providerTaskId ?? null,
      input.providerFailureCode ?? null,
    ],
  );
}

/** Drain and mirror a terminal job's durable managed-credit settlement. */
export function reconcileVideoGenerationBillingSettlement(
  db: DatabaseAdapter,
  jobId: string,
): Promise<VideoGenerationJob | null> {
  return queryJob(
    db,
    `select * from public.reconcile_video_generation_billing_settlement($1::uuid)`,
    [jobId],
  );
}

export function claimVideoIncidentAlert(input: {
  db: DatabaseAdapter;
  jobId: string;
  claimToken: string;
  claimSeconds?: number;
}): Promise<VideoGenerationJob | null> {
  return queryJob(
    input.db,
    `update public.video_generation_jobs
        set incident_alert_claim_token = $2,
            incident_alert_claim_expires_at = now() + make_interval(
              secs => greatest(30, least($3, 300))
            ),
            updated_at = now()
      where id = $1
        and incident_alert_status = 'pending'
        and incident_alert_attempts < 100
        and (
          incident_alert_attempts = 0
          or updated_at <= now() - make_interval(
            secs => least(3600, 60 * power(2, least(incident_alert_attempts, 6)))::integer
          )
        )
        and (
          incident_alert_claim_expires_at is null
          or incident_alert_claim_expires_at <= now()
        )
      returning ${JOB_COLUMNS}`,
    [input.jobId, input.claimToken, input.claimSeconds ?? 90],
  );
}

export function completeVideoIncidentAlert(input: {
  db: DatabaseAdapter;
  jobId: string;
  claimToken: string;
  delivered: boolean;
  error?: string;
}): Promise<VideoGenerationJob | null> {
  return queryJob(
    input.db,
    `update public.video_generation_jobs
        set incident_alert_status = case
              when $3 then 'delivered'
              when incident_alert_attempts + 1 >= 100 then 'exhausted'
              else 'pending'
            end,
            incident_alert_attempts = least(incident_alert_attempts + 1, 100),
            incident_alert_last_error = case when $3 then null else left($4, 500) end,
            incident_alert_claim_token = null,
            incident_alert_claim_expires_at = null,
            updated_at = now()
      where id = $1
        and incident_alert_status = 'pending'
        and incident_alert_claim_token = $2
        and incident_alert_claim_expires_at > now()
      returning ${JOB_COLUMNS}`,
    [input.jobId, input.claimToken, input.delivered, input.error ?? null],
  );
}

export async function listPendingVideoIncidentAlertIds(
  db: DatabaseAdapter,
  limit = 10,
): Promise<string[]> {
  const boundedLimit = Math.max(1, Math.min(Math.trunc(limit), 50));
  const [readiness] = await db.query<{ provisioned: boolean }>(
    `select to_regclass('public.video_generation_jobs') is not null as provisioned`,
  );
  if (!readiness?.provisioned) return [];

  const rows = await db.query<{ id: string }>(
    `select id
       from public.video_generation_jobs
      where incident_alert_status = 'pending'
        and incident_alert_attempts < 100
        and (
          incident_alert_attempts = 0
          or updated_at <= now() - make_interval(
            secs => least(3600, 60 * power(2, least(incident_alert_attempts, 6)))::integer
          )
        )
        and (
          incident_alert_claim_expires_at is null
          or incident_alert_claim_expires_at <= now()
        )
      order by incident_alert_attempts, updated_at, terminal_at, id
      limit $1`,
    [boundedLimit],
  );
  return rows.map((row) => String(row.id));
}

export async function countExhaustedVideoIncidentAlerts(db: DatabaseAdapter): Promise<number> {
  const [readiness] = await db.query<{ provisioned: boolean }>(
    `select to_regclass('public.video_generation_jobs') is not null as provisioned`,
  );
  if (!readiness?.provisioned) return 0;
  const [row] = await db.query<{ count: string | number }>(
    `select count(*) as count
       from public.video_generation_jobs
      where incident_alert_status = 'exhausted'
         or (incident_alert_status = 'pending' and incident_alert_attempts >= 100)`,
  );
  return Number(row?.count ?? 0);
}

const VIDEO_SETTLEMENT_INCIDENT_COLUMNS = `
  id, video_incident_alert_status, video_incident_alert_attempts,
  video_incident_alert_last_error, video_incident_alert_claim_token,
  video_incident_alert_claim_expires_at, completed_at
`;

export function claimVideoSettlementIncidentByReservation(input: {
  db: DatabaseAdapter;
  userId: string;
  idempotencyKey: string;
  claimToken: string;
  claimSeconds?: number;
}): Promise<VideoSettlementIncident | null> {
  return queryVideoSettlementIncident(
    input.db,
    `with candidate as (
       select settlement.id
         from public.credit_settlement_jobs settlement
         join public.managed_usage_requests request_row
           on request_row.id::text = settlement.metadata->>'managed_usage_request_id'
        where settlement.user_id = $1
          and request_row.user_id = $1
          and request_row.idempotency_key = $2
          and settlement.status = 'terminal'
          and settlement.metadata->>'type' = 'managed_usage_finalization'
          and settlement.metadata #>> '{usage,operation}' = 'video'
          and settlement.metadata #>> '{usage,jobId}' is null
          and (settlement.video_incident_alert_status is null
               or settlement.video_incident_alert_status = 'pending')
          and settlement.video_incident_alert_attempts < 100
          and (
            settlement.video_incident_alert_attempts = 0
            or settlement.updated_at <= now() - make_interval(
              secs => least(
                3600,
                60 * power(2, least(settlement.video_incident_alert_attempts, 6))
              )::integer
            )
          )
          and (settlement.video_incident_alert_claim_expires_at is null
               or settlement.video_incident_alert_claim_expires_at <= now())
        for update of settlement skip locked
        limit 1
     )
     update public.credit_settlement_jobs settlement
        set video_incident_alert_status = 'pending',
            video_incident_alert_claim_token = $3,
            video_incident_alert_claim_expires_at = now() + make_interval(
              secs => greatest(30, least($4, 300))
            ),
            updated_at = now()
      where settlement.id = (select id from candidate)
      returning ${VIDEO_SETTLEMENT_INCIDENT_COLUMNS}`,
    [input.userId, input.idempotencyKey, input.claimToken, input.claimSeconds ?? 90],
  );
}

export function claimVideoSettlementIncidentById(input: {
  db: DatabaseAdapter;
  incidentId: string;
  claimToken: string;
  claimSeconds?: number;
}): Promise<VideoSettlementIncident | null> {
  return queryVideoSettlementIncident(
    input.db,
    `with candidate as (
       select settlement.id
         from public.credit_settlement_jobs settlement
        where settlement.id = $1
          and settlement.status = 'terminal'
          and settlement.metadata->>'type' = 'managed_usage_finalization'
          and settlement.metadata #>> '{usage,operation}' = 'video'
          and (
            settlement.metadata #>> '{usage,jobId}' is null
            or not exists (
              select 1
                from public.video_generation_jobs job
               where job.id::text = settlement.metadata #>> '{usage,jobId}'
                 and job.incident_alert_status is not null
            )
          )
          and (settlement.video_incident_alert_status is null
               or settlement.video_incident_alert_status = 'pending')
          and settlement.video_incident_alert_attempts < 100
          and (
            settlement.video_incident_alert_attempts = 0
            or settlement.updated_at <= now() - make_interval(
              secs => least(
                3600,
                60 * power(2, least(settlement.video_incident_alert_attempts, 6))
              )::integer
            )
          )
          and (settlement.video_incident_alert_claim_expires_at is null
               or settlement.video_incident_alert_claim_expires_at <= now())
        for update of settlement skip locked
        limit 1
     )
     update public.credit_settlement_jobs settlement
        set video_incident_alert_status = 'pending',
            video_incident_alert_claim_token = $2,
            video_incident_alert_claim_expires_at = now() + make_interval(
              secs => greatest(30, least($3, 300))
            ),
            updated_at = now()
      where settlement.id = (select id from candidate)
      returning ${VIDEO_SETTLEMENT_INCIDENT_COLUMNS}`,
    [input.incidentId, input.claimToken, input.claimSeconds ?? 90],
  );
}

export function completeVideoSettlementIncident(input: {
  db: DatabaseAdapter;
  incidentId: string;
  claimToken: string;
  delivered: boolean;
  error?: string;
}): Promise<VideoSettlementIncident | null> {
  return queryVideoSettlementIncident(
    input.db,
    `update public.credit_settlement_jobs settlement
        set video_incident_alert_status = case
              when $3 then 'delivered'
              when video_incident_alert_attempts + 1 >= 100 then 'exhausted'
              else 'pending'
            end,
            video_incident_alert_attempts = least(video_incident_alert_attempts + 1, 100),
            video_incident_alert_last_error = case when $3 then null else left($4, 500) end,
            video_incident_alert_claim_token = null,
            video_incident_alert_claim_expires_at = null,
            updated_at = now()
      where settlement.id = $1
        and settlement.video_incident_alert_status = 'pending'
        and settlement.video_incident_alert_claim_token = $2
        and settlement.video_incident_alert_claim_expires_at > now()
      returning ${VIDEO_SETTLEMENT_INCIDENT_COLUMNS}`,
    [input.incidentId, input.claimToken, input.delivered, input.error ?? null],
  );
}

export function getVideoSettlementIncident(
  db: DatabaseAdapter,
  incidentId: string,
): Promise<VideoSettlementIncident | null> {
  return queryVideoSettlementIncident(
    db,
    `select ${VIDEO_SETTLEMENT_INCIDENT_COLUMNS}
       from public.credit_settlement_jobs
      where id = $1
      limit 1`,
    [incidentId],
  );
}

export async function listPendingVideoSettlementIncidentIds(
  db: DatabaseAdapter,
  limit = 10,
): Promise<string[]> {
  const boundedLimit = Math.max(1, Math.min(Math.trunc(limit), 50));
  const [readiness] = await db.query<{ provisioned: boolean }>(
    `select count(*) = 5 as provisioned
       from information_schema.columns
      where table_schema = 'public'
        and table_name = 'credit_settlement_jobs'
        and column_name in (
          'video_incident_alert_status',
          'video_incident_alert_attempts',
          'video_incident_alert_last_error',
          'video_incident_alert_claim_token',
          'video_incident_alert_claim_expires_at'
        )`,
  );
  if (!readiness?.provisioned) return [];

  const rows = await db.query<{ id: string }>(
    `select settlement.id
       from public.credit_settlement_jobs settlement
      where settlement.status = 'terminal'
        and settlement.metadata->>'type' = 'managed_usage_finalization'
        and settlement.metadata #>> '{usage,operation}' = 'video'
        and (
          settlement.metadata #>> '{usage,jobId}' is null
          or not exists (
            select 1
              from public.video_generation_jobs job
             where job.id::text = settlement.metadata #>> '{usage,jobId}'
               and job.incident_alert_status is not null
          )
        )
        and (settlement.video_incident_alert_status is null
             or settlement.video_incident_alert_status = 'pending')
        and settlement.video_incident_alert_attempts < 100
        and (
          settlement.video_incident_alert_attempts = 0
          or settlement.updated_at <= now() - make_interval(
            secs => least(
              3600,
              60 * power(2, least(settlement.video_incident_alert_attempts, 6))
            )::integer
          )
        )
        and (
          settlement.video_incident_alert_claim_expires_at is null
          or settlement.video_incident_alert_claim_expires_at <= now()
        )
      order by settlement.video_incident_alert_attempts, settlement.updated_at,
               settlement.completed_at, settlement.id
      limit $1`,
    [boundedLimit],
  );
  return rows.map((row) => String(row.id));
}

export async function countExhaustedVideoSettlementIncidentAlerts(
  db: DatabaseAdapter,
): Promise<number> {
  const [readiness] = await db.query<{ provisioned: boolean }>(
    `select count(*) = 5 as provisioned
       from information_schema.columns
      where table_schema = 'public'
        and table_name = 'credit_settlement_jobs'
        and column_name in (
          'video_incident_alert_status',
          'video_incident_alert_attempts',
          'video_incident_alert_last_error',
          'video_incident_alert_claim_token',
          'video_incident_alert_claim_expires_at'
        )`,
  );
  if (!readiness?.provisioned) return 0;
  const [row] = await db.query<{ count: string | number }>(
    `select count(*) as count
       from public.credit_settlement_jobs settlement
      where settlement.status = 'terminal'
        and settlement.metadata->>'type' = 'managed_usage_finalization'
        and settlement.metadata #>> '{usage,operation}' = 'video'
        and (
          settlement.metadata #>> '{usage,jobId}' is null
          or not exists (
            select 1
              from public.video_generation_jobs job
             where job.id::text = settlement.metadata #>> '{usage,jobId}'
               and job.incident_alert_status is not null
          )
        )
        and (
          settlement.video_incident_alert_status = 'exhausted'
          or (
            settlement.video_incident_alert_status = 'pending'
            and settlement.video_incident_alert_attempts >= 100
          )
        )`,
  );
  return Number(row?.count ?? 0);
}
