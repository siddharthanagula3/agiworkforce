/**
 * Signup → checkout → entitlement, driven through the real webhook route.
 *
 * Scope, stated precisely so nobody re-derives it from the file name:
 * `apps/web/__tests__/api/stripe-session-price-authority.test.ts` already
 * asserts the Price-authoritative tier and the unregistered-Price refusal at
 * the `db.ts` layer, and `apps/web/lib/__tests__/price-tier-mapping.test.ts`
 * already proves the real `resolvePlanTier` ignores metadata. What nothing
 * covered is the ROUTE: `apps/web/__tests__/api/stripe-webhook.test.ts`'s
 * `checkout.session.completed` case asserts nothing beyond `status === 200`, so
 * a route that verified the signature, opened the transaction and then dropped
 * the purchase on the floor passed it. These cases assert what the customer
 * paid for actually reaches the database through the real POST: the
 * subscription row, the credit allocation, the idempotency bookkeeping that
 * decides whether Stripe retries, and the replay window on the signature.
 */
import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { STRIPE_API_VERSION } from '@/lib/stripe-config';

vi.mock('server-only', () => ({}));

vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_route_spec');
vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_route_spec');

/** Structured payloads passed to `logger.warn` during the current delivery. */
const warnings = vi.hoisted(() => [] as Record<string, unknown>[]);

vi.mock('@/lib/logger', () => ({
  logger: {
    info: () => {},
    warn: (payload: unknown) => {
      if (payload && typeof payload === 'object') warnings.push(payload as Record<string, unknown>);
    },
    error: () => {},
    debug: () => {},
  },
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: async () => null }));

vi.mock('@/lib/security-audit', () => ({
  logInvalidSignature: async () => undefined,
  recordAuditEvent: async () => undefined,
}));

// Only `price_pro` is sold by this deployment. `price_unknown` stands in for a
// Price forged into a webhook payload or retired without a mapping. This double
// ignores metadata by construction, so it cannot prove the real resolver does —
// that property belongs to `apps/web/lib/__tests__/price-tier-mapping.test.ts`
// and is asserted there. What it pins here is which tier the route carries into
// the database once the resolver has answered.
vi.mock('@/lib/price-tier-mapping', () => ({
  isPriceIdRegistered: (priceId: string | null | undefined) => priceId === 'price_pro',
  resolvePlanTier: (_metadata: unknown, priceId: string | null | undefined) =>
    priceId === 'price_pro' ? 'pro' : null,
  isValidPlanTier: (tier: string | null | undefined) =>
    !!tier && ['free', 'basic', 'pro', 'max', 'max_15x', 'team', 'enterprise'].includes(tier),
  getTierMapping: () => ({ price_pro: { tier: 'pro', interval: 'monthly' } }),
}));

const allocateCreditsForPeriod = vi.hoisted(() => vi.fn());
// Only `allocateCreditsForPeriod` is on the path these fixtures drive. The
// carry/reset entry points belong to the upgrade and renewal paths and are not
// stubbed here — if a future fixture reaches one it will fail loudly rather
// than record a call nobody asserts.
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { allocateCreditsForPeriod },
}));

vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    getBalance: async () => null,
    deductCredits: async () => ({ success: true }),
  },
}));

interface Call {
  sql: string;
  params: unknown[];
}

const calls: Call[] = [];
/** Event ids whose idempotency row has already reached `succeeded`. */
const processedEventIds = new Set<string>();

function rowsFor(sql: string): unknown[] {
  if (sql.includes('process_stripe_event_idempotent')) {
    const eventId = String(calls.at(-1)?.params?.[0] ?? '');
    return [{ process_stripe_event_idempotent: !processedEventIds.has(eventId) }];
  }
  if (sql.includes('from processed_stripe_events')) return [{ status: 'succeeded' }];
  if (sql.includes('select id from profiles')) return [{ id: 'user_new' }];
  if (sql.includes('select email from profiles')) return [{ email: 'buyer@example.com' }];
  if (sql.includes('insert into subscriptions')) return [{ id: 'sub_row_1' }];
  return [];
}

const db = {
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    return rowsFor(sql);
  }),
  execute: vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    return rowsFor(sql);
  }),
  transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
};

vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => db }));

const PERIOD_START = Math.floor(Date.now() / 1000);
const PERIOD_END = PERIOD_START + 30 * 24 * 60 * 60;

/** Replay window `verify.ts` passed on the most recent delivery. */
let observedTolerance: number | undefined;

