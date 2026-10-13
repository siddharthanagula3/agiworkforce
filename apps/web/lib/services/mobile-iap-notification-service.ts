import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  BILLING_PLAN_CATALOG_VERSION,
  SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER,
  isEntitledSubscriptionStatus,
  type MobileIapCatalogProduct,
  type MobileIapPlatform,
} from '@agiworkforce/types';
import { createError, isAppError } from '@/lib/errors';
import { readStoreTestPurchasesAllowed } from '@/lib/feature-flags/store-test-purchase-gate';
import { logger } from '@/lib/logger';
import { logSecurityEvent } from '@/lib/security-audit';
import { grantsAccess, type MobileIapEntitlementState } from '@/lib/server/mobile-iap-lifecycle';
import {
  hashMobileIapPurchaseToken,
  isUnfundedStorePurchase,
  type VerifiedMobileIapPurchase,
} from '@/lib/server/mobile-iap-store-verification';
import type { SubscriptionRow } from '@/lib/server/neon-types';
import type { NormalizedEnvironment } from '@/lib/server/payments/domain';
import { resolveEffectiveSubscriptionBillingStatus } from '@/lib/server/subscription-billing-owner';
import {
  STORE_PLAN_HELD_BY_ANOTHER_PURCHASE,
  closeGrantedStoreChargeRequest,
  fileUngrantedStoreCharge,
  recordMobileIapStoreCommission,
  recordVerifiedMobileIapPurchase,
  storePeriodStart,
} from './mobile-iap-ledger-service';
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
  entitlementStatus: MobileIapEntitlementState;
  cancelAtPeriodEnd: boolean;
  accessUntil?: Date | null;
  refundFraction?: number;
  rawGooglePurchaseToken?: string;
  environment: NormalizedEnvironment;
  /**
   * When the store says the event happened: Apple's signature time, or the
   * event time on a Play notification. It orders the auto-renew choice.
   */
  signedAt?: Date | null;
}

interface ReceiptAnchor {
  id: string;
  user_id: string;
  app_account_token: string;
  intended_amount_cents: number;
  refunded_amount_cents: number;
  environment: string | null;
}

type SubscriptionOwnerRow = Pick<
  SubscriptionRow,
  | 'plan_tier'
  | 'status'
  | 'stripe_subscription_id'
  | 'apple_original_transaction_id'
  | 'google_purchase_token'
  | 'current_period_start'
  | 'current_period_end'
>;

/**
 * Whose subscription row a store notice is about. `owner` is the purchase the
 * row records. `claimable` is a row no other live purchase holds, which a
 * purchase that is active at the store may take. `foreign` is a row a different
 * purchase still pays for: a replaced Play token, the other store, or Stripe.
 */
type StoreOwnership = 'owner' | 'claimable' | 'foreign';

const STORE_IDENTITY_COLUMN = {
  ios: 'apple_original_transaction_id',
  android: 'google_purchase_token',
} as const satisfies Record<MobileIapPlatform, keyof SubscriptionOwnerRow>;

function eventStoreIdentity(event: MobileIapLifecycleEvent): string | null {
  return event.platform === 'ios'
    ? event.originalTransactionId
    : (event.rawGooglePurchaseToken ?? null);
}

async function readStoreOwnership(
  tx: DatabaseAdapter,
  userId: string,
  event: MobileIapLifecycleEvent,
): Promise<{ ownership: StoreOwnership; recorded: SubscriptionOwnerRow | null }> {
  const [row] = await tx.query<SubscriptionOwnerRow>(
    `select plan_tier, status, stripe_subscription_id,
            apple_original_transaction_id, google_purchase_token,
            current_period_start, current_period_end
       from public.subscriptions
      where user_id = $1
      limit 1
      for update`,
    [userId],
  );
  if (!row) return { ownership: 'claimable', recorded: null };
  const identity = eventStoreIdentity(event);
  if (
    identity !== null &&
    !row.stripe_subscription_id &&
    row[STORE_IDENTITY_COLUMN[event.platform]] === identity
  ) {
    return { ownership: 'owner', recorded: row };
  }
  const replacesRecordedToken =
    event.platform === 'android' &&
    typeof row.google_purchase_token === 'string' &&
    row.google_purchase_token.length > 0 &&
    hashMobileIapPurchaseToken(row.google_purchase_token) === event.originalTransactionId;
  if (replacesRecordedToken) return { ownership: 'claimable', recorded: row };
  const held = Boolean(
    row.stripe_subscription_id || row.apple_original_transaction_id || row.google_purchase_token,
  );
  return {
    ownership:
      held && isEntitledSubscriptionStatus(resolveEffectiveSubscriptionBillingStatus(row))
        ? 'foreign'
        : 'claimable',
    recorded: row,
  };
}

