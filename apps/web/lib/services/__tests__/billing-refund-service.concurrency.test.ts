import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MICROUSD_PER_LEDGER_CENT } from '@/lib/server/managed-usage-policy';
import type { NormalizedCharge } from '@/lib/server/payments/domain';

type StripeProviderModule = typeof import('@/lib/server/payments/stripe-provider');
type NeonDbModule = typeof import('@/lib/server/neon-db');
type NotificationModule = typeof import('../notification-service');

const mocks = vi.hoisted(() => ({
  retrieveStripeCharge: vi.fn(),
  refundStripeCharge: vi.fn(),
  readStripeCustomerCountry: vi.fn(),
  readStripeSubscriptionPayment: vi.fn(),
  getNeonDb: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/payments/stripe-provider', async (importOriginal) => ({
  ...(await importOriginal<StripeProviderModule>()),
  retrieveStripeCharge: mocks.retrieveStripeCharge,
  refundStripeCharge: mocks.refundStripeCharge,
  readStripeCustomerCountry: mocks.readStripeCustomerCountry,
  readStripeSubscriptionPayment: mocks.readStripeSubscriptionPayment,
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<NeonDbModule>()),
  getNeonDb: mocks.getNeonDb,
}));
vi.mock('../notification-service', async (importOriginal) => ({
  ...(await importOriginal<NotificationModule>()),
  recordNotification: vi.fn(),
}));

import { fileRefundRequest } from '../billing-refund-service';

const USER_ID = 'customer-1';
const CUSTOMER_ID = 'cus_customer1';
const NOW = new Date('2026-10-20T12:00:00.000Z');
const CHARGE_CENTS = 1_000;
const PURCHASED_LEDGER_CENTS = 1_000;
const PLAN_ALLOWANCE_CENTS = 500;
const CLAWBACK_PREFIX = 'Refund for charge ';

interface RequestRow {
  id: string;
  user_id: string;
  charge_id: string;
  charge_kind: string;
  charge_amount_cents: number;
  charge_currency: string;
  charge_created_at: string;
  reason: string;
  details: string | null;
  statutory_withdrawal: boolean;
  billing_country: string | null;
  assessment: string;
  assessed_refund_cents: number | null;
  status: string;
  refund_amount_cents: number | null;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
}

interface Ledger {
  allocatedCents: number;
  usedCents: number;
  topUpCents: number;
  requests: RequestRow[];
  clawbacks: { user_id: string; description: string }[];
}

function statusesNamedIn(sql: string): string[] {
  const list = /status in \(([^)]*)\)/u.exec(sql);
  if (list) return [...list[1]!.matchAll(/'([a-z_]+)'/gu)].map((match) => match[1]!);
  const single = /status = '([a-z_]+)'/u.exec(sql);
  return single ? [single[1]!] : [];
}

