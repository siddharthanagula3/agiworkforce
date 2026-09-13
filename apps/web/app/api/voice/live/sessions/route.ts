import 'server-only';

export const runtime = 'nodejs';

import { randomUUID } from 'node:crypto';
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
  buildOrganizationPolicyGateResponse,
  buildSpendLimitGateResponse,
  buildModelPolicyGateResponse,
} from '@/lib/managed-compute-gate';
import { resolveCloudChatSurface } from '@/lib/free-chat-surface-policy';
import { getModelMetadataById, getRoutingSlotModel, isModelLive } from '@agiworkforce/types';
import { isManagedProviderId, providerApiUrl } from '@/lib/server/provider-endpoints';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { SubscriptionService } from '@/lib/services/subscription-service';
import {
  ManagedUsageRequestError,
  createManagedUsageErrorBody,
  fingerprintManagedUsageRequest,
  finalizeManagedUsageRequest,
  markManagedUsageProviderStarted,
  reserveManagedUsageRequest,
  type ManagedUsageRequestReservation,
} from '@/lib/services/managed-usage-request-service';
import { assertTierUnitAllowance } from '@/lib/services/tier-unit-quota-service';
import {
  buildManagedComputeAccessGateResponse,
  evaluateManagedComputeSubscriptionAccess,
} from '@/lib/services/managed-compute-access';
import {
  LIVE_VOICE_BACKEND_INSTRUCTIONS,
  LIVE_VOICE_INSTRUCTIONS,
} from '@/lib/voice/live-voice-prompts';
import { isLiveVoice, LIVE_DEFAULT_VOICE } from '@features/chat/lib/live-voices';
import {
  describeLiveSessionFailure,
  LIVE_SESSION_BLOCK_MINUTES,
  LIVE_VOICE_FEATURE,
  liveSessionCostCents,
} from '@/lib/voice/live-voice-billing';

const LIVE_SESSION_LEASE_SECONDS = 4 * 60 * 60;
const SESSION_CREATE_TIMEOUT_MS = 20_000;
const OPENAI_KEY_ENV = 'OPENAI_API_KEY';
const MAX_SDP_LENGTH = 65_536;

const CreateLiveSessionSchema = z.object({
  sdp: z.string().min(1).max(MAX_SDP_LENGTH),
  voice: z.string().min(1).max(64).nullable().optional(),
  conversationId: z.string().min(1).max(128).nullable().optional(),
});

function jsonError(
  request: NextRequest,
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
): NextResponse {
  return NextResponse.json(
    {
      error: {
        message,
        code,
        type: status >= 500 ? 'api_error' : 'invalid_request_error',
        ...extra,
      },
    },
    { status, headers: { ...getCorsHeaders(request), ...getSecurityHeaders() } },
  );
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
    { status: error.status, headers: { ...getCorsHeaders(request), ...getSecurityHeaders() } },
  );
}

function upstreamErrorCode(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { code?: string; type?: string } };
    return parsed.error?.code ?? parsed.error?.type ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

