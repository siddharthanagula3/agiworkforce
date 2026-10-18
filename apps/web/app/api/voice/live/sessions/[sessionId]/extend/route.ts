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
  FREE_VOICE_SESSION_ALLOWANCE_SECONDS,
  freeVoiceAllowanceUsedError,
  grantFreeVoiceSeconds,
  readFreeVoiceSession,
  type FreeVoiceSessionState,
} from '@/lib/voice/free-voice-allowance';
import {
  readVoiceReservation,
  VOICE_INITIAL_BLOCK,
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

const ExtendLiveSessionSchema = z.object({
  block: z
    .number()
    .int()
    .min(VOICE_INITIAL_BLOCK + 1),
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
 * Gives a session that runs on the monthly voice allowance its next minute.
 * Blocks are taken in order, so the ceiling a tab is told always equals what
 * the session has been granted.
 */
async function extendOnFreeAllowance(input: {
  request: NextRequest;
  db: Awaited<ReturnType<typeof getUserScopedDb>>['db'];
  userId: string;
  record: VoiceSessionRecord;
  block: number;
  session: FreeVoiceSessionState;
  headers: Record<string, string>;
}): Promise<NextResponse> {
  const { request, db, userId, record, block } = input;
  const covered = () =>
    NextResponse.json(
      { ceilingSeconds: block * LIVE_VOICE_BLOCK_SECONDS },
      { headers: input.headers },
    );
  await touchVoiceSession({ db, userId, providerSessionId: record.providerSessionId }).catch(
    (error: unknown) => {
      logger.warn(
        { error, userId, sessionId: record.providerSessionId },
        'Voice session could not be marked as seen',
      );
    },
  );
  const grantedBlocks = Math.floor(input.session.grantedSeconds / LIVE_VOICE_BLOCK_SECONDS);
  if (block <= grantedBlocks) return covered();
  if (block !== grantedBlocks + 1) {
    return voiceJsonError(
      request,
      409,
      'voice_block_out_of_order',
      'This voice session has not reached that minute yet.',
    );
  }
  try {
    const grant = await grantFreeVoiceSeconds({
      db,
      userId,
      sessionId: record.id,
      use: 'live',
      grantKey: voiceBlockOperationKey(block),
      seconds: LIVE_VOICE_BLOCK_SECONDS,
      limitSeconds: FREE_VOICE_SESSION_ALLOWANCE_SECONDS,
    });
    if (grant.granted) return covered();
    if (grant.reason === 'session_settled') {
      return voiceJsonError(request, 409, 'voice_session_closed', 'This voice session has ended.');
    }
    const refusal = freeVoiceAllowanceUsedError(grant.resetsAt);
    return voiceUsageErrorResponse(request, refusal, { [refusal.code]: grant.resetsAt });
  } catch (error) {
    logger.error(
      { event: 'live_voice_extension_failed', error, userId, sessionId: record.providerSessionId },
      'Live voice allowance could not be extended',
    );
    return billingUnavailable(request);
  }
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

  let freeSession: FreeVoiceSessionState | null;
  try {
    freeSession = await readFreeVoiceSession(scoped.db, userId, record.id);
  } catch (error) {
    logger.error(
      { event: 'live_voice_extension_failed', error, userId, sessionId },
      'Live voice allowance could not be read before extending the block',
    );
    return billingUnavailable(request);
  }
  if (freeSession) {
    return extendOnFreeAllowance({
      request,
      db: scoped.db,
      userId,
      record,
      block: body.block,
      session: freeSession,
      headers,
    });
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
      operationKey: voiceBlockOperationKey(VOICE_INITIAL_BLOCK),
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
