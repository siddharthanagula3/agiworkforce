import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { topUpChargedCents } from '@agiworkforce/types';

import { logger } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/security-audit';
import { MICROUSD_PER_LEDGER_CENT } from '@/lib/server/managed-usage-policy';
import type { Stripe } from '@/lib/stripe-types';
import { duplicateRefundAmount } from './duplicate-subscription-settlement';

interface PlanPeriod {
  subscription_id: string;
  stripe_subscription_id: string | null;
  plan_tier: string | null;
  current_period_start: string | Date | null;
  current_period_end: string | Date | null;
}

function customerIdOf(customer: Stripe.Charge['customer']): string | null {
  if (typeof customer === 'string') return customer;
  return customer?.id ?? null;
}

function paymentIntentIdOf(charge: Stripe.Charge): string | null {
  const paymentIntent = charge.payment_intent;
  if (typeof paymentIntent === 'string') return paymentIntent;
  return paymentIntent?.id ?? null;
}

function isFullyRefunded(charge: Stripe.Charge): boolean {
  return charge.refunded === true || (charge.amount > 0 && charge.amount_refunded >= charge.amount);
}

function proportionOf(totalMicrousd: number, charge: Stripe.Charge): number {
  if (isFullyRefunded(charge)) return totalMicrousd;
  if (charge.amount <= 0) return 0;
  return Math.floor((totalMicrousd * charge.amount_refunded) / charge.amount);
}

function seconds(value: string | Date | null): number | null {
  if (value === null) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? Math.floor(time / 1000) : null;
}

async function alreadyRevokedMicrousd(
  db: DatabaseAdapter,
  userId: string,
  description: string,
): Promise<number> {
  const [row] = await db.query<{ revoked: string | number | null }>(
    `select coalesce(sum(-amount_microusd), 0) as revoked
       from credit_transactions
      where user_id = $1 and transaction_type = 'refund' and description = $2`,
    [userId, description],
  );
  const revoked = Number(row?.revoked ?? 0);
  return Number.isFinite(revoked) ? revoked : 0;
}

async function coversCurrentPeriod(
  stripe: Stripe,
  charge: Stripe.Charge,
  period: PlanPeriod,
): Promise<boolean> {
  const periodStart = seconds(period.current_period_start);
  const periodEnd = seconds(period.current_period_end);
  if (periodStart === null || periodEnd === null) return false;

  const paymentIntentId = paymentIntentIdOf(charge);
  if (paymentIntentId) {
    const payments = await stripe.invoicePayments.list({
      payment: { type: 'payment_intent', payment_intent: paymentIntentId },
      limit: 1,
      expand: ['data.invoice'],
    });
    const invoice = payments.data[0]?.invoice;
    if (invoice && typeof invoice !== 'string' && !invoice.deleted) {
      const invoiceSubscription = invoice.parent?.subscription_details?.subscription;
      const invoiceSubscriptionId =
        typeof invoiceSubscription === 'string' ? invoiceSubscription : invoiceSubscription?.id;
      if (invoiceSubscriptionId && invoiceSubscriptionId !== period.stripe_subscription_id) {
        return false;
      }
      const lines = invoice.lines.data;
      if (lines.length > 0) {
        return Math.max(...lines.map((line) => line.period.end)) === periodEnd;
      }
    }
  }
  return charge.created >= periodStart && charge.created < periodEnd;
}

async function revokeTopUpRefund(
  db: DatabaseAdapter,
  userId: string,
  charge: Stripe.Charge,
  description: string,
): Promise<number> {
  const purchasedCents = Number(charge.metadata?.['credit_amount_cents']);
  const chargedCents = topUpChargedCents({
    conversion: charge.metadata?.['conversion'],
    amountCents: purchasedCents,
    units: Number(charge.metadata?.['top_up_units']),
    priceCents: Number(charge.metadata?.['price_cents']),
    amountUsd: Number(charge.metadata?.['amount_usd']),
    autoReload: charge.metadata?.['auto_reload'] === 'true',
  });
  if (chargedCents === null || charge.amount < chargedCents) {
    throw new Error(`Invalid credit top-up refund metadata for Charge ${charge.id}`);
  }

  const target = proportionOf(purchasedCents * MICROUSD_PER_LEDGER_CENT, charge);
  const delta = target - (await alreadyRevokedMicrousd(db, userId, description));
  if (delta <= 0) return 0;
  await db.execute('select handle_top_up_refund_microusd($1, $2, $3)', [
    userId,
    delta,
    description,
  ]);
  return delta;
}

