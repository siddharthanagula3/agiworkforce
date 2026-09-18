export type JobHealthSeverity = 'warning' | 'critical';

/** What a queue reading has to carry to be judged, from any reader of it. */
export interface JobQueueHealthInput {
  queue: string;
  queued: number;
  dead: number;
  oldestQueuedAgeMs: number;
  stuck: number;
}

const MINUTE_MS = 60 * 1_000;

/**
 * The drain runs every five minutes, so an age of fifteen means three runs
 * passed the work over and an hour means it is not being picked up at all. A
 * lease that lapsed is counted on its own: the job is neither finished nor
 * dead, so no success rate and no dead-letter count moves while it sits there.
 */
export const JOB_HEALTH_THRESHOLDS = {
  warningAgeMs: 15 * MINUTE_MS,
  criticalAgeMs: 60 * MINUTE_MS,
  warningStuck: 1,
  criticalStuck: 5,
} as const;

export interface JobHealthAlert {
  queue: string;
  severity: JobHealthSeverity;
  reasons: string[];
  oldestQueuedAgeMs: number;
  stuck: number;
  queued: number;
  dead: number;
}

function ageReason(ageMs: number): string {
  return `oldest due job has waited ${Math.round(ageMs / MINUTE_MS)}m`;
}

function stuckReason(stuck: number): string {
  return `${stuck} job(s) hold a lease that lapsed without a result`;
}

export function evaluateJobHealth(stats: readonly JobQueueHealthInput[]): JobHealthAlert[] {
  const alerts: JobHealthAlert[] = [];

  for (const queue of stats) {
    const reasons: string[] = [];
    let severity: JobHealthSeverity | null = null;

    if (queue.oldestQueuedAgeMs >= JOB_HEALTH_THRESHOLDS.criticalAgeMs) {
      severity = 'critical';
      reasons.push(ageReason(queue.oldestQueuedAgeMs));
    } else if (queue.oldestQueuedAgeMs >= JOB_HEALTH_THRESHOLDS.warningAgeMs) {
      severity = 'warning';
      reasons.push(ageReason(queue.oldestQueuedAgeMs));
    }

    if (queue.stuck >= JOB_HEALTH_THRESHOLDS.criticalStuck) {
      severity = 'critical';
      reasons.push(stuckReason(queue.stuck));
    } else if (queue.stuck >= JOB_HEALTH_THRESHOLDS.warningStuck) {
      severity ??= 'warning';
      reasons.push(stuckReason(queue.stuck));
    }

    if (!severity) continue;
    alerts.push({
      queue: queue.queue,
      severity,
      reasons,
      oldestQueuedAgeMs: queue.oldestQueuedAgeMs,
      stuck: queue.stuck,
      queued: queue.queued,
      dead: queue.dead,
    });
  }

  return alerts;
}

export function jobHealthIncidentKey(queue: string): string {
  return `job-health:${queue}`;
}

export function describeJobHealth(alert: JobHealthAlert): string {
  return `- ${alert.queue}: ${alert.reasons.join('; ')} (queued ${alert.queued}, dead ${alert.dead})`;
}