// Both stores deliver notices out of order. Apple's carries the auto-renew choice
// as it stood when it was signed; Play's is read from the API while the notice is
// handled, and two handlers can commit in the opposite order to their reads. Only
// the newest event may set that choice.
async function claimsRenewalState(
  tx: DatabaseAdapter,
  userId: string,
  event: MobileIapLifecycleEvent,
): Promise<boolean> {
  if (!event.signedAt) return true;
  const claimed = await tx.query<{ user_id: string }>(
    `update public.mobile_iap_accounts
        set renewal_state_signed_at = $2, updated_at = now()
      where user_id = $1
        and (renewal_state_signed_at is null or renewal_state_signed_at <= $2)
      returning user_id`,
    [userId, event.signedAt.toISOString()],
  );
  return claimed.length > 0;
}

type LifecycleOutcome = 'processed' | 'duplicate' | 'unknown_purchase' | 'stale';

const SUSPENDED_SUBSCRIPTION_STATUS = { on_hold: 'past_due', paused: 'paused' } as const;

function planRank(tier: string | null | undefined): number {
  return (SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER as readonly string[]).indexOf(tier ?? '');
}

export async function hasMobileIapReceipt(
  db: DatabaseAdapter,
  input: {
    platform: MobileIapPlatform;
    storeTransactionId: string;
    purchaseTokenHash: string;
    originalTransactionId: string | null;
  },
): Promise<boolean> {
  const [row] = await db.query<{ id: string }>(
    `select id
       from public.mobile_iap_transactions
      where platform = $1
        and (
          store_transaction_id = $2
          or purchase_token_hash = $3
          or ($4::text is not null and original_transaction_id = $4)
          or ($4::text is not null and purchase_token_hash = $4)
        )
      limit 1`,
    [
      input.platform,
      input.storeTransactionId,
      input.purchaseTokenHash,
      input.originalTransactionId,
    ],
  );
  return row !== undefined;
}

/**
 * `refund_filed` is a charge the ledger refused and put in the operator's
 * refund queue. `not_grantable` is a refusal that left no such record.
 */
export type StoreNotificationGrant =
  'granted' | 'unknown_account' | 'refund_filed' | 'not_grantable';

const HTTP_CONFLICT = 409;

export type UnattributedStoreChargeReason =
  'no_account_token' | 'unknown_account' | 'not_grantable';

// A store took real money for a purchase no account here can be given: it names
// no account, names one that no longer exists, or was refused without reaching
// the refund queue, which needs an account to file under. The security log is
// the record the operator finds it in, and the write is required so the store
// retries the notice until that record exists.
export async function recordUnattributedStoreCharge(input: {
  platform: MobileIapPlatform;
  reason: UnattributedStoreChargeReason;
  storeTransactionId: string;
  originalTransactionId?: string | null;
  productId: string | null;
  endpoint: string;
}): Promise<void> {
  logger.error(
    {
      event: 'store_purchase_charged_not_attributed',
      platform: input.platform,
      reason: input.reason,
      storeTransactionId: input.storeTransactionId,
      productId: input.productId,
    },
    'A store charged for a purchase that could not be given to any account',
  );
  await logSecurityEvent(
    {
      eventType: 'suspicious_activity',
      severity: 'high',
      endpoint: input.endpoint,
      details: {
        action: 'store_purchase_unattributed',
        platform: input.platform,
        reason: input.reason,
        storeTransactionId: input.storeTransactionId,
        ...(input.originalTransactionId
          ? { originalTransactionId: input.originalTransactionId }
          : {}),
        productId: input.productId,
        refundThrough: input.platform === 'ios' ? 'App Store' : 'Google Play',
      },
    },
    { required: true },
  );
}

