import type Stripe from 'stripe';
import {
  MOBILE_IAP_PRODUCT_DEFINITIONS,
  TOP_UP_CONVERSION,
  quoteTopUp,
  type MobileIapCatalogProduct,
} from '@agiworkforce/types';
import type { MobileIapEntitlementState } from '@/lib/server/mobile-iap-lifecycle';
import {
  hashMobileIapPurchaseToken,
  type VerifiedMobileIapPurchase,
} from '@/lib/server/mobile-iap-store-verification';
import type { MobileIapLifecycleEvent } from '../mobile-iap-notification-service';

export const REPLAY_USER_ID = 'ledger-replay-user';
export const REPLAY_EMAIL = 'ledger-replay@example.test';
export const REPLAY_PRICES = {
  pro: 'price_ledgerReplayPro',
  max: 'price_ledgerReplayMax',
} as const;

const CUSTOMER = 'cus_ledgerReplay';
const SUBSCRIPTION = 'sub_ledgerReplay';
const PLAN_PAYMENT_INTENT = 'pi_ledgerReplayPlan';
const PLAN_CHARGE = 'ch_ledgerReplayPlan';
const PLAN_CHARGE_CENTS = 2_000;
const DAY_SECONDS = 86_400;

type ReplayPlan = keyof typeof REPLAY_PRICES;

export interface ReplayClock {
  unix(days: number, seconds?: number): number;
  at(days: number, seconds?: number): Date;
}

export function replayClock(anchorSeconds: number): ReplayClock {
  const unix = (days: number, seconds = 0) => anchorSeconds + days * DAY_SECONDS + seconds;
  return { unix, at: (days, seconds = 0) => new Date(unix(days, seconds) * 1000) };
}

export interface StripeEdge {
  subscriptions?: Stripe.Subscription[];
  sessions?: Stripe.Checkout.Session[];
  paymentIntents?: Stripe.PaymentIntent[];
  charges?: Stripe.Charge[];
  invoicePayments?: { paymentIntent: string; payments: Stripe.InvoicePayment[] }[];
}

export type ReplayStep = { label: string; stripe?: StripeEdge } & (
  | { via: 'upsertSubscriptionFromSession'; session: Stripe.Checkout.Session }
  | { via: 'handleCreditTopUp'; session: Stripe.Checkout.Session }
  | {
      via: 'updateSubscriptionFromStripeSubscription';
      subscription: Stripe.Subscription;
      eventCreated: number;
    }
  | { via: 'handleAutoReloadEvent'; event: Stripe.Event }
  | { via: 'handleChargeRefunded'; charge: Stripe.Charge }
  | { via: 'handleDisputeCreated'; dispute: Stripe.Dispute; charge: Stripe.Charge }
  | { via: 'handleDisputeOutcome'; dispute: Stripe.Dispute; eventCreated: number }
  | {
      via: 'recordVerifiedMobileIapPurchase';
      purchaseToken: string;
      verified: VerifiedMobileIapPurchase;
    }
  | { via: 'processMobileIapLifecycleEvent'; event: MobileIapLifecycleEvent }
);

export interface ScenarioInput {
  clock: ReplayClock;
  appAccountToken: string;
}

export interface LedgerScenario {
  name: string;
  steps(input: ScenarioInput): ReplayStep[];
}

class StripeResourceMissing extends Error {
  readonly code = 'resource_missing';
}

function copy<T>(value: T): T {
  return structuredClone(value);
}

function found<T>(store: Map<string, T>, id: string): T {
  const value = store.get(id);
  if (value === undefined) throw new StripeResourceMissing(`No such Stripe object: ${id}`);
  return copy(value);
}

function applyMetadata(
  current: Stripe.Metadata,
  changes: Record<string, string> | undefined,
): Stripe.Metadata {
  const next = { ...current };
  for (const [key, value] of Object.entries(changes ?? {})) {
    if (value === '') delete next[key];
    else next[key] = value;
  }
  return next;
}

export class ReplayStripe {
  private readonly subscriptions = new Map<string, Stripe.Subscription>();
  private readonly sessions = new Map<string, Stripe.Checkout.Session>();
  private readonly paymentIntents = new Map<string, Stripe.PaymentIntent>();
  private readonly charges = new Map<string, Stripe.Charge>();
  private readonly invoicePayments = new Map<string, Stripe.InvoicePayment[]>();

