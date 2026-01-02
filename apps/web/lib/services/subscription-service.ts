import 'server-only';

import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
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
// Based on 35% rule from PRICING_STRATEGY.md
const PLAN_CREDITS: Record<string, number> = {
  free: 0,
  hobby: 350, // $3.50/month (was $1)
  pro: 1050, // $10.50/month (was $20)
  max: 10500, // $105.00/month (was $250)
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

  /**
   * Infer plan tier from price ID or metadata
   */
  private static inferPlanTier(
    metadata: Stripe.Metadata | null | undefined,
    priceId: string | null | undefined,
  ): string {
    // First, check metadata (most reliable)
    if (metadata?.plan_tier) {
      return metadata.plan_tier;
    }

    // Second, infer from price ID
    if (priceId) {
      const lowerPriceId = priceId.toLowerCase();
      if (lowerPriceId.includes('hobby')) return 'hobby';
      if (lowerPriceId.includes('max')) return 'max';
      if (lowerPriceId.includes('pro')) return 'pro';
      if (lowerPriceId.includes('enterprise')) return 'enterprise';
    }

    // Default to 'pro' as it's the most common paid tier
    return 'pro';
  }

  /**
   * Sync subscription from Stripe by email (Self-healing)
   * This is a critical function that ensures local subscription data matches Stripe.
   * It handles:
   * - Both 'active' and 'trialing' subscription statuses
   * - Missing or delayed webhook updates
   * - Plan tier inference from multiple sources
   */
  static async syncWithStripe(userId: string, email: string): Promise<SubscriptionInfo | null> {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      logger.warn('STRIPE_SECRET_KEY not set, skipping sync');
      return null;
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: '2025-12-15.clover' as Stripe.LatestApiVersion,
    });

    try {
      logger.info({ userId, email }, 'Attempting self-healing subscription sync');

      // Find customer by email
      const customers = await stripe.customers.list({ email: email, limit: 1 });
      if (customers.data.length === 0) {
        logger.info({ email }, 'No Stripe customer found for email');
        return null;
      }

      const customerId = customers.data[0].id;

      // Query for ALL subscription statuses that should grant access
      // This is critical - we need to catch 'trialing' subscriptions too!
      const validStatuses: Stripe.SubscriptionListParams['status'][] = ['active', 'trialing'];
      let stripeSubscription: Stripe.Subscription | null = null;

      for (const status of validStatuses) {
        const subscriptions = await stripe.subscriptions.list({
          customer: customerId,
          status: status,
          limit: 1,
          expand: ['data.items.data.price'],
        });

        if (subscriptions.data.length > 0) {
          stripeSubscription = subscriptions.data[0];
          break;
        }
      }

      // Also check for recently created subscriptions that might be incomplete
      if (!stripeSubscription) {
        const recentSubs = await stripe.subscriptions.list({
          customer: customerId,
          limit: 5,
          expand: ['data.items.data.price'],
        });

        // Find the most recent valid subscription
        const validStatusSet = new Set(['active', 'trialing', 'past_due']);
        stripeSubscription = recentSubs.data.find((sub) => validStatusSet.has(sub.status)) || null;
      }

      if (!stripeSubscription) {
        logger.info({ customerId }, 'No valid subscriptions found for customer');
        return null;
      }

      const stripePriceId = stripeSubscription.items.data[0]?.price.id;

      if (!stripePriceId) {
        logger.warn(
          { subscriptionId: stripeSubscription.id },
          'No price ID found in subscription, continuing with null',
        );
      }

      // Infer plan tier from metadata or price ID
      const planTier = this.inferPlanTier(stripeSubscription.metadata, stripePriceId);

      logger.info(
        {
          subscriptionId: stripeSubscription.id,
          status: stripeSubscription.status,
          planTier,
          stripePriceId,
        },
        'Found valid subscription in Stripe',
      );

      // Extract period timestamps (Stripe SDK v20 type changes)
      const periodStart = (stripeSubscription as unknown as { current_period_start: number })
        .current_period_start;
      const periodEnd = (stripeSubscription as unknown as { current_period_end: number })
        .current_period_end;

      // Get coupon ID from discounts array (v20 API change: discount -> discounts)
      const discounts = (
        stripeSubscription as unknown as { discounts?: Array<{ coupon?: { id?: string } }> }
      ).discounts;
      const stripeCouponId =
        discounts && discounts.length > 0 ? discounts[0]?.coupon?.id || null : null;

      const supabase = getSupabaseClient();
      const subData = {
        user_id: userId,
        stripe_customer_id: customerId,
        stripe_subscription_id: stripeSubscription.id,
        stripe_price_id: stripePriceId || null,
        status: stripeSubscription.status,
        plan_tier: planTier,
        current_period_start: new Date(periodStart * 1000).toISOString(),
        current_period_end: new Date(periodEnd * 1000).toISOString(),
        cancel_at_period_end: stripeSubscription.cancel_at_period_end,
        canceled_at: stripeSubscription.canceled_at
          ? new Date(stripeSubscription.canceled_at * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
        stripe_coupon_id: stripeCouponId,
      };

      let { data, error } = await supabase
        .from('subscriptions')
        .upsert(subData, { onConflict: 'user_id' })
        .select()
        .single();

      if (error) {
        const isUndefinedColumnError =
          typeof error === 'object' && error !== null && 'code' in error
            ? (error as { code?: string }).code === '42703'
            : false;

        if (isUndefinedColumnError) {
          logger.warn(
            { userId, error },
            'Subscriptions table missing columns; retrying sync with minimal fields',
          );

          const minimalData = {
            user_id: subData.user_id,
            stripe_customer_id: subData.stripe_customer_id,
            stripe_subscription_id: subData.stripe_subscription_id,
            stripe_price_id: subData.stripe_price_id,
            status: subData.status,
            plan_tier: subData.plan_tier,
            current_period_start: subData.current_period_start,
            current_period_end: subData.current_period_end,
            cancel_at_period_end: subData.cancel_at_period_end,
            canceled_at: subData.canceled_at,
            updated_at: subData.updated_at,
            // Exclude stripe_coupon_id
          };

          const fallbackResult = await supabase
            .from('subscriptions')
            .upsert(minimalData, { onConflict: 'user_id' })
            .select()
            .single();

          data = fallbackResult.data;
          error = fallbackResult.error;
        }
      }

      if (error) {
        logger.error({ error, userId }, 'Failed to upsert subscription during sync');
        throw error;
      }

      // Allocate credits if needed
      await this.allocateCreditsForPeriod(
        userId,
        data.id,
        planTier,
        new Date(subData.current_period_start),
        new Date(subData.current_period_end),
      );

      return {
        id: data.id,
        user_id: data.user_id,
        plan_tier: data.plan_tier,
        status: data.status,
        current_period_start: new Date(data.current_period_start),
        current_period_end: new Date(data.current_period_end),
        stripe_subscription_id: data.stripe_subscription_id,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Error executing syncWithStripe');
      return null;
    }
  }
}
