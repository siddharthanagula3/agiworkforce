import 'server-only';

export const runtime = 'nodejs';

import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireEnv } from '@shared/utils/env';
import { getClerkAuthUser } from '@/lib/api-auth';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import {
  buildManagedComputeGateResponse,
  buildOrganizationPolicyGateResponse,
  buildSpendLimitGateResponse,
  buildModelPolicyGateResponse,
} from '@/lib/managed-compute-gate';
import { resolveCloudChatSurface } from '@/lib/free-chat-surface-policy';
import {
  getModelMetadataById,
  getRoutingSlotModel,
  isModelLive,
  resolveEffectiveModelPricingForInputTokens,
  type PricedModel,
} from '@agiworkforce/types';
import { providerApiUrl } from '@/lib/server/provider-endpoints';
// reserve_managed_usage_request_with_limits refuses any caller whose
// current_app_user_id() does not equal the userId it is passed, so the reservation has to
// run on a tenant-scoped handle. getUserScopedDb covers both a session cookie and a
// developer API key (inference:write) bearer.
import { getUserScopedDb } from '@/lib/server/rls-db';
import { SubscriptionService } from '@/lib/services/subscription-service';
import {
  ManagedUsageRequestError,
  createManagedUsageErrorBody,
  finalizeManagedUsageRequest,
  fingerprintManagedUsageRequest,
  markManagedUsageClientDelivered,
  markManagedUsageProviderStarted,
  parseManagedUsageIdempotencyKey,
  reserveManagedUsageRequest,
  type ManagedUsageRequestReservation,
} from '@/lib/services/managed-usage-request-service';
import { assertTierUnitAllowance } from '@/lib/services/tier-unit-quota-service';
import {
  buildManagedComputeAccessGateResponse,
  evaluateManagedComputeSubscriptionAccess,
} from '@/lib/services/managed-compute-access';

function isLikelyAudio(head: Uint8Array): boolean {
  if (head.length < 4) return false;
  if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) return true;
  if (head[0] === 0xff && (head[1]! & 0xe0) === 0xe0) return true;
  if (
    head.length >= 12 &&
    head[0] === 0x52 &&
    head[1] === 0x49 &&
    head[2] === 0x46 &&
    head[3] === 0x46 &&
    head[8] === 0x57 &&
    head[9] === 0x41 &&
    head[10] === 0x56 &&
    head[11] === 0x45
  )
    return true;
  if (head[0] === 0x4f && head[1] === 0x67 && head[2] === 0x67 && head[3] === 0x53) return true;
  if (
    head.length >= 8 &&
    head[4] === 0x66 &&
    head[5] === 0x74 &&
    head[6] === 0x79 &&
    head[7] === 0x70
  )
    return true;
  if (head[0] === 0x66 && head[1] === 0x4c && head[2] === 0x61 && head[3] === 0x43) return true;
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return true;
  return false;
}

// OpenAI publishes ~$0.006 per audio minute for the transcription model against the catalog's
// $2.50/1M input-token rate, i.e. ~2,400 audio tokens per minute. Spoken English near
// 150 wpm lands around 4 transcript tokens per second. Used only to bound the pre-flight
// reservation and to settle when the provider omits a usage block.
const INPUT_TOKENS_PER_AUDIO_SECOND = 40;
const OUTPUT_TOKENS_PER_AUDIO_SECOND = 4;

// Lowest plausible byte rates, so bytes / rate is an upper bound on duration rather than a guess.
const UNCOMPRESSED_AUDIO_BYTES_PER_SECOND = 8_000;
const COMPRESSED_AUDIO_BYTES_PER_SECOND = 2_000;
const UNCOMPRESSED_AUDIO_TYPES = new Set(['audio/wav', 'audio/wave', 'audio/x-wav', 'audio/flac']);

const MIME_PARAMETER_SEPARATOR = ';';

// MediaRecorder reports its container with the codec parameter attached, so every real
// browser recording arrives as `audio/webm;codecs=opus` rather than the bare essence the
// allowlist and the byte-rate table are keyed by.
export function audioMimeEssence(value: string): string {
  return value.split(MIME_PARAMETER_SEPARATOR)[0]?.trim().toLowerCase() ?? '';
}

