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
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import {
  chargeMicrousdForProviderCost,
  getModelMetadataById,
  getRoutingSlotModel,
} from '@agiworkforce/types';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  finalizeManagedUsageRequest,
  markManagedUsageClientDelivered,
} from '@/lib/services/managed-usage-request-service';
import {
  LIVE_SESSION_CEILING_SECONDS,
  LIVE_SESSION_PROVIDER_COST_SOURCE,
  LIVE_VOICE_FEATURE,
  liveSessionChargeMicrousd,
  liveSessionProviderCostMicrousd,
  liveSessionSecondsCoveredBy,
} from '@/lib/voice/live-voice-billing';
import { readVoiceReservation, voiceJsonError } from '../../lib/voice-session-budget';
import {
  priceLiveVoiceBackend,
  recordLiveVoiceBackendCost,
} from '@/lib/voice/live-voice-backend-cost';
import {
  closeVoiceSession,
  getVoiceSessionByProviderId,
  isVoiceSessionStoreReady,
  meteredVoiceSessionSeconds,
  type VoiceSessionRecord,
} from '../../lib/voice-session-store';

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
      model: z.string().min(1).max(128).optional(),
      inputTokens: z.number().int().min(0).optional(),
      outputTokens: z.number().int().min(0).optional(),
      cachedTokens: z.number().int().min(0).optional(),
      webSearchCalls: z.number().int().min(0).optional(),
    })
    .optional(),
  settlement: z.object({
    idempotencyKey: z.string().min(1).max(256),
    leaseToken: z.string().min(1).max(256),
    requestHash: z.string().min(1).max(256),
  }),
});

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

  const liveModel = getModelMetadataById(getRoutingSlotModel('voice_live'));
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
  let record: VoiceSessionRecord | null = null;
  if (storeReady) {
    try {
      record = await getVoiceSessionByProviderId(scoped.db, userId, sessionId);
    } catch (error) {
      logger.warn({ error, userId, sessionId }, 'Voice session record could not be read');
      return voiceJsonError(
        request,
        503,
        'voice_session_unreadable',
        'The voice session could not be read, so it was not settled. Try again.',
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
  }

  const reportedSeconds = Math.max(0, Math.ceil(body.seconds));
  const meteredSeconds = record
    ? meteredVoiceSessionSeconds(record, reportedSeconds, Date.now())
    : reportedSeconds;
  const model = record?.modelId ?? liveModel?.id;
  let estimatedCostMicrousd: number | null = null;
  try {
    estimatedCostMicrousd =
      (
        await readVoiceReservation({
          db: scoped.db,
          userId,
          idempotencyKey: body.settlement.idempotencyKey,
          requestHash: body.settlement.requestHash,
        })
      )?.reservedMicrousd ?? null;
  } catch (error) {
    logger.error(
      { error, userId, sessionId },
      'Live voice reservation could not be read; settling against one block',
    );
  }
  estimatedCostMicrousd ??= liveSessionChargeMicrousd(LIVE_SESSION_CEILING_SECONDS, model) ?? 0;
  const billedSeconds = Math.min(
    meteredSeconds,
    liveSessionSecondsCoveredBy(estimatedCostMicrousd, model),
  );
  const backendProvider = record?.provider ?? (liveModel ? String(liveModel.provider) : 'unknown');
  const backendCost = body.backend
    ? priceLiveVoiceBackend({
        provider: backendProvider,
        backendModel: getRoutingSlotModel('voice_live_backend'),
        reported: body.backend,
      })
    : null;
  const actualCostMicrousd = Math.min(
    (liveSessionChargeMicrousd(billedSeconds, model) ?? 0) +
      chargeMicrousdForProviderCost(backendCost?.totalMicrousd ?? 0),
    estimatedCostMicrousd,
  );
  const providerCostMicrousd = liveSessionProviderCostMicrousd(billedSeconds, model);
  if (providerCostMicrousd === null && billedSeconds > 0) {
    logger.error(
      { userId, sessionId, model, billedSeconds },
      'Live voice model declares no published session rate; these minutes settle unpriced',
    );
  }
  const reservation = {
    db: scoped.db,
    userId,
    idempotencyKey: body.settlement.idempotencyKey,
    leaseToken: body.settlement.leaseToken,
    requestHash: body.settlement.requestHash,
    estimatedCostMicrousd,
    estimatedCostCents: ledgerCentsFromMicrousd(estimatedCostMicrousd),
    quotaFeature: LIVE_VOICE_FEATURE,
    provider: record?.provider ?? (liveModel ? String(liveModel.provider) : undefined),
    model,
  };
  await finalizeManagedUsageRequest({
    ...reservation,
    outcome: 'completed',
    actualCostMicrousd,
    ...(providerCostMicrousd === null ? {} : { providerCostMicrousd }),
    usage: {
      operation: 'voice_live_session',
      provider: reservation.provider,
      model: reservation.model,
      providerSku: getModelMetadataById(model)?.apiModelId ?? model,
      sessionId,
      sessionSeconds: body.seconds,
      reportedSeconds,
      billedSeconds,
      reason: body.reason ?? 'close_requested',
      ...(backendCost ? { backendCostMicrousd: backendCost.totalMicrousd } : {}),
      ...(providerCostMicrousd === null
        ? {}
        : { providerCostMicrousd, costSource: LIVE_SESSION_PROVIDER_COST_SOURCE }),
    },
  });
  if (body.backend) {
    await recordLiveVoiceBackendCost({
      userId,
      provider: reservation.provider ?? 'unknown',
      sessionId,
      surface: record?.surface ?? null,
      backendModel: getRoutingSlotModel('voice_live_backend'),
      reported: body.backend,
    });
  }
  try {
    await markManagedUsageClientDelivered(reservation);
  } catch (error) {
    logger.warn(
      { error, userId, idempotencyKey: reservation.idempotencyKey },
      'Live voice delivery marker could not be persisted',
    );
  }
  // The record closes after settlement: a row that still says active is a
  // session that was never billed, which is the state worth noticing.
  try {
    if (storeReady) {
      await closeVoiceSession({
        db: scoped.db,
        userId,
        providerSessionId: sessionId,
        reason: body.reason ?? 'close_requested',
        ...(body.lastTurnId ? { lastTurnId: body.lastTurnId } : {}),
      });
    }
  } catch (error) {
    logger.warn({ error, userId, sessionId }, 'Voice session record could not be closed');
  }

  logger.info(
    { userId, sessionId, billedSeconds, actualCostMicrousd, reason: body.reason },
    'Live voice session settled',
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
