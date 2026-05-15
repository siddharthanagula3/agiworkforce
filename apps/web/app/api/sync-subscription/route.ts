import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/services/supabase-server';
import { getServiceClient } from '@/lib/supabase-server';
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
    let userId: string | null = null;
    let email: string | null = null;

    // Support Bearer tokens (desktop/mobile) and cookie sessions (web)
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const { data, error } = await getServiceClient().auth.getUser(token);
      if (error || !data.user) {
        logger.warn({ error }, 'sync-subscription: bearer token auth failed');
        throw createError.unauthorized('Invalid authentication token');
      }

      userId = data.user.id;
      email = data.user.email ?? null;
    } else {
      const supabase = await createSupabaseServerClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw createError.unauthorized('Please sign in to continue');
      }

      userId = user.id;
      email = user.email ?? null;
    }

    if (!userId || !email) {
      throw createError.unauthorized('Unable to resolve user identity');
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
