import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { logger } from '@/lib/logger';
import { OBSERVABILITY_ATTRIBUTE } from '@/lib/observability/attributes';
import { captureWorkerFailure } from '@/lib/observability/error-capture';
import { withSpan } from '@/lib/observability/span';

import { JOB_QUEUE_NAMES, JOB_QUEUE_POLICIES, isJobKind, type JobKind } from './job-queues';
import {
  PermanentJobError,
  claimJobs,
  completeJob,
  failJob,
  pruneFinishedJobs,
  reapExpiredJobLeases,
  type BackgroundJob,
} from './job-service';

const LEASE_SAFETY_MS = 5_000;
const MIN_JOB_BUDGET_MS = 5_000;

export interface JobHandlerContext {
  job: BackgroundJob;
  db: DatabaseAdapter;
  signal: AbortSignal;
  isFinalAttempt: boolean;
}

export type JobHandler = (context: JobHandlerContext) => Promise<Record<string, unknown> | void>;

export type JobHandlerRegistry = Readonly<Partial<Record<JobKind, JobHandler>>>;

export interface JobDrainSummary {
  claimed: number;
  succeeded: number;
  retried: number;
  deadLettered: number;
  reaped: { requeued: number; deadLettered: number };
  pruned: number;
  drained: boolean;
}

export interface DrainBackgroundJobsOptions {
  db: DatabaseAdapter;
  handlers: JobHandlerRegistry;
  budgetMs: number;
  maxInFlight: number;
  now?: () => number;
}

function jobTimeoutError(job: BackgroundJob): Error {
  return new Error(`Job ${job.kind} exceeded its time budget`);
}

async function runJob(
  db: DatabaseAdapter,
  handlers: JobHandlerRegistry,
  job: BackgroundJob,
  timeoutMs: number,
): Promise<'succeeded' | 'retry' | 'dead' | 'stale'> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(jobTimeoutError(job)), timeoutMs);
  try {
    const handler = isJobKind(job.kind) ? handlers[job.kind] : undefined;
    if (!handler) throw new PermanentJobError(`No handler is registered for job kind ${job.kind}`);
    const aborted = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener(
        'abort',
        () => reject(controller.signal.reason ?? jobTimeoutError(job)),
        { once: true },
      );
    });
    const result = await withSpan(
      'background_job.run',
      {
        domain: 'task',
        kind: 'consumer',
        attributes: {
          [OBSERVABILITY_ATTRIBUTE.queueName]: job.queue,
          [OBSERVABILITY_ATTRIBUTE.queueJobId]: job.id,
          'job.kind': job.kind,
          'job.attempt': job.attempts,
        },
      },
      () =>
        Promise.race([
          handler({
            job,
            db,
            signal: controller.signal,
            isFinalAttempt: job.attempts >= job.maxAttempts,
          }),
          aborted,
        ]),
    );
    const completed = await completeJob(db, job, result ?? null);
    return completed ? 'succeeded' : 'stale';
  } catch (error) {
    captureWorkerFailure(error, { worker: `background-job:${job.queue}`, jobId: job.id });
    return failJob(db, job, error);
  } finally {
    clearTimeout(timer);
  }
}

export async function drainBackgroundJobs(
  options: DrainBackgroundJobsOptions,
): Promise<JobDrainSummary> {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const remaining = () => options.budgetMs - (now() - startedAt);
  const summary: JobDrainSummary = {
    claimed: 0,
    succeeded: 0,
    retried: 0,
    deadLettered: 0,
    reaped: await reapExpiredJobLeases(options.db),
    pruned: 0,
    drained: false,
  };

  const inFlight = new Set<Promise<void>>();
  let outOfBudget = false;

  while (true) {
    let nothingClaimable = false;
    const available = options.maxInFlight - inFlight.size;
    if (!outOfBudget && available > 0) {
      const budgetMs = remaining() - LEASE_SAFETY_MS;
      const eligibleQueues = JOB_QUEUE_NAMES.filter(
        (queue) => JOB_QUEUE_POLICIES[queue].leaseSeconds * 1_000 <= budgetMs,
      );
      if (eligibleQueues.length === 0) {
        outOfBudget = true;
      } else {
        const claimed = await claimJobs(options.db, { queues: eligibleQueues, limit: available });
        summary.claimed += claimed.length;
        nothingClaimable = claimed.length === 0;
        for (const job of claimed) track(job);
      }
    }

    if (inFlight.size === 0) {
      summary.drained = nothingClaimable && !outOfBudget;
      break;
    }
    await Promise.race(inFlight);
  }

  function track(job: BackgroundJob): void {
    const timeoutMs = Math.max(
      MIN_JOB_BUDGET_MS,
      Math.min(
        JOB_QUEUE_POLICIES[job.queue].leaseSeconds * 1_000 - LEASE_SAFETY_MS,
        remaining() - LEASE_SAFETY_MS,
      ),
    );
    const tracked: Promise<void> = runJob(options.db, options.handlers, job, timeoutMs)
      .then(
        (outcome) => {
          if (outcome === 'succeeded') summary.succeeded += 1;
          else if (outcome === 'retry') summary.retried += 1;
          else if (outcome === 'dead') summary.deadLettered += 1;
        },
        (error: unknown) => {
          logger.error({ error, jobId: job.id }, 'Background job could not record its outcome');
        },
      )
      .finally(() => {
        inFlight.delete(tracked);
      });
    inFlight.add(tracked);
  }

  summary.pruned = await pruneFinishedJobs(options.db);
  logger.info(summary, 'Background job drain completed');
  return summary;
}
