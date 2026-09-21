import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const WEBHOOK_SECRET = ['whsec', 'delivery', 'guarantees', 'fixture'].join('_');
vi.stubEnv('STRIPE_SECRET_KEY', ['sk', 'test', 'delivery', 'fixture'].join('_'));
vi.stubEnv('STRIPE_WEBHOOK_SECRET', WEBHOOK_SECRET);

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: async () => null }));
vi.mock('@/lib/security-audit', () => ({
  logInvalidSignature: vi.fn().mockResolvedValue(undefined),
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/services/notification-service', () => ({
  recordNotification: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/price-tier-mapping', () => ({
  isPriceIdRegistered: (priceId: string | null | undefined) => priceId === 'price_pro',
  resolvePlanTier: (_metadata: unknown, priceId: string | null | undefined) =>
    priceId === 'price_pro' ? 'pro' : null,
  isValidPlanTier: (tier: string | null | undefined) => tier === 'pro',
  getTierMapping: () => ({ price_pro: { tier: 'pro', interval: 'monthly' } }),
  getEnterpriseProductId: () => null,
  isEnterpriseProductId: () => false,
}));

const allocateCreditsForPeriod = vi.hoisted(() => vi.fn().mockResolvedValue(''));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    allocateCreditsForPeriod,
    resetCreditsForNewPeriod: vi.fn().mockResolvedValue(''),
    carryCreditsForUpgradePeriod: vi.fn().mockResolvedValue(''),
  },
}));
vi.mock('@/lib/services/credit-service', () => ({
  MICROUSD_PER_LEDGER_CENT: 10_000,
  microusdFromLedgerCents: (cents: number) => Math.round(cents) * 10_000,
  ledgerCentsFromMicrousd: (microusd: number) => Math.floor((microusd + 5_000) / 10_000),
  CreditService: {
    getBalance: vi.fn().mockResolvedValue(null),
    deductCredits: vi.fn().mockResolvedValue({ success: true }),
  },
}));
vi.mock('@/lib/services/enterprise-billing-service', () => ({
  syncEnterpriseContractFromSubscription: vi.fn().mockResolvedValue(undefined),
  recordEnterpriseInvoiceEvent: vi.fn().mockResolvedValue(undefined),
  endEnterpriseContractIfPresent: vi.fn().mockResolvedValue(undefined),
  resolveEnterprisePlanTier: vi.fn().mockResolvedValue(null),
  auditUnknownStripePriceIfEnterpriseConfigured: vi.fn().mockResolvedValue(undefined),
}));

const NOW = Math.floor(Date.now() / 1000);
const PERIOD_END = NOW + 30 * 24 * 60 * 60;
const IDEMPOTENCY_SQL = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'db',
  'neon',
  '0020_functions.sql',
);

interface EventRow {
  status: 'processing' | 'succeeded' | 'failed';
  lockedAt: number;
}

// Answers the three idempotency statements the route issues the way the SQL
// function does: the insert claims the row, and a claimed row is never re-entered.
const events = new Map<string, EventRow>();
const bodies: string[] = [];
let allocationFails = false;
let transactionDepth = 0;
const committedWrites: string[] = [];
let pendingWrites: string[] = [];

function claimEvent(eventId: string): boolean {
  const existing = events.get(eventId);
  if (!existing) {
    events.set(eventId, { status: 'processing', lockedAt: Date.now() });
    return true;
  }
  if (existing.status === 'succeeded') return false;
  if (existing.status === 'processing' && Date.now() - existing.lockedAt < 600_000) return false;
  events.set(eventId, { status: 'processing', lockedAt: Date.now() });
  return true;
}

