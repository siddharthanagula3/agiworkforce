import 'server-only';

import { parseManagedUsageSummaryResponse } from '@agiworkforce/types';
import { NextRequest, NextResponse } from 'next/server';
import { getUserScopedDb, type UserScopedDb } from '@/lib/server/rls-db';
import { unauthorizedResponseFor } from '@/lib/api-auth-response';
import { isMfaRequiredError } from '@/lib/mfa-policy-gate';
import { isIpNotAllowedError } from '@/lib/ip-allow-list-gate';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { getManagedUsageSummary } from '@/lib/services/managed-usage-summary-service';

async function handleGetBillingAnalytics(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'billing-analytics');
  if (rateLimitResponse) return rateLimitResponse;

  let scoped: UserScopedDb;
  try {
    scoped = await getUserScopedDb(request);
  } catch (authError) {
    if (isMfaRequiredError(authError) || isIpNotAllowedError(authError)) {
      return unauthorizedResponseFor(authError);
    }
    throw createError.unauthorized('Authentication required');
  }

  try {
    return NextResponse.json(
      parseManagedUsageSummaryResponse(await getManagedUsageSummary(scoped.db, scoped.userId)),
    );
  } catch (error) {
    logger.error({ error, userId: scoped.userId }, 'Failed to fetch billing usage summary');
    throw createError.internal('Failed to fetch billing usage summary');
  }
}

export const GET = withErrorHandler(handleGetBillingAnalytics);

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) || new NextResponse(null, { status: 204 });
}
