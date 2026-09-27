import 'server-only';

export const PAYMENT_PROVIDER_IDS = ['stripe', 'apple', 'google'] as const;

export type PaymentProviderId = (typeof PAYMENT_PROVIDER_IDS)[number];

export type NormalizedSubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid'
  | 'none';

export type NormalizedPurchaseState =
  'paid' | 'confirmed' | 'processing' | 'expired' | 'revoked' | 'unpaid';

export type NormalizedEnvironment = 'production' | 'sandbox';

export interface NormalizedMoney {
  currency: string;
  minorUnits: number;
}

export interface NormalizedPeriod {
  startsAt: Date;
  endsAt: Date;
}

export interface NormalizedInterval {
  unit: 'day' | 'week' | 'month' | 'year';
  count: number;
}

export interface NormalizedPlanReference {
  productReference: string | null;
  priceReference: string | null;
}

export interface NormalizedSubscription {
  provider: PaymentProviderId;
  subscriptionReference: string;
  customerReference: string | null;
  ownerReference: string | null;
  plan: NormalizedPlanReference;
  status: NormalizedSubscriptionStatus;
  period: NormalizedPeriod | null;
  interval: NormalizedInterval | null;
  quantity: number;
  cancelAtPeriodEnd: boolean;
  endedAt: Date | null;
  environment: NormalizedEnvironment;
}

export interface NormalizedPurchase {
  provider: PaymentProviderId;
  purchaseReference: string;
  ownerReference: string | null;
  plan: NormalizedPlanReference;
  planTier: string | null;
  state: NormalizedPurchaseState;
  purchasedAt: Date | null;
  expiresAt: Date | null;
  quantity: number;
  amount: NormalizedMoney | null;
  environment: NormalizedEnvironment;
}

export type NormalizedPaymentStatus =
  | 'succeeded'
  | 'processing'
  | 'requires_action'
  | 'requires_payment_method'
  | 'requires_confirmation'
  | 'requires_capture'
  | 'canceled'
  | 'unknown';

export interface NormalizedPayment {
  reference: string;
  status: NormalizedPaymentStatus;
  amountReceived: NormalizedMoney | null;
  metadata: Readonly<Record<string, string>>;
  failureCode: string | null;
  declineCode: string | null;
}

export interface NormalizedCard {
  reference: string;
  brand: string;
  last4: string;
}

export interface NormalizedBillingInstrument {
  currency: string | null;
  card: NormalizedCard | null;
  billingEmail: string | null;
}

export interface NormalizedTaxCalculation {
  reference: string;
  total: NormalizedMoney;
  taxMinorUnits: number;
  country: string | null;
}

export type TaxCalculationResult =
  | { outcome: 'calculated'; calculation: NormalizedTaxCalculation }
  | { outcome: 'location_missing' };

export interface OffSessionChargeInput {
  customerReference: string;
  paymentMethodReference: string;
  amount: NormalizedMoney;
  description: string;
  metadata: Readonly<Record<string, string>>;
  receiptEmail: string | null;
  taxCalculationReference: string;
  idempotencyKey: string;
}

export type OffSessionChargeResult =
  | { outcome: 'created'; payment: NormalizedPayment }
  | {
      outcome: 'declined';
      payment: NormalizedPayment | null;
      failureCode: string | null;
      declineCode: string | null;
    }
  | { outcome: 'rejected'; code: string | null; message: string }
  | { outcome: 'unknown'; error: unknown };

export type NormalizedChargeAttributionKind = 'subscription' | 'top_up';

export interface NormalizedChargeAttribution {
  kind: NormalizedChargeAttributionKind;
  reference: string;
  ownerReference: string | null;
}

export interface NormalizedBalanceEntry {
  reference: string;
  type: string;
  occurredAt: Date;
  currency: string;
  amountMinorUnits: number;
  feeMinorUnits: number;
  chargeReference: string | null;
  attribution: NormalizedChargeAttribution | null;
}

export interface NormalizedInvoiceDiscount {
  invoiceReference: string;
  occurredAt: Date;
  currency: string;
  discountMinorUnits: number;
  discountReferences: string[];
}

export interface NormalizedCostActivity {
  balanceEntries: NormalizedBalanceEntry[];
  invoiceDiscounts: NormalizedInvoiceDiscount[];
}

export interface NormalizedCharge {
  reference: string;
  paymentReference: string | null;
  customerReference: string | null;
  kind: NormalizedChargeAttributionKind;
  amount: NormalizedMoney;
  refundedMinorUnits: number;
  createdAt: Date;
  settled: boolean;
  disputed: boolean;
  billingCountry: string | null;
  cardCountry: string | null;
  receiptUrl: string | null;
  purchasedLedgerCents: number | null;
}

export type NormalizedRefundReason = 'requested_by_customer' | 'duplicate' | 'fraudulent';

export interface NormalizedRefund {
  reference: string;
  status: string | null;
  amount: NormalizedMoney;
}

export interface ChargeRefundInput {
  chargeReference: string;
  amountMinorUnits: number;
  reason: NormalizedRefundReason;
  metadata: Readonly<Record<string, string>>;
  idempotencyKey: string;
}

export type ChargeRefundResult =
  { outcome: 'refunded'; refund: NormalizedRefund } | { outcome: 'rejected'; code: string | null };

export interface PurchaseVerificationInput {
  reference: string;
  ownerReference?: string | null;
  productReference?: string | null;
}

export interface PaymentProviderCapabilities {
  /** The provider answers a server-side read for a bare subscription reference. */
  readonly pollsSubscriptionState: boolean;
  /** The provider hosts the portal a customer manages their own billing in. */
  readonly hostedBillingPortal: boolean;
}

/**
 * The one boundary every payment integration crosses. Everything above it sees
 * only the normalized objects in this file: no Stripe, Apple or Google SDK type
 * is a domain object, and time, currency, quantity and status are normalized by
 * `./normalize` for all three providers rather than per integration.
 */
export interface PaymentProvider {
  readonly id: PaymentProviderId;
  readonly capabilities: PaymentProviderCapabilities;
  verifyPurchase(input: PurchaseVerificationInput): Promise<NormalizedPurchase>;
}

/**
 * A provider whose subscription state can be read back from a reference alone.
 * The stores are not: Apple and Google push signed state and answer only for a
 * purchase token paired with the catalog product it was bought against, so a
 * caller must branch on the capability rather than call and handle a null.
 */
export interface PollablePaymentProvider extends PaymentProvider {
  readonly capabilities: PaymentProviderCapabilities & { readonly pollsSubscriptionState: true };
  readSubscription(reference: string): Promise<NormalizedSubscription | null>;
}

export function pollsSubscriptionState(
  provider: PaymentProvider,
): provider is PollablePaymentProvider {
  return provider.capabilities.pollsSubscriptionState;
}

export function isPaymentProviderId(value: unknown): value is PaymentProviderId {
  return typeof value === 'string' && PAYMENT_PROVIDER_IDS.includes(value as PaymentProviderId);
}
