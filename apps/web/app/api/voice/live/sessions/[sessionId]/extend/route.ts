import 'server-only';

export const runtime = 'nodejs';

import { getVoiceLiveBackendModel } from '@agiworkforce/types';
import {
  GOOGLE_USER_DATA_VOICE_MESSAGE,
  storedConversationCarriesGoogleUserData,
} from '@/lib/connectors/google-user-data';
import { modelKeepsInputsOutOfTraining } from '@/lib/server/provider-training-opt-out';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getClerkAuthUser } from '@/lib/api-auth';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { resolveEntitlementBundle } from '@/lib/services/entitlement-resolution';
import {
  ManagedUsageRequestError,
  type ManagedUsageRequestReservation,
  reserveManagedUsageProviderStep,
} from '@/lib/services/managed-usage-request-service';
import {
  LIVE_VOICE_BLOCK_SECONDS,
  LIVE_VOICE_FEATURE,
  liveVoiceBlockChargeMicrousd,
} from '@/lib/voice/live-voice-billing';
import {
  readVoiceReservation,
  voiceBlockOperationKey,
  voiceJsonError,
  voiceReservationIdentity,
  voiceUsageErrorResponse,
} from '../../lib/voice-session-budget';
import {
  getVoiceSessionByProviderId,
  isVoiceSessionStoreReady,
  touchVoiceSession,
  type VoiceSessionRecord,
} from '../../lib/voice-session-store';

const INITIAL_BLOCK = 1;

const ExtendLiveSessionSchema = z.object({
  block: z
    .number()
    .int()
    .min(INITIAL_BLOCK + 1),
});

function billingUnavailable(request: NextRequest): NextResponse {
  return voiceUsageErrorResponse(
    request,
    new ManagedUsageRequestError(
      'Managed usage billing is temporarily unavailable.',
      503,
      'billing_unavailable',
    ),
  );
}

/**
 * Reserves the next one-minute block of a running session against the same
 * usage budget chat draws on. A refusal names the window that refused it, and
 * the tab ends the call when the block it already holds runs out.
 */
async function handleExtendLiveSession(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const preflightResponse = handleCorsPreflightRequest(request);
  if (preflightResponse) return preflightResponse;
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;
  const rateLimitResponse = await withRateLimit(request, 'voice-live-session');
  if (rateLimitResponse) return rateLimitResponse;
  const { userId } = await getClerkAuthUser(request);
  const { sessionId } = await context.params;
  const headers = { ...getCorsHeaders(request), ...getSecurityHeaders() };

  let body: z.infer<typeof ExtendLiveSessionSchema>;
  try {
    body = ExtendLiveSessionSchema.parse(await request.json());
  } catch {
    return voiceJsonError(request, 400, 'invalid_request', 'The block to extend is required.');
  }

  const scoped = await getUserScopedDb(request);
  if (scoped.userId !== userId) {
    return voiceJsonError(request, 403, 'tenant_mismatch', 'Managed usage tenant mismatch.');
  }

  let record: VoiceSessionRecord | null = null;
  try {
    if (await isVoiceSessionStoreReady(scoped.db)) {
      record = await getVoiceSessionByProviderId(scoped.db, userId, sessionId);
    }
  } catch (error) {
    logger.warn({ error, userId, sessionId }, 'Voice session record could not be read');
  }
  if (!record || record.status !== 'active') {
    return voiceJsonError(request, 409, 'voice_session_closed', 'This voice session has ended.');
  }
  let entitlement: Awaited<ReturnType<typeof resolveEntitlementBundle>>;
  try {
    entitlement = await resolveEntitlementBundle(scoped.db, userId);
  } catch (error) {
    logger.error(
      { event: 'live_voice_extension_failed', error, userId, sessionId },
      'Live voice plan could not be read before extending the block',
    );
    return billingUnavailable(request);
  }
  const planTier = entitlement.plan;
  const backendModelId = getVoiceLiveBackendModel(planTier);
  if (
    !(
      modelKeepsInputsOutOfTraining(record.modelId) && modelKeepsInputsOutOfTraining(backendModelId)
    ) &&
    (await storedConversationCarriesGoogleUserData(
      scoped.db,
      userId,
      scoped.organizationId,
      record.conversationId,
    ))
  ) {
    return voiceJsonError(request, 403, 'model_may_train', GOOGLE_USER_DATA_VOICE_MESSAGE);
  }

  const identity = voiceReservationIdentity(record.id);
  const reservation: ManagedUsageRequestReservation = {
    db: scoped.db,
    userId,
    ...identity,
    estimatedCostMicrousd: 0,
    estimatedCostCents: 0,
    quotaFeature: LIVE_VOICE_FEATURE,
    provider: record.provider,
    model: record.modelId,
  };
  const covered = () =>
    NextResponse.json({ ceilingSeconds: body.block * LIVE_VOICE_BLOCK_SECONDS }, { headers });

  try {
    await touchVoiceSession({ db: scoped.db, userId, providerSessionId: sessionId }).catch(
      (error: unknown) => {
        logger.warn({ error, userId, sessionId }, 'Voice session could not be marked as seen');
      },
    );
    const operationKey = voiceBlockOperationKey(body.block);
    const state = await readVoiceReservation({ db: scoped.db, userId, ...identity, operationKey });
    if (!state) {
      return voiceJsonError(
        request,
        409,
        'voice_session_unreserved',
        'This voice session has no reservation to extend.',
      );
    }
    if (state.extensionStatus === 'extended') return covered();

    await reserveManagedUsageProviderStep({
      reservation,
      operationKey: voiceBlockOperationKey(INITIAL_BLOCK),
      estimatedCostMicrousd: 0,
      planTier,
      isFlagship: false,
    });
    await reserveManagedUsageProviderStep({
      reservation,
      operationKey,
      estimatedCostMicrousd:
        state.extensionMicrousd ??
        liveVoiceBlockChargeMicrousd(record.modelId, backendModelId) ??
        0,
      planTier,
      isFlagship: false,
    });
    return covered();
  } catch (error) {
    if (error instanceof ManagedUsageRequestError) return voiceUsageErrorResponse(request, error);
    logger.error(
      { event: 'live_voice_extension_failed', error, userId, sessionId },
      'Live voice block could not be extended',
    );
    return billingUnavailable(request);
  }
}

export const POST = withErrorHandler(handleExtendLiveSession);

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, {
      status: 204,
      headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
    })
  );
}
