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
