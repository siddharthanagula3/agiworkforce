import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import type { SubscriptionRow } from '@/lib/server/neon-types';
import { SubscriptionService } from '@/lib/services/subscription-service';

export const runtime = 'nodejs';
export const maxDuration = 300;

const PAGE_SIZE = 200;
const SWEEP_BUDGET_MS = 240_000;

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

/**
 * Paged, and newest rollover first.
 *
 * The unbounded `select` this replaces had no LIMIT, no ORDER BY and no
 * `maxDuration`, so on renewal night it was killed partway through at whatever
 * physical heap position it had reached, and, with no ordering, the next night
 * died at the same place. The subscriptions past that point never received
 * their period credits and those paying users opened the app to a zero balance.
 *
 * `current_period_start desc` puts the subscriptions that actually rolled over
 * most recently at the front, so a run that runs out of budget defers the ones
 * whose credits an earlier night already allocated
 * (`allocateCreditsForPeriod` is a get-or-create, so re-visiting them is a
 * no-op anyway). The keyset carries `id` as the tiebreak because renewal
 * timestamps collide in bulk.
 */
const PAGE_SQL = `
  select id, user_id, plan_tier, stripe_price_id, current_period_start, current_period_end, status
    from subscriptions
   where status = any($1)
     and ($2::timestamptz is null or (current_period_start, id) < ($2::timestamptz, $3::uuid))
   order by current_period_start desc, id desc
   limit $4
`;

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAtMs = Date.now();

  try {
    logger.info('Starting monthly credit reset cron job');

    const db = getNeonDb();
    let cursorPeriodStart: string | null = null;
    let cursorId: string | null = null;
    let considered = 0;
    let resetCount = 0;
    let errorCount = 0;
    let drained = false;

    while (Date.now() - startedAtMs <= SWEEP_BUDGET_MS) {
      const page: SubRow[] = await db
        .query<SubRow>(PAGE_SQL, [['active', 'trialing'], cursorPeriodStart, cursorId, PAGE_SIZE])
        .catch((fetchError: unknown) => {
          logger.error({ error: fetchError }, 'Failed to fetch subscriptions');
          throw fetchError;
        });

      if (page.length === 0) {
        drained = true;
        break;
      }

      for (const subscription of page) {
        considered++;
        try {
          const accountId = await SubscriptionService.allocateCreditsForPeriod(
            subscription.user_id,
            subscription.id,
            subscription.plan_tier || 'free',
            new Date(subscription.current_period_start),
            new Date(subscription.current_period_end),
            { db, stripePriceId: subscription.stripe_price_id },
          );
          if (accountId) resetCount++;
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

      const last = page[page.length - 1]!;
      cursorPeriodStart = new Date(last.current_period_start).toISOString();
      cursorId = last.id;
      if (page.length < PAGE_SIZE) {
        drained = true;
        break;
      }
    }

    // `drained: false` is the signal that some active subscription was never
    // visited this run. It is the only way to tell a healthy quiet night from a
    // night that ran out of budget with paying accounts still unallocated.
    if (!drained) {
      logger.warn(
        { considered, reset: resetCount, errors: errorCount },
        'Credit reset ran out of budget before draining active subscriptions',
      );
    }

    logger.info(
      { considered, reset: resetCount, errors: errorCount, drained },
      'Credit reset cron job completed',
    );

    return NextResponse.json({
      message: 'Credit reset completed',
      total: considered,
      reset: resetCount,
      errors: errorCount,
      drained,
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Credit reset cron job failed',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
