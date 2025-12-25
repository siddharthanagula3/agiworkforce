import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { requireEnv } from '@/utils/env';
import { logger } from '@/lib/logger';
import { CreditService } from './credit-service';

function getSupabaseClient() {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });
}

// Credit allocation in cents per month (dollar amount * 100)
const PLAN_CREDITS: Record<string, number> = {
  free: 0,
  hobby: 100, // $1/month = 100 cents
  pro: 2000, // $20/month = 2000 cents
  max: 25000, // $250/month = 25000 cents
  enterprise: 0, // Custom - handled separately
};

export interface SubscriptionInfo {
  id: string;
  user_id: string;
  plan_tier: string;
  status: string;
  current_period_start: Date;
  current_period_end: Date;
  stripe_subscription_id: string | null;
}

export class SubscriptionService {
  /**
   * Get subscription for a user
   */
  static async getSubscription(userId: string): Promise<SubscriptionInfo | null> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No subscription found
          return null;
        }
        logger.error({ error, userId }, 'Failed to get subscription');
        throw error;
      }

      if (!data) {
        return null;
      }

      return {
        id: data.id,
        user_id: data.user_id,
        plan_tier: data.plan_tier || 'free',
        status: data.status || 'none',
        current_period_start: new Date(data.current_period_start),
        current_period_end: new Date(data.current_period_end),
        stripe_subscription_id: data.stripe_subscription_id,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Error in getSubscription');
      throw error;
    }
  }

  /**
   * Allocate credits for a subscription period
   */
  static async allocateCreditsForPeriod(
    userId: string,
    subscriptionId: string,
    planTier: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<string> {
    const creditsCents = PLAN_CREDITS[planTier.toLowerCase()] || 0;

    if (creditsCents === 0) {
      logger.info({ userId, planTier }, 'No credits allocated for plan tier');
      return '';
    }

    try {
      const accountId = await CreditService.getOrCreateAccount(
        userId,
        subscriptionId,
        periodStart,
        periodEnd,
        creditsCents,
      );

      logger.info(
        {
          userId,
          subscriptionId,
          planTier,
          creditsCents,
          accountId,
        },
        'Credits allocated for period',
      );

      return accountId;
    } catch (error) {
      logger.error({ error, userId, subscriptionId, planTier }, 'Failed to allocate credits');
      throw error;
    }
  }

  /**
   * Reset credits for a new billing period
   */
  static async resetCreditsForNewPeriod(
    userId: string,
    subscriptionId: string,
    planTier: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<string> {
    const creditsCents = PLAN_CREDITS[planTier.toLowerCase()] || 0;

    if (creditsCents === 0) {
      logger.info({ userId, planTier }, 'No credits to reset for plan tier');
      return '';
    }

    try {
      const accountId = await CreditService.resetForPeriod(
        userId,
        subscriptionId,
        periodStart,
        periodEnd,
        creditsCents,
      );

      logger.info(
        {
          userId,
          subscriptionId,
          planTier,
          creditsCents,
          accountId,
        },
        'Credits reset for new period',
      );

      return accountId;
    } catch (error) {
      logger.error({ error, userId, subscriptionId, planTier }, 'Failed to reset credits');
      throw error;
    }
  }

  /**
   * Get credit allocation for a plan tier
   */
  static getCreditAllocation(planTier: string): number {
    return PLAN_CREDITS[planTier.toLowerCase()] || 0;
  }
}
