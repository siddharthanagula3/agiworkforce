import 'server-only';

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireEnv } from '@shared/utils/env';
import { getClerkAuthUser } from '@/lib/api-auth';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import {
  buildManagedComputeGateResponse,
  buildModelPolicyGateResponse,
  buildSpendLimitGateResponse,
} from '@/lib/managed-compute-gate';
import {
  getModelMetadataById,
  getRoutingSlotModel,
  isModelLive,
  resolveEffectiveModelPricingForInputTokens,
} from '@agiworkforce/types';
import { providerApiUrl } from '@/lib/server/provider-endpoints';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { resolveEntitlementBundle } from '@/lib/services/entitlement-resolution';
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
import {
  buildManagedComputeAccessGateResponse,
  evaluateManagedComputeSubscriptionAccess,
} from '@/lib/services/managed-compute-access';
import { sideCallProviderAllowed } from '@/lib/server/side-call-training-policy';
import { DEFAULT_SPEECH_VOICE, SPEECH_VOICES } from '@/lib/voice/speech-voices';

const SPEECH_MAX_CHARACTERS = 4_000;
const CHARACTERS_PER_INPUT_TOKEN = 4;
const AUDIO_OUTPUT_TOKENS_PER_CHARACTER = 1.5;
const MICROUSD_PER_USD = 1_000_000;

const SpeechRequestSchema = z.object({
  text: z.string().trim().min(1).max(SPEECH_MAX_CHARACTERS),
  voice: z.enum(SPEECH_VOICES).optional(),
  speed: z.number().min(0.25).max(4).optional(),
});

function speechError(request: NextRequest, status: number, message: string, code?: string) {
  return NextResponse.json(
    { error: { message, type: 'invalid_request_error', ...(code ? { code } : {}) } },
    { status, headers: { ...getCorsHeaders(request), ...getSecurityHeaders() } },
  );
}

function describeSpeechFailure(status: number): string {
  if (status === 429) return 'Read aloud is busy right now. Try again in a moment.';
  if (status >= 500) return 'The speech provider is unavailable. Try again shortly.';
  return 'Read aloud could not produce audio for this message.';
}

async function handleSpeech(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  if (preflightResponse) return preflightResponse;
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;
  const rateLimitResponse = await withRateLimit(request, 'voice-speech');
  if (rateLimitResponse) return rateLimitResponse;
  const { userId } = await getClerkAuthUser(request);
  const headers = { ...getCorsHeaders(request), ...getSecurityHeaders() };

  const managedGateResponse = buildManagedComputeGateResponse(
    request,
    { provider: 'openai', model: 'audio-speech', feature: 'audio_speech' },
    headers,
  );
  if (managedGateResponse) return managedGateResponse;
  const spendGateResponse = await buildSpendLimitGateResponse(userId);
  if (spendGateResponse) return spendGateResponse;

  const parsed = SpeechRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return speechError(
      request,
      400,
      'Read aloud needs the text of one message, up to 4,000 characters.',
    );
  }

  const model = getModelMetadataById(getRoutingSlotModel('voice_speech'));
  if (!model || model.provider !== 'openai' || model.modelType !== 'tts' || !isModelLive(model)) {
    throw new Error('The voice_speech slot is not a live OpenAI TTS model');
  }
  if (!(await sideCallProviderAllowed(null, userId, model.provider))) {
    return speechError(
      request,
      403,
      'Read aloud uses a provider that may train on what you send, and your privacy setting keeps your content away from those.',
      'model_may_train',
    );
  }
  const modelPolicyResponse = await buildModelPolicyGateResponse(
    userId,
    request,
    { provider: String(model.provider), modelId: model.id },
    headers,
  );
  if (modelPolicyResponse) return modelPolicyResponse;

  const { text, voice = DEFAULT_SPEECH_VOICE, speed } = parsed.data;
  const inputTokens = Math.ceil(text.length / CHARACTERS_PER_INPUT_TOKEN);
  const outputTokens = Math.ceil(text.length * AUDIO_OUTPUT_TOKENS_PER_CHARACTER);
  const pricing = resolveEffectiveModelPricingForInputTokens(model, new Date(), inputTokens);
  const costMicrousd = Math.max(
    1,
    Math.ceil(
      ((pricing.inputCost * inputTokens + pricing.outputCost * outputTokens) / 1_000_000) *
        MICROUSD_PER_USD,
    ),
  );

  const scoped = await getUserScopedDb(request);
  if (scoped.userId !== userId) return speechError(request, 403, 'Managed usage tenant mismatch.');

  const idempotencyHeader = request.headers.get('Idempotency-Key');
  if (!idempotencyHeader) {
    return speechError(request, 400, 'Each read-aloud request needs an Idempotency-Key header.');
  }

  let reservation: ManagedUsageRequestReservation;
  try {
    const entitlement = await resolveEntitlementBundle(scoped.db, userId);
    const access = await evaluateManagedComputeSubscriptionAccess(
      scoped.db,
      userId,
      entitlement.subscription,
    );
    if (!access.allowed) {
      const gateResponse = buildManagedComputeAccessGateResponse(access, headers);
      if (gateResponse) return gateResponse;
    }
    reservation = await reserveManagedUsageRequest({
      db: scoped.db,
      userId,
      idempotencyKey: parseManagedUsageIdempotencyKey(idempotencyHeader),
      requestHash: fingerprintManagedUsageRequest({ model: model.id, voice, length: text.length }),
      provider: model.provider,
      model: model.id,
      estimatedCostMicrousd: costMicrousd,
      planTier: entitlement.plan,
      isFlagship: false,
    });
  } catch (error) {
    if (error instanceof ManagedUsageRequestError) {
      return NextResponse.json(
        createManagedUsageErrorBody(
          error,
          error.status === 402 || error.status === 429
            ? 'insufficient_quota'
            : 'invalid_request_error',
        ),
        { status: error.status, headers },
      );
    }
    throw error;
  }

  const release = async (reason: string) => {
    await finalizeManagedUsageRequest({
      ...reservation,
      outcome: 'failed',
      actualCostMicrousd: 0,
      usage: { operation: 'speech', provider: model.provider, model: model.id, reason },
    }).catch((error: unknown) => {
      logger.error({ error, userId }, 'Speech failure settlement could not be persisted');
    });
  };

  let response: Response;
  try {
    await markManagedUsageProviderStarted(reservation);
    response = await fetch(providerApiUrl('openai', 'audio/speech'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${requireEnv('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model.apiModelId ?? model.id,
        input: text,
        voice,
        response_format: 'mp3',
        ...(speed ? { speed } : {}),
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    await release('provider_unreachable');
    throw error;
  }
  if (!response.ok) {
    logger.warn({ status: response.status }, 'Speech proxy failed');
    await release('provider_failed');
    return speechError(
      request,
      response.status >= 500 ? 502 : response.status,
      describeSpeechFailure(response.status),
    );
  }

  const audio = await response.arrayBuffer();
  await finalizeManagedUsageRequest({
    ...reservation,
    outcome: 'completed',
    actualCostMicrousd: costMicrousd,
    usage: {
      operation: 'speech',
      provider: model.provider,
      model: model.id,
      inputTokens,
      outputTokens,
      usageSource: 'estimated_characters',
    },
  });
  await markManagedUsageClientDelivered(reservation).catch((error: unknown) => {
    logger.warn({ error, userId }, 'Speech delivery marker could not be persisted');
  });

  return new NextResponse(audio, {
    status: 200,
    headers: { ...headers, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
  });
}

export const POST = withErrorHandler(handleSpeech);

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, {
      status: 204,
      headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
    })
  );
}
