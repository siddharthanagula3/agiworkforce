import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { RevenueContext } from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import { CreditService } from './credit-service';
import type { SubscriptionRow } from '@/lib/server/neon-types';
import {
  getPlanUsageBudgetCents,
  isPlanUsageUncapped,
  type VersionedPlanTier,
} from '@/lib/server/managed-usage-policy';
import { resolveManagedUsagePeriod } from '@/lib/server/managed-usage-period';
import { resolveEffectiveSubscriptionBillingStatus } from '@/lib/server/subscription-billing-owner';
import { resolveOwnerSeatPlanTier } from '@/lib/services/team-seat-entitlement';
import {
  revenueContextOfSubscription,
  type SubscriptionRevenueSource,
} from '@/lib/billing/revenue-context';

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
  plan_catalog_version?: number | null;
  /**
   * Present only on a subscription derived from an organization seat, where
   * `id` and `stripe_subscription_id` belong to the owner and `user_id` is the
   * member holding the seat.
   */
  seat_source?: { organizationId: string; ownerUserId: string };
}

interface CreditAllocationOptions {
  db: DatabaseAdapter;
  stripePriceId?: string | null;
  catalogVersion?: number | null;
  revenueContext?: RevenueContext | null;
}

interface SubscriptionAllowanceRow extends SubscriptionRevenueSource {
  plan_catalog_version: number | null;
}

async function readSubscriptionAllowanceRow(
  db: DatabaseAdapter,
  userId: string,
  subscriptionId: string,
): Promise<SubscriptionAllowanceRow | null> {
  const [row] = await db.query<SubscriptionAllowanceRow>(
    `select plan_catalog_version, stripe_price_id, apple_original_transaction_id,
            google_purchase_token
       from subscriptions where id = $1 and user_id = $2 limit 1`,
    [subscriptionId, userId],
  );
  return row ?? null;
}

async function resolveAllowance(
  userId: string,
  planTier: string,
  subscriptionId: string,
  periodEnd: Date,
  options: CreditAllocationOptions,
): Promise<VersionedPlanTier> {
  const known = options.catalogVersion !== undefined && options.revenueContext !== undefined;
  const row = known ? null : await readSubscriptionAllowanceRow(options.db, userId, subscriptionId);
  return {
    tier: await resolveOwnerSeatPlanTier(options.db, userId, planTier, null, periodEnd),
    catalogVersion:
      options.catalogVersion !== undefined
        ? options.catalogVersion
        : (row?.plan_catalog_version ?? null),
    revenueContext:
      options.revenueContext !== undefined
        ? options.revenueContext
        : revenueContextOfSubscription(row),
  };
}

export class SubscriptionService {
  /**
   * The catalog version and revenue context of the open credit period. The period
   * points at the subscription that funds it, which for a seat member is the
   * organization owner's row, so this answers for members as well as owners.
   */
  static async readOpenCreditPeriodAllowance(
    db: DatabaseAdapter,
    userId: string,
  ): Promise<{ catalogVersion: number | null; revenueContext: RevenueContext | null }> {
    const [row] = await db.query<SubscriptionAllowanceRow>(
      `select credits.plan_catalog_version, subs.stripe_price_id,
              subs.apple_original_transaction_id, subs.google_purchase_token
         from public.token_credits credits
         left join public.subscriptions subs on subs.id = credits.subscription_id
        where credits.user_id = $1
          and credits.period_end > now()
        order by credits.period_end desc
        limit 1`,
      [userId],
    );
    return {
      catalogVersion: row?.plan_catalog_version ?? null,
      revenueContext: revenueContextOfSubscription(row),
    };
  }

  static async getSubscription(
    db: DatabaseAdapter,
    userId: string,
  ): Promise<SubscriptionInfo | null> {
    try {
      const rows = await db.query<SubscriptionRow>(
        `SELECT id, user_id, plan_tier, status, current_period_start, current_period_end,
                cancel_at_period_end,
                stripe_subscription_id, stripe_price_id,
                apple_original_transaction_id, google_purchase_token, plan_catalog_version
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
        plan_catalog_version: data.plan_catalog_version ?? null,
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
    const allowance = await resolveAllowance(userId, planTier, subscriptionId, periodEnd, options);
    const creditsCents = getPlanUsageBudgetCents(allowance, 'monthly');

    if (creditsCents === 0) {
      logger.info(
        { userId, planTier, uncapped: isPlanUsageUncapped(allowance) },
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
        allowance.catalogVersion,
      );

      logger.info(
        {
          userId,
          subscriptionId,
          planTier,
          catalogVersion: allowance.catalogVersion,
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
    const allowance = await resolveAllowance(userId, planTier, subscriptionId, periodEnd, options);
    const creditsCents = getPlanUsageBudgetCents(allowance, 'monthly');

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
        allowance.catalogVersion,
      );

      logger.info(
        {
          userId,
          subscriptionId,
          planTier,
          catalogVersion: allowance.catalogVersion,
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
    catalogVersions: { previous?: number | null; next?: number | null } = {},
  ): Promise<string> {
    const revenueContext = revenueContextOfSubscription(
      await readSubscriptionAllowanceRow(db, userId, subscriptionId),
    );
    const previousBudgetCents = getPlanUsageBudgetCents(
      { tier: previousPlanTier, catalogVersion: catalogVersions.previous, revenueContext },
      'monthly',
    );
    const nextBudgetCents = getPlanUsageBudgetCents(
      { tier: nextPlanTier, catalogVersion: catalogVersions.next, revenueContext },
      'monthly',
    );
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
      catalogVersions.next,
    );
  }
}
