import 'server-only';

import type Stripe from 'stripe';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import {
  BILLING_ERROR_REASONS,
  STATUTORY_WITHDRAWAL_DAYS,
  UNUSED_REFUND_WINDOW_DAYS,
  type OperatorAccountBilling,
  type OperatorDisputeView,
  type OperatorRefundRequestView,
  type OperatorRefundStripeReason,
  type RefundAssessment,
  type RefundChargeKind,
  type RefundRequestReason,
  type RefundRequestStatus,
  type RefundRequestView,
  type RefundableChargeView,
} from '@/lib/billing/refund-requests';
import { EEA_COUNTRY_CODES } from '@/lib/eu-access';
import { logger } from '@/lib/logger';
import { MICROUSD_PER_LEDGER_CENT } from '@/lib/server/managed-usage-policy';
import { getNeonDb } from '@/lib/server/neon-db';
import { isStripeCustomerId, isStripeSubscriptionId } from '@/lib/server/stripe-resource-ids';
import { recordNotification } from '@/lib/services/notification-service';

const DAY_MS = 86_400_000;
const CUSTOMER_CHARGE_LIMIT = 24;
const OPERATOR_LIST_LIMIT = 100;
const STATUTORY_WITHDRAWAL_COUNTRIES: ReadonlySet<string> = new Set([
  ...EEA_COUNTRY_CODES,
  'GB',
  'TR',
]);
const ENDED_SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set([
  'canceled',
  'incomplete_expired',
]);

export class RefundRequestRefusal extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(message);
    this.name = 'RefundRequestRefusal';
  }
}

interface RefundRequestRow {
  id: string;
  user_id: string;
  charge_id: string;
  charge_kind: RefundChargeKind;
  charge_amount_cents: string | number;
  charge_currency: string;
  charge_created_at: string | Date;
  reason: RefundRequestReason;
  details: string | null;
  statutory_withdrawal: boolean;
  billing_country: string | null;
  assessment: RefundAssessment;
  status: RefundRequestStatus;
  refund_amount_cents: string | number | null;
  decision_note: string | null;
  decided_at: string | Date | null;
  created_at: string | Date;
}

interface DisputeRow {
  id: string;
  charge_id: string;
  amount_cents: string | number;
  currency: string;
  reason: string | null;
  stripe_status: string;
  outcome: 'open' | 'won' | 'lost';
  opened_at: string | Date;
  closed_at: string | Date | null;
  restored_at: string | Date | null;
}

const REQUEST_COLUMNS = `id, user_id, charge_id, charge_kind, charge_amount_cents, charge_currency,
  charge_created_at, reason, details, statutory_withdrawal, billing_country, assessment, status,
  refund_amount_cents, decision_note, decided_at, created_at`;

function iso(value: string | Date): string {
  return new Date(value).toISOString();
}

function isoOrNull(value: string | Date | null): string | null {
  return value === null ? null : iso(value);
}

function toNumber(value: string | number): number {
  return Number(value);
}

export function toRefundRequestView(row: RefundRequestRow): RefundRequestView {
  return {
    id: row.id,
    chargeId: row.charge_id,
    chargeKind: row.charge_kind,
    chargeAmountCents: toNumber(row.charge_amount_cents),
    chargeCurrency: row.charge_currency,
    chargeCreatedAt: iso(row.charge_created_at),
    reason: row.reason,
    details: row.details,
    assessment: row.assessment,
    status: row.status,
    refundAmountCents: row.refund_amount_cents === null ? null : toNumber(row.refund_amount_cents),
    decisionNote: row.decision_note,
    decidedAt: isoOrNull(row.decided_at),
    createdAt: iso(row.created_at),
  };
}

function toOperatorRequestView(row: RefundRequestRow): OperatorRefundRequestView {
  return {
    ...toRefundRequestView(row),
    userId: row.user_id,
    billingCountry: row.billing_country,
    statutoryWithdrawal: row.statutory_withdrawal,
  };
}

