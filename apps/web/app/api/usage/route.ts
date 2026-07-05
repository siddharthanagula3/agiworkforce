import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  getPlanSessionUsageBudgetCents,
  getPlanWeeklyUsageBudgetCents,
  getPlanFlagshipWeeklyUsageBudgetCents,
} from '@agiworkforce/types';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimitHandler } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { CreditService } from '@/lib/services/credit-service';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { getRollingUsage } from '@/lib/server/rolling-usage';
import { handleCorsPreflightRequest } from '@/lib/cors';

const SESSION_WINDOW_HOURS = 5;
const WEEKLY_WINDOW_HOURS = 7 * 24;

/**
 * GET /api/usage
 * Returns the user's current credit balance and subscription info.
 * Used by TokenBalanceDisplay and UsageWarningBanner.
 */
async function handler(request: NextRequest) {
  let userId: string;
  try {
    const authResult = await getClerkAuthUser(request);
    userId = authResult.userId;
  } catch {
    throw createError.unauthorized('Authentication required');
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

    // Session (rolling 5h) / weekly / flagship-weekly caps layer on top of
    // the monthly credit budget above (founder decision, 2026-07-05) — see
    // getPlanWeeklyUsageBudgetCents in billing-catalog.ts. Zero cap (e.g.
    // free tier, which has no monthlyUsageBudgetUsd to derive from) means
    // "not applicable"; the mobile client hides that section entirely.
    const sessionCapCents = getPlanSessionUsageBudgetCents(planTier);
    const weeklyCapCents = getPlanWeeklyUsageBudgetCents(planTier);
    const flagshipWeeklyCapCents = getPlanFlagshipWeeklyUsageBudgetCents(planTier);

    const [session, weekly, flagshipWeekly] =
      sessionCapCents > 0 || weeklyCapCents > 0
        ? await Promise.all([
            getRollingUsage(userId, SESSION_WINDOW_HOURS, false),
            getRollingUsage(userId, WEEKLY_WINDOW_HOURS, false),
            getRollingUsage(userId, WEEKLY_WINDOW_HOURS, true),
          ])
        : [
            { usedCents: 0, oldestAt: null },
            { usedCents: 0, oldestAt: null },
            { usedCents: 0, oldestAt: null },
          ];

    const resetAt = (oldestAt: string | null, windowHours: number): string | null =>
      oldestAt ? new Date(Date.parse(oldestAt) + windowHours * 60 * 60 * 1000).toISOString() : null;

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
      session_used_cents: session.usedCents,
      session_cap_cents: sessionCapCents,
      session_reset_at: resetAt(session.oldestAt, SESSION_WINDOW_HOURS),
      weekly_used_cents: weekly.usedCents,
      weekly_cap_cents: weeklyCapCents,
      weekly_reset_at: resetAt(weekly.oldestAt, WEEKLY_WINDOW_HOURS),
      flagship_weekly_used_cents: flagshipWeekly.usedCents,
      flagship_weekly_cap_cents: flagshipWeeklyCapCents,
      flagship_weekly_reset_at: resetAt(flagshipWeekly.oldestAt, WEEKLY_WINDOW_HOURS),
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