  remember(edge: StripeEdge | undefined): void {
    for (const subscription of edge?.subscriptions ?? [])
      this.subscriptions.set(subscription.id, copy(subscription));
    for (const session of edge?.sessions ?? []) this.sessions.set(session.id, copy(session));
    for (const intent of edge?.paymentIntents ?? [])
      this.paymentIntents.set(intent.id, copy(intent));
    for (const charge of edge?.charges ?? []) this.charges.set(charge.id, copy(charge));
    for (const entry of edge?.invoicePayments ?? [])
      this.invoicePayments.set(entry.paymentIntent, copy(entry.payments));
  }

  readonly client = {
    subscriptions: {
      retrieve: async (id: string) => found(this.subscriptions, id),
      update: async (
        id: string,
        params: { pause_collection?: unknown; metadata?: Record<string, string> },
      ) => {
        const current = found(this.subscriptions, id);
        const next = {
          ...current,
          pause_collection:
            params.pause_collection === undefined
              ? current.pause_collection
              : params.pause_collection === ''
                ? null
                : (params.pause_collection as Stripe.Subscription.PauseCollection),
          metadata: applyMetadata(current.metadata, params.metadata),
        };
        this.subscriptions.set(id, next);
        return copy(next);
      },
      cancel: async (id: string) => {
        const next = { ...found(this.subscriptions, id), status: 'canceled' as const };
        this.subscriptions.set(id, next);
        return copy(next);
      },
    },
    checkout: { sessions: { retrieve: async (id: string) => found(this.sessions, id) } },
    paymentIntents: { retrieve: async (id: string) => found(this.paymentIntents, id) },
    charges: { retrieve: async (id: string) => found(this.charges, id) },
    customers: {
      retrieve: async (id: string) => ({ id, object: 'customer', email: REPLAY_EMAIL }),
    },
    invoicePayments: {
      list: async (params: { payment: { payment_intent: string } }) => ({
        object: 'list',
        has_more: false,
        data: copy(this.invoicePayments.get(params.payment.payment_intent) ?? []),
      }),
    },
  } as unknown as Stripe;
}

function stripeSubscription(input: {
  plan: ReplayPlan;
  start: number;
  end: number;
  cancelAtPeriodEnd?: boolean;
}): Stripe.Subscription {
  return {
    id: SUBSCRIPTION,
    object: 'subscription',
    customer: CUSTOMER,
    status: 'active',
    cancel_at_period_end: input.cancelAtPeriodEnd ?? false,
    canceled_at: null,
    pending_update: null,
    pause_collection: null,
    discounts: [],
    metadata: { user_id: REPLAY_USER_ID },
    items: {
      object: 'list',
      has_more: false,
      data: [
        {
          id: `si_ledgerReplay${input.plan}`,
          quantity: 1,
          price: { id: REPLAY_PRICES[input.plan], product: 'prod_ledgerReplay' },
          current_period_start: input.start,
          current_period_end: input.end,
        },
      ],
    },
  } as unknown as Stripe.Subscription;
}

function checkoutSession(plan: ReplayPlan): Stripe.Checkout.Session {
  return {
    id: `cs_test_ledgerReplay${plan}`,
    object: 'checkout.session',
    customer: CUSTOMER,
    subscription: SUBSCRIPTION,
    mode: 'subscription',
    payment_status: 'paid',
    currency: 'usd',
    automatic_tax: { enabled: false, status: null },
    metadata: { user_id: REPLAY_USER_ID },
    line_items: {
      object: 'list',
      has_more: false,
      data: [{ quantity: 1, price: { id: REPLAY_PRICES[plan] } }],
    },
  } as unknown as Stripe.Checkout.Session;
}

function subscribeOnStripe(
  plan: ReplayPlan,
  period: { start: number; end: number },
  clock: ReplayClock,
): ReplayStep[] {
  const subscription = stripeSubscription({ plan, ...period });
  const session = checkoutSession(plan);
  return [
    {
      label: 'customer.subscription.created',
      via: 'updateSubscriptionFromStripeSubscription',
      subscription,
      eventCreated: clock.unix(0),
      stripe: { subscriptions: [subscription] },
    },
    {
      label: 'checkout.session.completed',
      via: 'upsertSubscriptionFromSession',
      session,
      stripe: { subscriptions: [subscription], sessions: [session] },
    },
  ];
}

function subscriptionChange(
  label: string,
  subscription: Stripe.Subscription,
  eventCreated: number,
): ReplayStep {
  return {
    label,
    via: 'updateSubscriptionFromStripeSubscription',
    subscription,
    eventCreated,
    stripe: { subscriptions: [subscription] },
  };
}

