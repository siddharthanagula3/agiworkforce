import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  BILLING_PLAN_CATALOG_VERSION,
  BASIS_POINTS_PER_WHOLE,
  CENTS_PER_USD,
  SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER,
  isEntitledSubscriptionStatus,
  isFreeBillingPlanTier,
  mobileIapStoreCommissionBasisPoints,
  purchasedCreditMetadata,
  topUpBudgetCentsForCredits,
  type MobileIapCatalogProduct,
  type MobileIapPlatform,
  type MobileIapVerifyResponse,
} from '@agiworkforce/types';
import { STORE_CHARGE_ID_PREFIX } from '@/lib/billing/refund-requests';
import { createError, isAppError } from '@/lib/errors';
import { readStoreTestPurchasesAllowed } from '@/lib/feature-flags/store-test-purchase-gate';
import { logger } from '@/lib/logger';
import { MICROUSD_PER_LEDGER_CENT } from '@/lib/server/managed-usage-policy';
import type { SubscriptionRow } from '@/lib/server/neon-types';
import { recordCogsAdjustment } from './cogs-ledger-service';
import { SubscriptionService } from './subscription-service';
import {
  hashMobileIapPurchaseToken,
  isUnfundedStorePurchase,
  type VerifiedMobileIapPurchase,
} from '@/lib/server/mobile-iap-store-verification';
import { resolveEffectiveSubscriptionBillingStatus } from '@/lib/server/subscription-billing-owner';
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
  | 'plan_catalog_version'
>;

export const STORE_TEST_PURCHASE_REFUSED =
  "This purchase was made in the store's test environment, which this account is not set up to use. Nothing was charged.";

export const STORE_PLAN_HELD_BY_ANOTHER_PURCHASE =
  'This account already has an active plan from a different store purchase. Cancel that one, or wait for it to end, before starting another.';

const STORE_REQUEST_CLOSED_AS_GRANTED =
  'This purchase was added to the account after the request was filed, so no refund is due.';

const HTTP_CONFLICT = 409;

function planRank(tier: string | null | undefined): number {
  return (SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER as readonly string[]).indexOf(tier ?? '');
}

// A top-up is credited to the subscription the buyer pays for themselves, so the
// catalog offers one and the ledger grants one on exactly this answer.
export function ownsPaidPlanForTopUp(
  subscription: Pick<SubscriptionRow, 'plan_tier' | 'status'> | null | undefined,
): boolean {
  return (
    subscription != null &&
    isEntitledSubscriptionStatus(subscription.status) &&
    !isFreeBillingPlanTier(subscription.plan_tier)
  );
}

function ownsStoreSubscriptionRow(
  subscription: Pick<
    SubscriptionRow,
    'stripe_subscription_id' | 'apple_original_transaction_id' | 'google_purchase_token'
  >,
  input: { purchaseToken: string; verified: VerifiedMobileIapPurchase },
): boolean {
  if (subscription.stripe_subscription_id) return false;
  return input.verified.platform === 'ios'
    ? input.verified.originalTransactionId !== null &&
        subscription.apple_original_transaction_id === input.verified.originalTransactionId
    : subscription.google_purchase_token === input.purchaseToken;
}

// A Play plan change issues a new token that names the one it replaces. Apple
// keeps one original transaction for every change inside the subscription group.
function replacesRecordedPlayToken(
  subscription: Pick<SubscriptionRow, 'google_purchase_token'>,
  verified: VerifiedMobileIapPurchase,
): boolean {
  return (
    verified.platform === 'android' &&
    typeof subscription.google_purchase_token === 'string' &&
    subscription.google_purchase_token.length > 0 &&
    hashMobileIapPurchaseToken(subscription.google_purchase_token) ===
      verified.originalTransactionId
  );
}

