import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireEnv } from '@/utils/env';
import { logger } from '@/lib/logger';
import { SubscriptionService } from '@/lib/services/subscription-service';

function getSupabaseClient() {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });
}

// Verify cron secret to prevent unauthorized access
//
// WEB-NEW-010 fix (2026-05-04 audit): the prior implementation auto-allowed
// when `NODE_ENV === 'development'` and `CRON_SECRET` was absent. That is
// safe on a developer's laptop, but a misconfigured staging container
// (NODE_ENV=development is a common copy-paste from dev profiles) silently
// became an unauthenticated endpoint that resets credits for ALL active
// subscriptions. We now require an explicit `CRON_DEV_BYPASS=1` co-flag
// for the dev-mode shortcut so it cannot be triggered by a single
// environment variable getting copied into the wrong place.
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env['CRON_SECRET'];
  const nodeEnv = process.env['NODE_ENV'];
  const devBypass = process.env['CRON_DEV_BYPASS'] === '1';

  // CRON_SECRET is the only blessed way to authorize a cron call. Always
  // accept it when present and matching, regardless of environment.
  if (cronSecret) {
    return authHeader === `Bearer ${cronSecret}`;
  }

  // No secret configured. Only allow when BOTH:
  //   (a) NODE_ENV=development AND
  //   (b) CRON_DEV_BYPASS=1 explicitly set in .env.local
  // Any other environment denies; staging/preview/production will fail loud.
  if (nodeEnv === 'development' && devBypass) {
    logger.warn({ nodeEnv }, 'CRON_SECRET unset; CRON_DEV_BYPASS=1 enabled — allowing dev request');
    return true;
  }

  logger.error(
    { nodeEnv, vercelEnv: process.env['VERCEL_ENV'], devBypass },
    'CRON_SECRET not set and CRON_DEV_BYPASS not enabled — denying request',
  );
  return false;
}

export async function GET(request: NextRequest) {
  // Verify cron secret
  if (!verifyCronSecret(request)) {
    logger.warn('Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    logger.info('Starting monthly credit reset cron job');

    // Get all active subscriptions
    const supabase = getSupabaseClient();
    const { data: subscriptions, error: fetchError } = await supabase
      .from('subscriptions')
      .select(
        'id, user_id, plan_tier, stripe_price_id, current_period_start, current_period_end, status',
      )
      .in('status', ['active', 'trialing']);

    if (fetchError) {
      logger.error({ error: fetchError }, 'Failed to fetch subscriptions');
      throw fetchError;
    }

    if (!subscriptions || subscriptions.length === 0) {
      logger.info('No active subscriptions found');
      return NextResponse.json({ message: 'No subscriptions to process', count: 0 });
    }

    const now = new Date();
    let resetCount = 0;
    let errorCount = 0;

    for (const subscription of subscriptions) {
      try {
        const periodStart = new Date(subscription.current_period_start);
        const periodEnd = new Date(subscription.current_period_end);

        // Check if we're at the start of a new billing period (within 1 hour of period start)
        const timeSincePeriodStart = now.getTime() - periodStart.getTime();
        const oneHour = 60 * 60 * 1000;

        // Only reset if we're within 1 hour of period start and haven't reset yet today
        if (timeSincePeriodStart >= 0 && timeSincePeriodStart < oneHour) {
          await SubscriptionService.resetCreditsForNewPeriod(
            subscription.user_id,
            subscription.id,
            subscription.plan_tier || 'free',
            periodStart,
            periodEnd,
            { stripePriceId: subscription.stripe_price_id },
          );

          resetCount++;
          logger.info(
            {
              userId: subscription.user_id,
              subscriptionId: subscription.id,
              planTier: subscription.plan_tier,
            },
            'Credits reset for subscription',
          );
        }
      } catch (error) {
        errorCount++;
        logger.error(
          {
            error: error instanceof Error ? error.message : String(error),
            subscriptionId: subscription.id,
            userId: subscription.user_id,
          },
          'Failed to reset credits for subscription',
        );
      }
    }

    logger.info(
      {
        total: subscriptions.length,
        reset: resetCount,
        errors: errorCount,
      },
      'Credit reset cron job completed',
    );

    return NextResponse.json({
      message: 'Credit reset completed',
      total: subscriptions.length,
      reset: resetCount,
      errors: errorCount,
    });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Credit reset cron job failed',
    );
    return NextResponse.json(
      {
        error: 'Internal server error',
      },
      { status: 500 },
    );
  }
}
