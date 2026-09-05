import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { getNeonDb } from '@/lib/server/neon-db';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import Stripe from 'stripe';
import { logger } from '@/lib/logger';
import { CreditService } from './credit-service';
import type { SubscriptionRow, ProfileRow } from '@/lib/server/neon-types';
import { resolvePlanTier, isValidPlanTier } from '@/lib/price-tier-mapping';
import { resolveEnterprisePlanTier } from '@/lib/services/enterprise-billing-service';
import { getSubscriptionPeriod, getSubscriptionCouponId } from '@/lib/stripe-types';
import { getStripeClientOrNull } from '@/lib/server/stripe-client';
import { getPlanUsageBudgetCents, isPlanUsageUncapped } from '@/lib/server/managed-usage-policy';
import { resolveManagedUsagePeriod } from '@/lib/server/managed-usage-period';
import { resolveEffectiveSubscriptionBillingStatus } from '@/lib/server/subscription-billing-owner';

export interface SubscriptionInfo {
  id: string;
  user_id: string;
  plan_tier: string;
  status: string;
  current_period_start: Date;
  current_period_end: Date;
  cancel_at_period_end?: boolean;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  apple_original_transaction_id?: string | null;
  google_purchase_token?: string | null;
}

interface CreditAllocationOptions {
  db: DatabaseAdapter;
  stripePriceId?: string | null;
}