interface TopUpPurchase {
  id: string;
  amountUsd: number;
  country: string;
}

function topUpMetadata(amountUsd: number, autoReload: boolean): Record<string, string> {
  const quote = quoteTopUp(amountUsd, { autoReload });
  if (!quote) throw new Error(`No top-up quote for $${amountUsd}`);
  return {
    type: 'credit_topup',
    user_id: REPLAY_USER_ID,
    conversion: TOP_UP_CONVERSION,
    amount_usd: String(quote.amountUsd),
    top_up_units: String(quote.credits),
    credit_amount_cents: String(quote.budgetCents),
    price_cents: String(quote.priceCents),
    ...(autoReload ? { auto_reload: 'true' } : {}),
  };
}

function topUpPriceCents(amountUsd: number, autoReload = false): number {
  const quote = quoteTopUp(amountUsd, { autoReload });
  if (!quote) throw new Error(`No top-up quote for $${amountUsd}`);
  return quote.priceCents;
}

function stripeTopUp(purchase: TopUpPurchase): ReplayStep {
  const priceCents = topUpPriceCents(purchase.amountUsd);
  const paymentIntent = {
    id: `pi_${purchase.id}`,
    object: 'payment_intent',
    status: 'succeeded',
    currency: 'usd',
    amount_received: priceCents,
  } as unknown as Stripe.PaymentIntent;
  const session = {
    id: `cs_test_${purchase.id}`,
    object: 'checkout.session',
    customer: CUSTOMER,
    mode: 'payment',
    payment_status: 'paid',
    payment_intent: paymentIntent.id,
    currency: 'usd',
    amount_subtotal: priceCents,
    amount_total: priceCents,
    automatic_tax: { enabled: false, status: null },
    customer_details: { address: { country: purchase.country } },
    metadata: topUpMetadata(purchase.amountUsd, false),
  } as unknown as Stripe.Checkout.Session;
  return {
    label: 'checkout.session.completed (top-up)',
    via: 'handleCreditTopUp',
    session,
    stripe: { paymentIntents: [paymentIntent] },
  };
}

function topUpCharge(purchase: TopUpPurchase, refundedCents: number): Stripe.Charge {
  const priceCents = topUpPriceCents(purchase.amountUsd);
  return {
    id: `ch_${purchase.id}`,
    object: 'charge',
    customer: CUSTOMER,
    payment_intent: `pi_${purchase.id}`,
    amount: priceCents,
    amount_refunded: refundedCents,
    refunded: refundedCents >= priceCents,
    metadata: topUpMetadata(purchase.amountUsd, false),
  } as unknown as Stripe.Charge;
}

function planCharge(refundedCents: number): Stripe.Charge {
  return {
    id: PLAN_CHARGE,
    object: 'charge',
    customer: CUSTOMER,
    payment_intent: PLAN_PAYMENT_INTENT,
    amount: PLAN_CHARGE_CENTS,
    amount_refunded: refundedCents,
    refunded: refundedCents >= PLAN_CHARGE_CENTS,
    metadata: {},
  } as unknown as Stripe.Charge;
}

function planInvoicePayments(periodEnd: number): StripeEdge['invoicePayments'] {
  return [
    {
      paymentIntent: PLAN_PAYMENT_INTENT,
      payments: [
        {
          id: 'inpay_ledgerReplay',
          object: 'invoice_payment',
          status: 'paid',
          amount_paid: PLAN_CHARGE_CENTS,
          payment: { type: 'payment_intent', payment_intent: PLAN_PAYMENT_INTENT },
          invoice: {
            id: 'in_ledgerReplay',
            object: 'invoice',
            customer: CUSTOMER,
            status: 'paid',
            amount_paid: PLAN_CHARGE_CENTS,
            amount_remaining: 0,
            parent: { subscription_details: { subscription: SUBSCRIPTION } },
            lines: { object: 'list', has_more: false, data: [{ period: { end: periodEnd } }] },
          },
        } as unknown as Stripe.InvoicePayment,
      ],
    },
  ];
}

function planRefund(label: string, refundedCents: number, periodEnd: number): ReplayStep {
  return {
    label,
    via: 'handleChargeRefunded',
    charge: planCharge(refundedCents),
    stripe: { invoicePayments: planInvoicePayments(periodEnd) },
  };
}

function dispute(status: Stripe.Dispute.Status, created: number): Stripe.Dispute {
  return {
    id: 'dp_ledgerReplay',
    object: 'dispute',
    charge: PLAN_CHARGE,
    amount: PLAN_CHARGE_CENTS,
    currency: 'usd',
    reason: 'fraudulent',
    status,
    created,
  } as unknown as Stripe.Dispute;
}

