import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { logger } from '@/lib/logger';
import { OBSERVABILITY_ATTRIBUTE } from '@/lib/observability/attributes';
import { captureWorkerFailure } from '@/lib/observability/error-capture';
import { recordQueueAge, recordQueueDepth, recordQueueWait } from '@/lib/observability/metrics';
import { withSpan } from '@/lib/observability/span';
import { runWithCarriedTrace } from '@/lib/observability/trace-propagation';
import { clearIncident, notifyIncident } from '@/lib/server/incident/dispatch';
import {
  describeJobHealth,
  evaluateJobHealth,
  jobHealthIncidentKey,
  type JobHealthAlert,
} from '@/lib/server/slo/job-health';

import { JOB_QUEUE_NAMES, JOB_QUEUE_POLICIES, isJobKind, type JobKind } from './job-queues';
import {
  PermanentJobError,
  claimJobs,
  completeJob,
  failJob,
  pruneFinishedJobs,
  readJobQueueStats,
  reapExpiredJobLeases,
  type BackgroundJob,
  type JobQueueStats,
} from './job-service';
import {
  JobCancelledError,
  acknowledgeJobCancellation,
  reapAbandonedCancellations,
  watchJobCancellation,
} from './cancellation';

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
  cancelled: number;
  reaped: { requeued: number; deadLettered: number };
  abandonedCancellations: number;
  pruned: number;
  drained: boolean;
  unhealthyQueues: string[];
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

async function recordQueueBacklog(db: DatabaseAdapter): Promise<JobQueueStats[]> {
  const stats = await readJobQueueStats(db);
  for (const queue of stats) {
    recordQueueDepth({ queue: queue.queue, status: 'queued', count: queue.queued });
    recordQueueDepth({ queue: queue.queue, status: 'running', count: queue.running });
    recordQueueDepth({ queue: queue.queue, status: 'dead', count: queue.dead });
    recordQueueAge({
      queue: queue.queue,
      oldestQueuedAgeMs: queue.oldestQueuedAgeMs,
      stuck: queue.stuck,
    });
  }
  return stats;
}

function jobHealthPage(alert: JobHealthAlert): { subject: string; text: string } {
  return {
    subject: `[AGI ${alert.severity === 'critical' ? 'CRITICAL' : 'WARNING'}] background queue ${alert.queue} is not draining`,
    text: [
      `Queue: ${alert.queue}`,
      '',
      'WHAT IS WRONG',
      describeJobHealth(alert),
      '',
      'The thresholds are in apps/web/lib/server/slo/job-health.ts.',
      'Follow docs/runbooks/incident-response.md.',
    ].join('\n'),
  };
}

/**
 * A stuck queue reports no failure of its own: nothing completes, so no
 * success rate falls and no dead-letter count rises. The drain is the only
 * thing that sees it, so the drain is what raises it.
 */
async function reportJobHealth(stats: readonly JobQueueStats[]): Promise<JobHealthAlert[]> {
  const alerts = evaluateJobHealth(stats);
  const alerting = new Set(alerts.map((alert) => alert.queue));

  // A pager that is down must not take the drain with it.
  try {
    for (const alert of alerts) {
      const { subject, text } = jobHealthPage(alert);
      const dispatched = await notifyIncident({
        key: jobHealthIncidentKey(alert.queue),
        severity: alert.severity,
        subject,
        text,
        source: 'job-health',
      });
      logger.error(
        { queue: alert.queue, reasons: alert.reasons, paged: dispatched?.paged },
        'Background queue health alert dispatched',
      );
    }

    for (const queue of stats) {
      if (!alerting.has(queue.queue)) await clearIncident(jobHealthIncidentKey(queue.queue));
    }
  } catch (error) {
    logger.error({ error }, 'Background queue health alert could not be dispatched');
  }

  return alerts;
}

async function runJob(
  db: DatabaseAdapter,
  handlers: JobHandlerRegistry,
  job: BackgroundJob,
  timeoutMs: number,
): Promise<'succeeded' | 'retry' | 'dead' | 'stale' | 'cancelled'> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(jobTimeoutError(job)), timeoutMs);
  const watch = watchJobCancellation(db, job, controller);
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
    const result = await runWithCarriedTrace(job.payload, () =>
      withSpan(
        'background_job.run',
        {
          domain: 'queue',
          kind: 'consumer',
          attributes: {
            [OBSERVABILITY_ATTRIBUTE.queueName]: job.queue,
            [OBSERVABILITY_ATTRIBUTE.queueJobId]: job.id,
            'job.kind': job.kind,
            'job.attempt': job.attempts,
            'job.max_attempts': job.maxAttempts,
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
      ),
    );
    const completed = await completeJob(db, job, result ?? null);
    return completed ? 'succeeded' : 'stale';
  } catch (error) {
    if (error instanceof JobCancelledError) {
      await acknowledgeJobCancellation(db, job);
      return 'cancelled';
    }
    captureWorkerFailure(error, { worker: `background-job:${job.queue}`, jobId: job.id });
    return failJob(db, job, error);
  } finally {
    watch.stop();
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
    cancelled: 0,
    retried: 0,
    deadLettered: 0,
    reaped: await reapExpiredJobLeases(options.db),
    abandonedCancellations: await reapAbandonedCancellations(options.db),
    pruned: 0,
    drained: false,
    unhealthyQueues: [],
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
        const claimedAt = now();
        for (const job of claimed) {
          recordQueueWait({ queue: job.queue, waitMs: claimedAt - Date.parse(job.runAfter) });
          track(job);
        }
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
          else if (outcome === 'cancelled') summary.cancelled += 1;
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
  const stats = await recordQueueBacklog(options.db);
  summary.unhealthyQueues = (await reportJobHealth(stats)).map((alert) => alert.queue);
  logger.info(summary, 'Background job drain completed');
  return summary;
}