function isUncompressedAudioHead(head: Uint8Array): boolean {
  const riffWave =
    head.length >= 12 &&
    head[0] === 0x52 &&
    head[1] === 0x49 &&
    head[2] === 0x46 &&
    head[3] === 0x46 &&
    head[8] === 0x57 &&
    head[9] === 0x41 &&
    head[10] === 0x56 &&
    head[11] === 0x45;
  const flac =
    head.length >= 4 &&
    head[0] === 0x66 &&
    head[1] === 0x4c &&
    head[2] === 0x61 &&
    head[3] === 0x43;
  return riffWave || flac;
}

// The declared MIME type is caller-controlled; the uncompressed (cheaper-per-byte) rate is
// only granted when the magic bytes agree, so a compressed file cannot under-count minutes.
export function estimateAudioSeconds(
  byteSize: number,
  mimeType: string,
  head?: Uint8Array,
): number {
  const uncompressed =
    UNCOMPRESSED_AUDIO_TYPES.has(mimeType) && (head === undefined || isUncompressedAudioHead(head));
  const bytesPerSecond = uncompressed
    ? UNCOMPRESSED_AUDIO_BYTES_PER_SECOND
    : COMPRESSED_AUDIO_BYTES_PER_SECOND;
  return Math.max(1, Math.ceil(byteSize / bytesPerSecond));
}

export function estimateTranscriptionCostCents(
  model: PricedModel,
  inputTokens: number,
  outputTokens: number,
  pricedAt: Date = new Date(),
): number {
  const pricing = resolveEffectiveModelPricingForInputTokens(model, pricedAt, inputTokens);
  const costDollars =
    (pricing.inputCost * inputTokens + pricing.outputCost * outputTokens) / 1_000_000;
  return costDollars > 0 ? Math.max(1, Math.ceil(costDollars * 100)) : 0;
}

interface SettledTokens {
  inputTokens: number;
  outputTokens: number;
  source: 'provider_tokens' | 'provider_duration' | 'estimated_duration';
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function settleTranscriptionTokens(
  payload: unknown,
  estimatedSeconds: number,
): SettledTokens {
  const usage =
    payload && typeof payload === 'object'
      ? ((payload as { usage?: unknown }).usage as Record<string, unknown> | undefined)
      : undefined;

  if (usage && isPositiveNumber(usage['input_tokens'])) {
    return {
      inputTokens: Math.ceil(usage['input_tokens']),
      outputTokens: isNonNegativeNumber(usage['output_tokens'])
        ? Math.ceil(usage['output_tokens'])
        : 0,
      source: 'provider_tokens',
    };
  }

  if (usage && isPositiveNumber(usage['seconds'])) {
    const seconds = Math.max(1, Math.ceil(usage['seconds']));
    return {
      inputTokens: seconds * INPUT_TOKENS_PER_AUDIO_SECOND,
      outputTokens: seconds * OUTPUT_TOKENS_PER_AUDIO_SECOND,
      source: 'provider_duration',
    };
  }

  return {
    inputTokens: estimatedSeconds * INPUT_TOKENS_PER_AUDIO_SECOND,
    outputTokens: estimatedSeconds * OUTPUT_TOKENS_PER_AUDIO_SECOND,
    source: 'estimated_duration',
  };
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

async function handleTranscriptions(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  if (preflightResponse) return preflightResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) {
    return csrfError as NextResponse;
  }

  const rateLimitResponse = await withRateLimit(request, 'audio-transcription');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request, { apiKeyScope: 'inference:write' });

