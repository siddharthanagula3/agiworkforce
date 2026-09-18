import 'server-only';

import { randomUUID } from 'node:crypto';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { classifyError, SPENDING_CAP_PROVIDER_HINT } from '@agiworkforce/provider-runtime';
import { getModelMetadataById, isExecutableImageModel } from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import { ledgerCentsFromMicrousd } from '@/lib/services/credit-service';
import { markProviderDegraded } from '@/lib/services/provider-availability-service';
import {
  finalizeManagedUsageRequest,
  markManagedUsageProviderStarted,
  type ManagedUsageRequestReservation,
} from '@/lib/services/managed-usage-request-service';
import {
  authenticatedMediaUrl,
  bytesFromBase64,
  bytesFromUrl,
  deleteStoredMedia,
  isImageStorageConfigured,
  storeMedia,
} from '@/lib/server/media-storage';
import { insertMediaAssetsAtomically } from '@/lib/server/media-assets';
import {
  claimImageGenerationJobAttempt,
  completeImageGenerationJob,
  deferImageGenerationJobFailure,
  failImageGenerationJob,
  getImageGenerationJob,
  isImageGenerationJobRetryable,
  listImageGenerationJobAssetIds,
  type ImageGenerationJob,
} from '@/lib/server/image-generation-jobs';
import { buildAiGeneratedProvenance, type AiGeneratedProvenance } from '@/lib/compliance/ai-act';
import {
  describeImageFailure,
  describeImageFailureFromProviderMessage,
  estimateImageCostMicrousd,
  generateImages,
  ImageProviderHttpError,
  isRetryableImageFailure,
  resolveImageRefBytes,
  sha256HexFromBase64,
  sha256HexFromBytes,
  type GeneratedImage,
  type ImageEditContext,
} from './image-generation-provider';

export interface ImageJobInlineEdit {
  sourceBytes: Uint8Array;
  maskBytes?: Uint8Array;
}

export interface ImageJobAttemptOutcome {
  job: ImageGenerationJob;
  images: GeneratedImage[];
  providerModel: string | null;
  provenance: AiGeneratedProvenance[];
  retryAfterSeconds?: number;
  failureKind?: ImageAttemptFailureKind;
}

export type ImageAttemptFailureKind = 'setup' | 'provider' | 'persistence';

const IMAGE_ATTEMPT_BACKOFF_SECONDS = 5;

export function reservationForImageJob(
  db: DatabaseAdapter,
  job: ImageGenerationJob,
): ManagedUsageRequestReservation {
  return {
    db,
    userId: job.userId,
    idempotencyKey: job.idempotencyKey,
    requestHash: job.requestHash,
    leaseToken: job.billingLeaseToken,
    estimatedCostMicrousd: job.estimatedCostMicrousd,
    estimatedCostCents: ledgerCentsFromMicrousd(job.estimatedCostMicrousd),
    provider: job.provider,
    model: job.model,
  };
}

function usageFor(
  job: ImageGenerationJob,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  return {
    operation: 'image',
    sourceSurface: job.sourceSurface,
    provider: job.provider,
    model: job.model,
    jobId: job.id,
    attempt: job.attempts,
    ...extra,
  };
}

async function settleFailure(
  db: DatabaseAdapter,
  job: ImageGenerationJob,
  reason: string,
): Promise<{
  billingOutcome: 'released' | null;
  billingSettlementStatus: 'succeeded' | 'pending' | 'terminal' | null;
}> {
  try {
    const settlement = await finalizeManagedUsageRequest({
      ...reservationForImageJob(db, job),
      outcome: 'failed',
      actualCostMicrousd: 0,
      usage: usageFor(job, { reason }),
    });
    return {
      billingOutcome: settlement.requestStatus === 'released' ? 'released' : null,
      billingSettlementStatus: settlement.settlementStatus,
    };
  } catch (error) {
    logger.error(
      { event: 'image_refund_settlement_unrecorded', error, jobId: job.id, userId: job.userId },
      'Image job failure settlement could not be persisted',
    );
    return { billingOutcome: null, billingSettlementStatus: null };
  }
}

