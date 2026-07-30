import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getClerkAuthUser } from '@/lib/api-auth';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { CreditService } from '@/lib/services/credit-service';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { getCorsHeaders } from '@/lib/cors';
import { logger } from '@/lib/logger';
import { toPublicUsagePercentage } from '@/lib/server/managed-usage-policy';
import type { ManagedUsageBalanceResponse } from '@agiworkforce/types';
import { getFreeTrialPublicUsage } from '@/lib/services/free-trial-service';

/**
 * Credits Balance API
 * Endpoint: GET /v1/credits/balance (via api.agiworkforce.com)
 *
 * Returns percentage-only managed-usage status. Private allocations, ledger
 * units, and conversion math must never cross this API boundary.
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

  const { userId } = await getClerkAuthUser(request, { apiKeyScope: 'usage:read' });

  const [subscriptionResult, balanceResult] = await Promise.allSettled([
    SubscriptionService.getSubscription(userId),
    CreditService.getBalance(userId),
  ]);

  // Extract results, providing null for rejected promises
  const subscription = subscriptionResult.status === 'fulfilled' ? subscriptionResult.value : null;
  const balance = balanceResult.status === 'fulfilled' ? balanceResult.value : null;

  // Log any errors that occurred
  if (subscriptionResult.status === 'rejected') {
    logger.error(
      { error: subscriptionResult.reason, userId: userId },
      'Failed to fetch subscription',
    );
  }
  if (balanceResult.status === 'rejected') {
    logger.error({ error: balanceResult.reason, userId: userId }, 'Failed to fetch balance');
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

  const allocated = balance?.credits_allocated_cents ?? 0;
  const used = balance?.credits_used_cents ?? 0;
  const remaining = balance?.credits_remaining_cents ?? 0;
  const isFreePlan = subscription.plan_tier.toLowerCase() === 'free';
  const freeUsage = isFreePlan ? await getFreeTrialPublicUsage(userId) : null;
  const resetAt = freeUsage?.resetAt ?? nextMonthReset?.toISOString() ?? null;
  const resetDate = resetAt ? new Date(resetAt) : null;
  const secondsUntilReset =
    resetDate && !Number.isNaN(resetDate.getTime())
      ? Math.max(0, Math.floor((resetDate.getTime() - now.getTime()) / 1000))
      : 0;

  const responseBody: ManagedUsageBalanceResponse = {
    object: 'credit_balance',
    subscription: {
      plan_tier: subscription.plan_tier,
      status: subscription.status,
      current_period_end:
        subscription.current_period_end instanceof Date
          ? subscription.current_period_end.toISOString()
          : (subscription.current_period_end ?? null),
    },
    credits: {
      usage_percentage: freeUsage?.usagePercentage ?? toPublicUsagePercentage(used, allocated),
      reset_at: resetAt,
      seconds_until_reset: freeUsage ? secondsUntilReset : secondsUntilMonthlyReset,
      has_usage_remaining: freeUsage?.hasUsageRemaining ?? (allocated > 0 && remaining > 0),
    },
  };

  return NextResponse.json(responseBody, {
    headers: getCorsHeaders(request),
  });
}

export const GET = withErrorHandler(handleGetBalance);
export function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}