function midPeriod(clock: ReplayClock): { start: number; end: number } {
  return { start: clock.unix(-10), end: clock.unix(20) };
}

function endingPeriod(clock: ReplayClock): { start: number; end: number } {
  return { start: clock.unix(-30), end: clock.unix(0) };
}

function nextPeriod(clock: ReplayClock): { start: number; end: number } {
  return { start: clock.unix(0), end: clock.unix(30) };
}

const STRIPE_TOP_UP: TopUpPurchase = { id: 'ledgerReplayTopUp', amountUsd: 50, country: 'US' };

function openDispute(clock: ReplayClock): ReplayStep[] {
  return [
    ...subscribeOnStripe('pro', midPeriod(clock), clock),
    stripeTopUp(STRIPE_TOP_UP),
    {
      label: 'charge.dispute.created',
      via: 'handleDisputeCreated',
      dispute: dispute('needs_response', clock.unix(0, 60)),
      charge: planCharge(0),
      stripe: { charges: [planCharge(0)] },
    },
  ];
}

const STRIPE_SCENARIOS: LedgerScenario[] = [
  {
    name: 'stripe checkout',
    steps: ({ clock }) => subscribeOnStripe('pro', midPeriod(clock), clock),
  },
  {
    name: 'stripe renewal',
    steps: ({ clock }) => [
      ...subscribeOnStripe('pro', endingPeriod(clock), clock),
      subscriptionChange(
        'invoice.paid (renewal)',
        stripeSubscription({ plan: 'pro', ...nextPeriod(clock) }),
        clock.unix(0, 60),
      ),
    ],
  },
  {
    name: 'stripe upgrade',
    steps: ({ clock }) => [
      ...subscribeOnStripe('pro', midPeriod(clock), clock),
      subscriptionChange(
        'customer.subscription.updated (upgrade to max)',
        stripeSubscription({ plan: 'max', ...nextPeriod(clock) }),
        clock.unix(0, 60),
      ),
    ],
  },
  {
    name: 'stripe downgrade',
    steps: ({ clock }) => [
      ...subscribeOnStripe('max', endingPeriod(clock), clock),
      subscriptionChange(
        'invoice.paid (downgrade to pro)',
        stripeSubscription({ plan: 'pro', ...nextPeriod(clock) }),
        clock.unix(0, 60),
      ),
    ],
  },
  {
    name: 'stripe out-of-order update',
    steps: ({ clock }) => [
      ...subscribeOnStripe('pro', midPeriod(clock), clock),
      subscriptionChange(
        'customer.subscription.updated (cancel at period end, newer)',
        stripeSubscription({ plan: 'pro', ...midPeriod(clock), cancelAtPeriodEnd: true }),
        clock.unix(0, 120),
      ),
      subscriptionChange(
        'customer.subscription.updated (renewing, older)',
        stripeSubscription({ plan: 'pro', ...midPeriod(clock) }),
        clock.unix(0, 60),
      ),
    ],
  },
  {
    name: 'stripe top-up',
    steps: ({ clock }) => [
      ...subscribeOnStripe('pro', midPeriod(clock), clock),
      stripeTopUp({ id: 'ledgerReplayTopUp', amountUsd: 20, country: 'US' }),
    ],
  },
  {
    name: 'stripe top-up bought in Japan',
    steps: ({ clock }) => [
      ...subscribeOnStripe('pro', midPeriod(clock), clock),
      stripeTopUp({ id: 'ledgerReplayTopUpJp', amountUsd: 50, country: 'JP' }),
    ],
  },
  {
    name: 'stripe auto-reload top-up',
    steps: ({ clock }) => {
      const priceCents = topUpPriceCents(20, true);
      const intent = {
        id: 'pi_ledgerReplayAutoReload',
        object: 'payment_intent',
        status: 'succeeded',
        currency: 'usd',
        amount_received: priceCents,
        metadata: {
          ...topUpMetadata(20, true),
          auto_reload_attempt_id: '00000000-0000-4000-8000-00000000a001',
          tax_cents: '0',
          billing_country: 'US',
        },
      } as unknown as Stripe.PaymentIntent;
      return [
        ...subscribeOnStripe('pro', midPeriod(clock), clock),
        {
          label: 'payment_intent.succeeded (auto-reload)',
          via: 'handleAutoReloadEvent',
          event: {
            id: 'evt_ledgerReplayAutoReload',
            object: 'event',
            type: 'payment_intent.succeeded',
            created: clock.unix(0, 60),
            data: { object: intent },
          } as unknown as Stripe.Event,
        },
      ];
    },
  },
  {
    name: 'stripe partial refund of a top-up',
    steps: ({ clock }) => [
      ...subscribeOnStripe('pro', midPeriod(clock), clock),
      stripeTopUp(STRIPE_TOP_UP),
      {
        label: 'charge.refunded (part of the top-up)',
        via: 'handleChargeRefunded',
        charge: topUpCharge(STRIPE_TOP_UP, Math.floor(topUpPriceCents(50) / 3)),
      },
    ],
  },
  {
    name: 'stripe full refund of a top-up',
    steps: ({ clock }) => [
      ...subscribeOnStripe('pro', midPeriod(clock), clock),
      stripeTopUp(STRIPE_TOP_UP),
      {
        label: 'charge.refunded (whole top-up)',
        via: 'handleChargeRefunded',
        charge: topUpCharge(STRIPE_TOP_UP, topUpPriceCents(50)),
      },
    ],
  },
  {
    name: 'stripe partial refund of a plan',
    steps: ({ clock }) => [
      ...subscribeOnStripe('pro', midPeriod(clock), clock),
      planRefund('charge.refunded (part of the plan)', PLAN_CHARGE_CENTS / 4, midPeriod(clock).end),
    ],
  },
  {
    name: 'stripe full refund of a plan',
    steps: ({ clock }) => [
      ...subscribeOnStripe('pro', midPeriod(clock), clock),
      planRefund('charge.refunded (whole plan)', PLAN_CHARGE_CENTS, midPeriod(clock).end),
    ],
  },
  {
    name: 'stripe dispute opened',
    steps: ({ clock }) => openDispute(clock),
  },
  {
    name: 'stripe dispute won',
    steps: ({ clock }) => [
      ...openDispute(clock),
      {
        label: 'charge.dispute.closed (won)',
        via: 'handleDisputeOutcome',
        dispute: dispute('won', clock.unix(0, 60)),
        eventCreated: clock.unix(0, 120),
      },
    ],
  },
  {
    name: 'stripe dispute lost',
    steps: ({ clock }) => [
      ...openDispute(clock),
      {
        label: 'charge.dispute.closed (lost)',
        via: 'handleDisputeOutcome',
        dispute: dispute('lost', clock.unix(0, 60)),
        eventCreated: clock.unix(0, 120),
      },
    ],
  },
];