async function closeAttemptAsFailed(input: {
  db: DatabaseAdapter;
  job: ImageGenerationJob;
  claimToken: string;
  publicError: string;
  reason: string;
  retryable: boolean;
  retryAfterSeconds?: number;
  detached?: boolean;
}): Promise<ImageGenerationJob> {
  if (input.detached) {
    await settleFailure(input.db, input.job, input.reason);
    return {
      ...input.job,
      status: 'failed',
      retryable: false,
      publicError: input.publicError,
      terminalAt: new Date().toISOString(),
    };
  }

  const attemptsLeft = input.job.attempts < input.job.maxAttempts;
  if (input.retryable && attemptsLeft) {
    return deferImageGenerationJobFailure({
      db: input.db,
      jobId: input.job.id,
      claimToken: input.claimToken,
      publicError: input.publicError,
      retryAfterSeconds: input.retryAfterSeconds ?? IMAGE_ATTEMPT_BACKOFF_SECONDS,
    });
  }

  const settlement = await settleFailure(input.db, input.job, input.reason);
  return failImageGenerationJob({
    db: input.db,
    jobId: input.job.id,
    claimToken: input.claimToken,
    publicError: input.publicError,
    billingOutcome: settlement.billingOutcome,
    billingSettlementStatus: settlement.billingSettlementStatus,
  });
}

async function resolveEditContext(input: {
  db: DatabaseAdapter;
  job: ImageGenerationJob;
  inlineEdit?: ImageJobInlineEdit | undefined;
}): Promise<ImageEditContext | undefined> {
  const { job } = input;
  if (job.operation === 'generate') return undefined;

  if (input.inlineEdit) {
    if (
      job.sourceImageSha256 &&
      sha256HexFromBytes(input.inlineEdit.sourceBytes) !== job.sourceImageSha256
    ) {
      throw new Error('The source image supplied for this retry is not the one that was charged.');
    }
    if (
      job.maskImageSha256 &&
      (!input.inlineEdit.maskBytes ||
        sha256HexFromBytes(input.inlineEdit.maskBytes) !== job.maskImageSha256)
    ) {
      throw new Error('The mask supplied for this retry is not the one that was charged.');
    }
    return {
      operation: job.operation,
      sourceBytes: input.inlineEdit.sourceBytes,
      ...(input.inlineEdit.maskBytes ? { maskBytes: input.inlineEdit.maskBytes } : {}),
      transparentBackground: job.plan.transparentBackground,
    };
  }

  if (!job.plan.sourceAssetId) {
    throw new Error(
      'This edit was started from an uploaded image, so a retry has to be sent with that image again.',
    );
  }
  const sourceBytes = await resolveImageRefBytes(
    { asset_id: job.plan.sourceAssetId },
    job.userId,
    input.db,
  );
  const maskBytes = job.plan.maskAssetId
    ? await resolveImageRefBytes({ asset_id: job.plan.maskAssetId }, job.userId, input.db)
    : undefined;
  return {
    operation: job.operation,
    sourceBytes,
    ...(maskBytes ? { maskBytes } : {}),
    transparentBackground: job.plan.transparentBackground,
  };
}

interface PersistedImages {
  assetIds: string[];
  images: GeneratedImage[];
  failures: string[];
}

