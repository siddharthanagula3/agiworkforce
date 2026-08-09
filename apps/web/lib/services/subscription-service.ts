/**
 * @file subscription-service.ts
 *
 * # Client injection contract (WEB-RLS-BYPASS mitigation)
 *
 * USER-CONTEXT methods accept a `DatabaseAdapter` parameter. Callers construct it via:
 *   `import { getNeonDb } from '@/lib/server/neon-db';`
 *   `const db = getNeonDb().withUser(jwt);`
 *
 * SERVICE-CONTEXT methods (Stripe webhook, cron, claim-offer) call `getNeonDb()`
 * internally. Their doc-comments say "SERVICE-CONTEXT" and list valid callers.
 *
 * Never add direct DB client construction here. See lib/services/README.md.
 */
import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { getNeonDb } from '@/lib/server/neon-db';
import Stripe from 'stripe';
import { logger } from '@/lib/logger';
import { CreditService } from './credit-service';
import type { SubscriptionRow, ProfileRow } from '@/lib/server/neon-types';
import { resolvePlanTier, isValidPlanTier } from '@/lib/price-tier-mapping';
// AUDIT-P3: Use shared Stripe type helpers for safer period access
import { getSubscriptionPeriod, getSubscriptionCouponId } from '@/lib/stripe-types';
import { STRIPE_API_VERSION } from '@/lib/stripe-config';
import { getPlanUsageBudgetCents, isPlanUsageUncapped } from '@/lib/server/managed-usage-policy';
import { resolveManagedUsagePeriod } from '@/lib/server/managed-usage-period';

export interface SubscriptionInfo {
  id: string;
  user_id: string;
  plan_tier: string;
  status: string;
  current_period_start: Date;
  current_period_end: Date;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  /**
   * Present when the subscription is billed by Apple (migration 0046).
   * Optional because not every `SubscriptionInfo` comes from the table — the
   * free-trial service synthesises one, and a synthetic row is never
   * store-owned, so `undefined` is the correct answer rather than a lie.
   */
  apple_original_transaction_id?: string | null;
  /** Present when the subscription is billed by Google (migration 0046). */
  google_purchase_token?: string | null;
}

/**
 * Grace period applied to a lapsed store subscription before entitlement is
 * withdrawn. Apple and Google can both report a renewal after the previous
 * period has technically ended, so expiring on the exact boundary would revoke
 * access from paying customers during normal renewal lag.
 *
 * ponytail: fixed 3 days. Make it env-tunable only if observed store renewal
 * lag proves longer than this.
 */
const STORE_RENEWAL_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

interface CreditAllocationOptions {
  /** Compatibility-only audit context; allocation always comes from planTier. */
  stripePriceId?: string | null;
  /** Keep webhook entitlement and allowance mutations in one transaction. */
  db?: DatabaseAdapter;
}