async function handleCreateLiveSession(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  if (preflightResponse) return preflightResponse;
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;
  const rateLimitResponse = await withRateLimit(request, 'voice-live-session');
  if (rateLimitResponse) return rateLimitResponse;
  const { userId } = await getClerkAuthUser(request);

  const liveModel = getModelMetadataById(getRoutingSlotModel('voice_live'));
  const backendModel = getModelMetadataById(getRoutingSlotModel('voice_live_backend'));
  if (!liveModel || !isModelLive(liveModel) || !backendModel || !isModelLive(backendModel)) {
    throw new Error('The voice_live routing slots do not resolve to live models');
  }
  const provider = String(liveModel.provider);
  if (!isManagedProviderId(provider)) {
    throw new Error(`The voice_live slot resolves to an unmanaged provider: ${provider}`);
  }

  const gateHeaders = { ...getCorsHeaders(request), ...getSecurityHeaders() };
  const managedGateResponse = buildManagedComputeGateResponse(
    request,
    { provider, model: liveModel.id, feature: LIVE_VOICE_FEATURE },
    gateHeaders,
  );
  if (managedGateResponse) return managedGateResponse;
  const policyGateResponse = await buildOrganizationPolicyGateResponse(
    userId,
    request,
    {
      provider,
      model: liveModel.id,
      feature: LIVE_VOICE_FEATURE,
      surface: resolveCloudChatSurface(request),
    },
    gateHeaders,
  );
  if (policyGateResponse) return policyGateResponse;
  const spendGateResponse = await buildSpendLimitGateResponse(userId);
  if (spendGateResponse) return spendGateResponse;
  const modelPolicyResponse = await buildModelPolicyGateResponse(
    userId,
    request,
    { provider, modelId: liveModel.id },
    gateHeaders,
  );
  if (modelPolicyResponse) return modelPolicyResponse;

  let body: z.infer<typeof CreateLiveSessionSchema>;
  try {
    body = CreateLiveSessionSchema.parse(await request.json());
  } catch {
    return jsonError(request, 400, 'invalid_request', 'A WebRTC offer is required.');
  }

  let apiKey: string;
  try {
    apiKey = requireEnv(OPENAI_KEY_ENV);
  } catch {
    logger.error({ event: 'live_voice_not_configured' }, `${OPENAI_KEY_ENV} is not set`);
    return jsonError(
      request,
      503,
      'live_voice_not_configured',
      `${OPENAI_KEY_ENV} is not set on the server, so live voice cannot start.`,
    );
  }

  const scoped = await getUserScopedDb(request);
  if (scoped.userId !== userId) {
    return managedUsageErrorResponse(
      request,
      new ManagedUsageRequestError('Managed usage tenant mismatch.', 403, 'tenant_mismatch'),
    );
  }

  const ceilingSeconds = LIVE_SESSION_BLOCK_MINUTES * 60;
  const estimatedCostCents = liveSessionCostCents(ceilingSeconds);
  let reservation: ManagedUsageRequestReservation;
  try {
    const subscription = await SubscriptionService.getSubscription(scoped.db, userId);
    const subscriptionAccess = await evaluateManagedComputeSubscriptionAccess(
      scoped.db,
      userId,
      subscription,
    );
    if (!subscriptionAccess.allowed) {
      const gateResponse = buildManagedComputeAccessGateResponse(subscriptionAccess, gateHeaders);
      if (gateResponse) return gateResponse;
    }
    const planTier = subscription?.plan_tier ?? 'free';
    await assertTierUnitAllowance({
      db: scoped.db,
      userId,
      planTier,
      unit: 'voice_minutes',
      requestedUnits: LIVE_SESSION_BLOCK_MINUTES,
    });
    reservation = await reserveManagedUsageRequest({
      db: scoped.db,
      userId,
      idempotencyKey: `agi.voice.live.${randomUUID()}`,
      requestHash: fingerprintManagedUsageRequest({
        model: liveModel.id,
        conversationId: body.conversationId ?? null,
        voice: body.voice ?? null,
      }),
      provider,
      model: liveModel.id,
      estimatedCostCents,
      leaseSeconds: LIVE_SESSION_LEASE_SECONDS,
      planTier,
      isFlagship: false,
      quotaFeature: LIVE_VOICE_FEATURE,
    });
  } catch (error) {
    if (error instanceof ManagedUsageRequestError) {
      return managedUsageErrorResponse(request, error);
    }
    logger.error(
      { event: 'live_voice_reservation_failed', error, userId, model: liveModel.id },
      'Live voice reservation failed before any provider spend',
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

  const releaseReservation = async (reason: string): Promise<void> => {
    try {
      await finalizeManagedUsageRequest({
        ...reservation,
        outcome: 'failed',
        actualCostCents: 0,
        usage: { operation: 'voice_live_session', provider, model: liveModel.id, reason },
      });
    } catch (settlementError) {
      logger.error(
        {
          event: 'live_voice_refund_settlement_unrecorded',
          error: settlementError,
          userId,
          idempotencyKey: reservation.idempotencyKey,
        },
        'Live voice failure settlement could not be persisted',
      );
    }
  };

  const voice = isLiveVoice(body.voice) ? body.voice : LIVE_DEFAULT_VOICE;
  let response: Response;
  let responseText: string;
  try {
    await markManagedUsageProviderStarted(reservation);
    response = await fetch(providerApiUrl(provider, 'live/sessions'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session: {
          model: liveModel.apiModelId ?? liveModel.id,
          instructions: LIVE_VOICE_INSTRUCTIONS,
          audio: { output: { voice } },
          delegation: {
            type: 'responses',
            responses: {
              model: backendModel.apiModelId ?? backendModel.id,
              instructions: LIVE_VOICE_BACKEND_INSTRUCTIONS,
              tools: [{ type: 'web_search' }],
              tool_choice: 'auto',
            },
          },
        },
        transport: { type: 'webrtc', sdp: body.sdp },
      }),
      signal: AbortSignal.timeout(SESSION_CREATE_TIMEOUT_MS),
    });
    responseText = await response.text();
  } catch (error) {
    await releaseReservation('provider_unreachable');
    throw error;
  }

  if (!response.ok) {
    const upstreamCode = upstreamErrorCode(responseText);
    logger.warn(
      {
        event: 'live_voice_session_rejected',
        status: response.status,
        upstreamCode,
        body: responseText,
      },
      'Live voice session creation failed',
    );
    await releaseReservation('provider_failed');
    const failure = describeLiveSessionFailure(response.status, upstreamCode);
    return jsonError(request, failure.status, failure.code, failure.message, {
      upstreamStatus: response.status,
      upstreamCode,
    });
  }

  let created: { session?: { id?: string }; transport?: { sdp?: string } };
  try {
    created = JSON.parse(responseText) as typeof created;
  } catch {
    created = {};
  }
  const sessionId = created.session?.id;
  const answer = created.transport?.sdp;
  if (!sessionId || !answer) {
    await releaseReservation('provider_malformed');
    return jsonError(
      request,
      502,
      'live_voice_malformed',
      'The live voice service answered without a session.',
    );
  }

  logger.info(
    { userId, provider, model: liveModel.id, sessionId, estimatedCostCents },
    'Live voice session created',
  );
  return NextResponse.json(
    {
      sessionId,
      sdp: answer,
      settlement: {
        idempotencyKey: reservation.idempotencyKey,
        leaseToken: reservation.leaseToken,
        requestHash: reservation.requestHash,
        estimatedCostCents,
        ceilingSeconds,
      },
    },
    { status: 201, headers: { ...getCorsHeaders(request), ...getSecurityHeaders() } },
  );
}

export const POST = withErrorHandler(handleCreateLiveSession);

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, {
      status: 204,
      headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
    })
  );
}