const run = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
  const text = sql.replace(/\s+/g, ' ').trim();
  if (text.includes('process_stripe_event_idempotent')) {
    return [{ process_stripe_event_idempotent: claimEvent(String(params[0])) }];
  }
  if (text.includes('from processed_stripe_events')) {
    return [{ status: events.get(String(params[0]))?.status ?? 'unknown' }];
  }
  if (text.includes('mark_stripe_event_succeeded')) {
    const row = events.get(String(params[0]));
    if (row) row.status = 'succeeded';
    return [];
  }
  if (text.includes('mark_stripe_event_failed')) {
    const row = events.get(String(params[0]));
    if (row) row.status = 'failed';
    return [];
  }
  if (text.includes('from subscriptions') && text.includes('last_stripe_event_at')) return [];
  if (text.includes('from profiles where stripe_customer_id')) return [{ id: 'user_1' }];
  if (text.includes('select id from profiles where id')) return [{ id: 'user_1' }];
  if (text.includes('select email from profiles')) return [{ email: 'buyer@example.com' }];
  if (text.startsWith('insert into subscriptions')) {
    if (transactionDepth === 0) committedWrites.push('subscription');
    else pendingWrites.push('subscription');
    return [{ id: 'row_1' }];
  }
  return [];
};

const db = {
  query: vi.fn(run),
  execute: vi.fn(run),
  transaction: vi.fn(async (fn: (tx: unknown) => unknown) => {
    transactionDepth += 1;
    pendingWrites = [];
    try {
      const result = await fn(db);
      committedWrites.push(...pendingWrites);
      return result;
    } finally {
      pendingWrites = [];
      transactionDepth -= 1;
    }
  }),
};
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => db, getStripeWebhookDb: () => db }));

class MockStripe {
  webhooks = {
    constructEvent: (body: string, signature: string, secret: string, tolerance?: number) => {
      bodies.push(body);
      const parsed = /^t=(\d+),v1=([0-9a-f]+)$/.exec(signature);
      if (!parsed) throw new Error('Signature verification failed');
      const [, timestamp, digest] = parsed;
      const expected = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
      if (digest !== expected) throw new Error('Signature verification failed');
      if (
        tolerance !== undefined &&
        Math.floor(Date.now() / 1000) - Number(timestamp) > tolerance
      ) {
        throw new Error('Timestamp outside the tolerance zone');
      }
      return JSON.parse(body);
    },
  };
  checkout = {
    sessions: {
      retrieve: async () => ({ id: 'cs_1', line_items: { data: [] }, total_details: {} }),
    },
  };
  subscriptions = {
    retrieve: async () => ({
      id: 'sub_1',
      customer: 'cus_1',
      status: 'active',
      cancel_at_period_end: false,
      canceled_at: null,
      metadata: {},
      items: { data: [{ price: { id: 'price_pro' }, quantity: 1 }] },
      current_period_start: NOW,
      current_period_end: PERIOD_END,
    }),
  };
  customers = {
    retrieve: async () => ({ id: 'cus_1', email: 'buyer@example.com', deleted: false }),
  };
  charges = { retrieve: async () => ({ id: 'ch_1', customer: 'cus_1' }) };
  paymentIntents = { retrieve: async () => ({ id: 'pi_1', status: 'succeeded' }) };
}
vi.mock('stripe', () => ({ default: MockStripe }));

function checkoutBody(eventId: string, spacing: string | number = ''): string {
  return JSON.stringify(
    {
      id: eventId,
      type: 'checkout.session.completed',
      created: NOW,
      data: {
        object: {
          id: 'cs_1',
          customer: 'cus_1',
          subscription: 'sub_1',
          payment_status: 'paid',
          metadata: { user_id: 'user_1', plan_tier: 'pro' },
          line_items: { data: [{ price: { id: 'price_pro' }, quantity: 1 }] },
        },
      },
    },
    null,
    spacing,
  );
}