function toDisputeView(row: DisputeRow): OperatorDisputeView {
  return {
    id: row.id,
    chargeId: row.charge_id,
    amountCents: toNumber(row.amount_cents),
    currency: row.currency,
    reason: row.reason,
    stripeStatus: row.stripe_status,
    outcome: row.outcome,
    openedAt: iso(row.opened_at),
    closedAt: isoOrNull(row.closed_at),
    restoredAt: isoOrNull(row.restored_at),
  };
}

function customerIdOf(customer: Stripe.Charge['customer'] | Stripe.PaymentIntent['customer']) {
  if (typeof customer === 'string') return customer;
  return customer?.id ?? null;
}

export function chargeKindOf(charge: Stripe.Charge): RefundChargeKind {
  return charge.metadata?.['type'] === 'credit_topup' ? 'top_up' : 'plan';
}

export function billingCountryOf(charge: Stripe.Charge): string | null {
  const country =
    charge.billing_details?.address?.country ?? charge.payment_method_details?.card?.country;
  return country ? country.toUpperCase() : null;
}

function refundableCentsOf(charge: Stripe.Charge): number {
  return Math.max(0, charge.amount - charge.amount_refunded);
}

function isWithinDays(createdSeconds: number, days: number, now: Date): boolean {
  return now.getTime() - createdSeconds * 1000 <= days * DAY_MS;
}

export function isWithdrawalEligible(charge: Stripe.Charge, now: Date): boolean {
  const country = billingCountryOf(charge);
  return (
    country !== null &&
    STATUTORY_WITHDRAWAL_COUNTRIES.has(country) &&
    isWithinDays(charge.created, STATUTORY_WITHDRAWAL_DAYS, now)
  );
}

export function toRefundableChargeView(charge: Stripe.Charge, now: Date): RefundableChargeView {
  return {
    id: charge.id,
    kind: chargeKindOf(charge),
    amountCents: charge.amount,
    refundedCents: charge.amount_refunded,
    refundableCents: refundableCentsOf(charge),
    currency: charge.currency,
    createdAt: new Date(charge.created * 1000).toISOString(),
    billingCountry: billingCountryOf(charge),
    disputed: charge.disputed,
    withdrawalEligible: isWithdrawalEligible(charge, now),
    receiptUrl: charge.receipt_url ?? null,
  };
}

export async function listCustomerCharges(
  stripe: Stripe,
  customerId: string,
): Promise<Stripe.Charge[]> {
  const page = await stripe.charges.list({ customer: customerId, limit: CUSTOMER_CHARGE_LIMIT });
  return page.data.filter((charge) => charge.status === 'succeeded' && charge.paid);
}

interface UsageFacts {
  creditsUsedMicrousd: number;
  purchasedRemainingMicrousd: number;
}

async function readUsageFacts(db: DatabaseAdapter, userId: string): Promise<UsageFacts> {
  const [row] = await db.query<{
    credits_used_microusd: string | number;
    purchased_remaining_microusd: string | number;
  }>(
    `select credits_used_microusd,
            greatest(
              least(top_up_allocated_microusd, credits_allocated_microusd - credits_used_microusd),
              0
            ) as purchased_remaining_microusd
       from token_credits
      where user_id = $1 and period_end > now()
      order by period_end desc
      limit 1`,
    [userId],
  );
  return {
    creditsUsedMicrousd: Number(row?.credits_used_microusd ?? 0),
    purchasedRemainingMicrousd: Number(row?.purchased_remaining_microusd ?? 0),
  };
}

async function countDiscretionaryRefunds(db: DatabaseAdapter, userId: string): Promise<number> {
  const [row] = await db.query<{ refunds: string | number }>(
    `select count(*) as refunds from public.billing_refund_requests
      where user_id = $1 and status = 'refunded' and assessment = 'unused_within_policy'`,
    [userId],
  );
  return Number(row?.refunds ?? 0);
}

function purchasedMicrousdOf(charge: Stripe.Charge): number {
  const cents = Number(charge.metadata?.['credit_amount_cents']);
  return Number.isSafeInteger(cents) && cents > 0 ? cents * MICROUSD_PER_LEDGER_CENT : 0;
}

