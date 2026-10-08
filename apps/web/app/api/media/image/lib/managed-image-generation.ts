import 'server-only';

import { randomUUID } from 'node:crypto';
import { NextResponse, after } from 'next/server';
import {
  ManagedMediaImageGenerationRequestSchema,
  supportsManagedMediaImageEdit,
} from '@agiworkforce/cloud-contracts';
import { providerKeepsInputsOutOfTraining } from '@agiworkforce/model-registry';
import { canUseBillingPlanCapability } from '@agiworkforce/types';
import { parseManagedMediaIdempotencyKey, type ManagedMediaSurface } from '@agiworkforce/utils';
import { aiGeneratedHeaders, type AiGeneratedProvenance } from '@/lib/compliance/ai-act';
import { logger } from '@/lib/logger';
import {
  matchDenylistedUpload,
  moderateManagedPrompt,
  moderateUploadedImage,
  recordModerationEvent,
  GENERATED_OUTPUT_REFUSAL,
  PLATFORM_POLICY_REFUSAL,
  UPLOADED_IMAGE_REFUSAL,
} from '@/lib/moderation';
import { recordMediaSafety } from '@/lib/observability/media-telemetry';
import { annotateActiveSpan } from '@/lib/observability/span';
import { isMediaAssetStoreReady } from '@/lib/server/media-assets';
import { isImageStorageConfigured } from '@/lib/server/media-storage';
import {
  MODEL_MAY_TRAIN_MESSAGE,
  NO_TRAINING_MEDIA_MODEL_MESSAGE,
  modelKeepsInputsOutOfTraining,
} from '@/lib/server/provider-training-opt-out';
import type { UserScopedDb } from '@/lib/server/rls-db';
import { sideCallTrainingOptOut } from '@/lib/server/side-call-training-policy';
import { resolveEntitlementBundle } from '@/lib/services/entitlement-resolution';
import { evaluateManagedComputeSubscriptionAccess } from '@/lib/services/managed-compute-access';
import {
  ManagedUsageRequestError,
  createManagedUsageErrorBody,
  fingerprintManagedUsageRequest,
  markManagedUsageClientDelivered,
  parseManagedUsageIdempotencyKey,
  reserveManagedUsageRequest,
  type ManagedUsageRequestReservation,
} from '@/lib/services/managed-usage-request-service';
import {
  createImageGenerationJob,
  getImageGenerationJobByIdempotencyKey,
  isImageJobStoreReady,
  IMAGE_JOB_CLAIM_SECONDS,
  IMAGE_JOB_LEASE_SECONDS,
  type ImageGenerationJob,
  type ImageGenerationPlan,
  type ImageJobProvider,
} from '@/lib/server/image-generation-jobs';
import { editMaskProblem } from './edit-mask';
import {
  estimateImageCostMicrousd,
  getDefaultProvider,
  IMAGE_ASPECT_RATIOS_BY_API,
  isProviderAvailable,
  maxImagesPerRequest,
  resolveImageCatalogModel,
  resolveImageProviderFromCatalogModel,
  editImagesSha256,
  resolveImageRefBytes,
  resolveProviderImageAspectRatio,
  sha256HexFromBytes,
  type ImageProvider,
} from './image-generation-provider';
import {
  imageJobDeliveredImages,
  publicImageJobSnapshot,
  reservationForImageJob,
  runImageGenerationJobAttempt,
  type ImageJobInlineEdit,
} from './image-job-executor';
import { scheduleImageGenerationJobDrive } from './image-job-drive-queue';

export interface ImageGenerationResponse {
  success: boolean;
  images: Array<{ url?: string; b64_json?: string }>;
  provider: ImageProvider;
  model: string;
  catalog_model?: string;
  latency_ms: number;
  error?: string;
  retry_after_seconds?: number;
  persisted?: boolean;
  provenance?: AiGeneratedProvenance[];
  job_id?: string;
  retryable?: boolean;
}

function managedUsageErrorResponse(
  headers: Record<string, string>,
  error: ManagedUsageRequestError,
): NextResponse {
  return NextResponse.json(
    createManagedUsageErrorBody(
      error,
      error.status === 402 || error.status === 429 ? 'insufficient_quota' : 'invalid_request_error',
    ),
    {
      status: error.status,
      headers,
    },
  );
}