// The route only ever asks Stripe for the subscription, the customer and the
// expanded session, so those three are the whole surface worth faking. The
// signature check is real HMAC over the real body and over the timestamp in the
// header — a payload edited in transit must not verify, and a signature older
// than the window `verify.ts` passes must not either.
class MockStripe {
  webhooks = {
    constructEvent: (
      body: string,
      signature: string,
      secret: string,
      toleranceSeconds?: number,
    ) => {
      observedTolerance = toleranceSeconds;
      const parsed = /^t=(\d+),v1=([0-9a-f]+)$/.exec(signature);
      if (!parsed) throw new Error('Signature verification failed');
      const [, timestamp, digest] = parsed;
      const expected = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
      if (digest !== expected) throw new Error('Signature verification failed');
      // A caller that passes no window gets no replay protection, exactly as
      // with the real SDK. The window's value is asserted, not assumed.
      const age = Math.floor(Date.now() / 1000) - Number(timestamp);
      if (toleranceSeconds !== undefined && age > toleranceSeconds) {
        throw new Error('Timestamp outside the tolerance zone');
      }
      return JSON.parse(body);
    },
  };
  checkout = {
    sessions: {
      retrieve: async () => ({ id: 'cs_test', line_items: { data: [] }, total_details: {} }),
    },
  };
  subscriptions = {
    retrieve: async () => ({
      id: 'sub_stripe_1',
      status: 'active',
      cancel_at_period_end: false,
      canceled_at: null,
      current_period_start: PERIOD_START,
      current_period_end: PERIOD_END,
      items: { data: [{ price: { id: 'price_pro' }, quantity: 1 }] },
    }),
  };
  customers = {
    retrieve: async () => ({ id: 'cus_1', email: 'buyer@example.com', deleted: false }),
  };
}
vi.mock('stripe', () => ({ default: MockStripe }));

/**
 * Signs with an explicit timestamp that travels in the header, so verification
 * uses the instant the body was signed rather than the instant it was checked.
 * Recomputing `Date.now()` at verify time made the happy path fail whenever the
 * two straddled a second boundary.
 */