export function assessRefundRequest(input: {
  charge: Stripe.Charge;
  reason: RefundRequestReason;
  usage: UsageFacts;
  priorDiscretionaryRefunds: number;
  now: Date;
}): RefundAssessment {
  if (input.reason === 'statutory_withdrawal' && isWithdrawalEligible(input.charge, input.now)) {
    return 'statutory_withdrawal';
  }
  if (
    BILLING_ERROR_REASONS.has(input.reason) ||
    input.priorDiscretionaryRefunds > 0 ||
    !isWithinDays(input.charge.created, UNUSED_REFUND_WINDOW_DAYS, input.now)
  ) {
    return 'needs_review';
  }
  const purchased = purchasedMicrousdOf(input.charge);
  const unused =
    chargeKindOf(input.charge) === 'top_up'
      ? purchased > 0 && input.usage.purchasedRemainingMicrousd >= purchased
      : input.usage.creditsUsedMicrousd === 0;
  return unused ? 'unused_within_policy' : 'needs_review';
}

export async function listRefundRequests(
  db: DatabaseAdapter,
  userId: string,
): Promise<RefundRequestView[]> {
  const rows = await db.query<RefundRequestRow>(
    `select ${REQUEST_COLUMNS} from public.billing_refund_requests
      where user_id = $1
      order by created_at desc
      limit 50`,
    [userId],
  );
  return rows.map(toRefundRequestView);
}

async function findRequestForCharge(
  db: DatabaseAdapter,
  userId: string,
  chargeId: string,
): Promise<RefundRequestRow | null> {
  const [row] = await db.query<RefundRequestRow>(
    `select ${REQUEST_COLUMNS} from public.billing_refund_requests
      where user_id = $1 and charge_id = $2
      order by created_at desc
      limit 1`,
    [userId, chargeId],
  );
  return row ?? null;
}

async function retrieveCharge(stripe: Stripe, chargeId: string): Promise<Stripe.Charge | null> {
  try {
    return await stripe.charges.retrieve(chargeId);
  } catch (error) {
    if ((error as { code?: string }).code === 'resource_missing') return null;
    throw error;
  }
}

async function recordRefundDecision(
  db: DatabaseAdapter,
  input: {
    requestId: string;
    status: 'refunded' | 'declined';
    decidedBy: 'automatic' | 'operator';
    decidedByUserId: string | null;
    refundAmountCents: number | null;
    stripeRefundId: string | null;
    note: string | null;
  },
): Promise<RefundRequestRow | null> {
  const [row] = await db.query<RefundRequestRow>(
    `update public.billing_refund_requests
        set status = $2,
            decided_by = $3,
            decided_by_user_id = $4,
            refund_amount_cents = $5,
            stripe_refund_id = $6,
            decision_note = $7,
            decided_at = now(),
            updated_at = now()
      where id = $1 and status = 'pending'
      returning ${REQUEST_COLUMNS}`,
    [
      input.requestId,
      input.status,
      input.decidedBy,
      input.decidedByUserId,
      input.refundAmountCents,
      input.stripeRefundId,
      input.note,
    ],
  );
  return row ?? null;
}

async function notifyRefundDecision(db: DatabaseAdapter, row: RefundRequestRow): Promise<void> {
  const refunded = row.status === 'refunded';
  await recordNotification(db, {
    userId: row.user_id,
    category: 'billing',
    severity: refunded ? 'info' : 'warning',
    title: refunded ? 'Your refund is on its way' : 'Your refund request was declined',
    message: refunded
      ? 'We refunded your payment to the card you paid with. Your bank usually shows it within 5 to 10 business days.'
      : `We could not refund this payment. ${row.decision_note ?? ''}`.trim(),
    target: { kind: 'settings', id: 'billing' },
    dedupeKey: `refund-request:${row.id}:${row.status}`,
  });
}

async function endPlanAfterRefund(
  stripe: Stripe,
  subscriptionId: string | null,
  context: Record<string, unknown>,
): Promise<boolean> {
  if (!isStripeSubscriptionId(subscriptionId)) return false;
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    if (ENDED_SUBSCRIPTION_STATUSES.has(subscription.status)) return false;
    await stripe.subscriptions.cancel(subscriptionId, { prorate: false, invoice_now: false });
    return true;
  } catch (error) {
    logger.error(
      { ...context, error, subscriptionId },
      'Refunded plan could not be canceled in Stripe; the refund stands and the subscription needs an operator',
    );
    return false;
  }
}

