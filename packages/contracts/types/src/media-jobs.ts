export const MEDIA_JOB_STATUSES = ['queued', 'running', 'failed', 'done', 'cancelled'] as const;

export type MediaJobStatus = (typeof MEDIA_JOB_STATUSES)[number];

export const IN_FLIGHT_MEDIA_JOB_STATUSES: readonly MediaJobStatus[] = ['queued', 'running'];

export function isInFlightMediaJobStatus(status: MediaJobStatus): boolean {
  return IN_FLIGHT_MEDIA_JOB_STATUSES.includes(status);
}
