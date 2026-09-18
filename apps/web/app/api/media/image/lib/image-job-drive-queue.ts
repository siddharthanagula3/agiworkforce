import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { enqueueJob } from '@/lib/jobs/job-service';
import { logger } from '@/lib/logger';
import type { ImageGenerationJob } from '@/lib/server/image-generation-jobs';

export const IMAGE_JOB_DRIVE_KIND = 'media-generation.image-attempt';

/**
 * An edit started from uploaded bytes has nothing stored to replay, so only the
 * sender can retry it and an unattended drive would burn the attempt.
 */
export function isImageGenerationJobDrivable(job: ImageGenerationJob): boolean {
  return job.operation === 'generate' || job.plan.sourceAssetId !== undefined;
}

/**
 * Hand the next attempt to the background drain. The key carries the attempt
 * count, so each attempt queues one drive and a repeated call collapses onto it.
 */
export async function scheduleImageGenerationJobDrive(input: {
  db: DatabaseAdapter;
  job: ImageGenerationJob;
  delaySeconds: number;
  now?: () => number;
}): Promise<boolean> {
  if (!isImageGenerationJobDrivable(input.job)) return false;
  if (input.job.terminalAt !== null || input.job.cancelRequestedAt !== null) return false;
  if (input.job.attempts >= input.job.maxAttempts) return false;

  const at = (input.now ?? Date.now)() + Math.max(0, input.delaySeconds) * 1_000;
  try {
    await enqueueJob(input.db, {
      kind: IMAGE_JOB_DRIVE_KIND,
      userId: input.job.userId,
      organizationId: input.job.organizationId,
      idempotencyKey: `image-job:${input.job.id}:${input.job.attempts}`,
      runAfter: new Date(at),
      payload: { jobId: input.job.id },
    });
    return true;
  } catch (error) {
    // The client-driven status poll still re-drives the job, so a queue that
    // refuses the handoff must not fail the attempt that is already running.
    logger.error({ error, jobId: input.job.id }, 'Image job drive could not be queued');
    return false;
  }
}