  const managedGateResponse = buildManagedComputeGateResponse(
    request,
    {
      provider: 'openai',
      model: 'audio-transcription',
      feature: 'audio_transcription',
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
      provider: 'openai',
      model: 'audio-transcription',
      feature: 'audio_transcription',
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
  const spendGateResponse = await buildSpendLimitGateResponse(userId, request);
  if (spendGateResponse) return spendGateResponse;

  let formData: FormData;
  try {
    formData = (await request.formData()) as unknown as FormData;
  } catch (err) {
    logger.error({ err }, 'Failed to parse transcription form data');
    return NextResponse.json(
      {
        error: {
          message: 'Invalid multipart form data',
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

  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json(
      {
        error: {
          message: 'Missing audio file',
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

  const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
  const ALLOWED_AUDIO_TYPES = new Set([
    'audio/mpeg',
    'audio/mp3',
    'audio/mp4',
    'audio/m4a',
    'audio/x-m4a',
    'audio/wav',
    'audio/wave',
    'audio/x-wav',
    'audio/webm',
    'audio/ogg',
    'audio/flac',
  ]);
  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      {
        error: {
          message: `Audio file exceeds maximum size of ${MAX_AUDIO_BYTES} bytes`,
          type: 'invalid_request_error',
        },
      },
      {
        status: 413,
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }
  const mimeEssence = audioMimeEssence(file.type);
  if (!mimeEssence || !ALLOWED_AUDIO_TYPES.has(mimeEssence)) {
    return NextResponse.json(
      {
        error: {
          message: `Unsupported or missing audio MIME type: ${file.type || '<missing>'}`,
          type: 'invalid_request_error',
        },
      },
      {
        status: 415,
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }
  const headBytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!isLikelyAudio(headBytes)) {
    return NextResponse.json(
      {
        error: {
          message: 'Audio file content does not match a supported audio format',
          type: 'invalid_request_error',
        },
      },
      {
        status: 415,
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }

  const defaultModelId = getRoutingSlotModel('voice_transcription');
  const defaultModel = getModelMetadataById(defaultModelId);
  if (
    !defaultModel ||
    defaultModel.provider !== 'openai' ||
    defaultModel.modelType !== 'stt' ||
    !isModelLive(defaultModel)
  ) {
    throw new Error('The canonical voice_transcription slot is not a live OpenAI STT model');
  }

  const modelValue = formData.get('model');
  const requestedModel = typeof modelValue === 'string' ? getModelMetadataById(modelValue) : null;
  const selectedModel =
    requestedModel?.provider === 'openai' &&
    requestedModel.modelType === 'stt' &&
    requestedModel.status !== 'deprecated' &&
    isModelLive(requestedModel)
      ? requestedModel
      : defaultModel;
  const model = selectedModel.apiModelId ?? selectedModel.id;

  // Checked on the RESOLVED catalog model, not on `model` above, which is the
  // provider-facing id. The policy is written against catalog ids.
  const modelPolicyResponse = await buildModelPolicyGateResponse(
    userId,
    request,
    { provider: String(selectedModel.provider), modelId: selectedModel.id },
    { ...getCorsHeaders(request), ...getSecurityHeaders() },
  );
  if (modelPolicyResponse) return modelPolicyResponse;

  const forwardForm = new FormData();
  forwardForm.append('file', file);
  forwardForm.append('model', model);

  const language = formData.get('language');
  if (typeof language === 'string' && language.trim()) {
    forwardForm.append('language', language);
  }

  const estimatedSeconds = estimateAudioSeconds(file.size, mimeEssence, headBytes);
  const estimatedInputTokens = estimatedSeconds * INPUT_TOKENS_PER_AUDIO_SECOND;
  const estimatedCostCents = estimateTranscriptionCostCents(
    selectedModel,
    estimatedInputTokens,
    estimatedSeconds * OUTPUT_TOKENS_PER_AUDIO_SECOND,
  );

  const scoped = await getUserScopedDb(request, { apiKeyScope: 'inference:write' });
  if (scoped.userId !== userId) {
    return managedUsageErrorResponse(
      request,
      new ManagedUsageRequestError('Managed usage tenant mismatch.', 403, 'tenant_mismatch'),
    );
  }

  let reservation: ManagedUsageRequestReservation;
  try {
    const idempotencyHeader = request.headers.get('Idempotency-Key');
    const idempotencyKey =
      idempotencyHeader === null
        ? `agi.transcription.${randomUUID()}`
        : parseManagedUsageIdempotencyKey(idempotencyHeader);
    const subscription = await SubscriptionService.getSubscription(scoped.db, userId);
    const subscriptionAccess = await evaluateManagedComputeSubscriptionAccess(
      scoped.db,
      userId,
      subscription,
    );
    if (!subscriptionAccess.allowed) {
      const gateResponse = buildManagedComputeAccessGateResponse(subscriptionAccess, {
        ...getCorsHeaders(request),
        ...getSecurityHeaders(),
      });
      if (gateResponse) return gateResponse;
    }
    await assertTierUnitAllowance({
      db: scoped.db,
      userId,
      planTier: subscription?.plan_tier ?? 'free',
      unit: 'voice_minutes',
      requestedUnits: estimatedSeconds / 60,
    });
    reservation = await reserveManagedUsageRequest({
      db: scoped.db,
      userId,
      idempotencyKey,
      requestHash: fingerprintManagedUsageRequest({
        model: selectedModel.id,
        language: typeof language === 'string' ? language : null,
        byteSize: file.size,
        mimeType: mimeEssence,
      }),
      provider: selectedModel.provider,
      model: selectedModel.id,
      estimatedCostCents,
      planTier: subscription?.plan_tier ?? 'free',
      isFlagship: false,
    });
  } catch (error) {
    if (error instanceof ManagedUsageRequestError) {
      return managedUsageErrorResponse(request, error);
    }
    logger.error(
      { event: 'transcription_reservation_failed', error, userId, model: selectedModel.id },
      'Transcription reservation failed before any provider spend',
    );
    return managedUsageErrorResponse(
      request,
      new ManagedUsageRequestError(
        'Managed usage billing is temporarily unavailable.',
        503,
        'billing_unavailable',
      ),
    );
  }

  async function releaseReservation(reason: string): Promise<void> {
    try {
      await finalizeManagedUsageRequest({
        ...reservation,
        outcome: 'failed',
        actualCostCents: 0,
        usage: {
          operation: 'transcription',
          provider: selectedModel.provider,
          model: selectedModel.id,
          reason,
        },
      });
    } catch (settlementError) {
      logger.error(
        {
          event: 'transcription_refund_settlement_unrecorded',
          error: settlementError,
          userId,
          idempotencyKey: reservation.idempotencyKey,
        },
        'Transcription failure settlement could not be persisted',
      );
    }
  }

  let response: Response;
  let responseText: string;
  try {
    await markManagedUsageProviderStarted(reservation);
    response = await fetch(providerApiUrl('openai', 'audio/transcriptions'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${requireEnv('OPENAI_API_KEY')}`,
      },
      body: forwardForm,
      signal: AbortSignal.timeout(60_000),
    });
    responseText = await response.text();
  } catch (error) {
    await releaseReservation('provider_unreachable');
    throw error;
  }

  if (!response.ok) {
    logger.warn({ status: response.status, body: responseText }, 'Transcription proxy failed');
    await releaseReservation('provider_failed');
    return NextResponse.json(
      {
        error: {
          message: responseText || 'Transcription failed',
          type: 'api_error',
        },
      },
      {
        status: response.status,
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }

  let json: unknown;
  let parsedJson = true;
  try {
    json = JSON.parse(responseText);
  } catch {
    parsedJson = false;
  }

  const settled = settleTranscriptionTokens(parsedJson ? json : undefined, estimatedSeconds);
  const actualCostCents = estimateTranscriptionCostCents(
    selectedModel,
    settled.inputTokens,
    settled.outputTokens,
  );
  await finalizeManagedUsageRequest({
    ...reservation,
    outcome: 'completed',
    actualCostCents,
    usage: {
      operation: 'transcription',
      provider: selectedModel.provider,
      model: selectedModel.id,
      estimatedAudioSeconds: estimatedSeconds,
      inputTokens: settled.inputTokens,
      outputTokens: settled.outputTokens,
      usageSource: settled.source,
    },
  });

  logger.info(
    {
      userId,
      provider: selectedModel.provider,
      model: selectedModel.id,
      estimatedCostCents,
      actualCostCents,
      usageSource: settled.source,
    },
    'Transcription credits deducted',
  );

  try {
    await markManagedUsageClientDelivered(reservation);
  } catch (error) {
    logger.warn(
      { error, userId, idempotencyKey: reservation.idempotencyKey },
      'Transcription delivery marker could not be persisted',
    );
  }

  if (!parsedJson) {
    return new NextResponse(responseText, {
      status: 200,
      headers: {
        'Content-Type': response.headers.get('content-type') ?? 'text/plain',
        ...getCorsHeaders(request),
        ...getSecurityHeaders(),
      },
    });
  }

  return NextResponse.json(json, {
    headers: {
      ...getCorsHeaders(request),
      ...getSecurityHeaders(),
    },
  });
}

export const POST = withErrorHandler(handleTranscriptions);

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}