function signatureFor(body: string, secret: string, atSeconds?: number): string {
  const timestamp = atSeconds ?? Math.floor(Date.now() / 1000);
  const digest = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

function checkoutCompleted(overrides: {
  eventId?: string;
  priceId?: string;
  metadata?: Record<string, string>;
  apiVersion?: string;
}): string {
  return JSON.stringify({
    id: overrides.eventId ?? 'evt_checkout_1',
    type: 'checkout.session.completed',
    ...(overrides.apiVersion ? { api_version: overrides.apiVersion } : {}),
    data: {
      object: {
        id: 'cs_test',
        customer: 'cus_1',
        subscription: 'sub_stripe_1',
        metadata: overrides.metadata ?? { user_id: 'user_new', plan_tier: 'pro' },
        line_items: {
          data: [{ price: { id: overrides.priceId ?? 'price_pro' }, quantity: 1 }],
        },
      },
    },
  });
}

async function deliver(body: string, signedAtSeconds?: number) {
  const { POST } = await import('../../route');
  return POST(
    new NextRequest('http://localhost/api/stripe-webhook', {
      method: 'POST',
      body,
      headers: {
        'content-type': 'application/json',
        'stripe-signature': signatureFor(body, 'whsec_test_route_spec', signedAtSeconds),
      },
    }),
  );
}

function subscriptionUpsert(): Call | undefined {
  return calls.find((call) => call.sql.includes('insert into subscriptions'));
}

describe('a completed checkout provisions the entitlement it paid for', () => {
  beforeEach(() => {
    calls.length = 0;
    processedEventIds.clear();
    warnings.length = 0;
    observedTolerance = undefined;
    allocateCreditsForPeriod.mockReset();
    allocateCreditsForPeriod.mockResolvedValue(undefined);
  });

  it('writes the subscription row and allocates the period credits', async () => {
    const response = await deliver(checkoutCompleted({}));
    expect(response.status).toBe(200);

    const upsert = subscriptionUpsert();
    expect(upsert, 'no subscription row was written for a paid checkout').toBeDefined();
    // (user_id, status, plan_tier, stripe_customer_id, stripe_subscription_id, stripe_price_id, ...)
    expect(upsert!.params.slice(0, 6)).toEqual([
      'user_new',
      'active',
      'pro',
      'cus_1',
      'sub_stripe_1',
      'price_pro',
    ]);

    expect(allocateCreditsForPeriod).toHaveBeenCalledTimes(1);
    const [userId, subscriptionId, planTier, start, end] = allocateCreditsForPeriod.mock.calls[0]!;
    expect([userId, subscriptionId, planTier]).toEqual(['user_new', 'sub_row_1', 'pro']);
    expect((start as Date).getTime()).toBe(PERIOD_START * 1000);
    expect((end as Date).getTime()).toBe(PERIOD_END * 1000);

    expect(calls.some((call) => call.sql.includes('mark_stripe_event_succeeded'))).toBe(true);
  });

  it('carries the resolved tier into both the row and the credits, never the session metadata', async () => {
    // Session metadata is client-supplied at checkout creation and is the one
    // input an attacker controls end to end. The resolver's own indifference to
    // it is proven in `lib/__tests__/price-tier-mapping.test.ts`; what is proven
    // here is that neither the upsert nor the credit allocation reaches past the
    // resolver's answer to read `plan_tier` off the session for itself.
    await deliver(checkoutCompleted({ metadata: { user_id: 'user_new', plan_tier: 'max' } }));

    expect(subscriptionUpsert()!.params[2]).toBe('pro');
    expect(allocateCreditsForPeriod.mock.calls[0]![2]).toBe('pro');
  });

  it('refuses to provision anything from a Price the deployment does not sell', async () => {
    const response = await deliver(checkoutCompleted({ priceId: 'price_unknown' }));

    expect(response.status).toBe(500);
    expect(subscriptionUpsert()).toBeUndefined();
    expect(allocateCreditsForPeriod).not.toHaveBeenCalled();
    expect(calls.some((call) => call.sql.includes('mark_stripe_event_succeeded'))).toBe(false);
    expect(calls.some((call) => call.sql.includes('mark_stripe_event_failed'))).toBe(true);
  });

  it('fails the delivery when credits cannot be allocated, so Stripe retries', async () => {
    // A subscription row without credits is a customer who paid and got
    // nothing. Acknowledging the event here would strand them permanently,
    // because Stripe never redelivers a 2xx.
    allocateCreditsForPeriod.mockRejectedValue(new Error('credit ledger unavailable'));

    const response = await deliver(checkoutCompleted({ eventId: 'evt_checkout_credits' }));

    expect(response.status).toBe(500);
    expect(allocateCreditsForPeriod).toHaveBeenCalledTimes(3); // WEBHOOK_MAX_RETRIES
    expect(calls.some((call) => call.sql.includes('mark_stripe_event_succeeded'))).toBe(false);
    expect(calls.some((call) => call.sql.includes('mark_stripe_event_failed'))).toBe(true);
  });

  it('does not grant a second entitlement when Stripe redelivers the same event', async () => {
    processedEventIds.add('evt_checkout_replay');

    const response = await deliver(checkoutCompleted({ eventId: 'evt_checkout_replay' }));

    expect(response.status).toBe(200);
    expect(subscriptionUpsert()).toBeUndefined();
    expect(allocateCreditsForPeriod).not.toHaveBeenCalled();
  });

  it('rejects a payload whose body was edited after signing', async () => {
    const { POST } = await import('../../route');
    const signed = checkoutCompleted({});
    const tampered = signed.replace('"price_pro"', '"price_unknown"');

    const response = await POST(
      new NextRequest('http://localhost/api/stripe-webhook', {
        method: 'POST',
        body: tampered,
        headers: {
          'content-type': 'application/json',
          'stripe-signature': signatureFor(signed, 'whsec_test_route_spec'),
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(subscriptionUpsert()).toBeUndefined();
    expect(allocateCreditsForPeriod).not.toHaveBeenCalled();
  });

  it('rejects a correctly signed payload replayed outside the 60s window', async () => {
    // SEV-WEB-HIGH-5: `verify.ts` narrows the SDK's 300s default to 60s, and
    // that argument is the entire fix. A captured-and-replayed delivery two
    // minutes later carries a genuine signature, so nothing but the window
    // stops it.
    const response = await deliver(
      checkoutCompleted({ eventId: 'evt_checkout_stale' }),
      Math.floor(Date.now() / 1000) - 120,
    );

    expect(response.status).toBe(400);
    expect(observedTolerance, 'the route stopped narrowing the replay window').toBe(60);
    expect(subscriptionUpsert()).toBeUndefined();
    expect(allocateCreditsForPeriod).not.toHaveBeenCalled();
  });

  // BIZ-014: the endpoint's API version lives in the Stripe dashboard, not in
  // this repository, so it can drift away from `STRIPE_API_VERSION` with no
  // deploy and no error — the payload just starts arriving in a shape the
  // pinned types no longer describe. The event still has to be processed
  // (refusing it would strand a paying customer behind infinite retries), so
  // the only thing standing between silent drift and an operator is this log.
  it('names the version drift when the endpoint delivers a foreign API version', async () => {
    const response = await deliver(
      checkoutCompleted({ eventId: 'evt_checkout_old_api', apiVersion: '2024-06-20' }),
    );

    expect(response.status).toBe(200);
    expect(subscriptionUpsert(), 'a drifted event must still be provisioned').toBeDefined();

    const drift = warnings.find((entry) => 'eventApiVersion' in entry);
    expect(drift, 'the API version mismatch went unreported').toBeDefined();
    expect(drift!['eventApiVersion']).toBe('2024-06-20');
    expect(drift!['pinnedApiVersion']).toBe(STRIPE_API_VERSION);
    expect(drift!['eventId']).toBe('evt_checkout_old_api');
  });

  it('stays quiet when the endpoint delivers the pinned API version', async () => {
    await deliver(
      checkoutCompleted({ eventId: 'evt_checkout_same_api', apiVersion: STRIPE_API_VERSION }),
    );

    expect(warnings.filter((entry) => 'eventApiVersion' in entry)).toEqual([]);
  });
});