export class SubscriptionService {
  /**
   * Get subscription for a user.
   * USER-CONTEXT: caller passes a DatabaseAdapter (optionally bound to the
   * authenticated user via db.withUser(jwt)) so the query is scoped to the
   * authenticated user's rows.
   *
   * Supports two call forms (mirrors credit-service overload pattern):
   *   getSubscription(db, userId)  · caller provides adapter
   *   getSubscription(userId)      · service creates its own adapter internally
   *
   * PERFORMANCE OPTIMIZATION: Select only required columns instead of '*'
   */
  static async getSubscription(
    dbOrUserId: DatabaseAdapter | string,
    userId?: string,
  ): Promise<SubscriptionInfo | null> {
    let db: DatabaseAdapter;
    let resolvedUserId: string;
    if (typeof dbOrUserId === 'string') {
      db = getNeonDb();
      resolvedUserId = dbOrUserId;
    } else {
      db = dbOrUserId;
      resolvedUserId = userId!;
    }

    try {
      const rows = await db.query<SubscriptionRow>(
        `SELECT id, user_id, plan_tier, status, current_period_start, current_period_end,
                stripe_subscription_id, stripe_price_id,
                apple_original_transaction_id, google_purchase_token
         FROM subscriptions
         WHERE user_id = $1
         LIMIT 1`,
        [resolvedUserId],
      );

      if (rows.length === 0) {
        return null;
      }

      const data = rows[0]!;

      // Historical store-billed subscriptions have no active lifecycle
      // integration: there is no Apple ASSN V2 or Play RTDN endpoint and no
      // re-verification job. Without this boundary, a row left as `active`
      // would keep handing out a paid tier after its recorded period ended.
      //
      // This is the one reader every server-side entitlement check shares, so
      // deriving expiry here covers the chat auth-gate, /api/me, model listing
      // and the credit-reset cron in a single place, without changing
      // `effectivePlanTier`'s signature (20+ call sites across five surfaces,
      // several client-side with cached state that carries no period end).
      //
      // Scope is deliberately narrow. Only rows owned by a store and NOT
      // linked to Stripe are eligible, and a null or unparseable
      // `current_period_end` NEVER expires: historical store rows and manually
      // provisioned Team/Enterprise rows may carry null. Expiring on a null
      // would downgrade paying customers.
      const storeOwned =
        Boolean(data.apple_original_transaction_id || data.google_purchase_token) &&
        !data.stripe_subscription_id;
      const periodEnd = data.current_period_end ? new Date(data.current_period_end) : null;
      const lapsed =
        storeOwned &&
        periodEnd !== null &&
        Number.isFinite(periodEnd.getTime()) &&
        periodEnd.getTime() + STORE_RENEWAL_GRACE_MS < Date.now();

      return {
        id: data.id,
        user_id: data.user_id,
        plan_tier: data.plan_tier || 'free',
        status: lapsed ? 'expired' : data.status || 'none',
        current_period_start: new Date(data.current_period_start),
        current_period_end: new Date(data.current_period_end),
        stripe_subscription_id: data.stripe_subscription_id,
        stripe_price_id: data.stripe_price_id,
        apple_original_transaction_id: data.apple_original_transaction_id,
        google_purchase_token: data.google_purchase_token,
      };
    } catch (error) {
      logger.error({ error, userId: resolvedUserId }, 'Error in getSubscription');
      throw error;
    }
  }