function catalogProduct(
  match: (definition: (typeof MOBILE_IAP_PRODUCT_DEFINITIONS)[number]) => boolean,
  productId: string,
): MobileIapCatalogProduct {
  const definition = MOBILE_IAP_PRODUCT_DEFINITIONS.find(match);
  if (!definition) throw new Error(`No store product for ${productId}`);
  return { ...definition, productId };
}

const STORE_PRO = catalogProduct(
  (item) => item.kind === 'subscription' && item.planTier === 'pro',
  'ledger.replay.pro',
);
const STORE_MAX = catalogProduct(
  (item) => item.kind === 'subscription' && item.planTier === 'max',
  'ledger.replay.max',
);
const STORE_TOP_UP = catalogProduct(
  (item) => item.kind === 'top_up' && item.amountUsd === 20,
  'ledger.replay.top_up_20',
);

interface StorePeriod {
  start: Date;
  end: Date;
}

function storeMidPeriod(clock: ReplayClock): StorePeriod {
  return { start: clock.at(-10), end: clock.at(20) };
}

function storeEndingPeriod(clock: ReplayClock): StorePeriod {
  return { start: clock.at(-30), end: clock.at(0) };
}

function storeNextPeriod(clock: ReplayClock): StorePeriod {
  return { start: clock.at(0), end: clock.at(30) };
}

interface AppleTransaction {
  id: string;
  product: MobileIapCatalogProduct;
  period: StorePeriod;
  originalTransactionId?: string;
}

const APPLE_ORIGINAL = 'apple-ledger-replay-original';

function appleToken(transactionId: string): string {
  return `signed-${transactionId}`;
}

