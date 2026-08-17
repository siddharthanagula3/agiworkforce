import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { STRIPE_API_VERSION } from '@/lib/stripe-config';

vi.mock('server-only', () => ({}));

vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_route_spec');
vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_route_spec');

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

vi.mock('@/lib/price-tier-mapping', () => ({
  isPriceIdRegistered: (priceId: string | null | undefined) => priceId === 'price_pro',
  resolvePlanTier: (_metadata: unknown, priceId: string | null | undefined) =>
    priceId === 'price_pro' ? 'pro' : null,
  isValidPlanTier: (tier: string | null | undefined) =>
    !!tier && ['free', 'basic', 'pro', 'max', 'max_15x', 'team', 'enterprise'].includes(tier),
  getTierMapping: () => ({ price_pro: { tier: 'pro', interval: 'monthly' } }),
}));

const allocateCreditsForPeriod = vi.hoisted(() => vi.fn());
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
const processedEventIds = new Set<string>();
let existingSubscriptionRow: Record<string, unknown> | null = null;

function rowsFor(sql: string): unknown[] {
  if (sql.includes('from subscriptions') && sql.includes('apple_original_transaction_id')) {
    return existingSubscriptionRow ? [existingSubscriptionRow] : [];
  }
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

let observedTolerance: number | undefined;

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
    existingSubscriptionRow = null;
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

  it('releases an ended store subscription before the web checkout claims the row', async () => {
    existingSubscriptionRow = {
      plan_tier: 'pro',
      status: 'expired',
      stripe_subscription_id: null,
      apple_original_transaction_id: 'apple-tx-legacy',
      google_purchase_token: null,
      current_period_end: null,
    };

    const response = await deliver(checkoutCompleted({}));
    expect(response.status).toBe(200);

    const release = calls.find(
      (call) =>
        call.sql.includes('update subscriptions') &&
        call.sql.includes('apple_original_transaction_id'),
    );
    expect(release, 'the store identifier was left on a Stripe-owned row').toBeDefined();
    expect(release!.params).toEqual(['user_new', false, true, false]);
    expect(calls.indexOf(release!)).toBeLessThan(calls.indexOf(subscriptionUpsert()!));
  });

  it('keeps a still-entitled store subscription instead of silently taking it over', async () => {
    existingSubscriptionRow = {
      plan_tier: 'pro',
      status: 'active',
      stripe_subscription_id: null,
      apple_original_transaction_id: 'apple-tx-live',
      google_purchase_token: null,
      current_period_end: new Date(PERIOD_END * 1000).toISOString(),
    };

    await deliver(checkoutCompleted({}));

    expect(
      calls.some(
        (call) =>
          call.sql.includes('update subscriptions') &&
          call.sql.includes('apple_original_transaction_id'),
      ),
    ).toBe(false);
  });

  it('carries the resolved tier into both the row and the credits, never the session metadata', async () => {
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
    allocateCreditsForPeriod.mockRejectedValue(new Error('credit ledger unavailable'));

    const response = await deliver(checkoutCompleted({ eventId: 'evt_checkout_credits' }));

    expect(response.status).toBe(500);
    expect(allocateCreditsForPeriod).toHaveBeenCalledTimes(3);
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
    const response = await deliver(
      checkoutCompleted({ eventId: 'evt_checkout_stale' }),
      Math.floor(Date.now() / 1000) - 120,
    );

    expect(response.status).toBe(400);
    expect(observedTolerance, 'the route stopped narrowing the replay window').toBe(60);
    expect(subscriptionUpsert()).toBeUndefined();
    expect(allocateCreditsForPeriod).not.toHaveBeenCalled();
  });

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
