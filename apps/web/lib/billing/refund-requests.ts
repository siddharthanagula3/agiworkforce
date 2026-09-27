export const STATUTORY_WITHDRAWAL_DAYS = 14;
export const UNUSED_REFUND_WINDOW_DAYS = 7;

export const REFUND_REQUEST_REASONS = [
  'accidental_purchase',
  'not_as_expected',
  'technical_problem',
  'duplicate_charge',
  'unrecognized_charge',
  'statutory_withdrawal',
  'other',
] as const;
export type RefundRequestReason = (typeof REFUND_REQUEST_REASONS)[number];

export const REFUND_REQUEST_REASON_LABELS: Readonly<Record<RefundRequestReason, string>> = {
  accidental_purchase: 'I bought this by mistake',
  not_as_expected: 'It did not do what I expected',
  technical_problem: 'A technical problem stopped me using it',
  duplicate_charge: 'I was charged twice',
  unrecognized_charge: 'I do not recognize this charge',
  statutory_withdrawal: 'I am withdrawing within 14 days (EU, EEA or UK)',
  other: 'Something else',
};

export const BILLING_ERROR_REASONS: ReadonlySet<RefundRequestReason> = new Set([
  'duplicate_charge',
  'unrecognized_charge',
]);

export function isRefundRequestReason(value: unknown): value is RefundRequestReason {
  return typeof value === 'string' && (REFUND_REQUEST_REASONS as readonly string[]).includes(value);
}

export type RefundChargeKind = 'plan' | 'top_up';
export type RefundAssessment = 'statutory_withdrawal' | 'unused_within_policy' | 'needs_review';
export type RefundRequestStatus = 'pending' | 'refunded' | 'declined';
export const OPERATOR_REFUND_STRIPE_REASONS = [
  'requested_by_customer',
  'duplicate',
  'fraudulent',
] as const;
export type OperatorRefundStripeReason = (typeof OPERATOR_REFUND_STRIPE_REASONS)[number];

export interface RefundableChargeView {
  id: string;
  kind: RefundChargeKind;
  amountCents: number;
  refundedCents: number;
  refundableCents: number;
  currency: string;
  createdAt: string;
  billingCountry: string | null;
  disputed: boolean;
  withdrawalEligible: boolean;
  withdrawalRefundCents: number | null;
  receiptUrl: string | null;
}

export interface RefundRequestView {
  id: string;
  chargeId: string;
  chargeKind: RefundChargeKind;
  chargeAmountCents: number;
  chargeCurrency: string;
  chargeCreatedAt: string;
  reason: RefundRequestReason;
  details: string | null;
  assessment: RefundAssessment;
  assessedRefundCents: number | null;
  status: RefundRequestStatus;
  refundAmountCents: number | null;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface RefundRequestsResponse {
  requests: RefundRequestView[];
  charges: RefundableChargeView[];
}

export interface OperatorRefundRequestView extends RefundRequestView {
  userId: string;
  billingCountry: string | null;
  statutoryWithdrawal: boolean;
}

export interface OperatorDisputeView {
  id: string;
  chargeId: string;
  amountCents: number;
  currency: string;
  reason: string | null;
  stripeStatus: string;
  outcome: 'open' | 'won' | 'lost';
  openedAt: string;
  closedAt: string | null;
  restoredAt: string | null;
}

export interface OperatorAccountBilling {
  userId: string;
  email: string | null;
  stripeCustomerId: string | null;
  planTier: string | null;
  subscriptionStatus: string | null;
  charges: RefundableChargeView[];
  requests: OperatorRefundRequestView[];
  disputes: OperatorDisputeView[];
}

export function paymentFractionDigits(currency: string): number {
  return (
    new Intl.NumberFormat('en', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).resolvedOptions().maximumFractionDigits ?? 2
  );
}

export function formatPaymentAmount(amount: number, currency: string): string {
  const code = currency.toUpperCase();
  return (amount / 10 ** paymentFractionDigits(code)).toLocaleString(undefined, {
    style: 'currency',
    currency: code,
  });
}