function appleVerify(transaction: AppleTransaction): ReplayStep {
  return {
    label: `app verify ${transaction.id}`,
    via: 'recordVerifiedMobileIapPurchase',
    purchaseToken: appleToken(transaction.id),
    verified: {
      platform: 'ios',
      product: transaction.product,
      storeTransactionId: transaction.id,
      purchaseTokenHash: hashMobileIapPurchaseToken(appleToken(transaction.id)),
      originalTransactionId:
        transaction.originalTransactionId ??
        (transaction.product.kind === 'subscription' ? APPLE_ORIGINAL : transaction.id),
      purchasedAt: transaction.period.start,
      expiresAt: transaction.product.kind === 'subscription' ? transaction.period.end : null,
      environment: 'production',
      entitlementStatus: 'active',
    },
  };
}

function appleNotice(
  input: ScenarioInput,
  notice: {
    type: string;
    transaction: AppleTransaction;
    status: MobileIapEntitlementState;
    signedAt: Date;
    refundFraction?: number;
  },
): ReplayStep {
  const { transaction } = notice;
  return {
    label: `App Store ${notice.type} ${transaction.id}`,
    via: 'processMobileIapLifecycleEvent',
    event: {
      platform: 'ios',
      notificationId: `apple-notice-${notice.type}-${transaction.id}`,
      eventType: notice.type,
      product: transaction.product,
      storeTransactionId: transaction.id,
      purchaseTokenHash: hashMobileIapPurchaseToken(appleToken(transaction.id)),
      originalTransactionId:
        transaction.originalTransactionId ??
        (transaction.product.kind === 'subscription' ? APPLE_ORIGINAL : transaction.id),
      appAccountToken: input.appAccountToken,
      purchasedAt: transaction.period.start,
      expiresAt: transaction.product.kind === 'subscription' ? transaction.period.end : null,
      entitlementStatus: notice.status,
      cancelAtPeriodEnd: false,
      environment: 'production',
      signedAt: notice.signedAt,
      ...(notice.refundFraction === undefined ? {} : { refundFraction: notice.refundFraction }),
    },
  };
}

function appleSubscribe(input: ScenarioInput, transaction: AppleTransaction): ReplayStep[] {
  return [
    appleVerify(transaction),
    appleNotice(input, {
      type: 'SUBSCRIBED',
      transaction,
      status: 'active',
      signedAt: input.clock.at(0),
    }),
  ];
}

function appleFirst(clock: ReplayClock, period = storeMidPeriod(clock)): AppleTransaction {
  return { id: 'apple-ledger-replay-1', product: STORE_PRO, period };
}

function appleTopUp(clock: ReplayClock): AppleTransaction {
  return {
    id: 'apple-ledger-replay-top-up',
    product: STORE_TOP_UP,
    period: { start: clock.at(0), end: clock.at(0) },
  };
}

interface PlayPurchase {
  token: string;
  transactionId: string;
  product: MobileIapCatalogProduct;
  period: StorePeriod;
  replaces?: string;
}

function playVerify(purchase: PlayPurchase): ReplayStep {
  return {
    label: `app verify ${purchase.transactionId}`,
    via: 'recordVerifiedMobileIapPurchase',
    purchaseToken: purchase.token,
    verified: {
      platform: 'android',
      product: purchase.product,
      storeTransactionId: purchase.transactionId,
      purchaseTokenHash: hashMobileIapPurchaseToken(purchase.token),
      originalTransactionId: purchase.replaces
        ? hashMobileIapPurchaseToken(purchase.replaces)
        : null,
      purchasedAt: purchase.period.start,
      expiresAt: purchase.product.kind === 'subscription' ? purchase.period.end : null,
      environment: 'production',
      entitlementStatus: 'active',
      lifecycle: 'active',
      cancelAtPeriodEnd: false,
    },
  };
}

function playNotice(
  input: ScenarioInput,
  notice: {
    type: string;
    purchase: PlayPurchase;
    status: MobileIapEntitlementState;
    signedAt: Date;
    transactionId?: string;
    period?: StorePeriod;
    refundFraction?: number;
    cancelAtPeriodEnd?: boolean;
  },
): ReplayStep {
  const { purchase } = notice;
  const period = notice.period ?? purchase.period;
  const transactionId = notice.transactionId ?? purchase.transactionId;
  return {
    label: `Play ${notice.type} ${transactionId}`,
    via: 'processMobileIapLifecycleEvent',
    event: {
      platform: 'android',
      notificationId: `play-message-${notice.type}-${transactionId}`,
      eventType: notice.type,
      product: purchase.product,
      storeTransactionId: transactionId,
      purchaseTokenHash: hashMobileIapPurchaseToken(purchase.token),
      originalTransactionId: purchase.replaces
        ? hashMobileIapPurchaseToken(purchase.replaces)
        : null,
      appAccountToken: input.appAccountToken,
      purchasedAt: period.start,
      expiresAt: purchase.product.kind === 'subscription' ? period.end : null,
      entitlementStatus: notice.status,
      cancelAtPeriodEnd: notice.cancelAtPeriodEnd ?? false,
      rawGooglePurchaseToken: purchase.token,
      environment: 'production',
      signedAt: notice.signedAt,
      ...(notice.refundFraction === undefined ? {} : { refundFraction: notice.refundFraction }),
    },
  };
}