async function persistGeneratedImages(input: {
  db: DatabaseAdapter;
  job: ImageGenerationJob;
  images: GeneratedImage[];
  provenance: AiGeneratedProvenance[];
  generatedAt: string;
}): Promise<PersistedImages> {
  const { job } = input;
  const failures: string[] = [];
  if (!isImageStorageConfigured()) {
    return { assetIds: [], images: input.images, failures };
  }

  type StagedImage = { idx: number; pathname: string; byteSize: number; contentType: string };
  const stagedOutcomes = await Promise.all(
    input.images.map(
      async (img, idx): Promise<{ staged?: StagedImage; idx: number; error?: string }> => {
        let storedPathname: string | null = null;
        try {
          let bytes: Buffer | null = null;
          let contentType: string = img.contentType ?? 'image/png';
          if (img.b64_json) {
            bytes = bytesFromBase64(img.b64_json);
          } else if (img.url) {
            const fetched = await bytesFromUrl(img.url);
            bytes = fetched.data;
            contentType = fetched.contentType;
          }
          if (!bytes) return { idx, error: 'provider returned neither image bytes nor a URL' };

          const existingClaim = input.provenance[idx];
          if (existingClaim && !existingClaim.content_hash_sha256) {
            input.provenance[idx] = buildAiGeneratedProvenance({
              kind: 'image',
              provider: job.provider,
              model: job.model,
              generatedAt: input.generatedAt,
              contentHashSha256: sha256HexFromBytes(bytes),
            });
          }

          const stored = await storeMedia({
            userId: job.userId,
            kind: 'image',
            data: bytes,
            contentType,
          });
          storedPathname = stored.pathname;
          return {
            idx,
            staged: { idx, pathname: stored.pathname, byteSize: stored.byteSize, contentType },
          };
        } catch (err) {
          if (storedPathname) await deleteStoredMedia(storedPathname).catch(() => undefined);
          return { idx, error: err instanceof Error ? err.message : String(err) };
        }
      },
    ),
  );

  const stagedImages: StagedImage[] = [];
  for (const outcome of stagedOutcomes) {
    if (outcome.staged) stagedImages.push(outcome.staged);
    else failures.push(`image ${outcome.idx}: ${outcome.error ?? 'unknown error'}`);
  }

  const images = [...input.images];
  const assetIds: string[] = [];
  if (failures.length === 0) {
    try {
      const inserted = await insertMediaAssetsAtomically(
        stagedImages.map((staged) => ({
          userId: job.userId,
          organizationId: job.organizationId,
          kind: 'image' as const,
          mimeType: staged.contentType,
          byteSize: staged.byteSize,
          storageUrl: staged.pathname,
          storagePathname: staged.pathname,
          prompt: job.prompt,
          provider: job.provider,
          model: job.model,
          sourceSurface: job.sourceSurface,
          conversationId: job.conversationId ?? undefined,
          metadata: { aiAct: input.provenance[staged.idx] },
        })),
        input.db,
      );
      if (!inserted || inserted.length !== stagedImages.length) {
        failures.push('media catalog is unavailable for the generated image batch');
      } else {
        stagedImages.forEach((staged, position) => {
          const assetId = inserted[position]!;
          assetIds.push(assetId);
          images[staged.idx] = { url: authenticatedMediaUrl(assetId) };
        });
      }
    } catch (error) {
      failures.push(
        error instanceof Error ? error.message : 'generated image catalog transaction failed',
      );
    }
  }

  if (failures.length > 0) {
    const cleanupResults = await Promise.allSettled(
      stagedImages.map((staged) => deleteStoredMedia(staged.pathname)),
    );
    cleanupResults.forEach((cleanup, index) => {
      if (cleanup.status === 'rejected') {
        logger.error(
          {
            err: cleanup.reason,
            userId: job.userId,
            pathname: stagedImages[index]?.pathname,
            event: 'generated_image_batch_object_cleanup_failed',
          },
          'Generated image batch object cleanup failed after catalog rollback',
        );
      }
    });
    return { assetIds: [], images: input.images, failures };
  }

  return { assetIds, images, failures };
}

/**
 * Run one attempt of a durable image job.
 *
 * The claim is what makes this safe to call from anywhere: the submitting
 * request, a later status poll that finds the previous attempt abandoned, or an
 * explicit retry. Whoever wins the claim runs the provider call; everyone else
 * gets the current snapshot back.
 *
 * `detached` is the path taken while 0226 is unapplied: the same provider,
 * persistence and settlement code runs against an in-memory job so image
 * generation keeps working, with no durable handle to retry or poll.
 */
