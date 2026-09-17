export interface JobQueuePolicy {
  maxConcurrency: number;
  maxAttempts: number;
  backoffBaseSeconds: number;
  backoffMaxSeconds: number;
  leaseSeconds: number;
  retainFinishedDays: number;
}

export const JOB_QUEUE_POLICIES = {
  notifications: {
    maxConcurrency: 10,
    maxAttempts: 6,
    backoffBaseSeconds: 30,
    backoffMaxSeconds: 1_800,
    leaseSeconds: 30,
    retainFinishedDays: 7,
  },
  email: {
    maxConcurrency: 5,
    maxAttempts: 8,
    backoffBaseSeconds: 60,
    backoffMaxSeconds: 6 * 3_600,
    leaseSeconds: 30,
    retainFinishedDays: 7,
  },
  webhooks: {
    maxConcurrency: 4,
    maxAttempts: 10,
    backoffBaseSeconds: 60,
    backoffMaxSeconds: 6 * 3_600,
    leaseSeconds: 45,
    retainFinishedDays: 7,
  },
  'data-deletion': {
    maxConcurrency: 2,
    maxAttempts: 12,
    backoffBaseSeconds: 300,
    backoffMaxSeconds: 24 * 3_600,
    leaseSeconds: 240,
    retainFinishedDays: 30,
  },
  'file-processing': {
    maxConcurrency: 5,
    maxAttempts: 8,
    backoffBaseSeconds: 60,
    backoffMaxSeconds: 6 * 3_600,
    leaseSeconds: 30,
    retainFinishedDays: 7,
  },
  research: {
    maxConcurrency: 5,
    maxAttempts: 6,
    backoffBaseSeconds: 60,
    backoffMaxSeconds: 3_600,
    leaseSeconds: 30,
    retainFinishedDays: 7,
  },
  'event-triggers': {
    maxConcurrency: 4,
    maxAttempts: 10,
    backoffBaseSeconds: 60,
    backoffMaxSeconds: 3_600,
    leaseSeconds: 60,
    retainFinishedDays: 14,
  },
} as const satisfies Record<string, JobQueuePolicy>;

export type JobQueueName = keyof typeof JOB_QUEUE_POLICIES;

export const JOB_QUEUE_NAMES = Object.keys(JOB_QUEUE_POLICIES) as JobQueueName[];

export function isJobQueueName(value: string): value is JobQueueName {
  return Object.hasOwn(JOB_QUEUE_POLICIES, value);
}

export const JOB_KINDS = {
  'notifications.schedule-completed': 'notifications',
  'email.schedule-completed': 'email',
  'webhooks.audit-stream-delivery': 'webhooks',
  'data-deletion.scheduled-account-erasure': 'data-deletion',
  'file-processing.purge-upload-object': 'file-processing',
  'research.settle-report-cost': 'research',
  'event-triggers.fire': 'event-triggers',
} as const satisfies Record<string, JobQueueName>;

export type JobKind = keyof typeof JOB_KINDS;

export function isJobKind(value: string): value is JobKind {
  return Object.hasOwn(JOB_KINDS, value);
}

export function queueForJobKind(kind: JobKind): JobQueueName {
  return JOB_KINDS[kind];
}

export function computeJobBackoffSeconds(
  policy: Pick<JobQueuePolicy, 'backoffBaseSeconds' | 'backoffMaxSeconds'>,
  attempts: number,
  random: () => number = Math.random,
): number {
  const exponent = Math.max(0, Math.min(30, attempts - 1));
  const ceiling = Math.min(policy.backoffMaxSeconds, policy.backoffBaseSeconds * 2 ** exponent);
  const jitter = 0.8 + Math.min(1, Math.max(0, random())) * 0.4;
  return Math.max(1, Math.round(Math.min(policy.backoffMaxSeconds, ceiling * jitter)));
}
