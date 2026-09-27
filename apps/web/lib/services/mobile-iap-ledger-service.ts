import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  BASIS_POINTS_PER_WHOLE,
  CENTS_PER_USD,
  SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER,
  isFreeBillingPlanTier,
  mobileIapStoreCommissionBasisPoints,
  purchasedCreditMetadata,
  topUpBudgetCentsForCredits,
  type MobileIapCatalogProduct,
  type MobileIapPlatform,
  type MobileIapVerifyResponse,
} from '@agiworkforce/types';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { MICROUSD_PER_LEDGER_CENT } from '@/lib/server/managed-usage-policy';
import type { SubscriptionRow } from '@/lib/server/neon-types';
import { recordCogsAdjustment } from './cogs-ledger-service';
import { SubscriptionService } from './subscription-service';
import type { VerifiedMobileIapPurchase } from '@/lib/server/mobile-iap-store-verification';
import {
  resolveSubscriptionOwnerHandoff,
  subscriptionOwnerHandoffConflictMessage,
} from '@/lib/server/subscription-owner-handoff';

type ExistingSubscription = Pick<
  SubscriptionRow,
  | 'id'
  | 'plan_tier'
  | 'status'
  | 'stripe_subscription_id'
  | 'apple_original_transaction_id'
  | 'google_purchase_token'
  | 'current_period_start'
  | 'current_period_end'
>;

function planRank(tier: string | null | undefined): number {
  return (SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER as readonly string[]).indexOf(tier ?? '');
}

function isEntitledStatus(status: string | undefined): boolean {
  return status === 'active' || status === 'trialing';
}

async function findExistingReceipt(
  db: DatabaseAdapter,
  input: VerifiedMobileIapPurchase,
): Promise<{ user_id: string; status: string } | undefined> {
  const [row] = await db.query<{ user_id: string; status: string }>(
    `select user_id, status
       from public.mobile_iap_transactions
      where platform = $1
        and (store_transaction_id = $2 or purchase_token_hash = $3)
      limit 1`,
    [input.platform, input.storeTransactionId, input.purchaseTokenHash],
  );
  return row;
}

function intendedAmountCents(product: MobileIapCatalogProduct): number {
  return Math.round(
    (product.kind === 'top_up' ? product.amountUsd : product.intendedPriceUsd) * CENTS_PER_USD,
  );
}

async function hasYearOfPaidService(
  db: DatabaseAdapter,
  input: {
    userId: string;
    platform: MobileIapPlatform;
    originalTransactionId: string | null;
    purchasedAt: Date;
  },
): Promise<boolean> {
  if (!input.originalTransactionId) return false;
  const [row] = await db.query<{ first_purchased_at: string | Date | null }>(
    `select min(purchased_at) as first_purchased_at
       from public.mobile_iap_transactions
      where user_id = $1
        and platform = $2
        and original_transaction_id = $3`,
    [input.userId, input.platform, input.originalTransactionId],
  );
  if (!row?.first_purchased_at) return false;
  const anniversary = new Date(row.first_purchased_at);
  anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
  return anniversary.getTime() <= input.purchasedAt.getTime();
}

export async function recordMobileIapStoreCommission(
  db: DatabaseAdapter,
  input: {
    userId: string;
    platform: MobileIapPlatform;
    product: MobileIapCatalogProduct;
    storeTransactionId: string;
    originalTransactionId: string | null;
    purchasedAt: Date;
  },
): Promise<void> {
  const afterFirstYear =
    input.product.kind === 'subscription' && (await hasYearOfPaidService(db, input));
  const basisPoints = mobileIapStoreCommissionBasisPoints({
    platform: input.platform,
    kind: input.product.kind,
    afterFirstYear,
  });
  const priceCents = intendedAmountCents(input.product);
  await recordCogsAdjustment(
    {
      userId: input.userId,
      kind: 'store_commission',
      amountCents: Math.round((priceCents * basisPoints) / BASIS_POINTS_PER_WHOLE),
      sourceRef: `mobile_iap:${input.platform}:${input.storeTransactionId}`,
      occurredAt: input.purchasedAt,
      metadata: {
        platform: input.platform,
        productKey: input.product.key,
        priceCents,
        basisPoints,
      },
      attribution: {
        kind: input.product.kind,
        ref: input.originalTransactionId ?? input.storeTransactionId,
      },
    },
    db,
  );
}