export async function runImageGenerationJobAttempt(input: {
  db: DatabaseAdapter;
  job: ImageGenerationJob;
  inlineEdit?: ImageJobInlineEdit | undefined;
  detached?: boolean;
}): Promise<ImageJobAttemptOutcome> {
  const detached = input.detached === true;
  const claimToken = randomUUID();
  const claimed = detached
    ? { ...input.job, status: 'processing' as const, attempts: input.job.attempts + 1 }
    : await claimImageGenerationJobAttempt({
        db: input.db,
        jobId: input.job.id,
        userId: input.job.userId,
        claimToken,
      });
  if (!claimed) {
    const current =
      (await getImageGenerationJob(input.db, input.job.id, input.job.userId)) ?? input.job;
    return { job: current, images: [], providerModel: null, provenance: [] };
  }

  const job = claimed;
  const catalogModel = getModelMetadataById(job.model);
  if (!isExecutableImageModel(catalogModel)) {
    const failed = await closeAttemptAsFailed({
      db: input.db,
      job,
      claimToken,
      detached,
      publicError: 'The requested image model is no longer available for this provider.',
      reason: 'model_unavailable',
      retryable: false,
    });
    return { job: failed, images: [], providerModel: null, provenance: [], failureKind: 'setup' };
  }

  let edit: ImageEditContext | undefined;
  try {
    edit = await resolveEditContext({ db: input.db, job, inlineEdit: input.inlineEdit });
  } catch (error) {
    const failed = await closeAttemptAsFailed({
      db: input.db,
      job,
      claimToken,
      detached,
      publicError:
        error instanceof Error
          ? error.message
          : 'The source image for this edit could not be read.',
      reason: 'edit_source_unavailable',
      retryable: false,
    });
    return { job: failed, images: [], providerModel: null, provenance: [], failureKind: 'setup' };
  }

  try {
    await markManagedUsageProviderStarted(reservationForImageJob(input.db, job));
  } catch (error) {
    logger.error({ error, jobId: job.id }, 'Image job billing lifecycle rejected the attempt');
    const failed = await closeAttemptAsFailed({
      db: input.db,
      job,
      claimToken,
      detached,
      publicError:
        'The billing reservation for this image is no longer active. Start a new generation.',
      reason: 'billing_state_conflict',
      retryable: false,
    });
    return { job: failed, images: [], providerModel: null, provenance: [], failureKind: 'setup' };
  }

  let result: { images: GeneratedImage[]; model: string };
  try {
    result = await generateImages({
      provider: job.provider,
      prompt: job.prompt,
      aspectRatio: job.plan.aspectRatio,
      quality: job.plan.quality,
      style: job.plan.style,
      negativePrompt: job.plan.negativePrompt,
      n: job.imageCount,
      catalogModel,
      edit,
    });
    if (result.images.length === 0) {
      throw new Error(`${job.provider} image provider returned no usable image output`);
    }
  } catch (error) {
    const providerHttpError = error instanceof ImageProviderHttpError ? error : null;
    const errorMessage = error instanceof Error ? error.message : 'Image generation failed';
    const classified = error instanceof Error ? classifyError(error) : undefined;
    const providerLabel = job.provider === 'google' ? 'Google' : job.provider;

    let publicError = describeImageFailure(classified, providerLabel);
    let retryable = isRetryableImageFailure(classified);
    if (classified?.category === 'quota_exhausted') {
      markProviderDegraded(job.provider, classified.category);
      publicError =
        classified.providerHint === SPENDING_CAP_PROVIDER_HINT
          ? `${providerLabel}'s spending cap for this project is exceeded, so image generation is unavailable right now. Choose a different image model.`
          : `${providerLabel} has exhausted its image generation quota for now. Choose a different image model, or try again later.`;
    } else if (classified?.category === 'billing_exhausted') {
      markProviderDegraded(job.provider, classified.category);
    } else if (
      classified?.category === 'server_overload' ||
      classified?.category === 'capacity_off_switch'
    ) {
      markProviderDegraded(job.provider, classified.category);
      publicError = `${providerLabel} image generation is overloaded right now. Try again in a moment, or choose a different image model.`;
    } else if (providerHttpError?.status === 429) {
      publicError =
        'The image generation service is temporarily busy. Use Try again after the wait shown below.';
    } else {
      const fromMessage = describeImageFailureFromProviderMessage(errorMessage);
      if (fromMessage) {
        publicError = fromMessage.message;
        retryable = fromMessage.retryable;
      }
    }

    // An exhausted provider quota is not a wait this account can sit out, so a
    // Retry-After copied from that response would promise a recovery the model
    // choice has to make instead.
    const retryAfterSeconds =
      classified?.category === 'quota_exhausted' ? undefined : providerHttpError?.retryAfterSeconds;
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        userId: job.userId,
        provider: job.provider,
        jobId: job.id,
        attempt: job.attempts,
        retryable,
      },
      'Image generation attempt failed',
    );

    const failed = await closeAttemptAsFailed({
      db: input.db,
      job,
      claimToken,
      detached,
      publicError,
      reason: 'provider_failed',
      retryable,
      ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
    });
    return {
      job: failed,
      images: [],
      providerModel: null,
      provenance: [],
      failureKind: 'provider',
      ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
    };
  }

  const generatedAt = new Date().toISOString();
  const provenance: AiGeneratedProvenance[] = result.images.map((img) => {
    const hash = img.b64_json ? sha256HexFromBase64(img.b64_json) : undefined;
    return buildAiGeneratedProvenance({
      kind: 'image',
      provider: job.provider,
      model: job.model,
      generatedAt,
      ...(hash ? { contentHashSha256: hash } : {}),
    });
  });

  const persisted = await persistGeneratedImages({
    db: input.db,
    job,
    images: result.images,
    provenance,
    generatedAt,
  });

  if (persisted.failures.length > 0) {
    logger.error(
      { userId: job.userId, jobId: job.id, failures: persisted.failures },
      'Generated image persistence failed; the reservation is not settled against this attempt',
    );
    const failed = await closeAttemptAsFailed({
      db: input.db,
      job,
      claimToken,
      detached,
      publicError:
        'The image was generated but could not be saved to your library, so it was not charged. Try again; if this keeps happening, contact support.',
      reason: 'image_persistence_failed',
      retryable: true,
    });
    return {
      job: failed,
      images: [],
      providerModel: result.model,
      provenance,
      failureKind: 'persistence',
    };
  }

  const actualCostMicrousd = estimateImageCostMicrousd(
    job.provider,
    persisted.images.length,
    job.plan.quality,
    job.model,
  );
  let billingSettlementStatus: 'succeeded' | 'pending' | 'terminal' | null = null;
  try {
    const settlement = await finalizeManagedUsageRequest({
      ...reservationForImageJob(input.db, job),
      outcome: 'completed',
      actualCostMicrousd,
      usage: usageFor(job, { outputCount: persisted.images.length }),
    });
    billingSettlementStatus = settlement.settlementStatus;
  } catch (error) {
    logger.error(
      { event: 'image_completion_settlement_unrecorded', error, jobId: job.id },
      'Image job completion settlement could not be persisted',
    );
  }

  const completed = detached
    ? {
        ...job,
        status: 'completed' as const,
        actualCostMicrousd,
        billingOutcome: 'completed' as const,
        billingSettlementStatus,
        terminalAt: new Date().toISOString(),
      }
    : await completeImageGenerationJob({
        db: input.db,
        jobId: job.id,
        claimToken,
        assetIds: persisted.assetIds,
        actualCostMicrousd,
        billingSettlementStatus,
      });

  logger.info(
    {
      userId: job.userId,
      jobId: job.id,
      provider: job.provider,
      model: result.model,
      attempt: job.attempts,
      actualCostMicrousd,
    },
    'Durable image job delivered',
  );

  return {
    job: completed,
    images: persisted.images,
    providerModel: result.model,
    provenance,
  };
}