async function revokePlanRefund(
  db: DatabaseAdapter,
  userId: string,
  period: PlanPeriod,
  charge: Stripe.Charge,
  description: string,
): Promise<number> {
  const [account] = await db.query<{
    id: string;
    credits_allocated_microusd: string | number;
    top_up_allocated_microusd: string | number;
  }>(
    `select id, credits_allocated_microusd, top_up_allocated_microusd
       from token_credits
      where user_id = $1 and subscription_id = $2
      order by period_end desc
      limit 1`,
    [userId, period.subscription_id],
  );
  if (!account) return 0;

  const planAllowance = Math.max(
    0,
    Number(account.credits_allocated_microusd) - Number(account.top_up_allocated_microusd),
  );
  const target = proportionOf(planAllowance, charge);
  const delta = target - (await alreadyRevokedMicrousd(db, userId, description));
  if (delta <= 0) return 0;
  await db.execute('select revoke_plan_allowance_microusd($1, $2, $3, $4)', [
    userId,
    account.id,
    delta,
    description,
  ]);
  return delta;
}

async function endRefundedPlan(
  db: DatabaseAdapter,
  userId: string,
  stripeCustomerId: string,
  period: PlanPeriod,
  charge: Stripe.Charge,
): Promise<void> {
  await db.execute(
    `update subscriptions
        set status = 'past_due', plan_tier = 'free', cancel_at_period_end = true
      where stripe_customer_id = $1`,
    [stripeCustomerId],
  );

  await recordAuditEvent({
    userId,
    eventType: 'plan_changed',
    endpoint: '/api/stripe-webhook',
    surface: 'stripe_webhook',
    detail: {
      resourceType: 'subscription',
      previousPlanTier: period.plan_tier ?? 'unknown',
      planTier: 'free',
      source: 'stripe_webhook',
      status: 'past_due',
      reason: 'charge_refunded',
    },
  });

  logger.warn(
    { userId, chargeId: charge.id, previousPlanTier: period.plan_tier ?? 'unknown' },
    'Entitlement revoked for the fully refunded current period; the Stripe subscription itself was left alone and must be canceled in Stripe if the refund was meant to end it',
  );
}

export async function handleChargeRefunded(
  db: DatabaseAdapter,
  stripe: Stripe,
  charge: Stripe.Charge,
): Promise<void> {
  const stripeCustomerId = customerIdOf(charge.customer);
  const isTopUp = charge.metadata?.['type'] === 'credit_topup';

  logger.info(
    {
      chargeId: charge.id,
      customerId: stripeCustomerId,
      amountRefundedCumulative: charge.amount_refunded,
      fullyRefunded: isFullyRefunded(charge),
      isTopUp,
    },
    'Processing charge refund',
  );
  if (!stripeCustomerId || charge.amount_refunded <= 0) return;

  const [profile] = await db.query<{ id: string }>(
    'select id from profiles where stripe_customer_id = $1 limit 1',
    [stripeCustomerId],
  );
  if (!profile?.id) {
    logger.warn(
      { stripeCustomerId, chargeId: charge.id },
      'No user found for refunded charge - credits not revoked',
    );
    return;
  }

  const description = `Refund for charge ${charge.id}`;
  if (isTopUp) {
    const revokedMicrousd = await revokeTopUpRefund(db, profile.id, charge, description);
    logger.info(
      { userId: profile.id, chargeId: charge.id, revokedMicrousd },
      'Purchased credits revoked for refunded top-up',
    );
    return;
  }

  const [period] = await db.query<PlanPeriod>(
    `select id as subscription_id, stripe_subscription_id, plan_tier, current_period_start,
            current_period_end
       from subscriptions
      where stripe_customer_id = $1
      limit 1`,
    [stripeCustomerId],
  );
  if (!period || !(await coversCurrentPeriod(stripe, charge, period))) {
    logger.info(
      { userId: profile.id, chargeId: charge.id },
      'Refunded plan charge paid for an earlier period; the current period is untouched',
    );
    return;
  }

  const duplicateRefunded = await duplicateRefundAmount(
    stripe,
    charge,
    period.stripe_subscription_id,
  );
  const planCharge = {
    ...charge,
    amount: charge.amount - duplicateRefunded,
    amount_refunded: Math.max(0, charge.amount_refunded - duplicateRefunded),
    refunded: duplicateRefunded === 0 && charge.refunded,
  };
  if (planCharge.amount_refunded === 0) return;

  const revokedMicrousd = await revokePlanRefund(db, profile.id, period, planCharge, description);
  logger.info(
    { userId: profile.id, chargeId: charge.id, revokedMicrousd },
    'Plan credits revoked in proportion to the refunded share of the current period',
  );
  if (isFullyRefunded(planCharge)) {
    await endRefundedPlan(db, profile.id, stripeCustomerId, period, planCharge);
  }
}