export interface FileRefundRequestInput {
  db: DatabaseAdapter;
  stripe: Stripe;
  userId: string;
  customerId: string;
  subscriptionId: string | null;
  chargeId: string;
  reason: RefundRequestReason;
  details: string | null;
  now?: Date;
}

async function insertRefundRequest(
  input: FileRefundRequestInput,
  charge: Stripe.Charge,
  assessment: RefundAssessment,
): Promise<{ row: RefundRequestRow; created: boolean }> {
  try {
    const [row] = await input.db.query<RefundRequestRow>(
      `insert into public.billing_refund_requests (
         user_id, charge_id, charge_kind, charge_amount_cents, charge_currency,
         charge_created_at, reason, details, statutory_withdrawal, billing_country, assessment
       ) values ($1, $2, $3, $4, $5, to_timestamp($6), $7, $8, $9, $10, $11)
       returning ${REQUEST_COLUMNS}`,
      [
        input.userId,
        charge.id,
        chargeKindOf(charge),
        charge.amount,
        charge.currency,
        charge.created,
        input.reason,
        input.details,
        input.reason === 'statutory_withdrawal',
        billingCountryOf(charge),
        assessment,
      ],
    );
    if (!row) throw new Error('Refund request insert returned no row');
    return { row, created: true };
  } catch (error) {
    if ((error as { code?: string }).code !== '23505') throw error;
    const existing = await findRequestForCharge(input.db, input.userId, charge.id);
    if (!existing) throw error;
    return { row: existing, created: false };
  }
}

async function settleAutomatically(
  input: FileRefundRequestInput,
  row: RefundRequestRow,
  charge: Stripe.Charge,
): Promise<RefundRequestRow> {
  let refund: Stripe.Refund;
  try {
    refund = await input.stripe.refunds.create(
      {
        charge: charge.id,
        amount: refundableCentsOf(charge),
        reason: 'requested_by_customer',
        metadata: { refund_request_id: row.id, assessment: row.assessment },
      },
      { idempotencyKey: `refund-request:${row.id}` },
    );
  } catch (error) {
    logger.error(
      { error, requestId: row.id, chargeId: charge.id, userId: input.userId },
      'Automatic refund could not be issued; the request waits for an operator',
    );
    return row;
  }

  if (row.charge_kind === 'plan') {
    await endPlanAfterRefund(input.stripe, input.subscriptionId, {
      requestId: row.id,
      userId: input.userId,
    });
  }

  const ownerDb = getNeonDb();
  const decided = await recordRefundDecision(ownerDb, {
    requestId: row.id,
    status: 'refunded',
    decidedBy: 'automatic',
    decidedByUserId: null,
    refundAmountCents: refund.amount,
    stripeRefundId: refund.id,
    note: null,
  });
  if (!decided) return row;
  await notifyRefundDecision(ownerDb, decided);
  return decided;
}

export async function fileRefundRequest(
  input: FileRefundRequestInput,
): Promise<{ request: RefundRequestView; created: boolean }> {
  const existing = await findRequestForCharge(input.db, input.userId, input.chargeId);
  if (existing) return { request: toRefundRequestView(existing), created: false };

  const charge = await retrieveCharge(input.stripe, input.chargeId);
  if (!charge || customerIdOf(charge.customer) !== input.customerId) {
    throw new RefundRequestRefusal('That payment is not on your account.', 404);
  }
  if (charge.status !== 'succeeded' || !charge.paid) {
    throw new RefundRequestRefusal(
      'That payment did not complete, so there is nothing to refund.',
      409,
    );
  }
  if (charge.disputed) {
    throw new RefundRequestRefusal(
      'That payment is disputed with your bank, and the bank decides its outcome, so it cannot also be refunded here.',
      409,
    );
  }
  if (refundableCentsOf(charge) <= 0) {
    throw new RefundRequestRefusal('That payment has already been refunded.', 409);
  }

  const now = input.now ?? new Date();
  const [usage, priorDiscretionaryRefunds] = await Promise.all([
    readUsageFacts(input.db, input.userId),
    countDiscretionaryRefunds(input.db, input.userId),
  ]);
  const assessment = assessRefundRequest({
    charge,
    reason: input.reason,
    usage,
    priorDiscretionaryRefunds,
    now,
  });

  const { row, created } = await insertRefundRequest(input, charge, assessment);
  if (!created || row.assessment === 'needs_review') {
    return { request: toRefundRequestView(row), created };
  }
  const settled = await settleAutomatically(input, row, charge);
  return { request: toRefundRequestView(settled), created };
}

