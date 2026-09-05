import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER,
  isFreeBillingPlanTier,
  type MobileIapVerifyResponse,
} from '@agiworkforce/types';
import { createError } from '@/lib/errors';
import type { SubscriptionRow } from '@/lib/server/neon-types';
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

export async function recordVerifiedMobileIapPurchase(input: {
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

    const intendedAmountCents =
      input.verified.product.kind === 'top_up'
        ? input.verified.product.amountUsd * 100
        : input.verified.product.intendedPriceUsd * 100;
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
        intendedAmountCents,
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
        `select account_id from public.get_credit_balance($1) limit 1`,
        [input.userId],
      );
      if (!balance?.account_id) {
        throw createError.conflict('No active credit account is available for this top-up.');
      }
      await tx.execute('select public.add_credits($1, $2, $3, $4, $5)', [
        input.userId,
        balance.account_id,
        intendedAmountCents,
        `Mobile ${input.verified.platform} top-up ${input.verified.storeTransactionId}`,
        'purchase',
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
