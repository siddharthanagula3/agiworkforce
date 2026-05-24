import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getClerkAuthUser } from '@/lib/api-auth';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';

async function handleSyncSubscription(request: NextRequest): Promise<Response> {
  // CSRF protection for state-changing POST endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'sync-subscription');
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { userId, email } = await getClerkAuthUser(request);

    if (!email) {
      throw createError.unauthorized('Unable to resolve user email');
    }

    const subscription = await SubscriptionService.syncWithStripe(userId, email);

    return NextResponse.json(
      {
        success: !!subscription,
        subscription,
      },
      { status: 200 },
    );
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Error in /api/sync-subscription',
    );
    throw error;
  }
}

export const POST = withErrorHandler(handleSyncSubscription);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
