import 'server-only';

import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse, after } from 'next/server';
import {
  ManagedMediaImageGenerationRequestSchema,
  supportsManagedMediaImageEdit,
} from '@agiworkforce/cloud-contracts';
import { isMediaAssetStoreReady } from '@/lib/server/media-assets';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { evaluateManagedComputeSubscriptionAccess } from '@/lib/services/managed-compute-access';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import {
  buildManagedComputeGateResponse,
  buildOrganizationPolicyGateResponse,
  buildSpendLimitGateResponse,
  buildModelPolicyGateResponse,
} from '@/lib/managed-compute-gate';
import { resolveCloudChatSurface } from '@/lib/free-chat-surface-policy';
import {
  matchDenylistedUpload,
  moderateManagedPrompt,
  recordModerationEvent,
  PLATFORM_POLICY_REFUSAL,
} from '@/lib/moderation';
import { canUseBillingPlanCapability } from '@agiworkforce/types';
import { parseManagedMediaIdempotencyKey, type ManagedMediaSurface } from '@agiworkforce/utils';
import { aiGeneratedHeaders, type AiGeneratedProvenance } from '@/lib/compliance/ai-act';
import { isImageStorageConfigured } from '@/lib/server/media-storage';
import { getUserScopedDb } from '@/lib/server/rls-db';
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
import {
  estimateImageCostMicrousd,
  getDefaultProvider,
  IMAGE_ASPECT_RATIOS_BY_API,
  isProviderAvailable,
  resolveImageCatalogModel,
  resolveImageProviderFromCatalogModel,
  resolveImageRefBytes,
  resolveProviderImageAspectRatio,
  sha256HexFromBytes,
  type ImageProvider,
} from '../lib/image-generation-provider';
import {
  imageJobDeliveredImages,
  publicImageJobSnapshot,
  reservationForImageJob,
  runImageGenerationJobAttempt,
  type ImageJobInlineEdit,
} from '../lib/image-job-executor';
import { scheduleImageGenerationJobDrive } from '../lib/image-job-drive-queue';

export const maxDuration = 60;
export const runtime = 'nodejs';

interface ImageGenerationResponse {
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
  request: NextRequest,
  error: ManagedUsageRequestError,
): NextResponse {
  return NextResponse.json(
    createManagedUsageErrorBody(
      error,
      error.status === 402 || error.status === 429 ? 'insufficient_quota' : 'invalid_request_error',
    ),
    {
      status: error.status,
      headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
    },
  );
}