export async function listPendingRefundRequests(
  db: DatabaseAdapter,
): Promise<OperatorRefundRequestView[]> {
  const rows = await db.query<RefundRequestRow>(
    `select ${REQUEST_COLUMNS} from public.billing_refund_requests
      where status = 'pending'
      order by created_at asc
      limit ${OPERATOR_LIST_LIMIT}`,
  );
  return rows.map(toOperatorRequestView);
}

async function resolveOperatorQuery(
  db: DatabaseAdapter,
  stripe: Stripe,
  query: string,
): Promise<{ id: string; email: string | null; stripe_customer_id: string | null } | null> {
  let customerId: string | null = null;
  if (/^(ch|py)_[A-Za-z0-9]+$/.test(query)) {
    customerId = customerIdOf((await retrieveCharge(stripe, query))?.customer ?? null);
  } else if (/^pi_[A-Za-z0-9]+$/.test(query)) {
    customerId = customerIdOf((await stripe.paymentIntents.retrieve(query)).customer);
  } else if (isStripeCustomerId(query)) {
    customerId = query;
  }

  const [profile] = customerId
    ? await db.query<{ id: string; email: string | null; stripe_customer_id: string | null }>(
        'select id, email, stripe_customer_id from profiles where stripe_customer_id = $1 limit 1',
        [customerId],
      )
    : await db.query<{ id: string; email: string | null; stripe_customer_id: string | null }>(
        `select id, email, stripe_customer_id from profiles
          where id = $1 or lower(email) = lower($1)
          order by (id = $1) desc
          limit 1`,
        [query],
      );
  return profile ?? null;
}

export async function lookupAccountBilling(
  db: DatabaseAdapter,
  stripe: Stripe,
  rawQuery: string,
  now: Date = new Date(),
): Promise<OperatorAccountBilling | null> {
  const profile = await resolveOperatorQuery(db, stripe, rawQuery.trim());
  if (!profile) return null;

  const [subscription] = await db.query<{
    plan_tier: string | null;
    status: string | null;
    stripe_customer_id: string | null;
  }>('select plan_tier, status, stripe_customer_id from subscriptions where user_id = $1 limit 1', [
    profile.id,
  ]);
  const customerId = isStripeCustomerId(profile.stripe_customer_id)
    ? profile.stripe_customer_id
    : isStripeCustomerId(subscription?.stripe_customer_id)
      ? subscription.stripe_customer_id
      : null;

  const [charges, requests, disputes] = await Promise.all([
    customerId ? listCustomerCharges(stripe, customerId) : Promise.resolve([]),
    db.query<RefundRequestRow>(
      `select ${REQUEST_COLUMNS} from public.billing_refund_requests
        where user_id = $1 order by created_at desc limit ${OPERATOR_LIST_LIMIT}`,
      [profile.id],
    ),
    db.query<DisputeRow>(
      `select id, charge_id, amount_cents, currency, reason, stripe_status, outcome,
              opened_at, closed_at, restored_at
         from public.billing_disputes
        where user_id = $1
        order by opened_at desc
        limit ${OPERATOR_LIST_LIMIT}`,
      [profile.id],
    ),
  ]);

  return {
    userId: profile.id,
    email: profile.email,
    stripeCustomerId: customerId,
    planTier: subscription?.plan_tier ?? null,
    subscriptionStatus: subscription?.status ?? null,
    charges: charges.map((charge) => toRefundableChargeView(charge, now)),
    requests: requests.map(toOperatorRequestView),
    disputes: disputes.map(toDisputeView),
  };
}