export class SubscriptionService {
  static async getSubscription(
    db: DatabaseAdapter,
    userId: string,
  ): Promise<SubscriptionInfo | null> {
    try {
      const rows = await db.query<SubscriptionRow>(
        `SELECT id, user_id, plan_tier, status, current_period_start, current_period_end,
                cancel_at_period_end,
                stripe_subscription_id, stripe_price_id,
                apple_original_transaction_id, google_purchase_token
         FROM subscriptions
         WHERE user_id = $1
         LIMIT 1`,
        [userId],
      );

      if (rows.length === 0) {
        return null;
      }

      const data = rows[0]!;

      return {
        id: data.id,
        user_id: data.user_id,
        plan_tier: data.plan_tier || 'free',
        status: resolveEffectiveSubscriptionBillingStatus(data),
        current_period_start: new Date(data.current_period_start),
        current_period_end: new Date(data.current_period_end),
        cancel_at_period_end: data.cancel_at_period_end ?? false,
        stripe_subscription_id: data.stripe_subscription_id,
        stripe_price_id: data.stripe_price_id,
        apple_original_transaction_id: data.apple_original_transaction_id,
        google_purchase_token: data.google_purchase_token,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Error in getSubscription');
      throw error;
    }
  }

  static async allocateCreditsForPeriod(
    userId: string,
    subscriptionId: string,
    planTier: string,
    periodStart: Date,
    periodEnd: Date,
    options: CreditAllocationOptions,
  ): Promise<string> {
    const creditsCents = getPlanUsageBudgetCents(planTier, 'monthly');

    if (creditsCents === 0) {
      logger.info(
        { userId, planTier, uncapped: isPlanUsageUncapped(planTier) },
        'No paid-ledger credits allocated for plan tier',
      );
      return '';
    }

    const usagePeriod = resolveManagedUsagePeriod({
      subscriptionPeriodStart: periodStart,
      subscriptionPeriodEnd: periodEnd,
    });

    try {
      const accountId = await CreditService.getOrCreateAccount(
        userId,
        subscriptionId,
        usagePeriod.periodStart,
        usagePeriod.periodEnd,
        creditsCents,
        options.db,
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

  static async resetCreditsForNewPeriod(
    userId: string,
    subscriptionId: string,
    planTier: string,
    periodStart: Date,
    periodEnd: Date,
    options: CreditAllocationOptions,
  ): Promise<string> {
    const creditsCents = getPlanUsageBudgetCents(planTier, 'monthly');

    if (creditsCents === 0) {
      logger.info({ userId, planTier }, 'No credits to reset for plan tier');
      return '';
    }

    const usagePeriod = resolveManagedUsagePeriod({
      subscriptionPeriodStart: periodStart,
      subscriptionPeriodEnd: periodEnd,
    });

    try {
      const accountId = await CreditService.resetForPeriod(
        userId,
        subscriptionId,
        usagePeriod.periodStart,
        usagePeriod.periodEnd,
        creditsCents,
        options.db,
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

  static async carryCreditsForUpgradePeriod(
    userId: string,
    subscriptionId: string,
    previousPlanTier: string,
    nextPlanTier: string,
    periodStart: Date,
    periodEnd: Date,
    db: DatabaseAdapter,
  ): Promise<string> {
    const previousBudgetCents = getPlanUsageBudgetCents(previousPlanTier, 'monthly');
    const nextBudgetCents = getPlanUsageBudgetCents(nextPlanTier, 'monthly');
    if (previousBudgetCents <= 0 || nextBudgetCents < previousBudgetCents) {
      throw new Error('Usage carry-forward requires a paid plan upgrade');
    }

    const usagePeriod = resolveManagedUsagePeriod({
      subscriptionPeriodStart: periodStart,
      subscriptionPeriodEnd: periodEnd,
    });

    return CreditService.carryUsageIntoUpgradedPeriod(
      userId,
      subscriptionId,
      usagePeriod.periodStart,
      usagePeriod.periodEnd,
      nextBudgetCents - previousBudgetCents,
      db,
    );
  }

  static getCreditAllocation(planTier: string): number {
    return getPlanUsageBudgetCents(planTier, 'monthly');
  }

  private static async readStoredPlanTier(
    db: DatabaseAdapter,
    userId: string,
  ): Promise<string | null> {
    try {
      const [row] = await db.query<Pick<SubscriptionRow, 'plan_tier'>>(
        'SELECT plan_tier FROM subscriptions WHERE user_id = $1 LIMIT 1',
        [userId],
      );
      return row?.plan_tier ?? null;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to read stored plan tier during self-heal sync');
      return null;
    }
  }

  private static async resolveSyncPlanTier(
    stripe: Stripe,
    db: DatabaseAdapter,
    userId: string,
    metadata: Stripe.Metadata | null | undefined,
    price: Stripe.Price | null | undefined,
  ): Promise<string> {
    const priceId = price?.id ?? null;

    const enterpriseTier = price ? await resolveEnterprisePlanTier(stripe, price) : null;
    if (enterpriseTier) {
      return enterpriseTier;
    }

    const tier = resolvePlanTier(metadata, priceId);
    if (tier && isValidPlanTier(tier)) {
      return tier;
    }

    if (!priceId) {
      return 'free';
    }

    const storedTier = await this.readStoredPlanTier(db, userId);
    if (storedTier && storedTier !== 'free' && isValidPlanTier(storedTier)) {
      logger.error(
        { priceId, userId, storedTier },
        'Stripe price not found in tier mapping during self-heal sync; keeping the stored paid tier instead of downgrading to free',
      );
      return storedTier;
    }

    logger.warn(
      { priceId },
      'Price ID not found in tier mapping; defaulting to free tier. Check STRIPE_PRICE_* environment variables and PRICE_ID_OVERRIDES.',
    );
    return 'free';
  }

  private static async ensureProfileExists(userId: string, email: string): Promise<void> {
    const scopedDb = createClaimedUserScopedDb(getNeonDb(), { userId, organizationId: null });

    const existing = await scopedDb.query<Pick<ProfileRow, 'id'>>(
      'SELECT id FROM profiles WHERE id = $1 LIMIT 1',
      [userId],
    );

    if (existing.length === 0) {
      logger.info({ userId, email }, 'Creating missing profile for user');
      try {
        await scopedDb.execute('INSERT INTO profiles (id, email) VALUES ($1, $2)', [userId, email]);
        logger.info({ userId, email }, 'Profile created successfully');
      } catch (insertError) {
        if ((insertError as { code?: string }).code !== '23505') {
          logger.error({ error: insertError, userId }, 'Failed to create profile');
          throw insertError;
        }
        logger.info({ userId }, 'Profile already exists (concurrent creation)');
      }
    }
  }

  static async syncWithStripe(userId: string, email: string): Promise<SubscriptionInfo | null> {
    const stripe = getStripeClientOrNull();
    if (!stripe) {
      logger.warn('STRIPE_SECRET_KEY not set, skipping sync');
      return null;
    }

    try {
      logger.info({ userId, email }, 'Attempting self-healing subscription sync');

      const db = createClaimedUserScopedDb(getNeonDb(), { userId, organizationId: null });

      const profileRows = await db.query<Pick<ProfileRow, 'stripe_customer_id'>>(
        'SELECT stripe_customer_id FROM profiles WHERE id = $1 LIMIT 1',
        [userId],
      );

      let customerId: string | null = profileRows[0]?.stripe_customer_id ?? null;

      if (customerId) {
        logger.info({ customerId, userId }, 'Found stripe_customer_id in profiles (BEST PRACTICE)');
      } else {
        logger.warn(
          { email },
          'FALLBACK: No stripe_customer_id found, searching by email (should be avoided)',
        );
        const customers = await stripe.customers.list({ email: email, limit: 1 });
        if (customers.data.length === 0) {
          logger.info({ email }, 'No Stripe customer found for email');
          return null;
        }

        const customer = customers.data[0]!;

        const recordedUserId = customer.metadata?.['user_id'];
        if (!recordedUserId || recordedUserId !== userId) {
          logger.warn(
            {
              email,
              customerId: customer.id,
              expectedUserId: userId,
              actualUserId: recordedUserId ?? '<missing>',
            },
            'IDOR blocked: Stripe customer email matched but ownership cannot be verified',
          );
          return null;
        }

        customerId = customer.id;

        await db.execute('UPDATE profiles SET stripe_customer_id = $1 WHERE id = $2', [
          customerId,
          userId,
        ]);

        logger.info(
          { customerId, email },
          'Found Stripe customer by email and stored customer_id for future',
        );
      }
      logger.info({ customerId, email }, 'Found Stripe customer');

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
          stripeSubscription = subscriptions.data[0] ?? null;
          break;
        }
      }

      if (!stripeSubscription) {
        const recentSubs = await stripe.subscriptions.list({
          customer: customerId,
          limit: 5,
          expand: ['data.items.data.price'],
        });

        const validStatusSet = new Set(['active', 'trialing']);
        stripeSubscription = recentSubs.data.find((sub) => validStatusSet.has(sub.status)) ?? null;
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

      const planTier = await this.resolveSyncPlanTier(
        stripe,
        db,
        userId,
        stripeSubscription.metadata,
        stripeSubscription.items.data[0]?.price ?? null,
      );

      logger.info(
        {
          subscriptionId: stripeSubscription.id,
          status: stripeSubscription.status,
          planTier,
          stripePriceId,
        },
        'Found valid subscription in Stripe',
      );

      const period = getSubscriptionPeriod(stripeSubscription);
      if (!period) {
        logger.error(
          { subscriptionId: stripeSubscription.id },
          'Could not extract period from Stripe subscription',
        );
        return null;
      }
      const periodStart = period.start;
      const periodEnd = period.end;

      const stripeCouponId = getSubscriptionCouponId(stripeSubscription);

      await this.ensureProfileExists(userId, email);

      const currentPeriodStart = new Date(periodStart * 1000).toISOString();
      const currentPeriodEnd = new Date(periodEnd * 1000).toISOString();
      const canceledAt = stripeSubscription.canceled_at
        ? new Date(stripeSubscription.canceled_at * 1000).toISOString()
        : null;
      const updatedAt = new Date().toISOString();

      logger.info(
        {
          userId,
          subscriptionId: stripeSubscription.id,
          planTier,
          status: stripeSubscription.status,
        },
        'Upserting subscription data',
      );

      let rows: SubscriptionRow[];
      try {
        rows = await db.query<SubscriptionRow>(
          `INSERT INTO subscriptions
             (user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
              status, plan_tier, current_period_start, current_period_end,
              cancel_at_period_end, canceled_at, updated_at, stripe_coupon_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (user_id) DO UPDATE SET
             stripe_customer_id      = EXCLUDED.stripe_customer_id,
             stripe_subscription_id  = EXCLUDED.stripe_subscription_id,
             stripe_price_id         = EXCLUDED.stripe_price_id,
             status                  = EXCLUDED.status,
             plan_tier               = EXCLUDED.plan_tier,
             current_period_start    = EXCLUDED.current_period_start,
             current_period_end      = EXCLUDED.current_period_end,
             cancel_at_period_end    = EXCLUDED.cancel_at_period_end,
             canceled_at             = EXCLUDED.canceled_at,
             updated_at              = EXCLUDED.updated_at,
             stripe_coupon_id        = EXCLUDED.stripe_coupon_id
           RETURNING *`,
          [
            userId,
            customerId,
            stripeSubscription.id,
            stripePriceId || null,
            stripeSubscription.status,
            planTier,
            currentPeriodStart,
            currentPeriodEnd,
            stripeSubscription.cancel_at_period_end,
            canceledAt,
            updatedAt,
            stripeCouponId,
          ],
        );
      } catch (upsertError) {
        if ((upsertError as { code?: string }).code === '42703') {
          logger.warn(
            { userId, error: upsertError },
            'Subscriptions table missing columns; retrying sync with minimal fields',
          );

          rows = await db.query<SubscriptionRow>(
            `INSERT INTO subscriptions
               (user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
                status, plan_tier, current_period_start, current_period_end,
                cancel_at_period_end, canceled_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (user_id) DO UPDATE SET
               stripe_customer_id      = EXCLUDED.stripe_customer_id,
               stripe_subscription_id  = EXCLUDED.stripe_subscription_id,
               stripe_price_id         = EXCLUDED.stripe_price_id,
               status                  = EXCLUDED.status,
               plan_tier               = EXCLUDED.plan_tier,
               current_period_start    = EXCLUDED.current_period_start,
               current_period_end      = EXCLUDED.current_period_end,
               cancel_at_period_end    = EXCLUDED.cancel_at_period_end,
               canceled_at             = EXCLUDED.canceled_at,
               updated_at              = EXCLUDED.updated_at
             RETURNING *`,
            [
              userId,
              customerId,
              stripeSubscription.id,
              stripePriceId || null,
              stripeSubscription.status,
              planTier,
              currentPeriodStart,
              currentPeriodEnd,
              stripeSubscription.cancel_at_period_end,
              canceledAt,
              updatedAt,
            ],
          );
        } else {
          throw upsertError;
        }
      }

      if (!rows[0]) {
        logger.error({ userId }, 'Subscription upsert returned no row');
        throw new Error('Subscription upsert returned no data');
      }

      const data = rows[0];

      await this.allocateCreditsForPeriod(
        userId,
        data.id,
        planTier,
        new Date(currentPeriodStart),
        new Date(currentPeriodEnd),
        { db },
      );

      return {
        id: data.id,
        user_id: data.user_id,
        plan_tier: data.plan_tier,
        status: data.status,
        current_period_start: new Date(data.current_period_start),
        current_period_end: new Date(data.current_period_end),
        stripe_subscription_id: data.stripe_subscription_id,
        stripe_price_id: data.stripe_price_id,
      };
    } catch (error) {
      const isNotFound =
        error instanceof Error &&
        (error.message.includes('No such customer') || error.message.includes('resource_missing'));

      if (isNotFound) {
        logger.info({ error, userId }, 'Stripe resource not found during sync');
        return null;
      }

      logger.error({ error, userId }, 'Error executing syncWithStripe');
      throw error;
    }
  }
}
