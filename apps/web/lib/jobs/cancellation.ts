import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { CancellationSemantics } from '@agiworkforce/types';

import type { BackgroundJob, SettlingJob } from './job-service';

const MAX_CANCEL_REASON_LENGTH = 500;
const DEFAULT_POLL_MS = 2_000;
const MIN_POLL_MS = 250;

/**
 * Cancellation is cooperative. A queued job has no worker, so it stops at once.
 * A running job keeps its lease until the worker that owns it acknowledges the
 * request: flipping the status underneath a live worker would orphan the lease
 * and leave whatever side effect the job was mid-way through uncounted.
 */
export const BACKGROUND_JOB_CANCELLATION: CancellationSemantics = {
  immediatelyStopped: [
    'a queued job, which no worker holds, never starts',
    'the running handler at its next cancellation checkpoint, through its AbortSignal',
    'every provider stream the handler opened under that signal',
  ],
  cannotBeStopped: [
    'a request the handler already sent to a third party',
    'a database write the handler already committed',
    'a sibling job the handler already enqueued',
  ],
  partialOutputRetained: true,
  resumable: false,
  propagatesTo: ['background-worker', 'provider-stream'],
};

export type JobCancellationOutcome =
  'cancelled' | 'requested' | 'already-cancelled' | 'not-cancellable' | 'unknown';

export interface RequestJobCancellationInput {
  jobId: string;
  /** The subject whose job this is; a job filed under another subject is not found. */
  userId: string;
  /** Who asked, carried onto the row so the admin console can say. */
  requestedBy: string;
  reason?: string | null;
}

export interface JobCancellationRequest {
  status: string;
  requestedAt: string | null;
  requestedBy: string | null;
  reason: string | null;
  workerId: string | null;
}

function boundedReason(reason: string | null | undefined): string | null {
  const trimmed = reason?.trim();
  return trimmed ? trimmed.slice(0, MAX_CANCEL_REASON_LENGTH) : null;
}

function iso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/**
 * A queued job is cancelled outright. A running job is asked, and stays running
 * until its worker acknowledges; the caller must not report it as stopped.
 */
export async function requestJobCancellation(
  db: DatabaseAdapter,
  input: RequestJobCancellationInput,
): Promise<JobCancellationOutcome> {
  const reason = boundedReason(input.reason);
  const [cancelled] = await db.query<{ id: string }>(
    `update public.background_jobs
        set status = 'cancelled', cancel_requested_at = now(), cancel_requested_by = $2,
            cancel_reason = $3, lease_expires_at = null, worker_id = null,
            completed_at = now(), updated_at = now()
      where id = $1 and user_id = $4 and status = 'queued'
      returning id`,
    [input.jobId, input.requestedBy, reason, input.userId],
  );
  if (cancelled) return 'cancelled';

  const [requested] = await db.query<{ id: string }>(
    `update public.background_jobs
        set cancel_requested_at = coalesce(cancel_requested_at, now()),
            cancel_requested_by = coalesce(cancel_requested_by, $2),
            cancel_reason = coalesce(cancel_reason, $3),
            updated_at = now()
      where id = $1 and user_id = $4 and status = 'running'
      returning id`,
    [input.jobId, input.requestedBy, reason, input.userId],
  );
  if (requested) return 'requested';

  const [existing] = await db.query<{ status: string }>(
    `select status from public.background_jobs where id = $1 and user_id = $2`,
    [input.jobId, input.userId],
  );
  if (!existing) return 'unknown';
  return existing.status === 'cancelled' ? 'already-cancelled' : 'not-cancellable';
}

/** What a worker polls to learn that the job it is running has been cancelled. */
export async function readJobCancellation(
  db: DatabaseAdapter,
  jobId: string,
): Promise<JobCancellationRequest | null> {
  const [row] = await db.query<{
    status: string;
    cancel_requested_at: string | Date | null;
    cancel_requested_by: string | null;
    cancel_reason: string | null;
    worker_id: string | null;
  }>(
    `select status, cancel_requested_at, cancel_requested_by, cancel_reason, worker_id
       from public.background_jobs where id = $1`,
    [jobId],
  );
  if (!row) return null;
  return {
    status: row.status,
    requestedAt: iso(row.cancel_requested_at),
    requestedBy: row.cancel_requested_by,
    reason: row.cancel_reason,
    workerId: row.worker_id,
  };
}

export async function isJobCancellationRequested(
  db: DatabaseAdapter,
  jobId: string,
): Promise<boolean> {
  const request = await readJobCancellation(db, jobId);
  return request !== null && (request.requestedAt !== null || request.status === 'cancelled');
}

/**
 * The worker's half of the contract, fenced on the lease it holds. Whatever the
 * handler produced before it stopped is kept: a cancelled render that wrote
 * three of five frames has three frames, and discarding them would make the
 * user pay for them twice.
 */
export async function acknowledgeJobCancellation(
  db: DatabaseAdapter,
  job: SettlingJob<'id' | 'attempts'>,
  partialResult: Record<string, unknown> | null = null,
): Promise<boolean> {
  const affected = await db.execute(
    `update public.background_jobs
        set status = 'cancelled', result = coalesce($4::jsonb, result),
            cancel_requested_at = coalesce(cancel_requested_at, now()),
            lease_expires_at = null, completed_at = now(), updated_at = now()
      where id = $1 and status = 'running' and attempts = $2
        and ($3::text is null or worker_id is not distinct from $3::text)`,
    [
      job.id,
      job.attempts,
      job.workerId ?? null,
      partialResult === null ? null : JSON.stringify(partialResult),
    ],
  );
  return affected === 1;
}

export interface JobCancellationWatch {
  stop(): void;
}

/**
 * Propagation: the poll turns a cancellation recorded in the database into the
 * AbortSignal the handler and every provider stream under it already honour.
 * The handler still has to reach a checkpoint, which is why cancellation is
 * reported as requested and not as stopped until it acknowledges.
 */
export class JobCancelledError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} was cancelled`);
    this.name = 'JobCancelledError';
  }
}

export function watchJobCancellation(
  db: DatabaseAdapter,
  job: Pick<BackgroundJob, 'id'>,
  controller: AbortController,
  options: { pollMs?: number; onError?: (error: unknown) => void } = {},
): JobCancellationWatch {
  const pollMs = Math.max(MIN_POLL_MS, options.pollMs ?? DEFAULT_POLL_MS);
  let stopped = false;
  const timer = setInterval(() => {
    void isJobCancellationRequested(db, job.id)
      .then((requested) => {
        if (requested && !stopped) {
          stop();
          controller.abort(new JobCancelledError(job.id));
        }
      })
      .catch((error: unknown) => options.onError?.(error));
  }, pollMs);
  (timer as { unref?: () => void }).unref?.();

  function stop(): void {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
  }

  controller.signal.addEventListener('abort', stop, { once: true });
  return { stop };
}

/**
 * A cancellation whose worker died holding the lease. The lease is gone, so
 * nothing is running and the row can be finished without a fence.
 */
export async function reapAbandonedCancellations(db: DatabaseAdapter): Promise<number> {
  return db.execute(
    `update public.background_jobs
        set status = 'cancelled', lease_expires_at = null, worker_id = null,
            completed_at = now(), updated_at = now()
      where status = 'running' and cancel_requested_at is not null
        and lease_expires_at is not null and lease_expires_at < now()`,
    [],
  );
}
