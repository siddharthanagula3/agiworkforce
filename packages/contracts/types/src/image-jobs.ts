export const IMAGE_JOB_STATUSES = [
  'queued',
  'processing',
  'completed',
  'failed',
  'canceled',
] as const;

export type ImageJobStatus = (typeof IMAGE_JOB_STATUSES)[number];

export const IN_FLIGHT_IMAGE_JOB_STATUSES: readonly ImageJobStatus[] = ['queued', 'processing'];