function playFirst(clock: ReplayClock, period = storeMidPeriod(clock)): PlayPurchase {
  return {
    token: 'play-ledger-replay-token-1',
    transactionId: 'GPA.ledger-replay-1',
    product: STORE_PRO,
    period,
  };
}

function playSubscribe(input: ScenarioInput, purchase: PlayPurchase): ReplayStep[] {
  return [
    playVerify(purchase),
    playNotice(input, {
      type: 'google:4',
      purchase,
      status: 'active',
      signedAt: input.clock.at(0),
    }),
  ];
}

function playTopUp(clock: ReplayClock): PlayPurchase {
  return {
    token: 'play-ledger-replay-top-up-token',
    transactionId: 'GPA.ledger-replay-top-up',
    product: STORE_TOP_UP,
    period: { start: clock.at(0), end: clock.at(0) },
  };
}

const APP_STORE_SCENARIOS: LedgerScenario[] = [
  {
    name: 'app store purchase',
    steps: (input) => appleSubscribe(input, appleFirst(input.clock)),
  },
  {
    name: 'app store renewal',
    steps: (input) => [
      ...appleSubscribe(input, appleFirst(input.clock, storeEndingPeriod(input.clock))),
      appleNotice(input, {
        type: 'DID_RENEW',
        transaction: {
          id: 'apple-ledger-replay-2',
          product: STORE_PRO,
          period: storeNextPeriod(input.clock),
        },
        status: 'active',
        signedAt: input.clock.at(0, 60),
      }),
    ],
  },
  {
    name: 'app store upgrade',
    steps: (input) => {
      const upgrade: AppleTransaction = {
        id: 'apple-ledger-replay-upgrade',
        product: STORE_MAX,
        period: storeNextPeriod(input.clock),
      };
      return [
        ...appleSubscribe(input, appleFirst(input.clock)),
        appleVerify(upgrade),
        appleNotice(input, {
          type: 'DID_CHANGE_RENEWAL_PREF',
          transaction: upgrade,
          status: 'active',
          signedAt: input.clock.at(0, 60),
        }),
      ];
    },
  },
  {
    name: 'app store billing retry on hold',
    steps: (input) => [
      ...appleSubscribe(input, appleFirst(input.clock)),
      appleNotice(input, {
        type: 'DID_FAIL_TO_RENEW',
        transaction: appleFirst(input.clock),
        status: 'on_hold',
        signedAt: input.clock.at(0, 60),
      }),
    ],
  },
  {
    name: 'app store refund of a plan',
    steps: (input) => [
      ...appleSubscribe(input, appleFirst(input.clock)),
      appleNotice(input, {
        type: 'REFUND',
        transaction: appleFirst(input.clock),
        status: 'refunded',
        signedAt: input.clock.at(0, 60),
      }),
    ],
  },
  {
    name: 'app store revoke of a plan',
    steps: (input) => [
      ...appleSubscribe(input, appleFirst(input.clock)),
      appleNotice(input, {
        type: 'REVOKE',
        transaction: appleFirst(input.clock),
        status: 'revoked',
        signedAt: input.clock.at(0, 60),
      }),
    ],
  },
  {
    name: 'app store refund of a top-up',
    steps: (input) => [
      ...appleSubscribe(input, appleFirst(input.clock)),
      appleVerify(appleTopUp(input.clock)),
      appleNotice(input, {
        type: 'REFUND',
        transaction: appleTopUp(input.clock),
        status: 'refunded',
        signedAt: input.clock.at(0, 60),
      }),
    ],
  },
  {
    name: 'app store refund of a top-up reversed',
    steps: (input) => [
      ...appleSubscribe(input, appleFirst(input.clock)),
      appleVerify(appleTopUp(input.clock)),
      appleNotice(input, {
        type: 'REFUND',
        transaction: appleTopUp(input.clock),
        status: 'refunded',
        signedAt: input.clock.at(0, 60),
      }),
      appleNotice(input, {
        type: 'REFUND_REVERSED',
        transaction: appleTopUp(input.clock),
        status: 'restored',
        signedAt: input.clock.at(0, 120),
      }),
    ],
  },
  {
    name: 'app store stale notice',
    steps: (input) => [
      ...appleSubscribe(input, appleFirst(input.clock)),
      appleNotice(input, {
        type: 'DID_RENEW',
        transaction: {
          id: 'apple-ledger-replay-0',
          product: STORE_PRO,
          period: { start: input.clock.at(-40), end: input.clock.at(-10) },
        },
        status: 'active',
        signedAt: input.clock.at(-40),
      }),
    ],
  },
];