export type PublicImageJobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'canceled';

export interface PublicImageJobSnapshot {
  success: boolean;
  job_id: string;
  status: PublicImageJobStatus;
  provider: string;
  model: string;
  attempts: number;
  max_attempts: number;
  retryable: boolean;
  image_count: number;
  images: GeneratedImage[];
  error?: string;
  provenance?: AiGeneratedProvenance[];
}

export function publicImageJobSnapshot(
  job: ImageGenerationJob,
  images: GeneratedImage[],
): PublicImageJobSnapshot {
  return {
    success: job.status !== 'failed' && job.status !== 'canceled',
    job_id: job.id,
    status: job.status,
    provider: job.provider,
    model: job.model,
    attempts: job.attempts,
    max_attempts: job.maxAttempts,
    retryable: isImageGenerationJobRetryable(job),
    image_count: job.imageCount,
    images,
    ...(job.publicError ? { error: job.publicError } : {}),
  };
}

/**
 * Whether another attempt is owed: nothing holds the claim, the backoff has
 * elapsed, and the job is neither terminal nor out of attempts. This is what a
 * status poll uses to decide it has found work an interrupted request left.
 */
export function isImageJobAttemptDue(job: ImageGenerationJob, now: number): boolean {
  if (job.terminalAt !== null || job.cancelRequestedAt !== null) return false;
  if (job.attempts >= job.maxAttempts) return false;
  if (Date.parse(job.nextAttemptAt) > now) return false;
  return job.claimExpiresAt === null || Date.parse(job.claimExpiresAt) <= now;
}

/** The delivered candidates as authenticated library URLs. */
export async function imageJobDeliveredImages(
  db: DatabaseAdapter,
  job: ImageGenerationJob,
): Promise<GeneratedImage[]> {
  if (job.status !== 'completed') return [];
  const assetIds = await listImageGenerationJobAssetIds(db, job.id);
  return assetIds.map((assetId) => ({ url: authenticatedMediaUrl(assetId) }));
}
