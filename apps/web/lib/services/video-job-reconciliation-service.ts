import 'server-only';

import { randomUUID } from 'node:crypto';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import {
  authenticatedMediaUrl,
  deleteStoredMedia,
  isVideoStorageConfigured,
  storeMediaFile,
  videoStoragePathname,
} from '@/lib/server/media-storage';
import { deleteVideoMediaAsset, upsertVideoMediaAsset } from '@/lib/server/media-assets';
import {
  beginVideoProviderCancellationAttempt,
  claimVideoGenerationJob,
  deferVideoGenerationJob,
  deferVideoGenerationJobFailure,
  finalizeVideoGenerationJob,
  getVideoGenerationJobForSystem,
  listDueVideoGenerationJobIds,
  markVideoGenerationOutcomeUnknown,
  recordVideoProviderCancellationAttempt,
  type VideoGenerationJob,
} from '@/lib/server/video-generation-jobs';
import { buildAiGeneratedProvenance } from '@/lib/compliance/ai-act';
import {
  downloadVideoProviderOutput,
  pollVideoProvider,
  requestRunwayVideoCancellation,
  VideoProviderOutputError,
} from '@/lib/services/video-provider-output-service';
import { VIDEO_PROVIDER_TASK_ATTACHMENT_GRACE_MS } from '@/lib/workflows/video-generation-timing';
import { syncVideoGenerationTranscript } from '@/lib/server/video-generation-transcript';

const PROVIDER_POLL_SECONDS = 10;
const MAX_RECONCILIATION_FAILURES = 5;
const PROVIDER_SUBMISSION_GRACE_MS = 2 * 60 * 1_000;
const PROVIDER_STALL_ESCALATION_MS = 2 * 60 * 60 * 1_000;

function shouldRaiseOperationalIncident(job: VideoGenerationJob): boolean {
  return Date.now() - new Date(job.createdAt).getTime() >= PROVIDER_STALL_ESCALATION_MS;
}
const PROVIDER_OUTCOME_UNKNOWN_ERROR =
  'The provider may have accepted this video, but its task identity could not be verified. The incident was recorded; contact support if you need help with the charge.';

function isTerminal(job: VideoGenerationJob): boolean {
  return job.status === 'completed' || job.status === 'failed' || job.status === 'outcome_unknown';
}

export interface PublicVideoJobStatus {
  success: true;
  task_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  video_url?: string;
  progress?: number;
  error?: string;
  cancel_requested?: true;
  cancellation_state?:
    | 'requested'
    | 'provider_request_acknowledged'
    | 'unsupported'
    | 'unconfirmed';
}

export function publicVideoJobStatus(job: VideoGenerationJob): PublicVideoJobStatus {
  const status =
    job.status === 'submitting'
      ? 'queued'
      : job.status === 'outcome_unknown'
        ? 'failed'
        : job.status;
  return {
    success: true,
    task_id: job.id,
    status,
    ...(job.progress == null ? {} : { progress: job.progress }),
    ...(job.status === 'completed' && job.assetId
      ? { video_url: authenticatedMediaUrl(job.assetId) }
      : {}),
    ...(job.status === 'failed' || job.status === 'outcome_unknown'
      ? { error: job.publicError ?? 'Video generation failed.' }
      : {}),
    ...(job.cancelRequestedAt
      ? {
          cancel_requested: true as const,
          cancellation_state:
            job.provider !== 'runway'
              ? ('unsupported' as const)
              : job.providerCancelAcknowledgedAt
                ? ('provider_request_acknowledged' as const)
                : job.providerCancelAttemptedAt || job.cancelAttempts >= 5
                  ? ('unconfirmed' as const)
                  : ('requested' as const),
        }
      : {}),
  };
}

class VideoAssetCompensationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'VideoAssetCompensationError';
  }
}

interface PersistedVideoAsset {
  assetId: string;
  pathname: string;
}

async function removePersistedVideo(
  db: DatabaseAdapter,
  job: VideoGenerationJob,
  pathname: string,
): Promise<void> {
  await deleteStoredMedia(pathname);
  await deleteVideoMediaAsset(job.id, job.userId, db);
}

function jitteredDelaySeconds(baseSeconds: number, jobId: string, salt = 0): number {
  const boundedBase = Math.max(5, Math.min(Math.trunc(baseSeconds), 600));
  let hash = salt | 0;
  for (let index = 0; index < jobId.length; index += 1) {
    hash = Math.imul(hash ^ jobId.charCodeAt(index), 16_777_619);
  }
  const spread = Math.max(1, Math.floor(boundedBase * 0.2));
  return Math.min(boundedBase + (Math.abs(hash) % (spread + 1)), 600);
}