export interface OperatorRefundInput {
  operatorUserId: string;
  chargeId: string;
  amountCents: number | null;
  note: string;
  stripeReason: OperatorRefundStripeReason;
  requestId: string | null;
  endPlan: boolean;
  idempotencyKey: string;
}

export interface OperatorRefundResult {
  refundId: string;
  refundStatus: string | null;
  amountCents: number;
  currency: string;
  userId: string | null;
  planEnded: boolean;
  request: OperatorRefundRequestView | null;
}

export async function issueOperatorRefund(
  db: DatabaseAdapter,
  stripe: Stripe,
  input: OperatorRefundInput,
): Promise<OperatorRefundResult> {
  const charge = await retrieveCharge(stripe, input.chargeId);
  if (!charge) throw new RefundRequestRefusal('No payment has that charge id.', 404);
  if (charge.disputed) {
    throw new RefundRequestRefusal(
      'This payment is disputed. Stripe does not allow a refund while the dispute is open; answer or accept the dispute instead.',
      409,
    );
  }
  const refundable = refundableCentsOf(charge);
  const amountCents = input.amountCents ?? refundable;
  if (refundable <= 0) throw new RefundRequestRefusal('This payment is already refunded.', 409);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > refundable) {
    throw new RefundRequestRefusal(
      `The refund must be between 1 and ${refundable} in the smallest currency unit.`,
      400,
    );
  }

  const customerId = customerIdOf(charge.customer);
  const [owner] = customerId
    ? await db.query<{ user_id: string; stripe_subscription_id: string | null }>(
        `select profile.id as user_id, subscription.stripe_subscription_id
           from profiles profile
           left join subscriptions subscription on subscription.user_id = profile.id
          where profile.stripe_customer_id = $1
          limit 1`,
        [customerId],
      )
    : [];

  if (input.requestId) {
    const [pending] = await db.query<{ charge_id: string; status: string }>(
      'select charge_id, status from public.billing_refund_requests where id = $1',
      [input.requestId],
    );
    if (!pending || pending.charge_id !== charge.id || pending.status !== 'pending') {
      throw new RefundRequestRefusal('That refund request is not pending for this payment.', 409);
    }
  }

  const refund = await stripe.refunds.create(
    {
      charge: charge.id,
      amount: amountCents,
      reason: input.stripeReason,
      metadata: {
        operator_user_id: input.operatorUserId,
        ...(input.requestId ? { refund_request_id: input.requestId } : {}),
      },
    },
    { idempotencyKey: `operator-refund:${charge.id}:${input.idempotencyKey}` },
  );

  const planEnded =
    input.endPlan && chargeKindOf(charge) === 'plan'
      ? await endPlanAfterRefund(stripe, owner?.stripe_subscription_id ?? null, {
          chargeId: charge.id,
          operatorUserId: input.operatorUserId,
        })
      : false;

  let request: OperatorRefundRequestView | null = null;
  if (input.requestId) {
    const decided = await recordRefundDecision(db, {
      requestId: input.requestId,
      status: 'refunded',
      decidedBy: 'operator',
      decidedByUserId: input.operatorUserId,
      refundAmountCents: refund.amount,
      stripeRefundId: refund.id,
      note: input.note,
    });
    if (decided) {
      await notifyRefundDecision(db, decided);
      request = toOperatorRequestView(decided);
    }
  }

  return {
    refundId: refund.id,
    refundStatus: refund.status ?? null,
    amountCents: refund.amount,
    currency: refund.currency,
    userId: owner?.user_id ?? null,
    planEnded,
    request,
  };
}

export async function declineRefundRequest(
  db: DatabaseAdapter,
  input: { operatorUserId: string; requestId: string; note: string },
): Promise<OperatorRefundRequestView> {
  const decided = await recordRefundDecision(db, {
    requestId: input.requestId,
    status: 'declined',
    decidedBy: 'operator',
    decidedByUserId: input.operatorUserId,
    refundAmountCents: null,
    stripeRefundId: null,
    note: input.note,
  });
  if (!decided) throw new RefundRequestRefusal('That refund request is no longer pending.', 409);
  await notifyRefundDecision(db, decided);
  return toOperatorRequestView(decided);
}
