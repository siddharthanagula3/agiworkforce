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
    const body: AccountUsageLimitsResponse = {
      planTier,
      periodStart: period.periodStart,
      resetAt: period.resetAt,
      units: period.units,
      images,
      responses,
      storage,
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
