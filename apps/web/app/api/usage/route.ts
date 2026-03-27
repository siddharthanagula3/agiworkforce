import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimitHandler } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { CreditService } from '@/lib/services/credit-service';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { handleCorsPreflightRequest } from '@/lib/cors';

/**
 * GET /api/usage
 * Returns the user's current credit balance and subscription info.
 * Used by TokenBalanceDisplay and UsageWarningBanner.
 */
async function handler(request: NextRequest) {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  // Authenticate user
  const authHeader = request.headers.get('authorization');

  let userId: string;

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (error || !user) {
      throw createError.unauthorized('Invalid or expired token');
    }
    userId = user.id;
  } else {
    // Try cookie-based auth for browser requests
    const { createServerClient } = await import('@supabase/ssr');
    const ssrClient = createServerClient(supabaseUrl, requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {
          // Read-only for this route
        },
      },
    });
    const {
      data: { user },
      error,
    } = await ssrClient.auth.getUser();
    if (error || !user) {
      throw createError.unauthorized('Authentication required');
    }
    userId = user.id;
  }

  try {
    // Fetch credit balance and subscription in parallel
    const [balance, subscription] = await Promise.all([
      CreditService.getBalance(userId),
      SubscriptionService.getSubscription(userId),
    ]);

    const planTier = subscription?.plan_tier || 'free';
    const creditsAllocated = balance?.credits_allocated_cents ?? 0;
    const creditsUsed = balance?.credits_used_cents ?? 0;
    const creditsRemaining = balance?.credits_remaining_cents ?? 0;
    const periodStart = balance?.period_start ?? subscription?.current_period_start ?? null;
    const periodEnd = balance?.period_end ?? subscription?.current_period_end ?? null;

    const usagePercentage = creditsAllocated > 0 ? (creditsUsed / creditsAllocated) * 100 : 0;

    return NextResponse.json({
      plan_tier: planTier,
      credits_allocated_cents: creditsAllocated,
      credits_used_cents: creditsUsed,
      credits_remaining_cents: creditsRemaining,
      usage_percentage: Math.round(usagePercentage * 100) / 100,
      period_start: periodStart,
      period_end: periodEnd,
      daily_used_cents: 0,
      daily_limit_cents: 0,
      daily_remaining_cents: 0,
      has_daily_limit: false,
      subscription_status: subscription?.status ?? 'none',
    });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to fetch usage data');
    throw createError.internal('Failed to fetch usage data');
  }
}

export const GET = withErrorHandler(withRateLimitHandler(handler, 'credits-balance'));

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
