import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import type { SubscriptionRow } from '@/lib/server/neon-types';
import { SubscriptionService } from '@/lib/services/subscription-service';

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    logger.info('Starting monthly credit reset cron job');

    const db = getNeonDb();
    type SubRow = Pick<
      SubscriptionRow,
      | 'id'
      | 'user_id'
      | 'plan_tier'
      | 'stripe_price_id'
      | 'current_period_start'
      | 'current_period_end'
      | 'status'
    >;
    const subscriptions = await db
      .query<SubRow>(
        'select id, user_id, plan_tier, stripe_price_id, current_period_start, current_period_end, status from subscriptions where status = any($1)',
        [['active', 'trialing']],
      )
      .catch((fetchError: unknown) => {
        logger.error({ error: fetchError }, 'Failed to fetch subscriptions');
        throw fetchError;
      });

    if (!subscriptions || subscriptions.length === 0) {
      logger.info('No active subscriptions found');
      return NextResponse.json({ message: 'No subscriptions to process', count: 0 });
    }

    let resetCount = 0;
    let errorCount = 0;

    for (const subscription of subscriptions) {
      try {
        const periodStart = new Date(subscription.current_period_start);
        const periodEnd = new Date(subscription.current_period_end);

        const accountId = await SubscriptionService.allocateCreditsForPeriod(
          subscription.user_id,
          subscription.id,
          subscription.plan_tier || 'free',
          periodStart,
          periodEnd,
          { stripePriceId: subscription.stripe_price_id },
        );

        if (accountId) {
          resetCount++;
          logger.info(
            {
              userId: subscription.user_id,
              subscriptionId: subscription.id,
              planTier: subscription.plan_tier,
            },
            'Credits ensured for current period',
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