async function handleImageGeneration(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  const preflightResponse = handleCorsPreflightRequest(request);
  if (preflightResponse) {
    return preflightResponse;
  }

  const csrfError = await requireCsrfToken(request);
  if (csrfError) {
    return csrfError as NextResponse;
  }

  const rateLimitResponse = await withRateLimit(request, 'image-generation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);

  // Resolved exactly once: the workspace admitted at the start of the turn is
  // the workspace the row is written to, so a switch mid-request cannot move it.
  let scopedDbPromise: ReturnType<typeof getUserScopedDb> | undefined;
  const callerScope = () => (scopedDbPromise ??= getUserScopedDb(request));

  const managedGateResponse = buildManagedComputeGateResponse(
    request,
    {
      provider: 'managed-media',
      model: 'image-generation',
      feature: 'media_image_generation',
    },
    {
      ...getCorsHeaders(request),
      ...getSecurityHeaders(),
    },
  );
  if (managedGateResponse) return managedGateResponse;

  const policyGateResponse = await buildOrganizationPolicyGateResponse(
    userId,
    request,
    {
      provider: 'managed-media',
      model: 'image-generation',
      feature: 'media_image_generation',
      surface: resolveCloudChatSurface(request),
    },
    {
      ...getCorsHeaders(request),
      ...getSecurityHeaders(),
    },
  );
  if (policyGateResponse) return policyGateResponse;

  // The workspace budget, checked before any credit is reserved so a turn
  // that a spend cap will refuse never spends anything first.
  const spendGateResponse = await buildSpendLimitGateResponse(userId);
  if (spendGateResponse) return spendGateResponse;

  const subscription = await SubscriptionService.getSubscription((await callerScope()).db, userId);

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
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }

  const subscriptionAccess = await evaluateManagedComputeSubscriptionAccess(
    (await callerScope()).db,
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
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }

  const userTier = subscription.plan_tier?.toLowerCase() || 'free';
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
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
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
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
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
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
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
    transparent_background,
    async: wantsAsync,
  } = validationResult.data;

  // Always-on platform safety floor, ahead of model resolution, billing
  // reservation, and provider egress: a refused prompt must never be charged
  // for and must never leave this process. Covers every operation the handler
  // serves, generate and the edit paths (inpaint/outpaint/variation), which
  // all reach a provider through this same prompt.
  // NOTE: the helper's surface label has no 'managed-image' member yet, so
  // these events are reported under the default surface.
  const moderation = moderateManagedPrompt({
    userId,
    segments: negative_prompt ? [prompt, negative_prompt] : [prompt],
  });
  if (!moderation.allowed) {
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
        headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
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
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
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
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
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
            headers: {
              ...getCorsHeaders(request),
              ...getSecurityHeaders(),
            },
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
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }

  const catalogModel = resolveImageCatalogModel(provider, requestedModel);

  // The workspace model policy, checked on the RESOLVED catalog model rather
  // than on what was requested, a provider default must not be a way past a
  // rule the administrator wrote.
  if (catalogModel) {
    const modelPolicyResponse = await buildModelPolicyGateResponse(
      userId,
      request,
      { provider: String(catalogModel.provider), modelId: catalogModel.id },
      { ...getCorsHeaders(request), ...getSecurityHeaders() },
    );
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
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }

  if (catalogModel.imageApi === 'gemini' && n !== 1) {
    return NextResponse.json(
      {
        error: {
          message: 'The requested Google image model supports one image per request.',
          type: 'invalid_request_error',
          code: 'unsupported_image_count',
          param: 'n',
          max_images: 1,
        },
      },
      {
        status: 400,
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
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
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
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
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
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
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }
  let mediaCatalogConfigured = false;
  try {
    mediaCatalogConfigured = await isMediaAssetStoreReady((await callerScope()).db);
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
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
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
    try {
      const referencesStoredAsset =
        'asset_id' in source_image || (mask_image && 'asset_id' in mask_image);
      const editRefDb = referencesStoredAsset ? (await callerScope()).db : undefined;
      sourceBytes = await resolveImageRefBytes(source_image, userId, editRefDb);
      maskBytes = mask_image
        ? await resolveImageRefBytes(mask_image, userId, editRefDb)
        : undefined;
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
          headers: {
            ...getCorsHeaders(request),
            ...getSecurityHeaders(),
          },
        },
      );
    }

    const suppliedUploads: ReadonlyArray<readonly [string, Uint8Array]> = maskBytes
      ? [
          ['source_image', sourceBytes],
          ['mask_image', maskBytes],
        ]
      : [['source_image', sourceBytes]];
    for (const [param, bytes] of suppliedUploads) {
      const hashMatch = matchDenylistedUpload(bytes);
      if (!hashMatch.matched) continue;
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
          headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
        },
      );
    }

    inlineEdit = { sourceBytes, ...(maskBytes ? { maskBytes } : {}) };
    sourceImageSha256 = sha256HexFromBytes(sourceBytes);
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
        headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
      },
    );
  }

  const estimatedCostMicrousd = estimateImageCostMicrousd(provider, n, quality, catalogModel.id);
  let reservation: ManagedUsageRequestReservation;
  let sourceSurface: ManagedMediaSurface;
  let organizationId: string | null;
  let scopedDb: Awaited<ReturnType<typeof getUserScopedDb>>['db'];
  let jobStoreReady = false;
  try {
    const idempotencyKey = parseManagedUsageIdempotencyKey(request.headers.get('Idempotency-Key'));
    const mediaIdentity = parseManagedMediaIdempotencyKey(idempotencyKey);
    if (!mediaIdentity || mediaIdentity.operation !== 'image') {
      throw new ManagedUsageRequestError(
        'Idempotency-Key must identify one Managed Cloud image operation.',
        400,
        'invalid_media_idempotency_key',
      );
    }
    sourceSurface = mediaIdentity.surface;
    const scoped = await callerScope();
    organizationId = scoped.organizationId;
    scopedDb = scoped.db;
    if (scoped.userId !== userId) {
      throw new ManagedUsageRequestError('Managed usage tenant mismatch.', 403, 'tenant_mismatch');
    }
    if (conversationId) {
      const [ownedConversation] = await scoped.db.query<{ id: string }>(
        `select id
           from public.web_conversations
          where id = $1 and user_id = $2
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
      planTier: subscription.plan_tier,
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
    return managedUsageErrorResponse(request, managedError);
  }

  const plan: ImageGenerationPlan = {
    aspectRatio: providerAspectRatio,
    quality,
    legacySize: size,
    transparentBackground: transparent_background,
    ...(style ? { style } : {}),
    ...(negative_prompt ? { negativePrompt: negative_prompt } : {}),
    ...(source_image && 'asset_id' in source_image ? { sourceAssetId: source_image.asset_id } : {}),
    ...(mask_image && 'asset_id' in mask_image ? { maskAssetId: mask_image.asset_id } : {}),
  };

  // Narrowed rather than asserted: only the two providers with an executable
  // catalog image model reach this point, and the job row's own check
  // constraint names the same two.
  const jobProvider: ImageJobProvider | null =
    provider === 'openai' || provider === 'google' ? provider : null;
  if (!jobProvider) {
    return managedUsageErrorResponse(
      request,
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
          request,
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

  const corsHeaders = { ...getCorsHeaders(request), ...getSecurityHeaders() };

  if (wantsAsync) {
    const detachedJob = job;
    if (jobStoreReady) {
      await scheduleImageGenerationJobDrive({
        db: scopedDb,
        job: detachedJob,
        delaySeconds: IMAGE_JOB_CLAIM_SECONDS,
      });
    }
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
      { status: 202, headers: corsHeaders },
    );
  }

  const outcome = await runImageGenerationJobAttempt({
    db: scopedDb,
    job,
    inlineEdit,
    detached: !jobStoreReady,
  });

  if (outcome.job.status !== 'completed') {
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
          ...corsHeaders,
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
        ...corsHeaders,
        ...aiGeneratedHeaders(),
      },
    },
  );
}

export const POST = withErrorHandler(handleImageGeneration);

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}
