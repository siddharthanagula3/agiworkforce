import 'server-only';

import { parseManagedUsageSummaryResponse } from '@agiworkforce/types';
import { NextRequest, NextResponse } from 'next/server';
import { getClerkAuthUser } from '@/lib/api-auth';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { getManagedUsageSummary } from '@/lib/services/managed-usage-summary-service';

/**
 * Legacy alias for the percentage-only managed-usage summary.
 * Stripe invoices remain the exact, user-owned monetary history.
 */
async function handleGetBillingAnalytics(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'billing-analytics');
  if (rateLimitResponse) return rateLimitResponse;

  let userId: string;
  try {
    userId = (await getClerkAuthUser(request)).userId;
  } catch {
    throw createError.unauthorized('Authentication required');
  }

  try {
    return NextResponse.json(
      parseManagedUsageSummaryResponse(await getManagedUsageSummary(userId)),
    );
  } catch (error) {
    logger.error({ error, userId }, 'Failed to fetch billing usage summary');
    throw createError.internal('Failed to fetch billing usage summary');
  }
}

export const GET = withErrorHandler(handleGetBillingAnalytics);

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) || new NextResponse(null, { status: 204 });
}