function playUpgrade(clock: ReplayClock): PlayPurchase {
  return {
    token: 'play-ledger-replay-token-2',
    transactionId: 'GPA.ledger-replay-2',
    product: STORE_MAX,
    period: { start: clock.at(0), end: clock.at(20) },
    replaces: playFirst(clock).token,
  };
}

const PLAY_SCENARIOS: LedgerScenario[] = [
  {
    name: 'play purchase',
    steps: (input) => playSubscribe(input, playFirst(input.clock)),
  },
  {
    name: 'play renewal',
    steps: (input) => {
      const first = playFirst(input.clock, storeEndingPeriod(input.clock));
      return [
        ...playSubscribe(input, first),
        playNotice(input, {
          type: 'google:2',
          purchase: first,
          transactionId: 'GPA.ledger-replay-1..0',
          period: storeNextPeriod(input.clock),
          status: 'active',
          signedAt: input.clock.at(0, 60),
        }),
      ];
    },
  },
  {
    name: 'play upgrade',
    steps: (input) => {
      const upgrade = playUpgrade(input.clock);
      return [
        ...playSubscribe(input, playFirst(input.clock)),
        playVerify(upgrade),
        playNotice(input, {
          type: 'google:4',
          purchase: upgrade,
          status: 'active',
          signedAt: input.clock.at(0, 60),
        }),
      ];
    },
  },
  {
    name: 'play pause',
    steps: (input) => [
      ...playSubscribe(input, playFirst(input.clock)),
      playNotice(input, {
        type: 'google:10',
        purchase: playFirst(input.clock),
        status: 'paused',
        signedAt: input.clock.at(0, 60),
      }),
    ],
  },
  {
    name: 'play partial refund of a top-up',
    steps: (input) => [
      ...playSubscribe(input, playFirst(input.clock)),
      playVerify(playTopUp(input.clock)),
      playNotice(input, {
        type: 'google:voided',
        purchase: playTopUp(input.clock),
        status: 'refunded',
        refundFraction: 0.5,
        signedAt: input.clock.at(0, 60),
      }),
    ],
  },
  {
    name: 'play revoke of a plan',
    steps: (input) => [
      ...playSubscribe(input, playFirst(input.clock)),
      playNotice(input, {
        type: 'google:12',
        purchase: playFirst(input.clock),
        status: 'revoked',
        cancelAtPeriodEnd: true,
        signedAt: input.clock.at(0, 60),
      }),
    ],
  },
  {
    name: 'play refund of a top-up restored',
    steps: (input) => [
      ...playSubscribe(input, playFirst(input.clock)),
      playVerify(playTopUp(input.clock)),
      playNotice(input, {
        type: 'google:voided',
        purchase: playTopUp(input.clock),
        status: 'refunded',
        signedAt: input.clock.at(0, 60),
      }),
      playNotice(input, {
        type: 'google:restored',
        purchase: playTopUp(input.clock),
        status: 'restored',
        signedAt: input.clock.at(0, 120),
      }),
    ],
  },
  {
    name: 'play stale notice for a replaced token',
    steps: (input) => {
      const upgrade = playUpgrade(input.clock);
      return [
        ...playSubscribe(input, playFirst(input.clock)),
        playVerify(upgrade),
        playNotice(input, {
          type: 'google:4',
          purchase: upgrade,
          status: 'active',
          signedAt: input.clock.at(0, 60),
        }),
        playNotice(input, {
          type: 'google:13',
          purchase: playFirst(input.clock),
          status: 'expired',
          cancelAtPeriodEnd: true,
          signedAt: input.clock.at(0, 120),
        }),
      ];
    },
  },
];

export const LEDGER_REPLAY_SCENARIOS: readonly LedgerScenario[] = [
  ...STRIPE_SCENARIOS,
  ...APP_STORE_SCENARIOS,
  ...PLAY_SCENARIOS,
];