function retryDelaySeconds(
  failures: number,
  jobId: string,
  providerMinimumSeconds?: number,
): number {
  const exponential = Math.min(15 * 2 ** Math.max(0, failures), 300);
  return jitteredDelaySeconds(Math.max(exponential, providerMinimumSeconds ?? 0), jobId, failures);
}

async function finishFailed(
  db: DatabaseAdapter,
  job: VideoGenerationJob,
  claimToken: string,
  publicError: string,
): Promise<VideoGenerationJob> {
  const finalized = await finalizeVideoGenerationJob({
    db,
    jobId: job.id,
    claimToken,
    outcome: 'failed',
    publicError,
  });
  if (!finalized) throw new Error('Video job disappeared during failure settlement.');
  return finalized;
}

async function persistCompletedVideo(
  db: DatabaseAdapter,
  job: VideoGenerationJob,
  output: { url: string } | { base64: string } | { openRouterContentIndex: number },
): Promise<PersistedVideoAsset> {
  if (!isVideoStorageConfigured()) {
    throw new VideoProviderOutputError(
      'Video storage is unavailable, so this result could not be delivered.',
      false,
    );
  }

  const downloaded = await downloadVideoProviderOutput(job, output);
  try {
    const plannedPathname = videoStoragePathname({
      userId: job.userId,
      storageId: job.id,
      contentType: downloaded.contentType,
    });
    let stored;
    try {
      stored = await storeMediaFile({
        userId: job.userId,
        kind: 'video',
        filePath: downloaded.filePath,
        byteSize: downloaded.byteSize,
        contentType: downloaded.contentType,
        storageId: job.id,
      });
    } catch (error) {
      try {
        await deleteStoredMedia(plannedPathname);
        await deleteVideoMediaAsset(job.id, job.userId, db);
      } catch (cleanupError) {
        logger.error(
          { jobId: job.id, cleanupError },
          'Could not compensate ambiguous video object upload',
        );
        throw new VideoAssetCompensationError(
          'Ambiguous video upload compensation is incomplete; settlement must remain active.',
          { cause: error },
        );
      }
      throw error;
    }
    const provenance = buildAiGeneratedProvenance({
      kind: 'video',
      provider: job.provider,
      model: job.model,
    });
    try {
      const assetId = await upsertVideoMediaAsset(
        {
          id: job.id,
          userId: job.userId,
          organizationId: job.organizationId,
          mimeType: downloaded.contentType,
          storageUrl: stored.pathname,
          storagePathname: stored.pathname,
          byteSize: stored.byteSize,
          prompt: job.prompt,
          provider: job.provider,
          model: job.model,
          sourceSurface: job.sourceSurface,
          metadata: {
            origin: 'generated',
            surface: 'file',
            filename: `agi-video-${job.id}.${downloaded.contentType === 'video/webm' ? 'webm' : downloaded.contentType === 'video/quicktime' ? 'mov' : 'mp4'}`,
            previewable: true,
            aiAct: provenance,
            durationSecs: job.durationSecs,
            resolution: job.resolution,
            ...(job.aspectRatio ? { aspectRatio: job.aspectRatio } : {}),
            ...(job.generateAudio === undefined ? {} : { generateAudio: job.generateAudio }),
          },
        },
        db,
      );
      return { assetId, pathname: stored.pathname };
    } catch (error) {
      try {
        await removePersistedVideo(db, job, stored.pathname);
      } catch (cleanupError) {
        logger.error(
          { jobId: job.id, cleanupError },
          'Could not compensate video storage after catalog persistence failed',
        );
        throw new VideoAssetCompensationError(
          'Video asset compensation is incomplete; settlement must remain active.',
          { cause: error },
        );
      }
      throw error;
    }
  } finally {
    try {
      await downloaded.cleanup();
    } catch (cleanupError) {
      logger.warn({ jobId: job.id, cleanupError }, 'Could not remove staged provider video');
    }
  }
}