function createLedgerDb(ledger: Ledger) {
  const lockTails = new Map<string, Promise<void>>();
  const lockedKeys: string[] = [];

  async function acquire(key: string): Promise<() => void> {
    const previous = lockTails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    lockTails.set(
      key,
      previous.then(() => held),
    );
    await previous;
    lockedKeys.push(key);
    return release;
  }

  async function run(sql: string, params: unknown[], held: (() => void)[] | null) {
    if (sql.includes('pg_advisory_xact_lock')) {
      if (!held) throw new Error('advisory transaction lock taken outside a transaction');
      held.push(await acquire(String(params[0])));
      return [{}];
    }
    if (/^\s*insert into public\.billing_refund_requests/u.test(sql)) {
      const chargeId = String(params[1]);
      const active = ledger.requests.some(
        (row) => row.charge_id === chargeId && ['pending', 'refunded'].includes(row.status),
      );
      if (active) {
        if (sql.includes('on conflict do nothing')) return [];
        throw Object.assign(new Error('duplicate key'), { code: '23505' });
      }
      const row: RequestRow = {
        id: `request-${ledger.requests.length + 1}`,
        user_id: String(params[0]),
        charge_id: chargeId,
        charge_kind: String(params[2]),
        charge_amount_cents: Number(params[3]),
        charge_currency: String(params[4]),
        charge_created_at: String(params[5]),
        reason: String(params[6]),
        details: (params[7] as string | null) ?? null,
        statutory_withdrawal: Boolean(params[8]),
        billing_country: (params[9] as string | null) ?? null,
        assessment: String(params[10]),
        assessed_refund_cents: (params[11] as number | null) ?? null,
        status: 'pending',
        refund_amount_cents: null,
        decision_note: null,
        decided_at: null,
        created_at: NOW.toISOString(),
      };
      ledger.requests.push(row);
      return [{ ...row }];
    }
    if (/^\s*update public\.billing_refund_requests/u.test(sql)) {
      const row = ledger.requests.find((r) => r.id === params[0] && r.status === 'pending');
      if (!row) return [];
      row.status = String(params[1]);
      row.refund_amount_cents = (params[4] as number | null) ?? null;
      row.decision_note = (params[6] as string | null) ?? null;
      row.decided_at = NOW.toISOString();
      return [{ ...row }];
    }
    if (sql.includes('from public.billing_refund_requests request')) {
      return ledger.requests
        .filter(
          (row) =>
            row.user_id === params[0] &&
            row.charge_kind === 'top_up' &&
            !row.charge_id.startsWith(String(params[1])) &&
            (row.status === 'refunded' ||
              (row.status === 'pending' && row.assessment !== 'needs_review')) &&
            !ledger.clawbacks.some(
              (clawback) =>
                clawback.user_id === row.user_id &&
                clawback.description === `${String(params[2])}${row.charge_id}`,
            ),
        )
        .map((row) => ({
          charge_id: row.charge_id,
          charge_amount_cents: row.charge_amount_cents,
          refund_cents: row.refund_amount_cents ?? row.assessed_refund_cents,
        }));
    }
    if (sql.includes('count(*) as refunds')) {
      const statuses = statusesNamedIn(sql);
      const refunds = ledger.requests.filter(
        (row) =>
          row.user_id === params[0] &&
          row.assessment === 'unused_within_policy' &&
          statuses.includes(row.status),
      ).length;
      return [{ refunds }];
    }
    if (
      /from public\.billing_refund_requests\s+where user_id = \$1 and charge_id = \$2/u.test(sql)
    ) {
      const row = ledger.requests
        .filter((r) => r.user_id === params[0] && r.charge_id === params[1])
        .at(-1);
      return row ? [{ ...row }] : [];
    }
    if (sql.includes('from token_credits')) {
      return [
        {
          credits_allocated_microusd: ledger.allocatedCents * MICROUSD_PER_LEDGER_CENT,
          credits_used_microusd: ledger.usedCents * MICROUSD_PER_LEDGER_CENT,
          top_up_allocated_microusd: ledger.topUpCents * MICROUSD_PER_LEDGER_CENT,
        },
      ];
    }
    if (sql.includes('from subscriptions')) return [];
    throw new Error(`Unexpected SQL in refund ledger fake: ${sql}`);
  }

  function adapter(held: (() => void)[] | null): DatabaseAdapter {
    return {
      query: (sql: string, params: unknown[] = []) => run(sql, params, held),
      execute: async () => 0,
      transaction: async <T>(fn: (tx: DatabaseAdapter) => Promise<T>) => {
        const locks: (() => void)[] = [];
        try {
          return await fn(adapter(locks));
        } finally {
          for (const release of locks) release();
        }
      },
      withUser: () => adapter(held),
      withOrg: () => adapter(held),
      dispose: async () => undefined,
    } as unknown as DatabaseAdapter;
  }

  return { db: adapter(null), lockedKeys };
}

