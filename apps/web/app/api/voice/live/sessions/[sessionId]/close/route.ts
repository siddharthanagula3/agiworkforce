import 'server-only';

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getClerkAuthUser } from '@/lib/api-auth';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { ledgerCentsFromMicrousd } from '@/lib/services/credit-service';
import { recordSettledProviderCost } from '@/lib/services/cogs-ledger-service';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { getModelMetadataById, getVoiceLiveBackendModel } from '@agiworkforce/types';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { resolveEntitlementBundle } from '@/lib/services/entitlement-resolution';
import {
  LIVE_SESSION_PROVIDER_COST_SOURCE,
  liveSessionProviderCostMicrousd,
} from '@/lib/voice/live-voice-billing';
import { voiceJsonError } from '../../lib/voice-session-budget';
import { recordLiveVoiceBackendCost } from '@/lib/voice/live-voice-backend-cost';
import {
  closeVoiceSession,
  getVoiceSessionByProviderId,
  isVoiceSessionStoreReady,
  meteredVoiceSessionSeconds,
  type VoiceSessionRecord,
} from '../../lib/voice-session-store';

const LIVE_VOICE_SESSION_COST_SOURCE = 'live_voice_session';
const LIVE_VOICE_SESSION_OPERATION = 'voice_live_session';

const CloseLiveSessionSchema = z.object({
  seconds: z
    .number()
    .min(0)
    .max(24 * 60 * 60),
  reason: z.string().max(64).optional(),
  lastTurnId: z.string().min(1).max(128).optional(),
  /**
   * What the delegated backend responses model spent during the session. The
   * provider bills it separately from the per-minute session rate, and nothing
   * reported it, so that spend never reached the COGS ledger. Optional, because
   * a session that never delegated has none, and a client that does not send it
   * still settles the session itself correctly.
   */
  backend: z
    .object({
      inputTokens: z.number().int().min(0).optional(),
      outputTokens: z.number().int().min(0).optional(),
      cachedTokens: z.number().int().min(0).optional(),
      webSearchCalls: z.number().int().min(0).optional(),
    })
    .optional(),
});

async function resolveSessionBackendModel(
  db: Parameters<typeof resolveEntitlementBundle>[0],
  userId: string,
): Promise<string> {
  try {
    return getVoiceLiveBackendModel((await resolveEntitlementBundle(db, userId)).plan);
  } catch (error) {
    logger.error(
      { error, userId },
      'Live voice plan could not be read at close; the backend is priced at the free-tier model',
    );
    return getVoiceLiveBackendModel(null);
  }
}

async function handleCloseLiveSession(
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

  let body: z.infer<typeof CloseLiveSessionSchema>;
  try {
    body = CloseLiveSessionSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: { message: 'A usage report is required.', type: 'invalid_request_error' } },
      { status: 400, headers },
    );
  }

  const scoped = await getUserScopedDb(request);
  if (scoped.userId !== userId) {
    return NextResponse.json(
      { error: { message: 'Managed usage tenant mismatch.', type: 'invalid_request_error' } },
      { status: 403, headers },
    );
  }

  // The canonical record is read before anything settles: a tab that dropped
  // its connection reports the last usage event it saw, which is none at all
  // when the drop came first, and that report alone billed the session at zero
  // and left the plan's voice allowance untouched for the minutes it ran.
  let storeReady = false;
  try {
    storeReady = await isVoiceSessionStoreReady(scoped.db);
  } catch (error) {
    logger.warn({ error, userId, sessionId }, 'Voice session store readiness could not be read');
  }
  if (!storeReady) {
    return voiceJsonError(
      request,
      503,
      'voice_session_unreadable',
      'The voice session could not be read, so it was not closed. Try again.',
    );
  }
  let record: VoiceSessionRecord | null;
  try {
    record = await getVoiceSessionByProviderId(scoped.db, userId, sessionId);
  } catch (error) {
    logger.warn({ error, userId, sessionId }, 'Voice session record could not be read');
    return voiceJsonError(
      request,
      503,
      'voice_session_unreadable',
      'The voice session could not be read, so it was not closed. Try again.',
    );
  }
  if (!record) {
    return voiceJsonError(
      request,
      404,
      'voice_session_not_found',
      'No voice session with this id was started.',
    );
  }

  const reportedSeconds = Math.max(0, Math.ceil(body.seconds));
  let closedRecord: VoiceSessionRecord | null = null;
  try {
    closedRecord = await closeVoiceSession({
      db: scoped.db,
      userId,
      providerSessionId: sessionId,
      reason: body.reason ?? 'close_requested',
      ...(body.lastTurnId ? { lastTurnId: body.lastTurnId } : {}),
    });
  } catch (error) {
    logger.warn({ error, userId, sessionId }, 'Voice session record could not be closed');
    return voiceJsonError(
      request,
      503,
      'voice_session_unreadable',
      'The voice session could not be closed. Try again.',
    );
  }
  if (!closedRecord) {
    return NextResponse.json(
      { billedSeconds: meteredVoiceSessionSeconds(record, 0, Date.now()) },
      { headers },
    );
  }

  const billedSeconds = meteredVoiceSessionSeconds(closedRecord, 0, Date.now());
  const model = closedRecord.modelId;
  const provider = closedRecord.provider;
  const providerCostMicrousd = liveSessionProviderCostMicrousd(billedSeconds, model);
  if (providerCostMicrousd === null && billedSeconds > 0) {
    logger.error(
      { userId, sessionId, model, billedSeconds },
      'Live voice model declares no published session rate; these minutes are recorded unpriced',
    );
  }
  try {
    await recordSettledProviderCost({
      userId,
      organizationId: closedRecord.organizationId,
      provider,
      model,
      actualCostCents: ledgerCentsFromMicrousd(providerCostMicrousd ?? 0),
      customerCanonicalMicrousd: 0,
      sourceRef: `${LIVE_VOICE_SESSION_COST_SOURCE}:${sessionId}`,
      taskOutcome: 'delivered',
      taskRef: `voice-live:${sessionId}`,
      surface: closedRecord.surface,
      usage: {
        operation: LIVE_VOICE_SESSION_OPERATION,
        provider,
        model,
        providerSku: getModelMetadataById(model)?.apiModelId ?? model,
        sessionId,
        reportedSeconds,
        billedSeconds,
        reason: body.reason ?? 'close_requested',
        costSource: LIVE_SESSION_PROVIDER_COST_SOURCE,
      },
    });
  } catch (error) {
    logger.warn({ error, userId, sessionId }, 'Live voice session cost was not recorded');
  }
  if (body.backend) {
    await recordLiveVoiceBackendCost({
      userId,
      organizationId: closedRecord.organizationId,
      provider,
      sessionId,
      surface: closedRecord.surface,
      backendModel: await resolveSessionBackendModel(scoped.db, userId),
      reported: body.backend,
    });
  }

  logger.info(
    { userId, sessionId, billedSeconds, reason: body.reason },
    'Live voice session closed',
  );
  return NextResponse.json({ billedSeconds }, { headers });
}

export const POST = withErrorHandler(handleCloseLiveSession);

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, {
      status: 204,
      headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
    })
  );
}