// The same store can bill one account twice: a second Apple ID, or a second
// Google account. The one already paying for the row keeps it, as it would
// against another channel, so its renewals are never orphaned by an overwrite.
function heldByAnotherStorePurchase(
  subscription: ExistingSubscription | undefined,
  input: { purchaseToken: string; verified: VerifiedMobileIapPurchase },
): boolean {
  if (!subscription || subscription.stripe_subscription_id) return false;
  const recorded =
    input.verified.platform === 'ios'
      ? subscription.apple_original_transaction_id
      : subscription.google_purchase_token;
  if (!recorded) return false;
  if (
    ownsStoreSubscriptionRow(subscription, input) ||
    replacesRecordedPlayToken(subscription, input.verified)
  ) {
    return false;
  }
  return isEntitledSubscriptionStatus(resolveEffectiveSubscriptionBillingStatus(subscription));
}

// Both the app's verify call and the store's notice describe one paid period.
// Whichever arrives first names it, and the other must name it the same way or
// the period is allocated twice. A Play plan change that keeps the billing date
// reports the moment of the change as its start, so a period whose end is
// already on the row keeps the start already on the row.
export function storePeriodStart(
  recorded: Pick<SubscriptionRow, 'current_period_start' | 'current_period_end'> | null | undefined,
  purchase: { purchasedAt: Date; expiresAt: Date },
): Date {
  return recorded?.current_period_start &&
    recorded.current_period_end &&
    new Date(recorded.current_period_end).getTime() === purchase.expiresAt.getTime()
    ? new Date(recorded.current_period_start)
    : purchase.purchasedAt;
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
    purchaseCountry?: string | null;
  },
): Promise<void> {
  const afterFirstYear =
    input.product.kind === 'subscription' && (await hasYearOfPaidService(db, input));
  const basisPoints = mobileIapStoreCommissionBasisPoints({
    platform: input.platform,
    kind: input.product.kind,
    afterFirstYear,
    purchaseCountry: input.purchaseCountry ?? null,
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

export interface UngrantedStoreCharge {
  platform: MobileIapPlatform;
  product: MobileIapCatalogProduct;
  storeTransactionId: string;
  purchasedAt: Date;
  purchaseCountry?: string | null;
}

export function storeChargeId(platform: MobileIapPlatform, storeTransactionId: string): string {
  return `${STORE_CHARGE_ID_PREFIX}${platform}:${storeTransactionId}`;
}

// The store has taken the buyer's money for a purchase this ledger will not
// grant: a plan bought or renewed while another purchase still pays for the
// account, or a top-up approved after the plan it needed had lapsed. It joins
// the operator's refund queue once per store transaction, whatever was decided
// about it since, so it ends refunded at the store or granted.
export async function fileUngrantedStoreCharge(
  db: DatabaseAdapter,
  input: { userId: string; charge: UngrantedStoreCharge; refusal: string },
): Promise<void> {
  const { charge } = input;
  const store = charge.platform === 'ios' ? 'App Store' : 'Google Play';
  await db.execute(
    `insert into public.billing_refund_requests (
       user_id, charge_id, charge_kind, charge_amount_cents, charge_currency,
       charge_created_at, reason, details, billing_country, assessment
     )
     select $1::text, $2::text, $3::text, $4::bigint, 'usd',
            $5::timestamptz, 'technical_problem', $6::text, $7::text, 'needs_review'
      where not exists (
        select 1 from public.billing_refund_requests filed where filed.charge_id = $2::text
      )
     on conflict do nothing`,
    [
      input.userId,
      storeChargeId(charge.platform, charge.storeTransactionId),
      charge.product.kind === 'subscription' ? 'plan' : 'top_up',
      intendedAmountCents(charge.product),
      charge.purchasedAt.toISOString(),
      `${store} charged for ${charge.product.key} and it was not added to this account: ${input.refusal} The amount is the list price in US dollars. It is refunded through ${store}, not Stripe.`,
      charge.purchaseCountry ?? null,
    ],
  );
}

export async function closeGrantedStoreChargeRequest(
  db: DatabaseAdapter,
  userId: string,
  platform: MobileIapPlatform,
  storeTransactionId: string,
): Promise<void> {
  await db.execute(
    `update public.billing_refund_requests
        set status = 'declined', decided_by = 'automatic', decision_note = $2,
            decided_at = now(), updated_at = now()
      where charge_id = $1 and user_id = $3 and status = 'pending'`,
    [storeChargeId(platform, storeTransactionId), STORE_REQUEST_CLOSED_AS_GRANTED, userId],
  );
}

export async function recordVerifiedMobileIapPurchase(input: {
  db: DatabaseAdapter;
  userId: string;
  purchaseToken: string;
  verified: VerifiedMobileIapPurchase;
}): Promise<MobileIapVerifyResponse> {
  let result: MobileIapVerifyResponse;
  try {
    result = await grantVerifiedMobileIapPurchase(input);
  } catch (error) {
    if (
      isAppError(error) &&
      error.statusCode === HTTP_CONFLICT &&
      input.verified.entitlementStatus === 'active' &&
      input.verified.environment !== 'sandbox'
    ) {
      let filingError: unknown = null;
      try {
        await fileUngrantedStoreCharge(input.db, {
          userId: input.userId,
          charge: input.verified,
          refusal: error.message,
        });
      } catch (caught) {
        filingError = caught ?? new Error('The refund request could not be filed.');
      }
      logger.error(
        {
          event: 'store_purchase_charged_not_granted',
          reason: error.message,
          platform: input.verified.platform,
          storeTransactionId: input.verified.storeTransactionId,
          refundRequestFiled: filingError === null,
          ...(filingError === null
            ? {}
            : {
                filingError:
                  filingError instanceof Error ? filingError.message : String(filingError),
              }),
        },
        filingError === null
          ? 'A store purchase was charged but could not be granted; a refund request was filed'
          : 'A store purchase was charged but could not be granted, and its refund request could not be filed',
      );
      if (filingError !== null) throw filingError;
    }
    throw error;
  }
  if (result.status === 'already_processed' || input.verified.environment === 'sandbox') {
    return result;
  }
  try {
    await recordMobileIapStoreCommission(input.db, {
      userId: input.userId,
      platform: input.verified.platform,
      product: input.verified.product,
      storeTransactionId: input.verified.storeTransactionId,
      originalTransactionId: input.verified.originalTransactionId,
      purchasedAt: input.verified.purchasedAt,
      purchaseCountry: input.verified.purchaseCountry ?? null,
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
              current_period_start, current_period_end, plan_catalog_version
         from public.subscriptions
        where user_id = $1
        limit 1
        for update`,
      [input.userId],
    );

    if (
      isUnfundedStorePurchase(input.verified) &&
      !(await readStoreTestPurchasesAllowed(input.userId))
    ) {
      throw createError.forbidden(STORE_TEST_PURCHASE_REFUSED).asUserSafe();
    }

    const handoff = resolveSubscriptionOwnerHandoff(subscription, input.verified.platform);
    if (input.verified.product.kind === 'subscription') {
      if (handoff.blocked) {
        throw createError.conflict(subscriptionOwnerHandoffConflictMessage(handoff));
      }
      if (!input.verified.expiresAt) {
        throw createError.badRequest('Verified subscription is missing its renewal date.');
      }
      if (heldByAnotherStorePurchase(subscription, input)) {
        throw createError.conflict(STORE_PLAN_HELD_BY_ANOTHER_PURCHASE).asUserSafe();
      }
    } else if (!ownsPaidPlanForTopUp(subscription)) {
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
        JSON.stringify({
          ...purchasedCreditMetadata(input.verified.purchaseCountry, input.verified.purchasedAt),
          charged_cents:
            input.verified.environment === 'sandbox'
              ? 0
              : intendedAmountCents(input.verified.product),
          charged_currency: 'usd',
          store_environment: input.verified.environment,
        }),
      ]);
      await tx.execute(
        `update public.mobile_iap_transactions
            set status = 'granted', processed_at = now(), updated_at = now()
          where id = $1`,
        [receipt.id],
      );
      await closeGrantedStoreChargeRequest(
        tx,
        input.userId,
        input.verified.platform,
        input.verified.storeTransactionId,
      );
      return {
        success: true,
        kind: 'top_up',
        productKey: input.verified.product.key,
        status: 'granted',
        unitsGranted: input.verified.product.units,
      };
    }

    // The store's notices can be ahead of the app: a transaction for a period this
    // subscription has already reached changes nothing, so it cannot undo a newer
    // plan or an auto-renew choice recorded since.
    if (
      subscription?.current_period_end &&
      isEntitledSubscriptionStatus(subscription.status) &&
      ownsStoreSubscriptionRow(subscription, input) &&
      new Date(subscription.current_period_end).getTime() >= input.verified.expiresAt!.getTime()
    ) {
      await tx.execute(
        `update public.mobile_iap_transactions
            set status = 'already_processed', processed_at = now(), updated_at = now()
          where id = $1`,
        [receipt.id],
      );
      return {
        success: true,
        kind: 'subscription',
        productKey: input.verified.product.key,
        status: 'already_processed',
        planTier: input.verified.product.planTier,
        currentPeriodEnd: new Date(subscription.current_period_end).toISOString(),
      };
    }

    const periodStart = storePeriodStart(subscription, {
      purchasedAt: input.verified.purchasedAt,
      expiresAt: input.verified.expiresAt!,
    });
    const [upserted] = await tx.query<{ id: string; plan_catalog_version: number | null }>(
      `insert into public.subscriptions (
         user_id, status, plan_tier,
         apple_original_transaction_id, google_purchase_token,
         current_period_start, current_period_end,
         cancel_at_period_end, canceled_at, updated_at, plan_catalog_version
       ) values ($1, 'active', $2, $3, $4, $5, $6, $9, null, now(), $8)
       on conflict (user_id) do update set
         plan_catalog_version = case
           when subscriptions.plan_tier = excluded.plan_tier
             then coalesce(subscriptions.plan_catalog_version, excluded.plan_catalog_version)
           else excluded.plan_catalog_version
         end,
         status = 'active',
         plan_tier = excluded.plan_tier,
         apple_original_transaction_id = excluded.apple_original_transaction_id,
         google_purchase_token = excluded.google_purchase_token,
         stripe_subscription_id = case when $7 then null else subscriptions.stripe_subscription_id end,
         stripe_price_id = case when $7 then null else subscriptions.stripe_price_id end,
         current_period_start = excluded.current_period_start,
         current_period_end = excluded.current_period_end,
         cancel_at_period_end = excluded.cancel_at_period_end,
         canceled_at = null,
         updated_at = now()
       returning id, plan_catalog_version`,
      [
        input.userId,
        input.verified.product.planTier,
        input.verified.platform === 'ios' ? input.verified.originalTransactionId : null,
        input.verified.platform === 'android' ? input.purchaseToken : null,
        periodStart.toISOString(),
        input.verified.expiresAt!.toISOString(),
        handoff.clearsStripe,
        BILLING_PLAN_CATALOG_VERSION,
        input.verified.cancelAtPeriodEnd ?? false,
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
        { previous: subscription.plan_catalog_version, next: upserted.plan_catalog_version },
      );
    } else {
      await SubscriptionService.allocateCreditsForPeriod(
        input.userId,
        upserted.id,
        input.verified.product.planTier,
        periodStart,
        input.verified.expiresAt!,
        { db: tx, catalogVersion: upserted.plan_catalog_version },
      );
    }

    await tx.execute(
      `update public.mobile_iap_transactions
          set status = 'active', processed_at = now(), updated_at = now()
        where id = $1`,
      [receipt.id],
    );
    await closeGrantedStoreChargeRequest(
      tx,
      input.userId,
      input.verified.platform,
      input.verified.storeTransactionId,
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
