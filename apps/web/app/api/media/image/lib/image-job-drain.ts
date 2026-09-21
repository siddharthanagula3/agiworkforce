import 'server-only';

import type { JobHandlerContext } from '@/lib/jobs/job-drain';
import { PermanentJobError } from '@/lib/jobs/job-service';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { getImageGenerationJob } from '@/lib/server/image-generation-jobs';

import {
  isImageJobAttemptDue,
  isImageJobCancellationPending,
  reconcileCancelledImageGenerationJob,
  runImageGenerationJobAttempt,
} from './image-job-executor';
import { isImageGenerationJobDrivable } from './image-job-drive-queue';

/**
 * The next attempt of a durable image job, so one whose submitting request died
 * finishes without a client polling. A deferral queues its own successor.
 */
export async function driveImageGenerationJob(
  context: JobHandlerContext,
): Promise<Record<string, unknown>> {
  const userId = context.job.userId;
  if (!userId) throw new PermanentJobError('This image job drive carries no account to act for');
  const jobId = context.job.payload['jobId'];
  if (typeof jobId !== 'string' || !jobId.trim()) {
    throw new PermanentJobError('Image job drive payload is missing jobId');
  }

  const scopedDb = createClaimedUserScopedDb(context.db, {
    userId,
    organizationId: context.job.organizationId,
  });

  const job = await getImageGenerationJob(scopedDb, jobId, userId);
  if (!job) throw new PermanentJobError('The image job this drive names no longer exists');
  if (job.terminalAt !== null) return { jobId, status: job.status, settled: true };
  if (job.cancelRequestedAt !== null) {
    // The attempt that held the claim when the cancellation arrived closes the
    // job itself. When that attempt is gone, this drive is what releases the
    // reservation instead of leaving the job cancelling for good.
    if (!isImageJobCancellationPending(job, Date.now())) {
      throw new Error(`Image job ${jobId} is cancelling inside a live attempt`);
    }
    const closed = await reconcileCancelledImageGenerationJob({ db: scopedDb, job });
    return { jobId, status: (closed ?? job).status, settled: closed !== null };
  }
  if (job.attempts >= job.maxAttempts) {
    return { jobId, status: job.status, skipped: 'attempts_exhausted' };
  }
  if (!isImageGenerationJobDrivable(job)) {
    return { jobId, status: job.status, skipped: 'source_image_not_stored' };
  }
  if (!isImageJobAttemptDue(job, Date.now())) {
    throw new Error(`Image job ${jobId} is claimed or not yet due`);
  }

  const outcome = await runImageGenerationJobAttempt({ db: scopedDb, job });
  return {
    jobId,
    status: outcome.job.status,
    attempts: outcome.job.attempts,
    settled: outcome.job.terminalAt !== null,
  };
}
