import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import {
  readManagedTurnSlots,
  withRateLimitHandler,
  type ManagedTurnSlotReading,
} from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb, type UserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { isApiKeyScopeError } from '@/lib/api-key-scope-error';
import { isMfaRequiredError } from '@/lib/mfa-policy-gate';
import { isIpNotAllowedError } from '@/lib/ip-allow-list-gate';
import { resolveEntitledPlanTier } from '@/lib/services/entitlement-resolution';
import { readTierUnitUsage, type TierUnitUsage } from '@/lib/services/tier-unit-quota-service';
import {
  readMonthlyImageUsage,
  type MonthlyImageUsage,
} from '@/lib/services/account-usage-history-service';

export const runtime = 'nodejs';

export interface UsageLimitsResponse {
  planTier: string;
  periodStart: string;
  resetAt: string;
  units: TierUnitUsage[];
  images: MonthlyImageUsage;
  responses: ManagedTurnSlotReading | null;
}

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
    if (isApiKeyScopeError(error) || isMfaRequiredError(error) || isIpNotAllowedError(error)) {
      throw error;
    }
    throw createError.unauthorized('Authentication required');
  }

  try {
    const planTier = await resolveEntitledPlanTier(scoped.db, scoped.userId);
    const [period, images, responses] = await Promise.all([
      readTierUnitUsage(scoped.db, scoped.userId, planTier),
      readMonthlyImageUsage(scoped.db, scoped.userId),
      readRunningResponses(scoped.userId, planTier),
    ]);
    const body: UsageLimitsResponse = {
      planTier,
      periodStart: period.periodStart,
      resetAt: period.resetAt,
      units: period.units,
      images,
      responses,
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
