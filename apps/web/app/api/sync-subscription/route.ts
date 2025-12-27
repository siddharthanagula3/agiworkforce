import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../services/supabase-server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { CreditService } from '@/lib/services/credit-service';
import { SubscriptionService } from '@/lib/services/subscription-service';

/**
 * Manual sync endpoint to fix subscriptions with missing or out-of-date local records.
 * Delegates to SubscriptionService.syncWithStripe which contains the tested sync logic.
 */
async function handleSyncSubscription(request: NextRequest) {
  // Rate limiting
  const rateLimitResponse = await withRateLimit(request, 'sync-subscription');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw createError.unauthorized();
  }

  if (!user.email) {
    throw createError.validation('User has no email address');
  }

  try {
    // Use the shared subscription sync service so behavior matches /diagnose and webhooks.
    const synced = await SubscriptionService.syncWithStripe(user.id, user.email);

    if (!synced) {
      // Either no active subscription exists in Stripe, or syncWithStripe encountered
      // an internal error and logged it.
      //
      // IMPORTANT: This is not a hard server error; the Pricing page treats this as a
      // best-effort self-healing step. We therefore return 200 with success: false
      // so the client can continue gracefully without a noisy 500 in the console.
      logger.warn(
        {
          userId: user.id,
        },
        'syncWithStripe returned null in sync-subscription endpoint',
      );

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SYNC_FAILED',
            message:
              'No active Stripe subscription was found to sync. If you just subscribed, please wait a moment and try again.',
          },
        },
        { status: 200 },
      );
    }

    // Get credit balance (best-effort only)
    let creditBalance = null;
    try {
      creditBalance = await CreditService.getBalance(user.id);
    } catch (creditError) {
      logger.warn(
        {
          error: creditError,
          userId: user.id,
        },
        'Failed to get credit balance during sync',
      );
      // Don't fail the sync if credit balance fetch fails
    }

    logger.info(
      {
        userId: user.id,
        subscriptionId: synced.stripe_subscription_id,
        planTier: synced.plan_tier,
        status: synced.status,
      },
      'Subscription synced successfully via syncWithStripe',
    );

    return NextResponse.json({
      success: true,
      message: 'Subscription synced successfully',
      subscription: synced,
      credits: creditBalance,
    });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        userId: user.id,
      },
      'Error in sync-subscription',
    );
    throw error;
  }
}

export const POST = withErrorHandler(handleSyncSubscription);