export interface ManagedImageModelAsk {
  provider: string;
  modelId: string;
}

export interface ManagedImageGenerationInput {
  userId: string;
  startTime: number;
  headers: Record<string, string>;
  scope: () => Promise<UserScopedDb>;
  readBody: () => Promise<unknown>;
  idempotencyKey: string | null;
  modelPolicyRefusal: (model: ManagedImageModelAsk) => Promise<NextResponse | null>;
  assertCapabilityOpen?: (plan: string) => Promise<void>;
}

export async function generateManagedImage(
  input: ManagedImageGenerationInput,
): Promise<NextResponse> {
  const { userId, startTime, headers } = input;

  const entitlement = await resolveEntitlementBundle((await input.scope()).db, userId);
  const subscription = entitlement.subscription;

  if (!subscription) {
    return NextResponse.json(
      {
        error: {
          message: 'No active subscription found. Please subscribe to use image generation.',
          type: 'invalid_request_error',
          code: 'subscription_required',
        },
      },
      {
        status: 403,
        headers,
      },
    );
  }

  const subscriptionAccess = await evaluateManagedComputeSubscriptionAccess(
    (await input.scope()).db,
    userId,
    subscription,
  );
  if (!subscriptionAccess.allowed) {
    return NextResponse.json(
      {
        error: {
          message: subscriptionAccess.reason,
          type: 'invalid_request_error',
          code: subscriptionAccess.code,
        },
      },
      {
        status: 403,
        headers,
      },
    );
  }

  const userTier = entitlement.plan;
  if (!canUseBillingPlanCapability(userTier, 'image_generation')) {
    return NextResponse.json(
      {
        error: {
          message:
            'Image generation is available on Pro, Max, Team, and Enterprise plans. Upgrade your plan to unlock AI-powered image creation.',
          type: 'invalid_request_error',
          code: 'plan_upgrade_required',
          current_plan: userTier,
          required_plans: ['pro', 'max', 'max_15x', 'team', 'enterprise'],
        },
      },
      {
        status: 403,
        headers,
      },
    );
  }
  await input.assertCapabilityOpen?.(userTier);

  let body: unknown;
  try {
    body = await input.readBody();
  } catch {
    return NextResponse.json(
      {
        error: {
          message: 'Invalid JSON in request body',
          type: 'invalid_request_error',
        },
      },
      {
        status: 400,
        headers,
      },
    );
  }

  const validationResult = ManagedMediaImageGenerationRequestSchema.safeParse(body);
  if (!validationResult.success) {
    return NextResponse.json(
      {
        error: {
          // `error.message` is the serialized issue array, and this string is
          // what every media client renders to the user, so an unsupported
          // aspect ratio printed a JSON blob into the chat. The video route's
          // wording is the house format.
          message: `Invalid request: ${validationResult.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join('; ')}`,
          type: 'invalid_request_error',
          param: validationResult.error.issues[0]?.path.join('.'),
        },
      },
      {
        status: 400,
        headers,
      },
    );
  }

  const {
    prompt,
    conversation_id: conversationId,
    provider: requestedProvider,
    model: requestedModel,
    aspect_ratio: requestedAspectRatio,
    size,
    style,
    quality,
    n,
    negative_prompt,
    operation,
    source_image,
    mask_image,
    reference_images,
    transparent_background,
    async: wantsAsync,
  } = validationResult.data;

  // Always-on platform safety floor, ahead of model resolution, billing
  // reservation, and provider egress: a refused prompt must never be charged
  // for and must never leave this process. Covers every operation the handler
  // serves, generate and the edit paths (inpaint/outpaint/variation), which
  // all reach a provider through this same prompt.
  const moderation = moderateManagedPrompt({
    userId,
    surface: 'managed-image',
    segments: negative_prompt ? [prompt, negative_prompt] : [prompt],
  });
  if (!moderation.allowed) {
    recordMediaSafety({ media: 'image', decision: 'blocked', reason: 'prompt_moderation' });
    return NextResponse.json(
      {
        error: {
          message: moderation.refusal,
          type: 'invalid_request_error',
          code: 'content_policy_violation',
        },
      },
      {
        status: 422,
        headers,
      },
    );
  }

  const catalogProvider = requestedModel
    ? resolveImageProviderFromCatalogModel(requestedModel)
    : null;
  if (requestedModel && !catalogProvider) {
    return NextResponse.json(
      {
        error: {
          message: 'The requested model is not a supported image generation model.',
          type: 'invalid_request_error',
          code: 'model_unavailable',
        },
      },
      {
        status: 400,
        headers,
      },
    );
  }

  if (requestedProvider && catalogProvider && requestedProvider !== catalogProvider) {
    return NextResponse.json(
      {
        error: {
          message: `The requested image model is not served by the ${requestedProvider} provider.`,
          type: 'invalid_request_error',
          code: 'provider_model_mismatch',
        },
      },
      {
        status: 400,
        headers,
      },
    );
  }

  let provider: ImageProvider;
  try {
    const selectedProvider = requestedProvider ?? catalogProvider;
    if (selectedProvider) {
      if (!isProviderAvailable(selectedProvider)) {
        return NextResponse.json(
          {
            error: {
              message: `The ${selectedProvider} provider is not configured. Please try a different provider.`,
              type: 'invalid_request_error',
              code: 'provider_unavailable',
            },
          },
          {
            status: 400,
            headers,
          },
        );
      }
      provider = selectedProvider;
    } else {
      provider = getDefaultProvider();
    }
  } catch {
    return NextResponse.json(
      {
        error: {
          message: 'No image generation providers are configured. Please contact support.',
          type: 'server_error',
          code: 'no_providers',
        },
      },
      {
        status: 500,
        headers,
      },
    );
  }

  const catalogModel = resolveImageCatalogModel(provider, requestedModel);

  // The workspace model policy, checked on the RESOLVED catalog model rather
  // than on what was requested, a provider default must not be a way past a
  // rule the administrator wrote.
  if (catalogModel) {
    const modelPolicyResponse = await input.modelPolicyRefusal({
      provider: String(catalogModel.provider),
      modelId: catalogModel.id,
    });
    if (modelPolicyResponse) return modelPolicyResponse;
  }

  if (!catalogModel) {
    return NextResponse.json(
      {
        error: {
          message: 'The requested image model is not available for this provider.',
          type: 'invalid_request_error',
          code: 'model_unavailable',
        },
      },
      {
        status: 400,
        headers,
      },
    );
  }

  if (
    !(
      modelKeepsInputsOutOfTraining(catalogModel.id) && providerKeepsInputsOutOfTraining(provider)
    ) &&
    (await sideCallTrainingOptOut((await input.scope()).db, userId))
  ) {
    const chosen = Boolean(requestedModel || requestedProvider);
    return NextResponse.json(
      {
        error: {
          message: chosen ? MODEL_MAY_TRAIN_MESSAGE : NO_TRAINING_MEDIA_MODEL_MESSAGE,
          type: 'invalid_request_error',
          code: chosen ? 'model_may_train' : 'no_training_model_available',
        },
      },
      {
        status: 403,
        headers,
      },
    );
  }

  const maxImages = maxImagesPerRequest(catalogModel.imageApi);
  if (n > maxImages) {
    return NextResponse.json(
      {
        error: {
          message:
            maxImages === 1
              ? 'The requested image model supports one image per request.'
              : `The requested image model supports up to ${maxImages} images per request.`,
          type: 'invalid_request_error',
          code: 'unsupported_image_count',
          param: 'n',
          max_images: maxImages,
        },
      },
      {
        status: 400,
        headers,
      },
    );
  }

  if (catalogModel.imageApi === 'gemini' && !catalogModel.imageOutputMimeType) {
    logger.error(
      { provider, model: catalogModel.id },
      'Gemini image model is missing its catalog output MIME contract',
    );
    return NextResponse.json(
      {
        error: {
          message: 'The requested image model is not fully configured for this deployment.',
          type: 'server_error',
          code: 'image_model_contract_unavailable',
        },
      },
      {
        status: 503,
        headers,
      },
    );
  }

  const providerAspectRatio = resolveProviderImageAspectRatio(
    catalogModel,
    requestedAspectRatio,
    size,
  );
  if (!providerAspectRatio) {
    return NextResponse.json(
      {
        error: {
          message: `Aspect ratio ${requestedAspectRatio} is not supported by the requested image model.`,
          type: 'invalid_request_error',
          code: 'unsupported_aspect_ratio',
          param: 'aspect_ratio',
          supported_aspect_ratios: [...IMAGE_ASPECT_RATIOS_BY_API[catalogModel.imageApi]],
        },
      },
      {
        status: 400,
        headers,
      },
    );
  }

  const storageConfigured = isImageStorageConfigured();
  if (process.env.NODE_ENV === 'production' && !storageConfigured) {
    logger.error(
      { userId, provider, model: catalogModel.id },
      'Image generation unavailable because durable media storage is not configured',
    );
    return NextResponse.json(
      {
        error: {
          message:
            'Image generation is temporarily unavailable because generated images cannot be saved. Please try again later.',
          type: 'server_error',
          code: 'media_storage_unavailable',
        },
      },
      {
        status: 503,
        headers,
      },
    );
  }
  let mediaCatalogConfigured = false;
  try {
    mediaCatalogConfigured = await isMediaAssetStoreReady((await input.scope()).db);
  } catch (error) {
    logger.error(
      { error, userId, provider, model: catalogModel.id },
      'Image generation unavailable because media catalog readiness could not be verified',
    );
  }
  if (!mediaCatalogConfigured) {
    return NextResponse.json(
      {
        error: {
          message:
            'Image generation is temporarily unavailable because generated images cannot be cataloged. Please try again later.',
          type: 'server_error',
          code: 'media_catalog_unavailable',
        },
      },
      {
        status: 503,
        headers,
      },
    );
  }

  // The other half of the safety floor: client-supplied image bytes. A benign
  // prompt must not be a way to push prohibited imagery through the edit
  // endpoints, so both refs are resolved and hash-checked here, ahead of the
  // billing reservation and every provider call, and a refused upload is
  // therefore never charged for and never leaves this process.
  let inlineEdit: ImageJobInlineEdit | undefined;
  let sourceImageSha256: string | undefined;
  let maskImageSha256: string | undefined;
  if (operation !== 'generate' && source_image) {
    let sourceBytes: Uint8Array;
    let maskBytes: Uint8Array | undefined;
    let referenceBytes: Uint8Array[] = [];
    try {
      const referencesStoredAsset =
        'asset_id' in source_image ||
        (mask_image && 'asset_id' in mask_image) ||
        (reference_images ?? []).some((reference) => 'asset_id' in reference);
      const editRefDb = referencesStoredAsset ? (await input.scope()).db : undefined;
      sourceBytes = await resolveImageRefBytes(source_image, userId, editRefDb);
      maskBytes = mask_image
        ? await resolveImageRefBytes(mask_image, userId, editRefDb)
        : undefined;
      referenceBytes = await Promise.all(
        (reference_images ?? []).map((reference) =>
          resolveImageRefBytes(reference, userId, editRefDb),
        ),
      );
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          userId,
          provider,
          operation,
        },
        'Image edit source could not be resolved',
      );
      return NextResponse.json(
        {
          success: false,
          error:
            'The source image for this edit could not be read. Upload the image again and retry.',
          images: [],
          provider,
          model: 'unknown',
          latency_ms: Date.now() - startTime,
        } satisfies ImageGenerationResponse,
        {
          status: 422,
          headers,
        },
      );
    }

    const suppliedUploads: ReadonlyArray<readonly [string, Uint8Array]> = [
      ['source_image', sourceBytes],
      ...(maskBytes ? [['mask_image', maskBytes] as const] : []),
      ...referenceBytes.map((bytes, index) => [`reference_images.${index}`, bytes] as const),
    ];
    for (const [param, bytes] of suppliedUploads) {
      const hashMatch = matchDenylistedUpload(bytes);
      if (hashMatch.matched) {
        recordMediaSafety({ media: 'image', decision: 'blocked', reason: 'upload_hash_denylist' });
        recordModerationEvent({
          surface: 'upload',
          action: 'block',
          categories: ['known_illegal_media'],
          ruleIds: [`managed-image.${param}.hash-denylist`],
          userId,
          contentSha256: hashMatch.sha256,
          ...(hashMatch.listLabel ? { listLabel: hashMatch.listLabel } : {}),
        });
        return NextResponse.json(
          {
            error: {
              message: PLATFORM_POLICY_REFUSAL,
              type: 'invalid_request_error',
              code: 'content_policy_violation',
            },
          },
          {
            status: 422,
            headers,
          },
        );
      }

      // Generated output is parsed at the provider boundary; a client upload is
      // parsed here so a polyglot cannot ride an edit into a provider call.
      const structure = moderateUploadedImage(bytes);
      if (structure.allowed) continue;
      recordMediaSafety({ media: 'image', decision: 'blocked', reason: 'upload_structure' });
      recordModerationEvent({
        surface: 'upload',
        action: 'block',
        categories: ['malformed_media'],
        ruleIds: [`managed-image.${param}.${structure.reason}`],
        userId,
        contentSha256: hashMatch.sha256,
      });
      return NextResponse.json(
        {
          error: {
            message: UPLOADED_IMAGE_REFUSAL,
            type: 'invalid_request_error',
            code: 'invalid_source_image',
            param,
          },
        },
        {
          status: 422,
          headers,
        },
      );
    }

    const maskProblem = maskBytes ? editMaskProblem(sourceBytes, maskBytes) : null;
    if (maskProblem) {
      return NextResponse.json(
        {
          error: {
            message: maskProblem,
            type: 'invalid_request_error',
            code: 'invalid_mask_image',
            param: 'mask_image',
          },
        },
        {
          status: 422,
          headers,
        },
      );
    }

    inlineEdit = {
      sourceBytes,
      ...(maskBytes ? { maskBytes } : {}),
      ...(referenceBytes.length > 0 ? { referenceBytes } : {}),
    };
    sourceImageSha256 = editImagesSha256(sourceBytes, referenceBytes);
    maskImageSha256 = maskBytes ? sha256HexFromBytes(maskBytes) : undefined;
  }

  // Refused before the reservation rather than inside the provider call, so a
  // model that cannot take a source image costs the caller nothing. The catalog
  // entry's image API decides it, which is the same evidence the availability
  // endpoint publishes as `supports_edit`.
  if (inlineEdit && !supportsManagedMediaImageEdit(catalogModel.imageApi)) {
    return NextResponse.json(
      {
        success: false,
        error: `${catalogModel.name} cannot take a source image. Choose an image model that supports editing.`,
        images: [],
        provider,
        model: catalogModel.id,
        latency_ms: Date.now() - startTime,
      } satisfies ImageGenerationResponse,
      {
        status: 422,
        headers,
      },
    );
  }

  annotateActiveSpan({ 'media.provider': provider, 'media.model': catalogModel.id });

  const estimatedCostMicrousd = estimateImageCostMicrousd(provider, n, quality, catalogModel.id);
  let reservation: ManagedUsageRequestReservation;
  let sourceSurface: ManagedMediaSurface;
  let organizationId: string | null;
  let scopedDb: UserScopedDb['db'];
  let jobStoreReady = false;
  try {
    const idempotencyKey = parseManagedUsageIdempotencyKey(input.idempotencyKey);
    const mediaIdentity = parseManagedMediaIdempotencyKey(idempotencyKey);
    if (!mediaIdentity || mediaIdentity.operation !== 'image') {
      throw new ManagedUsageRequestError(
        'Idempotency-Key must identify one Managed Cloud image operation.',
        400,
        'invalid_media_idempotency_key',
      );
    }
    sourceSurface = mediaIdentity.surface;
    const scoped = await input.scope();
    organizationId = scoped.organizationId;
    scopedDb = scoped.db;
    if (scoped.userId !== userId) {
      throw new ManagedUsageRequestError('Managed usage tenant mismatch.', 403, 'tenant_mismatch');
    }
    if (conversationId) {
      const [ownedConversation] = await scoped.db.query<{ id: string }>(
        `select id
           from public.web_conversations
          where id = $1 and user_id = $2 and deleted_at is null
          limit 1`,
        [conversationId, userId],
      );
      if (!ownedConversation) {
        throw new ManagedUsageRequestError(
          'The conversation was not found for this account.',
          404,
          'conversation_not_found',
        );
      }
    }

    jobStoreReady = await isImageJobStoreReady(scoped.db).catch(() => false);
    if (wantsAsync && !jobStoreReady) {
      throw new ManagedUsageRequestError(
        'Durable image jobs are not available on this deployment yet. Retry without "async".',
        503,
        'image_job_store_unavailable',
      );
    }

    // The durable job holds one reservation across every attempt, which is what
    // makes a retry free, so the lease has to outlive the attempt schedule
    // rather than a single provider call.
    reservation = await reserveManagedUsageRequest({
      db: scoped.db,
      userId,
      idempotencyKey,
      requestHash: fingerprintManagedUsageRequest(validationResult.data),
      provider,
      model: catalogModel.id,
      estimatedCostMicrousd,
      planTier: entitlement.plan,
      isFlagship: false,
      leaseSeconds: IMAGE_JOB_LEASE_SECONDS,
    });
  } catch (error) {
    const managedError =
      error instanceof ManagedUsageRequestError
        ? error
        : new ManagedUsageRequestError(
            'Managed usage billing is temporarily unavailable.',
            503,
            'billing_unavailable',
          );
    return managedUsageErrorResponse(headers, managedError);
  }

  const referenceAssetIds = (reference_images ?? []).flatMap((reference) =>
    'asset_id' in reference ? [reference.asset_id] : [],
  );
  const plan: ImageGenerationPlan = {
    aspectRatio: providerAspectRatio,
    quality,
    legacySize: size,
    transparentBackground: transparent_background,
    ...(style ? { style } : {}),
    ...(negative_prompt ? { negativePrompt: negative_prompt } : {}),
    ...(source_image && 'asset_id' in source_image ? { sourceAssetId: source_image.asset_id } : {}),
    ...(mask_image && 'asset_id' in mask_image ? { maskAssetId: mask_image.asset_id } : {}),
    ...(reference_images
      ? referenceAssetIds.length === reference_images.length
        ? { referenceAssetIds }
        : { referencesInline: true }
      : {}),
  };

  // Narrowed rather than asserted: only the two providers with an executable
  // catalog image model reach this point, and the job row's own check
  // constraint names the same two.
  const jobProvider: ImageJobProvider | null =
    provider === 'openai' || provider === 'google' ? provider : null;
  if (!jobProvider) {
    return managedUsageErrorResponse(
      headers,
      new ManagedUsageRequestError(
        `The ${provider} provider cannot generate images on this deployment.`,
        400,
        'provider_unavailable',
      ),
    );
  }

  let job: ImageGenerationJob;
  if (jobStoreReady) {
    try {
      job = await createImageGenerationJob({
        db: scopedDb,
        id: randomUUID(),
        userId,
        organizationId,
        conversationId,
        idempotencyKey: reservation.idempotencyKey,
        requestHash: reservation.requestHash,
        billingLeaseToken: reservation.leaseToken,
        provider: jobProvider,
        model: catalogModel.id,
        operation,
        prompt,
        plan,
        ...(sourceImageSha256 ? { sourceImageSha256 } : {}),
        ...(maskImageSha256 ? { maskImageSha256 } : {}),
        imageCount: n,
        sourceSurface,
        estimatedCostMicrousd,
      });
    } catch (error) {
      const existing = await getImageGenerationJobByIdempotencyKey(
        scopedDb,
        userId,
        reservation.idempotencyKey,
      ).catch(() => null);
      if (!existing) {
        logger.error({ error, userId }, 'Durable image job could not be persisted');
        return managedUsageErrorResponse(
          headers,
          new ManagedUsageRequestError(
            'Image generation is temporarily unavailable. Please try again later.',
            503,
            'image_job_unavailable',
          ),
        );
      }
      job = existing;
    }
  } else {
    // 0226 is not applied on this deployment. The same executor runs, with no
    // durable row behind it, so image generation keeps working and only the
    // job handle is missing.
    job = {
      id: randomUUID(),
      userId,
      organizationId,
      conversationId: conversationId ?? null,
      idempotencyKey: reservation.idempotencyKey,
      requestHash: reservation.requestHash,
      billingLeaseToken: reservation.leaseToken,
      provider: jobProvider,
      model: catalogModel.id,
      operation,
      prompt,
      plan,
      sourceImageSha256: sourceImageSha256 ?? null,
      maskImageSha256: maskImageSha256 ?? null,
      imageCount: n,
      sourceSurface,
      estimatedCostMicrousd,
      actualCostMicrousd: null,
      status: 'queued',
      attempts: 0,
      maxAttempts: 1,
      attemptStartedAt: null,
      retryable: false,
      publicError: null,
      cancelRequestedAt: null,
      billingOutcome: null,
      billingSettlementStatus: null,
      nextAttemptAt: new Date().toISOString(),
      claimToken: null,
      claimExpiresAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      terminalAt: null,
    };
  }

  // The request that submits a job is not what finishes it. A drive queued for
  // every durable job is what carries the work when this process is killed
  // mid-attempt, whether or not the caller ever asks about it again. It is a
  // no-op once the job is terminal.
  if (jobStoreReady) {
    await scheduleImageGenerationJobDrive({
      db: scopedDb,
      job,
      delaySeconds: IMAGE_JOB_CLAIM_SECONDS,
    });
  }

  if (wantsAsync) {
    const detachedJob = job;
    after(async () => {
      try {
        await runImageGenerationJobAttempt({ db: scopedDb, job: detachedJob, inlineEdit });
      } catch (error) {
        logger.error(
          { error, jobId: detachedJob.id, userId },
          'Durable image job attempt failed outside the request',
        );
      }
    });

    logger.info(
      { userId, provider, model: catalogModel.id, jobId: job.id, n },
      'Durable image job queued',
    );
    return NextResponse.json(
      {
        ...publicImageJobSnapshot(job, []),
        status: 'queued' as const,
        latency_ms: Date.now() - startTime,
      },
      { status: 202, headers },
    );
  }

  const outcome = await runImageGenerationJobAttempt({
    db: scopedDb,
    job,
    inlineEdit,
    detached: !jobStoreReady,
  });

  if (outcome.job.status !== 'completed') {
    if (outcome.failureKind === 'moderation') {
      return NextResponse.json(
        {
          error: {
            message: outcome.job.publicError ?? GENERATED_OUTPUT_REFUSAL,
            type: 'invalid_request_error',
            code: 'content_policy_violation',
          },
        },
        { status: 422, headers },
      );
    }
    const status =
      outcome.failureKind === 'persistence'
        ? 502
        : outcome.retryAfterSeconds !== undefined
          ? 429
          : 422;
    return NextResponse.json(
      {
        success: false,
        error: outcome.job.publicError ?? 'Image generation failed',
        images: [],
        provider,
        model: outcome.providerModel ?? 'unknown',
        latency_ms: Date.now() - startTime,
        ...(jobStoreReady ? { job_id: outcome.job.id, retryable: outcome.job.retryable } : {}),
        ...(outcome.failureKind === 'persistence' ? { persisted: false } : {}),
        ...(outcome.retryAfterSeconds !== undefined
          ? { retry_after_seconds: outcome.retryAfterSeconds }
          : {}),
      } satisfies ImageGenerationResponse,
      {
        status,
        headers: {
          ...headers,
          ...(outcome.retryAfterSeconds !== undefined
            ? { 'Retry-After': String(outcome.retryAfterSeconds) }
            : {}),
        },
      },
    );
  }

  const images =
    outcome.images.length > 0
      ? outcome.images
      : await imageJobDeliveredImages(scopedDb, outcome.job);

  try {
    await markManagedUsageClientDelivered(reservationForImageJob(scopedDb, outcome.job));
  } catch (error) {
    logger.warn(
      { error, userId, idempotencyKey: reservation.idempotencyKey },
      'Image delivery marker could not be persisted',
    );
  }

  return NextResponse.json(
    {
      success: true,
      images: images.map(({ url, b64_json }) => ({
        ...(url ? { url } : {}),
        ...(b64_json ? { b64_json } : {}),
      })),
      provider,
      model: outcome.providerModel ?? catalogModel.id,
      catalog_model: catalogModel.id,
      latency_ms: Date.now() - startTime,
      persisted: storageConfigured,
      provenance: outcome.provenance,
      ...(jobStoreReady ? { job_id: outcome.job.id } : {}),
    },
    {
      headers: {
        ...headers,
        ...aiGeneratedHeaders(),
      },
    },
  );
}
