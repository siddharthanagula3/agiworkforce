import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { MobileIapCatalogProduct, MobileIapPlatform } from '@agiworkforce/types';
import { createError } from '@/lib/errors';
import { SubscriptionService } from './subscription-service';

export interface MobileIapLifecycleEvent {
  platform: MobileIapPlatform;
  notificationId: string;
  eventType: string;
  product: MobileIapCatalogProduct;
  storeTransactionId: string;
  purchaseTokenHash: string;
  originalTransactionId: string | null;
  appAccountToken: string;
  purchasedAt: Date;
  expiresAt: Date | null;
  entitlementStatus: 'active' | 'expired' | 'revoked' | 'refunded' | 'restored';
  cancelAtPeriodEnd: boolean;
  refundFraction?: number;
  rawGooglePurchaseToken?: string;
}

interface ReceiptAnchor {
  id: string;
  user_id: string;
  app_account_token: string;
  intended_amount_cents: number;
  refunded_amount_cents: number;
}

export async function processMobileIapLifecycleEvent(input: {
  db: DatabaseAdapter;
  event: MobileIapLifecycleEvent;
}): Promise<'processed' | 'duplicate' | 'unknown_purchase'> {
  return input.db.transaction(async (tx) => {
    const [notification] = await tx.query<{ notification_id: string }>(
      `insert into public.mobile_iap_notification_receipts (platform, notification_id)
       values ($1, $2)
       on conflict do nothing
       returning notification_id`,
      [input.event.platform, input.event.notificationId],
    );
    if (!notification) return 'duplicate';

    const [anchor] = await tx.query<ReceiptAnchor>(
      `select receipt.id, receipt.user_id, account.app_account_token,
              receipt.intended_amount_cents, receipt.refunded_amount_cents
         from public.mobile_iap_transactions receipt
         join public.mobile_iap_accounts account on account.user_id = receipt.user_id
        where receipt.platform = $1
          and (
            receipt.store_transaction_id = $2
            or receipt.purchase_token_hash = $3
            or ($4::text is not null and receipt.original_transaction_id = $4)
          )
        order by receipt.created_at asc
        limit 1
        for update of receipt`,
      [
        input.event.platform,
        input.event.storeTransactionId,
        input.event.purchaseTokenHash,
        input.event.originalTransactionId,
      ],
    );
    if (!anchor) {
      await tx.execute(
        `update public.mobile_iap_notification_receipts
            set processed_at = now()
          where platform = $1 and notification_id = $2`,
        [input.event.platform, input.event.notificationId],
      );
      return 'unknown_purchase';
    }
    if (anchor.app_account_token !== input.event.appAccountToken) {
      throw createError.forbidden('Store notification account binding does not match.');
    }

    if (input.event.product.kind === 'top_up') {
      if (
        input.event.entitlementStatus === 'refunded' ||
        input.event.entitlementStatus === 'revoked'
      ) {
        const fraction = Math.min(1, Math.max(0, input.event.refundFraction ?? 1));
        const refundTargetCents = Math.round(anchor.intended_amount_cents * fraction);
        const refundCents = Math.max(0, refundTargetCents - anchor.refunded_amount_cents);
        if (refundCents > 0) {
          await tx.execute('select public.handle_top_up_refund($1, $2, $3)', [
            anchor.user_id,
            refundCents,
            `Mobile ${input.event.platform} refund ${input.event.storeTransactionId}`,
          ]);
        }
        await tx.execute(
          `update public.mobile_iap_transactions
              set status = $2, refunded_amount_cents = $3, updated_at = now()
            where id = $1`,
          [anchor.id, input.event.entitlementStatus, refundTargetCents],
        );
      } else if (input.event.entitlementStatus === 'restored' && anchor.refunded_amount_cents > 0) {
        const [balance] = await tx.query<{ account_id: string }>(
          `select account_id from public.get_credit_balance($1) limit 1`,
          [anchor.user_id],
        );
        if (!balance?.account_id) {
          throw createError.conflict('No active credit account is available for this reversal.');
        }
        await tx.execute('select public.add_credits($1, $2, $3, $4, $5)', [
          anchor.user_id,
          balance.account_id,
          anchor.refunded_amount_cents,
          `Mobile ${input.event.platform} refund reversed ${input.event.storeTransactionId}`,
          'purchase',
        ]);
        await tx.execute(
          `update public.mobile_iap_transactions
              set status = 'granted', refunded_amount_cents = 0, updated_at = now()
            where id = $1`,
          [anchor.id],
        );
      }
    } else if (input.event.entitlementStatus === 'active') {
      if (!input.event.expiresAt) {
        throw createError.badRequest('Active subscription notification has no expiry.');
      }
      const [subscription] = await tx.query<{ id: string }>(
        `update public.subscriptions
            set status = 'active',
                plan_tier = $2,
                apple_original_transaction_id = $3,
                google_purchase_token = $4,
                current_period_start = $5,
                current_period_end = $6,
                cancel_at_period_end = $7,
                canceled_at = null,
                updated_at = now()
          where user_id = $1
            and stripe_subscription_id is null
          returning id`,
        [
          anchor.user_id,
          input.event.product.planTier,
          input.event.platform === 'ios' ? input.event.originalTransactionId : null,
          input.event.platform === 'android' ? (input.event.rawGooglePurchaseToken ?? null) : null,
          input.event.purchasedAt.toISOString(),
          input.event.expiresAt.toISOString(),
          input.event.cancelAtPeriodEnd,
        ],
      );
      if (!subscription?.id) {
        throw createError.conflict('Store notification no longer owns this subscription.');
      }
      await SubscriptionService.allocateCreditsForPeriod(
        anchor.user_id,
        subscription.id,
        input.event.product.planTier,
        input.event.purchasedAt,
        input.event.expiresAt,
        { db: tx },
      );
      await tx.execute(
        `update public.mobile_iap_transactions
            set status = 'active', expires_at = $2, updated_at = now()
          where id = $1`,
        [anchor.id, input.event.expiresAt.toISOString()],
      );
    } else {
      await tx.execute(
        `update public.subscriptions
            set status = 'canceled', plan_tier = 'free',
                cancel_at_period_end = true, canceled_at = now(), updated_at = now()
          where user_id = $1
            and stripe_subscription_id is null`,
        [anchor.user_id],
      );
      await tx.execute(
        `update public.mobile_iap_transactions
            set status = $2, expires_at = coalesce($3, expires_at), updated_at = now()
          where id = $1`,
        [anchor.id, input.event.entitlementStatus, input.event.expiresAt?.toISOString() ?? null],
      );
    }

    await tx.execute(
      `update public.mobile_iap_notification_receipts
          set processed_at = now()
        where platform = $1 and notification_id = $2`,
      [input.event.platform, input.event.notificationId],
    );
    return 'processed';
  });
}
