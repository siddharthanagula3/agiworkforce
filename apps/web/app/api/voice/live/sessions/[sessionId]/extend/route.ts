import 'server-only';

export const runtime = 'nodejs';

import { getRoutingSlotModel } from '@agiworkforce/types';
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
  estimateMicrousdOf,
  ManagedUsageRequestError,
  type ManagedUsageRequestReservation,
  reserveManagedUsageProviderStep,
} from '@/lib/services/managed-usage-request-service';
import { assertTierUnitAllowance } from '@/lib/services/tier-unit-quota-service';
import {
  LIVE_SESSION_MIN_BLOCK_SECONDS,
  LIVE_VOICE_FEATURE,
  liveSessionChargeMicrousd,
  liveSessionMinutes,
  liveSessionSecondsCoveredBy,
} from '@/lib/voice/live-voice-billing';
import {
  planVoiceSessionBlock,
  readVoiceReservation,
  voiceBlockOperationKey,
  voiceJsonError,
  voiceUsageErrorResponse,
  type VoiceLimitResets,
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
  settlement: z.object({
    idempotencyKey: z.string().min(1).max(256),
    leaseToken: z.string().min(1).max(256),
    requestHash: z.string().min(1).max(256),
  }),
});

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
    return voiceJsonError(
      request,
      400,
      'invalid_request',
      'A block and its settlement are required.',
    );
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
  if (
    !(
      modelKeepsInputsOutOfTraining(record.modelId) &&
      modelKeepsInputsOutOfTraining(getRoutingSlotModel('voice_live_backend'))
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

  const { settlement } = body;
  const modelId = record.modelId;
  const operationKey = voiceBlockOperationKey(body.block);
  const reservation: ManagedUsageRequestReservation = {
    db: scoped.db,
    userId,
    idempotencyKey: settlement.idempotencyKey,
    leaseToken: settlement.leaseToken,
    requestHash: settlement.requestHash,
    estimatedCostMicrousd: 0,
    estimatedCostCents: 0,
    quotaFeature: LIVE_VOICE_FEATURE,
    provider: record.provider,
    model: modelId,
  };
  const covered = (reservedMicrousd: number) =>
    NextResponse.json(
      { ceilingSeconds: liveSessionSecondsCoveredBy(reservedMicrousd, modelId) },
      { headers },
    );

  let resetsAt: VoiceLimitResets | undefined;
  try {
    const state = await readVoiceReservation({
      db: scoped.db,
      userId,
      idempotencyKey: settlement.idempotencyKey,
      requestHash: settlement.requestHash,
      operationKey,
    });
    if (!state) {
      return voiceJsonError(
        request,
        409,
        'voice_session_unreserved',
        'This voice session has no reservation to extend.',
      );
    }
    if (state.extensionStatus === 'extended') return covered(state.reservedMicrousd);

    const entitlement = await resolveEntitlementBundle(scoped.db, userId);
    const planTier = entitlement.plan;
    const block = await planVoiceSessionBlock({
      db: scoped.db,
      userId,
      planTier,
      catalogVersion: entitlement.catalogVersion,
      modelId,
    });
    resetsAt = block.resetsAt;
    await reserveManagedUsageProviderStep({
      reservation,
      operationKey: voiceBlockOperationKey(INITIAL_BLOCK),
      estimatedCostMicrousd: 0,
      planTier,
      isFlagship: false,
    });

    let stepMicrousd = state.extensionMicrousd;
    if (stepMicrousd === null) {
      const blockSeconds = Math.max(block.blockSeconds, LIVE_SESSION_MIN_BLOCK_SECONDS);
      await assertTierUnitAllowance({
        db: scoped.db,
        userId,
        planTier,
        unit: 'voice_minutes',
        requestedUnits: liveSessionMinutes(
          liveSessionSecondsCoveredBy(state.reservedMicrousd, modelId) + blockSeconds,
        ),
      });
      stepMicrousd = liveSessionChargeMicrousd(blockSeconds, modelId) ?? 0;
    }

    const extended = await reserveManagedUsageProviderStep({
      reservation,
      operationKey,
      estimatedCostMicrousd: stepMicrousd,
      planTier,
      isFlagship: false,
    });
    await touchVoiceSession({ db: scoped.db, userId, providerSessionId: sessionId }).catch(
      (error: unknown) => {
        logger.warn({ error, userId, sessionId }, 'Voice session could not be marked as seen');
      },
    );
    return covered(estimateMicrousdOf(extended));
  } catch (error) {
    if (error instanceof ManagedUsageRequestError) {
      return voiceUsageErrorResponse(request, error, resetsAt);
    }
    logger.error(
      { event: 'live_voice_extension_failed', error, userId, sessionId },
      'Live voice block could not be extended',
    );
    return voiceUsageErrorResponse(
      request,
      new ManagedUsageRequestError(
        'Managed usage billing is temporarily unavailable.',
        503,
        'billing_unavailable',
      ),
    );
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
