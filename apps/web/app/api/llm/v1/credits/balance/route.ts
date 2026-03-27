import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { CreditService } from '@/lib/services/credit-service';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { getCorsHeaders } from '@/lib/cors';
import { logger } from '@/lib/logger';

/**
 * Credits Balance API
 * Endpoint: GET /v1/credits/balance (via api.agiworkforce.com)
 *
 * Returns the user's current credit balance including:
 * - Monthly allocation and remaining
 * - Daily limits and usage
 * - Subscription tier
 */

async function handleGetBalance(request: NextRequest) {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: getCorsHeaders(request),
    });
  }

  // Rate limiting
  const rateLimitResponse = await withRateLimit(request, 'credits-balance');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  // Authentication required
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      {
        error: {
          message: 'Missing or invalid authorization header',
          type: 'invalid_request_error',
          code: 'invalid_api_key',
        },
      },
      { status: 401 },
    );
  }

  const token = authHeader.substring(7);

  // Verify user with Supabase
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');

  const supabase = createClient(supabaseUrl, requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json(
      {
        error: {
          message: 'Invalid authentication token',
          type: 'invalid_request_error',
          code: 'invalid_api_key',
        },
      },
      { status: 401 },
    );
  }

  // Get subscription and credits with error isolation
  // Use Promise.allSettled to prevent one failure from blocking the other
  const [subscriptionResult, balanceResult] = await Promise.allSettled([
    SubscriptionService.getSubscription(user.id),
    CreditService.getBalance(user.id),
  ]);

  // Extract results, providing null for rejected promises
  const subscription = subscriptionResult.status === 'fulfilled' ? subscriptionResult.value : null;
  const balance = balanceResult.status === 'fulfilled' ? balanceResult.value : null;

  // Log any errors that occurred
  if (subscriptionResult.status === 'rejected') {
    logger.error(
      { error: subscriptionResult.reason, userId: user.id },
      'Failed to fetch subscription',
    );
  }
  if (balanceResult.status === 'rejected') {
    logger.error({ error: balanceResult.reason, userId: user.id }, 'Failed to fetch balance');
  }

  if (!subscription) {
    return NextResponse.json(
      {
        error: {
          message: 'No active subscription found',
          type: 'invalid_request_error',
          code: 'subscription_required',
        },
      },
      { status: 403 },
    );
  }

  const now = new Date();

  const billingPeriodEnd =
    balance?.period_end ??
    subscription.current_period_end?.toISOString?.() ??
    subscription.current_period_end ??
    null;
  const nextMonthReset = billingPeriodEnd ? new Date(billingPeriodEnd) : null;
  const secondsUntilMonthlyReset =
    nextMonthReset != null
      ? Math.max(0, Math.floor((nextMonthReset.getTime() - now.getTime()) / 1000))
      : 0;

  return NextResponse.json(
    {
      object: 'credit_balance',
      subscription: {
        plan_tier: subscription.plan_tier,
        status: subscription.status,
        current_period_end: subscription.current_period_end,
      },
      credits: {
        // Monthly credits
        monthly_allocated_cents: balance?.credits_allocated_cents || 0,
        monthly_remaining_cents: balance?.credits_remaining_cents || 0,
        monthly_used_cents:
          (balance?.credits_allocated_cents || 0) - (balance?.credits_remaining_cents || 0),
        monthly_reset_at: nextMonthReset?.toISOString() ?? null,
        seconds_until_monthly_reset: secondsUntilMonthlyReset,

        // Daily limits
        daily_limit_cents: 0,
        daily_used_cents: 0,
        daily_remaining_cents: 0,
        daily_reset_at: null,
        seconds_until_daily_reset: null,
        has_daily_limit: false,
      },
      // Formatted for display
      formatted: {
        monthly_remaining: `$${((balance?.credits_remaining_cents || 0) / 100).toFixed(2)}`,
        monthly_allocated: `$${((balance?.credits_allocated_cents || 0) / 100).toFixed(2)}`,
        daily_remaining: '$0.00',
        daily_limit: '$0.00',
      },
    },
    {
      headers: getCorsHeaders(request),
    },
  );
}

export const GET = withErrorHandler(handleGetBalance);
export function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}
