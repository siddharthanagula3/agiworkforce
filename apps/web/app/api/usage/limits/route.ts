import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { isAuthGateRefusal } from '@/lib/api-auth-response';
import type { AccountUsageLimitsResponse, ManagedTurnSlotReading } from '@agiworkforce/types';
import { readManagedTurnSlots, withRateLimitHandler } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb, type UserScopedDb } from '@/lib/server/rls-db';
import { readFileStorageMeter } from '@/lib/server/file-storage';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { isApiKeyScopeError } from '@/lib/api-key-scope-error';
import { resolveEntitledPlanTier } from '@/lib/services/entitlement-resolution';
import { readTierUnitUsage } from '@/lib/services/tier-unit-quota-service';
import { readMonthlyImageUsage } from '@/lib/services/account-usage-history-service';
import {
  creditsFromMicrousd,
  getRoutingSlotModel,
  getVoiceLiveBackendModel,
} from '@agiworkforce/types';
import { liveVoiceBlockChargeMicrousd } from '@/lib/voice/live-voice-billing';
import {
  freeVoiceAllowanceSeconds,
  readFreeVoiceConsumedSeconds,
} from '@/lib/voice/free-voice-allowance';

const CREDIT_PRECISION = 100;
const SECONDS_PER_MINUTE = 60;
const VOICE_MINUTES_UNIT = 'voice_minutes';

function voiceMinuteCredits(planTier: string): number | null {
  const microusd = liveVoiceBlockChargeMicrousd(
    getRoutingSlotModel('voice_live'),
    getVoiceLiveBackendModel(planTier),
  );
  return microusd === null
    ? null
    : Math.ceil(creditsFromMicrousd(microusd) * CREDIT_PRECISION) / CREDIT_PRECISION;
}

export const runtime = 'nodejs';

async function readRunningResponses(
  userId: string,
  planTier: string,
): Promise<ManagedTurnSlotReading | null> {
  try {
    return await readManagedTurnSlots({ userId, planTier });
  } catch (error) {
    logger.warn({ error, userId }, 'Running response count unavailable');
    return null;
  }
}

async function handler(request: NextRequest) {
  let scoped: UserScopedDb;
  try {
    scoped = await getUserScopedDb(request, { apiKeyScope: 'usage:read' });
  } catch (error) {
    if (isApiKeyScopeError(error) || isAuthGateRefusal(error)) {
      throw error;
    }
    throw createError.unauthorized('Authentication required');
  }

  try {
    const planTier = await resolveEntitledPlanTier(scoped.db, scoped.userId);
    const [period, images, responses, storage] = await Promise.all([
      readTierUnitUsage(scoped.db, scoped.userId, planTier),
      readMonthlyImageUsage(scoped.db, scoped.userId),
      readRunningResponses(scoped.userId, planTier),
      readFileStorageMeter({
        db: scoped.db,
        userId: scoped.userId,
        organizationId: scoped.organizationId,
      }),
    ]);
    const allowanceVoiceMinutes =
      freeVoiceAllowanceSeconds(planTier) === null
        ? null
        : Math.ceil(
            (await readFreeVoiceConsumedSeconds(scoped.db, scoped.userId)) / SECONDS_PER_MINUTE,
          );
    const body: AccountUsageLimitsResponse = {
      planTier,
      periodStart: period.periodStart,
      resetAt: period.resetAt,
      units:
        allowanceVoiceMinutes === null
          ? period.units
          : period.units.map((unit) =>
              unit.unit === VOICE_MINUTES_UNIT
                ? { ...unit, consumed: allowanceVoiceMinutes }
                : unit,
            ),
      images,
      responses,
      storage,
      voiceMinuteCredits: voiceMinuteCredits(planTier),
    };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    logger.error({ error, userId: scoped.userId }, 'Failed to fetch usage limits');
    throw createError.internal('Failed to fetch usage limits');
  }
}

export const GET = withCorsRoute(
  withErrorHandler(withRateLimitHandler(handler, 'credits-balance')),
);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
