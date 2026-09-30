import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { topUpChargedCents } from '@agiworkforce/types';

import { logger } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/security-audit';
import { MICROUSD_PER_LEDGER_CENT } from '@/lib/server/managed-usage-policy';
import type { Stripe } from '@/lib/stripe-types';
import { duplicateRefundAmount, STRIPE_PAGE_SIZE } from './duplicate-subscription-settlement';

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

async function currentPlanAllocation(
  stripe: Stripe,
  charge: Stripe.Charge,
  period: PlanPeriod,
): Promise<{
  amount: number;
  other: { id: string; amount: number; subscription: string | null }[];
} | null> {
  const periodEnd = seconds(period.current_period_end);
  const periodStart = seconds(period.current_period_start);
  if (periodEnd === null || periodStart === null) return null;
  if (
    !period.stripe_subscription_id ||
    !customerIdOf(charge.customer) ||
    !Number.isSafeInteger(charge.amount) ||
    charge.amount <= 0
  )
    throw new Error('Plan refund charge allocation is invalid');
  const paymentIntentId = paymentIntentIdOf(charge);
  if (!paymentIntentId) throw new Error('Plan refund has no verifiable invoice-payment mapping');
  const payments = await stripe.invoicePayments.list({
    payment: { type: 'payment_intent', payment_intent: paymentIntentId },
    status: 'paid',
    limit: STRIPE_PAGE_SIZE,
    expand: ['data.invoice'],
  });
  if (payments.has_more || payments.data.length === 0)
    throw new Error('Plan refund invoice-payment mapping is incomplete');
  let amount = 0;
  let total = 0;
  const other: { id: string; amount: number; subscription: string | null }[] = [];
  const seen = new Set<string>();
  const currentInvoices = new Map<string, { invoice: Stripe.Invoice; amount: number }>();
  for (const payment of payments.data) {
    const invoice = payment.invoice;
    const paid = payment.amount_paid;
    if (
      payment.status !== 'paid' ||
      payment.payment.type !== 'payment_intent' ||
      (typeof payment.payment.payment_intent === 'string'
        ? payment.payment.payment_intent
        : payment.payment.payment_intent?.id) !== paymentIntentId ||
      seen.has(payment.id) ||
      !payment.id ||
      paid === null ||
      !Number.isSafeInteger(paid) ||
      paid <= 0 ||
      !invoice ||
      typeof invoice === 'string' ||
      invoice.deleted ||
      customerIdOf(invoice.customer) !== customerIdOf(charge.customer) ||
      invoice.lines.has_more ||
      invoice.lines.data.length === 0
    ) {
      throw new Error('Plan refund invoice allocation cannot be verified');
    }
    seen.add(payment.id);
    total += paid;
    const reference = invoice.parent?.subscription_details?.subscription;
    const subscription = typeof reference === 'string' ? reference : (reference?.id ?? null);
    const current =
      subscription === period.stripe_subscription_id &&
      Math.max(...invoice.lines.data.map((line) => line.period.end)) === periodEnd;
    if (current) {
      amount += paid;
      const recorded = currentInvoices.get(invoice.id);
      currentInvoices.set(invoice.id, { invoice, amount: (recorded?.amount ?? 0) + paid });
    } else other.push({ id: payment.id, amount: paid, subscription });
  }
  if (!Number.isSafeInteger(total) || total !== charge.amount || !Number.isSafeInteger(amount))
    throw new Error('Invoice allocations do not match the signed charge amount');
  for (const { invoice, amount: invoiceAllocation } of currentInvoices.values()) {
    if (
      invoice.status !== 'paid' ||
      invoice.amount_remaining !== 0 ||
      !Number.isSafeInteger(invoice.amount_paid) ||
      invoice.amount_paid <= 0 ||
      !Number.isSafeInteger(invoiceAllocation) ||
      invoiceAllocation !== invoice.amount_paid
    ) {
      throw new Error('Kept invoice requires complete settled payment attribution');
    }
  }
  return amount > 0 ? { amount, other } : null;
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
  const allocation = period ? await currentPlanAllocation(stripe, charge, period) : null;
  if (!period || !allocation) {
    logger.info(
      { userId: profile.id, chargeId: charge.id },
      'Refunded plan charge paid for an earlier period; the current period is untouched',
    );
    return;
  }

  if (
    !Number.isSafeInteger(charge.amount_refunded) ||
    charge.amount_refunded < 0 ||
    charge.amount_refunded > charge.amount
  )
    throw new Error('Charge refund amount is invalid');
  const fullyRefunded = charge.amount_refunded === charge.amount;
  const duplicateRefunded =
    !fullyRefunded && allocation.other.length > 0
      ? duplicateRefundAmount(charge, period.stripe_subscription_id, allocation.other)
      : 0;
  const keptRefunded = fullyRefunded
    ? allocation.amount
    : charge.amount_refunded - duplicateRefunded;
  if (keptRefunded < 0 || keptRefunded > allocation.amount)
    throw new Error('Refund exceeds the proven kept invoice allocation');
  const planCharge = {
    ...charge,
    amount: allocation.amount,
    amount_refunded: keptRefunded,
    refunded: keptRefunded === allocation.amount,
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
