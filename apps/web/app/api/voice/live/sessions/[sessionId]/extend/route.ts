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
import { ManagedUsageRequestError } from '@/lib/services/managed-usage-request-service';
import {
  planIncludesVoice,
  planVoiceMinutesBlock,
  VOICE_USAGE_NOT_IN_PLAN,
  voiceBillingUnavailable,
  voiceJsonError,
  voiceUsageErrorResponse,
} from '../../lib/voice-session-budget';
import {
  getVoiceSessionByProviderId,
  isVoiceSessionStoreReady,
  touchVoiceSession,
  type VoiceSessionRecord,
} from '../../lib/voice-session-store';

const FIRST_EXTENSION_BLOCK = 2;
const MS_PER_SECOND = 1_000;

const ExtendLiveSessionSchema = z.object({
  block: z.number().int().min(FIRST_EXTENSION_BLOCK),
});

function elapsedSeconds(record: VoiceSessionRecord, nowMs: number): number {
  const startedAt = Date.parse(record.startedAt);
  return Number.isFinite(startedAt) ? Math.ceil(Math.max(0, nowMs - startedAt) / MS_PER_SECOND) : 0;
}

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

  try {
    ExtendLiveSessionSchema.parse(await request.json());
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
    return voiceBillingUnavailable(request);
  }
  if (!planIncludesVoice(entitlement.plan)) {
    return voiceJsonError(
      request,
      403,
      VOICE_USAGE_NOT_IN_PLAN.code,
      VOICE_USAGE_NOT_IN_PLAN.message,
    );
  }
  if (
    !(
      modelKeepsInputsOutOfTraining(record.modelId) &&
      modelKeepsInputsOutOfTraining(getVoiceLiveBackendModel(entitlement.plan))
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

  try {
    await touchVoiceSession({ db: scoped.db, userId, providerSessionId: sessionId }).catch(
      (error: unknown) => {
        logger.warn({ error, userId, sessionId }, 'Voice session could not be marked as seen');
      },
    );
    const blockSeconds = await planVoiceMinutesBlock({
      db: scoped.db,
      userId,
      planTier: entitlement.plan,
    });
    return NextResponse.json(
      { ceilingSeconds: elapsedSeconds(record, Date.now()) + blockSeconds },
      { headers },
    );
  } catch (error) {
    if (error instanceof ManagedUsageRequestError) return voiceUsageErrorResponse(request, error);
    logger.error(
      { event: 'live_voice_extension_failed', error, userId, sessionId },
      'Live voice block could not be extended',
    );
    return voiceBillingUnavailable(request);
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