export async function recordVerifiedMobileIapPurchase(input: {
  db: DatabaseAdapter;
  userId: string;
  purchaseToken: string;
  verified: VerifiedMobileIapPurchase;
}): Promise<MobileIapVerifyResponse> {
  const result = await grantVerifiedMobileIapPurchase(input);
  if (result.status === 'already_processed') return result;
  try {
    await recordMobileIapStoreCommission(input.db, {
      userId: input.userId,
      platform: input.verified.platform,
      product: input.verified.product,
      storeTransactionId: input.verified.storeTransactionId,
      originalTransactionId: input.verified.originalTransactionId,
      purchasedAt: input.verified.purchasedAt,
    });
  } catch (error) {
    logger.error(
      {
        event: 'store_commission_not_recorded',
        error: error instanceof Error ? error.message : String(error),
        platform: input.verified.platform,
        storeTransactionId: input.verified.storeTransactionId,
      },
      'The store commission on a granted purchase is missing from the COGS ledger',
    );
  }
  return result;
}

async function grantVerifiedMobileIapPurchase(input: {
  db: DatabaseAdapter;
  userId: string;
  purchaseToken: string;
  verified: VerifiedMobileIapPurchase;
}): Promise<MobileIapVerifyResponse> {
  if (input.verified.entitlementStatus !== 'active') {
    throw createError.conflict('This store purchase is no longer active.');
  }

  return input.db.transaction(async (tx) => {
    const existingReceipt = await findExistingReceipt(tx, input.verified);
    if (existingReceipt) {
      if (existingReceipt.user_id !== input.userId) {
        throw createError.forbidden('This store receipt belongs to another account.');
      }
      return {
        success: true,
        kind: input.verified.product.kind,
        productKey: input.verified.product.key,
        status: 'already_processed',
        ...(input.verified.product.kind === 'subscription'
          ? {
              planTier: input.verified.product.planTier,
              currentPeriodEnd: input.verified.expiresAt?.toISOString() ?? null,
            }
          : { unitsGranted: input.verified.product.units }),
      };
    }

    const [subscription] = await tx.query<ExistingSubscription>(
      `select id, plan_tier, status, stripe_subscription_id,
              apple_original_transaction_id, google_purchase_token,
              current_period_start, current_period_end
         from public.subscriptions
        where user_id = $1
        limit 1
        for update`,
      [input.userId],
    );

    const handoff = resolveSubscriptionOwnerHandoff(subscription, input.verified.platform);
    if (input.verified.product.kind === 'subscription') {
      if (handoff.blocked) {
        throw createError.conflict(subscriptionOwnerHandoffConflictMessage(handoff));
      }
      if (!input.verified.expiresAt) {
        throw createError.badRequest('Verified subscription is missing its renewal date.');
      }
    } else if (
      !subscription ||
      !isEntitledStatus(subscription.status) ||
      isFreeBillingPlanTier(subscription.plan_tier)
    ) {
      throw createError.conflict('Start or restore an active paid plan before buying a top-up.');
    }

    const [receipt] = await tx.query<{ id: string }>(
      `insert into public.mobile_iap_transactions (
         user_id, platform, product_key, product_id, product_kind,
         store_transaction_id, purchase_token_hash, original_transaction_id,
         plan_tier, units_granted, intended_amount_cents, status,
         environment, purchased_at, expires_at, processed_at
       ) values (
         $1, $2, $3, $4, $5,
         $6, $7, $8,
         $9, $10, $11, 'pending',
         $12, $13, $14, null
       )
       on conflict do nothing
       returning id`,
      [
        input.userId,
        input.verified.platform,
        input.verified.product.key,
        input.verified.product.productId,
        input.verified.product.kind,
        input.verified.storeTransactionId,
        input.verified.purchaseTokenHash,
        input.verified.originalTransactionId,
        input.verified.product.kind === 'subscription' ? input.verified.product.planTier : null,
        input.verified.product.kind === 'top_up' ? input.verified.product.units : 0,
        intendedAmountCents(input.verified.product),
        input.verified.environment,
        input.verified.purchasedAt.toISOString(),
        input.verified.expiresAt?.toISOString() ?? null,
      ],
    );
    if (!receipt) {
      const racedReceipt = await findExistingReceipt(tx, input.verified);
      if (racedReceipt?.user_id === input.userId) {
        return {
          success: true,
          kind: input.verified.product.kind,
          productKey: input.verified.product.key,
          status: 'already_processed',
          ...(input.verified.product.kind === 'subscription'
            ? {
                planTier: input.verified.product.planTier,
                currentPeriodEnd: input.verified.expiresAt?.toISOString() ?? null,
              }
            : { unitsGranted: input.verified.product.units }),
        };
      }
      throw createError.forbidden('This store receipt has already been used.');
    }

    if (input.verified.product.kind === 'top_up') {
      const [balance] = await tx.query<{ account_id: string }>(
        `select account_id from public.get_credit_balance_microusd($1) limit 1`,
        [input.userId],
      );
      if (!balance?.account_id) {
        throw createError.conflict('No active credit account is available for this top-up.');
      }
      await tx.execute('select public.add_credits_microusd($1, $2, $3, $4, $5, $6)', [
        input.userId,
        balance.account_id,
        topUpBudgetCentsForCredits(input.verified.product.units) * MICROUSD_PER_LEDGER_CENT,
        `Mobile ${input.verified.platform} top-up ${input.verified.storeTransactionId}`,
        'purchase',
        JSON.stringify(
          purchasedCreditMetadata(input.verified.purchaseCountry, input.verified.purchasedAt),
        ),
      ]);
      await tx.execute(
        `update public.mobile_iap_transactions
            set status = 'granted', processed_at = now(), updated_at = now()
          where id = $1`,
        [receipt.id],
      );
      return {
        success: true,
        kind: 'top_up',
        productKey: input.verified.product.key,
        status: 'granted',
        unitsGranted: input.verified.product.units,
      };
    }

    const periodStart =
      subscription?.current_period_end &&
      new Date(subscription.current_period_end).getTime() === input.verified.expiresAt!.getTime() &&
      subscription.current_period_start
        ? new Date(subscription.current_period_start)
        : input.verified.purchasedAt;
    const [upserted] = await tx.query<{ id: string }>(
      `insert into public.subscriptions (
         user_id, status, plan_tier,
         apple_original_transaction_id, google_purchase_token,
         current_period_start, current_period_end,
         cancel_at_period_end, canceled_at, updated_at
       ) values ($1, 'active', $2, $3, $4, $5, $6, false, null, now())
       on conflict (user_id) do update set
         status = 'active',
         plan_tier = excluded.plan_tier,
         apple_original_transaction_id = excluded.apple_original_transaction_id,
         google_purchase_token = excluded.google_purchase_token,
         stripe_subscription_id = case when $7 then null else subscriptions.stripe_subscription_id end,
         stripe_price_id = case when $7 then null else subscriptions.stripe_price_id end,
         current_period_start = excluded.current_period_start,
         current_period_end = excluded.current_period_end,
         cancel_at_period_end = false,
         canceled_at = null,
         updated_at = now()
       returning id`,
      [
        input.userId,
        input.verified.product.planTier,
        input.verified.platform === 'ios' ? input.verified.originalTransactionId : null,
        input.verified.platform === 'android' ? input.purchaseToken : null,
        periodStart.toISOString(),
        input.verified.expiresAt!.toISOString(),
        handoff.clearsStripe,
      ],
    );
    if (!upserted?.id) throw createError.internal('Failed to record the store subscription.');

    const previousRank = planRank(subscription?.plan_tier);
    const nextRank = planRank(input.verified.product.planTier);
    if (
      subscription?.id === upserted.id &&
      previousRank >= 0 &&
      nextRank > previousRank &&
      subscription.current_period_end
    ) {
      await SubscriptionService.carryCreditsForUpgradePeriod(
        input.userId,
        upserted.id,
        subscription.plan_tier,
        input.verified.product.planTier,
        periodStart,
        input.verified.expiresAt!,
        tx,
      );
    } else {
      await SubscriptionService.allocateCreditsForPeriod(
        input.userId,
        upserted.id,
        input.verified.product.planTier,
        periodStart,
        input.verified.expiresAt!,
        { db: tx },
      );
    }

    await tx.execute(
      `update public.mobile_iap_transactions
          set status = 'active', processed_at = now(), updated_at = now()
        where id = $1`,
      [receipt.id],
    );
    return {
      success: true,
      kind: 'subscription',
      productKey: input.verified.product.key,
      status: 'active',
      planTier: input.verified.product.planTier,
      currentPeriodEnd: input.verified.expiresAt!.toISOString(),
    };
  });
}
