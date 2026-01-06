import 'server-only';

import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { requireEnv } from '@/utils/env';
import { logger } from '@/lib/logger';
import { CreditService } from './credit-service';
import { resolvePlanTier, isValidPlanTier } from '@/lib/price-tier-mapping';

function getSupabaseClient() {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });
}

// Credit allocation in cents per month (dollar amount * 100)
// Based on desktop pricing.ts tokenCredits values
const PLAN_CREDITS: Record<string, number> = {
  free: 0,
  hobby: 350, // $3.50/month
  pro: 1200, // $12.00/month (matches desktop pricing.ts tokenCredits: 12)
  max: 15000, // $150.00/month (matches desktop pricing.ts tokenCredits: 150)
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
   * Infer plan tier from price ID or metadata using strict mapping
   * IMPORTANT: Uses environment-based price mapping, NOT substring matching
   */
  private static inferPlanTier(
    metadata: Stripe.Metadata | null | undefined,
    priceId: string | null | undefined,
  ): string {
    // Use the centralized price-tier-mapping module
    const tier = resolvePlanTier(metadata, priceId);

    if (tier && isValidPlanTier(tier)) {
      return tier;
    }

    // Log warning for unmapped price IDs (helps debug configuration issues)
    if (priceId && !tier) {
      logger.warn(
        { priceId },
        'Price ID not found in tier mapping. Check STRIPE_PRICE_* environment variables.',
      );
    }

    // IMPORTANT: Return null-like value to force caller to handle missing tier
    // This is safer than silently defaulting to 'pro'
    return 'free';
  }

  /**
   * Ensure a profile exists for the user (required for subscriptions FK constraint)
   */
  private static async ensureProfileExists(userId: string, email: string): Promise<void> {
    const supabase = getSupabaseClient();

    // Check if profile exists
    const { data: existingProfile, error: fetchError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (fetchError) {
      logger.error({ error: fetchError, userId }, 'Error checking for existing profile');
      throw fetchError;
    }

    if (!existingProfile) {
      // Profile doesn't exist - create it
      logger.info({ userId, email }, 'Creating missing profile for user');
      const { error: insertError } = await supabase
        .from('profiles')
        .insert({ id: userId, email: email } as Record<string, unknown>);

      if (insertError) {
        // Ignore duplicate key errors (profile might have been created concurrently)
        if (insertError.code !== '23505') {
          logger.error({ error: insertError, userId }, 'Failed to create profile');
          throw insertError;
        }
        logger.info({ userId }, 'Profile already exists (concurrent creation)');
      } else {
        logger.info({ userId, email }, 'Profile created successfully');
      }
    }
  }

  /**
   * Sync subscription from Stripe using customer ID (BEST PRACTICE)
   * This is a critical function that ensures local subscription data matches Stripe.
   * It handles:
   * - Both 'active' and 'trialing' subscription statuses
   * - Missing or delayed webhook updates
   * - Plan tier inference from multiple sources
   * - Creating missing profile records (required for FK constraint)
   *
   * IMPORTANT: Uses customer_id lookup instead of email (Stripe best practice)
   * Falls back to email only for legacy data
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

      // BEST PRACTICE: First, try to get customer_id from profiles table
      const supabase = getSupabaseClient();
      const { data: profile } = await supabase
        .from('profiles')
        .select('stripe_customer_id')
        .eq('id', userId)
        .maybeSingle();

      let customerId: string | null = profile?.stripe_customer_id || null;

      if (customerId) {
        logger.info({ customerId, userId }, 'Found stripe_customer_id in profiles (BEST PRACTICE)');
      } else {
        // FALLBACK: Find customer by email (for legacy data only)
        logger.warn(
          { email },
          'FALLBACK: No stripe_customer_id found, searching by email (should be avoided)',
        );
        const customers = await stripe.customers.list({ email: email, limit: 1 });
        if (customers.data.length === 0) {
          logger.info({ email }, 'No Stripe customer found for email');
          return null;
        }

        customerId = customers.data[0].id;

        // Store customer_id for future lookups
        await supabase.from('profiles').update({ stripe_customer_id: customerId }).eq('id', userId);

        logger.info(
          { customerId, email },
          'Found Stripe customer by email and stored customer_id for future',
        );
      }
      logger.info({ customerId, email }, 'Found Stripe customer');

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

      // Ensure profile exists before creating subscription (FK constraint)
      await this.ensureProfileExists(userId, email);

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

      logger.info({ subData }, 'Upserting subscription data');

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