async function handleReconciliationError(input: {
  db: DatabaseAdapter;
  job: VideoGenerationJob;
  claimToken: string;
  error: unknown;
}): Promise<VideoGenerationJob> {
  const providerError = input.error instanceof VideoProviderOutputError ? input.error : undefined;
  const failureNumber = input.job.reconcileFailures + 1;
  const terminal =
    providerError?.retryable === false || failureNumber >= MAX_RECONCILIATION_FAILURES;
  const publicError = providerError?.message ?? 'Video processing is temporarily unavailable.';

  if (terminal) {
    return markClaimedVideoGenerationOutcomeUnknown(
      input.db,
      input.job,
      input.claimToken,
      input.job.providerTaskId ?? undefined,
      providerError?.retryable === true
        ? 'AGI could not verify the provider outcome after bounded retries. The incident was recorded; contact support if you need help with the charge.'
        : 'AGI could not safely verify or deliver the provider result. The incident was recorded; contact support if you need help with the charge.',
    );
  }

  return deferVideoGenerationJobFailure({
    db: input.db,
    jobId: input.job.id,
    claimToken: input.claimToken,
    retryAfterSeconds: retryDelaySeconds(
      input.job.reconcileFailures,
      input.job.id,
      providerError?.retryAfterSeconds,
    ),
    publicError,
  });
}

async function reconcileVideoGenerationJobCore(
  db: DatabaseAdapter,
  snapshot: VideoGenerationJob,
): Promise<VideoGenerationJob> {
  if (isTerminal(snapshot)) return snapshot;

  const claimToken = randomUUID();
  const claimed = await claimVideoGenerationJob({
    db,
    jobId: snapshot.id,
    claimToken,
    claimSeconds: 360,
  });
  if (!claimed) {
    return (await getVideoGenerationJobForSystem(db, snapshot.id)) ?? snapshot;
  }
  if (isTerminal(claimed)) return claimed;

  if (!claimed.providerTaskId) {
    if (claimed.providerStartedAt) {
      if (
        Date.now() - new Date(claimed.providerStartedAt).getTime() <
        VIDEO_PROVIDER_TASK_ATTACHMENT_GRACE_MS
      ) {
        return deferVideoGenerationJob({
          db,
          jobId: claimed.id,
          claimToken,
          status: 'submitting',
          retryAfterSeconds: jitteredDelaySeconds(10, claimed.id, claimed.reconcileFailures),
        });
      }
      return markClaimedVideoGenerationOutcomeUnknown(db, claimed, claimToken);
    }
    if (claimed.cancelRequestedAt) {
      return finishFailed(
        db,
        claimed,
        claimToken,
        'Video generation was cancelled before the provider request started.',
      );
    }
    if (Date.now() - new Date(claimed.createdAt).getTime() < PROVIDER_SUBMISSION_GRACE_MS) {
      return deferVideoGenerationJob({
        db,
        jobId: claimed.id,
        claimToken,
        status: 'submitting',
        retryAfterSeconds: jitteredDelaySeconds(5, claimed.id, claimed.reconcileFailures),
      });
    }
    return finishFailed(
      db,
      claimed,
      claimToken,
      'Video generation stopped before the provider request was started.',
    );
  }

  if (
    claimed.cancelRequestedAt &&
    claimed.provider === 'runway' &&
    !claimed.providerCancelAcknowledgedAt &&
    !claimed.providerCancelAttemptedAt &&
    claimed.cancelAttempts === 0
  ) {
    let attempted: VideoGenerationJob;
    try {
      attempted = await beginVideoProviderCancellationAttempt({
        db,
        jobId: claimed.id,
        claimToken,
      });
    } catch (error) {
      logger.warn(
        { jobId: claimed.id, error },
        'Runway cancellation boundary could not be confirmed before egress',
      );
      return deferVideoGenerationJob({
        db,
        jobId: claimed.id,
        claimToken,
        status:
          claimed.status === 'submitting' || claimed.status === 'queued'
            ? claimed.status
            : 'processing',
        ...(claimed.progress == null ? {} : { progress: claimed.progress }),
        retryAfterSeconds: retryDelaySeconds(claimed.reconcileFailures, claimed.id),
      });
    }
    try {
      await requestRunwayVideoCancellation(attempted);
      return recordVideoProviderCancellationAttempt({
        db,
        jobId: claimed.id,
        claimToken,
        acknowledged: true,
        retryAfterSeconds: 5,
      });
    } catch (error) {
      const providerError = error instanceof VideoProviderOutputError ? error : undefined;
      logger.warn(
        { jobId: claimed.id, error },
        'Runway video cancellation request crossed an ambiguous provider boundary',
      );
      return recordVideoProviderCancellationAttempt({
        db,
        jobId: claimed.id,
        claimToken,
        acknowledged: false,
        publicError: providerError?.message ?? 'Runway cancellation is temporarily unavailable.',
        exhausted: true,
        retryAfterSeconds: retryDelaySeconds(claimed.cancelAttempts, claimed.id),
      });
    }
  }

  let persistedAsset: PersistedVideoAsset | undefined;
  try {
    const provider = await pollVideoProvider(claimed);
    if (provider.status === 'queued' || provider.status === 'processing') {
      const stalled = shouldRaiseOperationalIncident(claimed);
      return deferVideoGenerationJob({
        db,
        jobId: claimed.id,
        claimToken,
        status: provider.status,
        progress: provider.progress,
        retryAfterSeconds: jitteredDelaySeconds(
          Math.max(PROVIDER_POLL_SECONDS, provider.retryAfterSeconds ?? 0),
          claimed.id,
          claimed.reconcileFailures,
        ),
        raiseIncident: stalled,
      });
    }
    if (provider.status === 'failed') {
      if (provider.moderated) {
        return markClaimedVideoGenerationOutcomeUnknown(
          db,
          claimed,
          claimToken,
          claimed.providerTaskId,
          'The provider safety system could not deliver this video. The incident was recorded; contact support if you need help with the charge.',
          provider.providerFailureCode,
        );
      }
      return finishFailed(db, claimed, claimToken, provider.error);
    }

    if (provider.status !== 'completed') {
      throw new VideoProviderOutputError('The provider returned an unknown task state.', true);
    }
    if (claimed.provider === 'openrouter' && provider.actualCostCents == null) {
      throw new VideoProviderOutputError(
        'OpenRouter completed without authoritative provider usage.',
        true,
      );
    }
    if (claimed.provider === 'runway' && claimed.cancelRequestedAt) {
      return finishFailed(
        db,
        claimed,
        claimToken,
        'Runway completed after cancellation was requested. AGI did not deliver the result.',
      );
    }
    const beforePersistence = await getVideoGenerationJobForSystem(db, claimed.id);
    if (
      beforePersistence?.provider === 'runway' &&
      beforePersistence.cancelRequestedAt &&
      !claimed.cancelRequestedAt
    ) {
      return deferVideoGenerationJob({
        db,
        jobId: claimed.id,
        claimToken,
        status: 'processing',
        ...(claimed.progress == null ? {} : { progress: claimed.progress }),
        retryAfterSeconds: jitteredDelaySeconds(5, claimed.id, 1),
      });
    }
    persistedAsset = await persistCompletedVideo(db, claimed, provider.output);
    const finalized = await finalizeVideoGenerationJob({
      db,
      jobId: claimed.id,
      claimToken,
      outcome: 'completed',
      assetId: persistedAsset.assetId,
      actualCostCents: provider.actualCostCents ?? claimed.estimatedCostCents,
    });
    if (!finalized) throw new Error('Video job disappeared during completion settlement.');
    return finalized;
  } catch (error) {
    const current = await getVideoGenerationJobForSystem(db, claimed.id);
    if (current?.status === 'completed') return current;

    if (persistedAsset) {
      try {
        await removePersistedVideo(db, claimed, persistedAsset.pathname);
      } catch (cleanupError) {
        logger.error(
          { jobId: claimed.id, error, cleanupError },
          'Video completion failed and persisted output compensation is incomplete',
        );
        if (current && !isTerminal(current)) {
          return deferVideoGenerationJob({
            db,
            jobId: claimed.id,
            claimToken,
            status: 'processing',
            ...(claimed.progress == null ? {} : { progress: claimed.progress }),
            retryAfterSeconds: 60,
            raiseIncident: shouldRaiseOperationalIncident(claimed),
          });
        }
        return current ?? claimed;
      }
    }

    if (current && isTerminal(current)) return current;
    if (error instanceof VideoAssetCompensationError) {
      return deferVideoGenerationJob({
        db,
        jobId: claimed.id,
        claimToken,
        status: 'processing',
        ...(claimed.progress == null ? {} : { progress: claimed.progress }),
        retryAfterSeconds: 60,
        raiseIncident: shouldRaiseOperationalIncident(claimed),
      });
    }
    logger.warn({ jobId: claimed.id, error }, 'Video reconciliation attempt failed');
    return handleReconciliationError({ db, job: claimed, claimToken, error });
  }
}