function topUpCharge(reference: string, billingCountry: string): NormalizedCharge {
  return {
    reference,
    paymentReference: `pi_${reference.slice(3)}`,
    customerReference: CUSTOMER_ID,
    kind: 'top_up',
    amount: { currency: 'usd', minorUnits: CHARGE_CENTS },
    refundedMinorUnits: 0,
    createdAt: new Date(NOW.getTime() - 86_400_000),
    settled: true,
    disputed: false,
    billingCountry,
    cardCountry: billingCountry,
    receiptUrl: null,
    purchasedLedgerCents: PURCHASED_LEDGER_CENTS,
    withdrawalConsent: { version: 'withdrawal-2026-01', acceptedAt: new Date('2026-10-19') },
  };
}

function ledgerWithUnspentPurchase(topUps: number, unspentPurchasedCents: number): Ledger {
  const topUpCents = topUps * PURCHASED_LEDGER_CENTS;
  const allocatedCents = PLAN_ALLOWANCE_CENTS + topUpCents;
  return {
    allocatedCents,
    usedCents: allocatedCents - unspentPurchasedCents,
    topUpCents,
    requests: [],
    clawbacks: [],
  };
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function stubStripe(charges: Map<string, NormalizedCharge | null>) {
  mocks.retrieveStripeCharge.mockImplementation(async (reference: string) => {
    await tick();
    return charges.get(reference) ?? null;
  });
  let refundCount = 0;
  mocks.refundStripeCharge.mockImplementation(
    async (input: { chargeReference: string; amountMinorUnits: number }) => {
      await tick();
      await tick();
      refundCount += 1;
      return {
        outcome: 'refunded',
        refund: {
          reference: `re_${refundCount}`,
          status: 'succeeded',
          amount: { currency: 'usd', minorUnits: input.amountMinorUnits },
        },
      };
    },
  );
}

function refundedCents(): number[] {
  return mocks.refundStripeCharge.mock.calls.map(
    ([input]) => (input as { amountMinorUnits: number }).amountMinorUnits,
  );
}

function fileFor(
  db: DatabaseAdapter,
  chargeId: string,
  reason: 'accidental_purchase' | 'statutory_withdrawal',
) {
  return fileRefundRequest({
    db,
    userId: USER_ID,
    customerId: CUSTOMER_ID,
    subscriptionId: null,
    chargeId,
    reason,
    details: null,
    now: NOW,
  });
}

beforeEach(() => {
  mocks.readStripeCustomerCountry.mockResolvedValue(null);
  mocks.readStripeSubscriptionPayment.mockResolvedValue(null);
});

afterEach(() => vi.clearAllMocks());

describe('concurrent refund requests by one account', () => {
  it('automatically refunds only one unused top-up when several are filed at once', async () => {
    const ledger = ledgerWithUnspentPurchase(3, 1_200);
    const { db, lockedKeys } = createLedgerDb(ledger);
    mocks.getNeonDb.mockReturnValue(db);
    const ids = ['ch_topupaaaa1', 'ch_topupbbbb2', 'ch_topupcccc3'];
    stubStripe(new Map(ids.map((id) => [id, topUpCharge(id, 'US')])));

    const results = await Promise.all(ids.map((id) => fileFor(db, id, 'accidental_purchase')));

    expect(refundedCents()).toEqual([CHARGE_CENTS]);
    expect(results.map((result) => result.request.assessment).sort()).toEqual([
      'needs_review',
      'needs_review',
      'unused_within_policy',
    ]);
    expect(lockedKeys).toEqual([USER_ID, USER_ID, USER_ID]);
  });

  it('prorates concurrent statutory withdrawals against one unspent purchased balance', async () => {
    const unspentPurchasedCents = 1_200;
    const ledger = ledgerWithUnspentPurchase(3, unspentPurchasedCents);
    const { db } = createLedgerDb(ledger);
    mocks.getNeonDb.mockReturnValue(db);
    const ids = ['ch_topupaaaa1', 'ch_topupbbbb2', 'ch_topupcccc3'];
    stubStripe(new Map(ids.map((id) => [id, topUpCharge(id, 'DE')])));

    await Promise.all(ids.map((id) => fileFor(db, id, 'statutory_withdrawal')));

    const total = refundedCents().reduce((sum, cents) => sum + cents, 0);
    expect(total).toBe(unspentPurchasedCents);
    expect(refundedCents().sort((a, b) => b - a)).toEqual([1_000, 200]);
    expect(ledger.requests.filter((row) => row.status === 'pending')).toEqual([
      expect.objectContaining({ assessment: 'needs_review', assessed_refund_cents: 0 }),
    ]);
  });

  it.each([
    {
      state: 'not yet clawed back',
      clawedBack: false,
      topUpCents: 2_000,
      unspentPurchasedCents: 1_200,
      expected: [200],
    },
    {
      state: 'already clawed back',
      clawedBack: true,
      topUpCents: 1_000,
      unspentPurchasedCents: 200,
      expected: [200],
    },
  ])(
    'counts an earlier refund $state exactly once',
    async ({ clawedBack, topUpCents, unspentPurchasedCents, expected }) => {
      const allocatedCents = PLAN_ALLOWANCE_CENTS + topUpCents;
      const earlier = 'ch_topupaaaa1';
      const ledger: Ledger = {
        allocatedCents,
        usedCents: allocatedCents - unspentPurchasedCents,
        topUpCents,
        requests: [],
        clawbacks: clawedBack
          ? [{ user_id: USER_ID, description: `${CLAWBACK_PREFIX}${earlier}` }]
          : [],
      };
      const { db } = createLedgerDb(ledger);
      mocks.getNeonDb.mockReturnValue(db);
      const later = 'ch_topupbbbb2';
      stubStripe(
        new Map([
          [earlier, { ...topUpCharge(earlier, 'DE'), refundedMinorUnits: CHARGE_CENTS }],
          [later, topUpCharge(later, 'DE')],
        ]),
      );
      ledger.requests.push({
        id: 'request-earlier',
        user_id: USER_ID,
        charge_id: earlier,
        charge_kind: 'top_up',
        charge_amount_cents: CHARGE_CENTS,
        charge_currency: 'usd',
        charge_created_at: NOW.toISOString(),
        reason: 'statutory_withdrawal',
        details: null,
        statutory_withdrawal: true,
        billing_country: 'DE',
        assessment: 'statutory_withdrawal',
        assessed_refund_cents: CHARGE_CENTS,
        status: 'refunded',
        refund_amount_cents: CHARGE_CENTS,
        decision_note: null,
        decided_at: NOW.toISOString(),
        created_at: NOW.toISOString(),
      });

      await fileFor(db, later, 'statutory_withdrawal');

      expect(refundedCents()).toEqual(expected);
    },
  );

  it('refunds nothing automatically while an earlier top-up refund cannot be priced', async () => {
    const ledger = ledgerWithUnspentPurchase(2, 2_000);
    const { db } = createLedgerDb(ledger);
    mocks.getNeonDb.mockReturnValue(db);
    const unpriced = 'ch_topupaaaa1';
    const later = 'ch_topupbbbb2';
    stubStripe(
      new Map<string, NormalizedCharge | null>([
        [unpriced, { ...topUpCharge(unpriced, 'DE'), purchasedLedgerCents: null }],
        [later, topUpCharge(later, 'DE')],
      ]),
    );
    ledger.requests.push({
      id: 'request-unpriced',
      user_id: USER_ID,
      charge_id: unpriced,
      charge_kind: 'top_up',
      charge_amount_cents: CHARGE_CENTS,
      charge_currency: 'usd',
      charge_created_at: NOW.toISOString(),
      reason: 'statutory_withdrawal',
      details: null,
      statutory_withdrawal: true,
      billing_country: 'DE',
      assessment: 'statutory_withdrawal',
      assessed_refund_cents: CHARGE_CENTS,
      status: 'pending',
      refund_amount_cents: null,
      decision_note: null,
      decided_at: null,
      created_at: NOW.toISOString(),
    });

    const { request } = await fileFor(db, later, 'statutory_withdrawal');

    expect(mocks.refundStripeCharge).not.toHaveBeenCalled();
    expect(request).toMatchObject({ assessment: 'needs_review', assessedRefundCents: 0 });
  });
});