export async function grantMobileIapPurchaseFromStore(input: {
  db: DatabaseAdapter;
  appAccountToken: string;
  purchaseToken: string;
  verified: VerifiedMobileIapPurchase;
}): Promise<StoreNotificationGrant> {
  const [account] = await input.db.query<{ user_id: string }>(
    `select user_id
       from public.mobile_iap_accounts
      where app_account_token = $1
      limit 1`,
    [input.appAccountToken],
  );
  if (!account?.user_id) return 'unknown_account';
  try {
    await recordVerifiedMobileIapPurchase({
      db: input.db,
      userId: account.user_id,
      purchaseToken: input.purchaseToken,
      verified: input.verified,
    });
    return 'granted';
  } catch (error) {
    if (!isAppError(error) || error.statusCode < 400 || error.statusCode >= 500) throw error;
    logger.warn(
      {
        event: 'store_notification_purchase_not_granted',
        reason: error.message,
        platform: input.verified.platform,
        storeTransactionId: input.verified.storeTransactionId,
      },
      'A purchase reported by the store could not be granted to its account',
    );
    return error.statusCode === HTTP_CONFLICT &&
      input.verified.entitlementStatus === 'active' &&
      input.verified.environment !== 'sandbox'
      ? 'refund_filed'
      : 'not_grantable';
  }
}

export async function processMobileIapLifecycleEvent(input: {
  db: DatabaseAdapter;
  event: MobileIapLifecycleEvent;
}): Promise<LifecycleOutcome> {
  const { outcome, renewedUserId } = await applyMobileIapLifecycleEvent(input);
  if (renewedUserId && input.event.environment !== 'sandbox') {
    try {
      await recordMobileIapStoreCommission(input.db, {
        userId: renewedUserId,
        platform: input.event.platform,
        product: input.event.product,
        storeTransactionId: input.event.storeTransactionId,
        originalTransactionId: input.event.originalTransactionId,
        purchasedAt: input.event.purchasedAt,
      });
    } catch (error) {
      logger.error(
        {
          event: 'store_commission_not_recorded',
          error: error instanceof Error ? error.message : String(error),
          platform: input.event.platform,
          storeTransactionId: input.event.storeTransactionId,
        },
        'The store commission on a renewal is missing from the COGS ledger',
      );
    }
  }
  return outcome;
}

