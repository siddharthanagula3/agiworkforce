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
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const nodeEnv = process.env.NODE_ENV;

  // AUDIT-008-010: Explicit NODE_ENV check to block production without secret
  // This prevents accidental deployment of dev-mode bypass to production
  const isProduction = nodeEnv === 'production';
  const isVercelProduction = process.env.VERCEL_ENV === 'production';
  const shouldRequireSecret = isProduction || isVercelProduction;

  // In production (or Vercel production), CRON_SECRET is required
  if (!cronSecret) {
    if (shouldRequireSecret) {
      logger.error(
        { nodeEnv, vercelEnv: process.env.VERCEL_ENV },
        'CRON_SECRET not set in production environment - denying request',
      );
      return false;
    }
    // Only allow in true development (local dev)
    if (nodeEnv === 'development') {
      logger.warn('CRON_SECRET not set in development - allowing request');
      return true;
    }
    // Default deny for any other environment (staging, preview, etc.)
    logger.error(
      { nodeEnv },
      'CRON_SECRET not set in non-development environment - denying request',
    );
    return false;
  }

  return authHeader === `Bearer ${cronSecret}`;
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
      .select('id, user_id, plan_tier, current_period_start, current_period_end, status')
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
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