function sign(body: string, secret = WEBHOOK_SECRET, atSeconds?: number): string {
  const timestamp = atSeconds ?? Math.floor(Date.now() / 1000);
  const digest = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

async function deliver(body: string, signature: string) {
  const { POST } = await import('../../route');
  return POST(
    new NextRequest('http://localhost/api/stripe-webhook', {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json', 'stripe-signature': signature },
    }),
  );
}

function reset(): void {
  vi.clearAllMocks();
  events.clear();
  bodies.length = 0;
  committedWrites.length = 0;
  allocationFails = false;
  allocateCreditsForPeriod.mockImplementation(async () => {
    if (allocationFails) throw new Error('credit ledger unavailable');
    return '';
  });
}

describe('a delivery is trusted only after its signature checks out', () => {
  beforeEach(reset);

  it('verifies the exact bytes that were signed, not a re-serialised copy', async () => {
    const signed = checkoutBody('evt_raw_1');
    const reserialised = checkoutBody('evt_raw_1', 2);
    expect(JSON.parse(reserialised)).toEqual(JSON.parse(signed));
    expect(reserialised).not.toBe(signed);

    const response = await deliver(reserialised, sign(signed));
    expect(response.status).toBe(400);
    expect(bodies).toEqual([reserialised]);
    expect(db.query).not.toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('refuses a delivery that carries no signature at all', async () => {
    const { POST } = await import('../../route');
    const response = await POST(
      new NextRequest('http://localhost/api/stripe-webhook', {
        method: 'POST',
        body: checkoutBody('evt_raw_2'),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(response.status).toBe(400);
    expect(bodies).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('refuses a correctly signed body replayed outside the tolerance window', async () => {
    const body = checkoutBody('evt_raw_3');
    const response = await deliver(body, sign(body, WEBHOOK_SECRET, NOW - 3_600));
    expect(response.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('refuses a body signed with a secret this endpoint does not hold', async () => {
    const body = checkoutBody('evt_raw_4');
    const response = await deliver(body, sign(body, [WEBHOOK_SECRET, 'other'].join('_')));
    expect(response.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('an event is applied at most once', () => {
  beforeEach(reset);

  it('claims the event with a conditional insert rather than a read then a write', () => {
    const sql = readFileSync(IDEMPOTENCY_SQL, 'utf8').replace(/\s+/g, ' ');
    const claim = sql.slice(sql.indexOf('function public.process_stripe_event_idempotent'));
    expect(claim).toContain('insert into public.processed_stripe_events');
    expect(claim).toContain('on conflict (event_id) do nothing');
    expect(claim.indexOf('on conflict (event_id) do nothing')).toBeLessThan(
      claim.indexOf('select status, locked_at'),
    );
  });

  it('provisions once when Stripe redelivers the same event', async () => {
    const body = checkoutBody('evt_once_1');
    const first = await deliver(body, sign(body));
    const second = await deliver(body, sign(body));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ message: 'Event already processed' });
    expect(committedWrites).toEqual(['subscription']);
    expect(allocateCreditsForPeriod).toHaveBeenCalledTimes(1);
  });

  it('provisions once when two deliveries of the same event overlap', async () => {
    const body = checkoutBody('evt_once_2');
    const [first, second] = await Promise.all([
      deliver(body, sign(body)),
      deliver(body, sign(body)),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 503]);
    expect(committedWrites).toEqual(['subscription']);
    expect(allocateCreditsForPeriod).toHaveBeenCalledTimes(1);
  });

  it('asks the loser of the race to come back rather than acknowledging work it did not do', async () => {
    const body = checkoutBody('evt_once_3');
    allocateCreditsForPeriod.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(''), 20)),
    );
    const [, second] = await Promise.all([deliver(body, sign(body)), deliver(body, sign(body))]);
    expect(second.status).toBe(503);
    expect(second.headers.get('Retry-After')).toBe('10');
  });
});

describe('a failed delivery leaves nothing half applied', () => {
  beforeEach(reset);

  it('answers with a status that makes Stripe retry', async () => {
    allocationFails = true;
    const body = checkoutBody('evt_fail_1');
    const response = await deliver(body, sign(body));
    expect(response.status).toBe(500);
  });

  it('rolls the subscription write back with the transaction that failed', async () => {
    allocationFails = true;
    const body = checkoutBody('evt_fail_2');
    await deliver(body, sign(body));
    expect(committedWrites).toEqual([]);
    expect(transactionDepth).toBe(0);
  });

  it('leaves the event open so the retry does the work', async () => {
    allocationFails = true;
    const body = checkoutBody('evt_fail_3');
    await deliver(body, sign(body));
    expect(events.get('evt_fail_3')?.status).toBe('failed');

    allocationFails = false;
    const retry = await deliver(body, sign(body));
    expect(retry.status).toBe(200);
    expect(committedWrites).toEqual(['subscription']);
  });

  it('never reports the failure body to Stripe as a success', async () => {
    allocationFails = true;
    const body = checkoutBody('evt_fail_4');
    const response = await deliver(body, sign(body));
    expect(await response.json()).not.toMatchObject({ received: true });
  });
});