async function applyMobileIapLifecycleEvent(input: {
  db: DatabaseAdapter;
  event: MobileIapLifecycleEvent;
}): Promise<{ outcome: LifecycleOutcome; renewedUserId: string | null }> {
  return input.db.transaction(async (tx) => {
    const [notification] = await tx.query<{ notification_id: string }>(
      `insert into public.mobile_iap_notification_receipts (platform, notification_id)
       values ($1, $2)
       on conflict do nothing
       returning notification_id`,
      [input.event.platform, input.event.notificationId],
    );
    if (!notification) return { outcome: 'duplicate', renewedUserId: null };

    const [anchor] = await tx.query<ReceiptAnchor>(
      `select receipt.id, receipt.user_id, account.app_account_token,
              receipt.intended_amount_cents, receipt.refunded_amount_cents,
              receipt.environment
         from public.mobile_iap_transactions receipt
         join public.mobile_iap_accounts account on account.user_id = receipt.user_id
        where receipt.platform = $1
          and (
            receipt.store_transaction_id = $2
            or receipt.purchase_token_hash = $3
            or ($4::text is not null and receipt.original_transaction_id = $4)
            or ($4::text is not null and receipt.purchase_token_hash = $4)
          )
        order by (receipt.store_transaction_id = $2 or receipt.purchase_token_hash = $3) desc,
                 receipt.created_at asc
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
      return { outcome: 'unknown_purchase', renewedUserId: null };
    }
    if (anchor.app_account_token !== input.event.appAccountToken) {
      throw createError.forbidden('Store notification account binding does not match.');
    }

    const receiptEnvironment: NormalizedEnvironment =
      anchor.environment === 'sandbox' ? 'sandbox' : 'production';
    if (receiptEnvironment !== input.event.environment) {
      logger.warn(
        {
          event: 'store_notification_environment_mismatch',
          platform: input.event.platform,
          storeTransactionId: input.event.storeTransactionId,
        },
        'A store notice from one environment named a receipt granted in the other',
      );
      return markStale(tx, input.event);
    }

    // Apple signs each notice with the transaction it was sent about, so one that
    // arrives late describes a period that may already be over. Google's state is
    // read from the Play API at processing time and is never behind for its own
    // token, though that token may no longer be the one the subscription is on.
    const supersededBefore =
      input.event.platform === 'ios' ? input.event.purchasedAt.toISOString() : null;
    const sellsSubscription = input.event.product.kind === 'subscription';
    const { ownership, recorded } = sellsSubscription
      ? await readStoreOwnership(tx, anchor.user_id, input.event)
      : { ownership: 'owner' as const, recorded: null };
    if (
      sellsSubscription &&
      grantsAccess(input.event.entitlementStatus) &&
      isUnfundedStorePurchase(input.event) &&
      !(await readStoreTestPurchasesAllowed(anchor.user_id))
    ) {
      return markStale(tx, input.event);
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
      if (ownership === 'foreign') {
        // The store is still collecting for a purchase that no longer owns the
        // plan, so this charge buys the customer nothing.
        if (input.event.environment !== 'sandbox') {
          await fileUngrantedStoreCharge(tx, {
            userId: anchor.user_id,
            charge: input.event,
            refusal: STORE_PLAN_HELD_BY_ANOTHER_PURCHASE,
          });
          logger.error(
            {
              event: 'store_purchase_charged_not_granted',
              reason: STORE_PLAN_HELD_BY_ANOTHER_PURCHASE,
              platform: input.event.platform,
              storeTransactionId: input.event.storeTransactionId,
              refundRequestFiled: true,
            },
            'A store charge arrived for a plan another purchase owns; a refund request was filed',
          );
        }
        return markStale(tx, input.event);
      }
      const periodStart = storePeriodStart(recorded, {
        purchasedAt: input.event.purchasedAt,
        expiresAt: input.event.expiresAt,
      });
      const setsRenewalState = await claimsRenewalState(tx, anchor.user_id, input.event);
      const [subscription] = await tx.query<{
        id: string;
        plan_catalog_version: number | null;
        previous_plan_tier: string | null;
        previous_plan_catalog_version: number | null;
        previous_period_end: string | Date | null;
      }>(
        `with previous as (
           select plan_tier, plan_catalog_version, current_period_end
             from public.subscriptions
            where user_id = $1
              and stripe_subscription_id is null
            for update
         )
         update public.subscriptions s
            set status = 'active',
                plan_catalog_version = case
                  when s.plan_tier = $2 then coalesce(s.plan_catalog_version, $8)
                  else $8
                end,
                plan_tier = $2,
                apple_original_transaction_id = $3,
                google_purchase_token = $4,
                current_period_start = $5,
                current_period_end = $6,
                cancel_at_period_end = case when $10 then $7 else s.cancel_at_period_end end,
                canceled_at = null,
                updated_at = now()
           from previous
          where s.user_id = $1
            and s.stripe_subscription_id is null
            and ($9::timestamptz is null or s.current_period_start is null or s.current_period_start <= $9)
          returning s.id, s.plan_catalog_version,
                    previous.plan_tier as previous_plan_tier,
                    previous.plan_catalog_version as previous_plan_catalog_version,
                    previous.current_period_end as previous_period_end`,
        [
          anchor.user_id,
          input.event.product.planTier,
          input.event.platform === 'ios' ? input.event.originalTransactionId : null,
          input.event.platform === 'android' ? (input.event.rawGooglePurchaseToken ?? null) : null,
          periodStart.toISOString(),
          input.event.expiresAt.toISOString(),
          input.event.cancelAtPeriodEnd,
          BILLING_PLAN_CATALOG_VERSION,
          supersededBefore,
          setsRenewalState,
        ],
      );
      if (!subscription?.id) {
        if (await ownsStoreSubscription(tx, anchor.user_id)) return markStale(tx, input.event);
        throw createError.conflict('Store notification no longer owns this subscription.');
      }
      const previousRank = planRank(subscription.previous_plan_tier);
      const nextRank = planRank(input.event.product.planTier);
      if (previousRank >= 0 && nextRank > previousRank && subscription.previous_period_end) {
        await SubscriptionService.carryCreditsForUpgradePeriod(
          anchor.user_id,
          subscription.id,
          subscription.previous_plan_tier!,
          input.event.product.planTier,
          periodStart,
          input.event.expiresAt,
          tx,
          {
            previous: subscription.previous_plan_catalog_version,
            next: subscription.plan_catalog_version,
          },
        );
      } else {
        await SubscriptionService.allocateCreditsForPeriod(
          anchor.user_id,
          subscription.id,
          input.event.product.planTier,
          periodStart,
          input.event.expiresAt,
          { db: tx, catalogVersion: subscription.plan_catalog_version ?? null },
        );
      }
      await tx.execute(
        `update public.mobile_iap_transactions
            set status = 'active', expires_at = $2, updated_at = now()
          where id = $1`,
        [anchor.id, input.event.expiresAt.toISOString()],
      );
      await closeGrantedStoreChargeRequest(
        tx,
        input.event.platform,
        input.event.storeTransactionId,
      );
    } else if (input.event.entitlementStatus === 'grace') {
      const accessUntil = input.event.accessUntil ?? input.event.expiresAt;
      if (!accessUntil) {
        throw createError.badRequest('Grace period notification has no end date.');
      }
      if (ownership !== 'owner') return markStale(tx, input.event);
      const kept = await tx.query<{ id: string }>(
        `update public.subscriptions
            set status = 'active',
                current_period_end = greatest(current_period_end, $2::timestamptz),
                updated_at = now()
          where user_id = $1
            and stripe_subscription_id is null
            and ($3::timestamptz is null or current_period_start is null or current_period_start <= $3)
          returning id`,
        [anchor.user_id, accessUntil.toISOString(), supersededBefore],
      );
      if (kept.length === 0) return markStale(tx, input.event);
    } else if (
      input.event.entitlementStatus === 'on_hold' ||
      input.event.entitlementStatus === 'paused'
    ) {
      if (ownership !== 'owner') return markStale(tx, input.event);
      const suspended = await tx.query<{ id: string }>(
        `update public.subscriptions
            set status = $2, updated_at = now()
          where user_id = $1
            and stripe_subscription_id is null
            and ($3::timestamptz is null or current_period_start is null or current_period_start <= $3)
          returning id`,
        [
          anchor.user_id,
          SUSPENDED_SUBSCRIPTION_STATUS[input.event.entitlementStatus],
          supersededBefore,
        ],
      );
      if (suspended.length === 0) return markStale(tx, input.event);
    } else if (input.event.entitlementStatus === 'restored') {
      return markStale(tx, input.event);
    } else {
      if (ownership !== 'owner') {
        await markReceiptEnded(tx, anchor.id, input.event);
        return markStale(tx, input.event);
      }
      const ended = await tx.query<{ id: string }>(
        `update public.subscriptions
            set status = 'canceled', plan_tier = 'free',
                cancel_at_period_end = true, canceled_at = now(), updated_at = now()
          where user_id = $1
            and stripe_subscription_id is null
            and ($2::timestamptz is null or current_period_start is null or current_period_start <= $2)
          returning id`,
        [anchor.user_id, supersededBefore],
      );
      if (ended.length === 0) return markStale(tx, input.event);
      await markReceiptEnded(tx, anchor.id, input.event);
    }

    await tx.execute(
      `update public.mobile_iap_notification_receipts
          set processed_at = now()
        where platform = $1 and notification_id = $2`,
      [input.event.platform, input.event.notificationId],
    );
    const renewed =
      input.event.product.kind === 'subscription' && input.event.entitlementStatus === 'active';
    return { outcome: 'processed', renewedUserId: renewed ? anchor.user_id : null };
  });
}

async function markReceiptEnded(
  tx: DatabaseAdapter,
  receiptId: string,
  event: MobileIapLifecycleEvent,
): Promise<void> {
  await tx.execute(
    `update public.mobile_iap_transactions
        set status = $2, expires_at = coalesce($3, expires_at), updated_at = now()
      where id = $1`,
    [receiptId, event.entitlementStatus, event.expiresAt?.toISOString() ?? null],
  );
}

async function ownsStoreSubscription(tx: DatabaseAdapter, userId: string): Promise<boolean> {
  const [row] = await tx.query<{ id: string }>(
    `select id
       from public.subscriptions
      where user_id = $1
        and stripe_subscription_id is null
      limit 1`,
    [userId],
  );
  return row !== undefined;
}

// A notice that no longer describes the live subscription changes nothing: a late
// EXPIRED for last month must not end the month that renewed after it, and one
// for a replaced purchase must not end the purchase that replaced it.
async function markStale(
  tx: DatabaseAdapter,
  event: MobileIapLifecycleEvent,
): Promise<{ outcome: LifecycleOutcome; renewedUserId: null }> {
  await tx.execute(
    `update public.mobile_iap_notification_receipts
        set processed_at = now()
      where platform = $1 and notification_id = $2`,
    [event.platform, event.notificationId],
  );
  return { outcome: 'stale', renewedUserId: null };
}