async function projectVideoGenerationTranscript(
  db: DatabaseAdapter,
  job: VideoGenerationJob,
  logMessage: string,
): Promise<void> {
  try {
    await syncVideoGenerationTranscript(db, job);
  } catch (error) {
    logger.warn({ error, jobId: job.id, assistantMessageId: job.assistantMessageId }, logMessage);
  }
}

export async function reconcileVideoGenerationJob(
  db: DatabaseAdapter,
  snapshot: VideoGenerationJob,
): Promise<VideoGenerationJob> {
  const reconciled = await reconcileVideoGenerationJobCore(db, snapshot);
  await projectVideoGenerationTranscript(
    db,
    reconciled,
    'Video transcript projection remains pending',
  );
  return reconciled;
}

export async function reconcileVideoGenerationJobWithRequiredTranscript(
  db: DatabaseAdapter,
  snapshot: VideoGenerationJob,
): Promise<VideoGenerationJob> {
  const reconciled = await reconcileVideoGenerationJobCore(db, snapshot);
  await syncVideoGenerationTranscript(db, reconciled);
  return reconciled;
}

export async function failClaimedVideoGenerationJob(
  db: DatabaseAdapter,
  snapshot: VideoGenerationJob,
  claimToken: string,
  publicError: string,
): Promise<VideoGenerationJob> {
  const failed = isTerminal(snapshot)
    ? snapshot
    : await finishFailed(db, snapshot, claimToken, publicError);
  await projectVideoGenerationTranscript(
    db,
    failed,
    'Failed video transcript projection remains pending',
  );
  return failed;
}