  /**
   * Allocate credits for a subscription period.
   * SERVICE-CONTEXT: called from Stripe webhook and claim-offer handler; no user JWT available.
   */
  static async allocateCreditsForPeriod(
    userId: string,
    subscriptionId: string,
    planTier: string,
    periodStart: Date,
    periodEnd: Date,
    options: CreditAllocationOptions = {},
  ): Promise<string> {
    // GOV-2: an uncapped tier (Enterprise) used to resolve to 0 here, so no
    // credit account was ever created, `CreditService.checkAvailable` returned
    // false, and every Enterprise chat 402'd with "Usage budget exhausted.
    // Upgrade your plan" — while BILLING_PLAN_CAPABILITY_TIERS grants that tier
    // everything. `getPlanUsageBudgetCents` now returns real ledger headroom
    // for declared-uncapped tiers, so the account is created like any other.
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

  /**
   * Reset credits for a new billing period.
   * SERVICE-CONTEXT: called from Stripe webhook and cron job; no user JWT available.
   */
  static async resetCreditsForNewPeriod(
    userId: string,
    subscriptionId: string,
    planTier: string,
    periodStart: Date,
    periodEnd: Date,
    options: CreditAllocationOptions = {},
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

  /**
   * Move an active paid credit account into a replacement upgrade period.
   * Existing usage counters and purchased top-ups stay on the account; only
   * the included plan-allocation difference is added.
   */
  static async carryCreditsForUpgradePeriod(
    userId: string,
    subscriptionId: string,
    previousPlanTier: string,
    nextPlanTier: string,
    periodStart: Date,
    periodEnd: Date,
    db?: DatabaseAdapter,
  ): Promise<string> {
    // GOV-2: uncapped tiers resolve to ledger headroom rather than 0, so an
    // upgrade INTO one is a legitimate carry-forward instead of an exception.
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

  /**
   * Get credit allocation for a plan tier
   */
  static getCreditAllocation(planTier: string): number {
    return getPlanUsageBudgetCents(planTier, 'monthly');
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
        'Price ID not found in tier mapping; defaulting to free tier. Check STRIPE_PRICE_* environment variables and PRICE_ID_OVERRIDES.',
      );
      return 'free';
    }

    // Only return 'free' if there's genuinely no price ID (e.g., new user without subscription)
    return 'free';
  }

  /**
   * Ensure a profile exists for the user (required for subscriptions FK constraint).
   * SERVICE-CONTEXT: called only from syncWithStripe, which has no user JWT.
   */
  private static async ensureProfileExists(userId: string, email: string): Promise<void> {
    // SERVICE-CONTEXT: service-level db (no user JWT) because the only caller,
    // syncWithStripe, runs outside any request that carries one.
    const db = getNeonDb();

    // Check if profile exists
    const existing = await db.query<Pick<ProfileRow, 'id'>>(
      'SELECT id FROM profiles WHERE id = $1 LIMIT 1',
      [userId],
    );

    if (existing.length === 0) {
      // Profile doesn't exist - create it
      logger.info({ userId, email }, 'Creating missing profile for user');
      try {
        await db.execute('INSERT INTO profiles (id, email) VALUES ($1, $2)', [userId, email]);
        logger.info({ userId, email }, 'Profile created successfully');
      } catch (insertError) {
        // Ignore unique-violation errors (profile might have been created concurrently)
        if ((insertError as { code?: string }).code !== '23505') {
          logger.error({ error: insertError, userId }, 'Failed to create profile');
          throw insertError;
        }
        logger.info({ userId }, 'Profile already exists (concurrent creation)');
      }
    }
  }

  /**
   * Sync subscription from Stripe using customer ID (BEST PRACTICE).
   *
   * UNCALLED TODAY. Its only caller, `/api/sync-subscription`, was deleted in
   * 17b2036c9 ("close unmounted surface sweep", 2026-07-29). Nothing in the repo
   * invokes it now, so no code path repairs a missed or out-of-order Stripe
   * webhook: the webhook handler is the sole writer of subscription state.
   * Ledger BIZ-013 tracks wiring this into a periodic reconciliation job; keep
   * this notice accurate until a real caller exists.
   *
   * SERVICE-CONTEXT: uses a service-level db. Any future caller must be a
   * trusted server context (cron/webhook/admin) — it takes `userId` on faith
   * and writes that user's subscription row without an ownership check.
   *
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
    const stripeKey = process.env['STRIPE_SECRET_KEY'];
    if (!stripeKey) {
      logger.warn('STRIPE_SECRET_KEY not set, skipping sync');
      return null;
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: STRIPE_API_VERSION,
    });

    try {
      logger.info({ userId, email }, 'Attempting self-healing subscription sync');

      // SERVICE-CONTEXT: service-level db (no user JWT). See the notice on this
      // method: it is reserved for trusted server contexts, and has no caller yet.
      const db = getNeonDb();

      const profileRows = await db.query<Pick<ProfileRow, 'stripe_customer_id'>>(
        'SELECT stripe_customer_id FROM profiles WHERE id = $1 LIMIT 1',
        [userId],
      );

      let customerId: string | null = profileRows[0]?.stripe_customer_id ?? null;

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

        const customer = customers.data[0]!;

        // WEB-8 (audit 2026-05-03): tightened IDOR check.
        //
        // The previous logic only blocked when
        // It accepted the customer if the metadata field was MISSING -
        // which is exactly the case for legacy customers created before
        // metadata was attached. Combined with the email-fallback path,
        // a user who changed their account email to one that previously
        // belonged to someone else's Stripe customer would inherit that
        // customer's billing record.
        //
        // We now REQUIRE the metadata field to exist AND match. Customers
        // with no metadata are treated as "ownership unknown" and
        // refused - operators can run a one-time backfill to attach
        // metadata to legacy customers, after which the email fallback
        // becomes safe.
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

        // Store customer_id for future lookups
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
          stripeSubscription = subscriptions.data[0] ?? null;
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

        // Find the most recent valid subscription (past_due excluded - payment has failed)
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

      // AUDIT-P3: Use type-safe helpers for period extraction (Stripe SDK v20 changes)
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

      // AUDIT-P3: Use type-safe helper for coupon ID (v20 API: discount -> discounts)
      const stripeCouponId = getSubscriptionCouponId(stripeSubscription);

      // Ensure profile exists before creating subscription (FK constraint)
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

      // Primary upsert · includes all columns
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
        // 42703 = undefined_column: table is missing a column (migration pending)
        // Retry with minimal columns that are guaranteed to exist
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

      // Allocate credits if needed
      await this.allocateCreditsForPeriod(
        userId,
        data.id,
        planTier,
        new Date(currentPeriodStart),
        new Date(currentPeriodEnd),
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
      // Differentiate between "not found" scenarios and actual errors
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
