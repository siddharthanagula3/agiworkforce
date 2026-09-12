import 'server-only';

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getClerkAuthUser } from '@/lib/api-auth';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { microusdFromLedgerCents } from '@/lib/services/credit-service';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { getModelMetadataById, getRoutingSlotModel } from '@agiworkforce/types';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  finalizeManagedUsageRequest,
  markManagedUsageClientDelivered,
} from '@/lib/services/managed-usage-request-service';
import {
  LIVE_SESSION_PROVIDER_COST_SOURCE,
  LIVE_VOICE_FEATURE,
  liveSessionCostCents,
  liveSessionProviderCostCents,
} from '@/lib/voice/live-voice-billing';
import { recordLiveVoiceBackendCost } from '@/lib/voice/live-voice-backend-cost';

const CloseLiveSessionSchema = z.object({
  seconds: z
    .number()
    .min(0)
    .max(24 * 60 * 60),
  reason: z.string().max(64).optional(),
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
    estimatedCostCents: z.number().int().min(0),
    ceilingSeconds: z.number().int().min(0),
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
  const billedSeconds = Math.min(Math.ceil(body.seconds), body.settlement.ceilingSeconds);
  const actualCostCents = Math.min(
    liveSessionCostCents(billedSeconds),
    body.settlement.estimatedCostCents,
  );
  const reservation = {
    db: scoped.db,
    userId,
    idempotencyKey: body.settlement.idempotencyKey,
    leaseToken: body.settlement.leaseToken,
    requestHash: body.settlement.requestHash,
    estimatedCostMicrousd: microusdFromLedgerCents(body.settlement.estimatedCostCents),
    estimatedCostCents: body.settlement.estimatedCostCents,
    quotaFeature: LIVE_VOICE_FEATURE,
    provider: liveModel ? String(liveModel.provider) : undefined,
    model: liveModel?.id,
  };
  const providerCostCents = liveSessionProviderCostCents(billedSeconds, reservation.model);
  if (providerCostCents === null && billedSeconds > 0) {
    logger.error(
      { userId, sessionId, model: reservation.model, billedSeconds },
      'Live voice model declares no published session rate; provider cost falls back to the customer charge',
    );
  }
  await finalizeManagedUsageRequest({
    ...reservation,
    outcome: 'completed',
    // The live-voice rate is published per minute in whole cents, so the exact
    // charge is a whole number of cents; the microUSD field carries it without
    // a second rounding.
    actualCostMicrousd: microusdFromLedgerCents(actualCostCents),
    ...(providerCostCents === null
      ? {}
      : { providerCostMicrousd: microusdFromLedgerCents(providerCostCents) }),
    usage: {
      operation: 'voice_live_session',
      provider: reservation.provider,
      model: reservation.model,
      providerSku: liveModel?.apiModelId ?? reservation.model,
      sessionId,
      sessionSeconds: body.seconds,
      billedSeconds,
      reason: body.reason ?? 'close_requested',
      ...(providerCostCents === null
        ? {}
        : { providerCostCents, costSource: LIVE_SESSION_PROVIDER_COST_SOURCE }),
    },
  });
  if (body.backend) {
    await recordLiveVoiceBackendCost({
      userId,
      provider: reservation.provider ?? 'unknown',
      sessionId,
      surface: 'web',
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
  logger.info(
    { userId, sessionId, billedSeconds, actualCostCents, reason: body.reason },
    'Live voice session settled',
  );
  return NextResponse.json({ billedSeconds, actualCostCents }, { headers });
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