export async function markClaimedVideoGenerationOutcomeUnknown(
  db: DatabaseAdapter,
  snapshot: VideoGenerationJob,
  claimToken: string,
  providerTaskId?: string,
  publicError = PROVIDER_OUTCOME_UNKNOWN_ERROR,
  providerFailureCode?: string,
): Promise<VideoGenerationJob> {
  if (isTerminal(snapshot)) {
    await projectVideoGenerationTranscript(
      db,
      snapshot,
      'Unknown video transcript projection remains pending',
    );
    return snapshot;
  }
  const marked = await markVideoGenerationOutcomeUnknown({
    db,
    jobId: snapshot.id,
    claimToken,
    publicError,
    ...(providerTaskId ? { providerTaskId } : {}),
    ...(providerFailureCode ? { providerFailureCode } : {}),
  });
  if (!marked) throw new Error('Ambiguous video provider start could not be persisted.');
  logger.error(
    {
      event: 'video_provider_outcome_unknown',
      jobId: snapshot.id,
      userId: snapshot.userId,
      provider: snapshot.provider,
      model: snapshot.model,
      providerTaskIdRecorded: Boolean(providerTaskId),
      providerFailureCodeRecorded: Boolean(providerFailureCode),
    },
    'Video provider outcome is unknown; generation will not be replayed',
  );
  await projectVideoGenerationTranscript(
    db,
    marked,
    'Unknown video transcript projection remains pending',
  );
  return marked;
}

export async function failVideoGenerationJob(
  db: DatabaseAdapter,
  snapshot: VideoGenerationJob,
  publicError: string,
): Promise<VideoGenerationJob> {
  if (isTerminal(snapshot)) {
    await projectVideoGenerationTranscript(
      db,
      snapshot,
      'Failed video transcript projection remains pending',
    );
    return snapshot;
  }
  const claimToken = randomUUID();
  const claimed = await claimVideoGenerationJob({
    db,
    jobId: snapshot.id,
    claimToken,
    claimSeconds: 180,
  });
  if (!claimed) {
    const current = await getVideoGenerationJobForSystem(db, snapshot.id);
    if (current && isTerminal(current)) {
      await projectVideoGenerationTranscript(
        db,
        current,
        'Failed video transcript projection remains pending',
      );
      return current;
    }
    throw new Error('Video submission failure could not claim its durable job.');
  }
  if (isTerminal(claimed)) {
    await projectVideoGenerationTranscript(
      db,
      claimed,
      'Failed video transcript projection remains pending',
    );
    return claimed;
  }
  const failed = await finishFailed(db, claimed, claimToken, publicError);
  await projectVideoGenerationTranscript(
    db,
    failed,
    'Failed video transcript projection remains pending',
  );
  return failed;
}

export interface VideoReconciliationSummary {
  considered: number;
  completed: number;
  failed: number;
  active: number;
  errors: number;
}

export async function reconcileDueVideoGenerationJobs(
  db: DatabaseAdapter,
  limit = 6,
): Promise<VideoReconciliationSummary> {
  const jobIds = await listDueVideoGenerationJobIds(db, limit);
  const summary: VideoReconciliationSummary = {
    considered: jobIds.length,
    completed: 0,
    failed: 0,
    active: 0,
    errors: 0,
  };

  for (const jobId of jobIds) {
    try {
      const job = await getVideoGenerationJobForSystem(db, jobId);
      if (!job) continue;
      const reconciled = await reconcileVideoGenerationJob(db, job);
      if (reconciled.status === 'completed') summary.completed += 1;
      else if (reconciled.status === 'failed' || reconciled.status === 'outcome_unknown')
        summary.failed += 1;
      else summary.active += 1;
    } catch (error) {
      summary.errors += 1;
      logger.error({ jobId, error }, 'Unattended video reconciliation failed');
    }
  }

  return summary;
}
