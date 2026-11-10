import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { STORE_CHARGE_ID_PREFIX } from '@/lib/billing/refund-requests';
import { insertNotification } from './notification-service';
import { declineRefundRequest, recordStoreRefund } from './billing-refund-service';

type NotificationModule = typeof import('./notification-service');

vi.mock('server-only', () => ({}));
vi.mock('./notification-service', async (importOriginal) => ({
  ...(await importOriginal<NotificationModule>()),
  insertNotification: vi.fn(),
}));

const REQUEST = {
  id: 'request-1',
  user_id: 'customer-1',
  charge_id: `${STORE_CHARGE_ID_PREFIX}ios:transaction-1`,
  charge_kind: 'plan',
  charge_amount_cents: 2_000,
  charge_currency: 'usd',
  charge_created_at: '2026-10-01T00:00:00.000Z',
  reason: 'technical_problem',
  details: null,
  statutory_withdrawal: false,
  billing_country: null,
  assessment: 'needs_review',
  assessed_refund_cents: null,
  status: 'pending',
  refund_amount_cents: null,
  decision_note: null,
  decided_at: null,
  created_at: '2026-10-01T00:00:00.000Z',
};
const INPUT = {
  operatorUserId: 'operator-1',
  requestId: REQUEST.id,
  amountCents: null,
  note: 'Store refund confirmed.',
};

afterEach(() => vi.clearAllMocks());

describe('recordStoreRefund ownership', () => {
  it('binds the decision to the customer resolved from the pending request', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([REQUEST])
      .mockResolvedValueOnce([
        {
          ...REQUEST,
          status: 'refunded',
          refund_amount_cents: REQUEST.charge_amount_cents,
          decision_note: INPUT.note,
          decided_at: '2026-10-02T00:00:00.000Z',
        },
      ]);
    const db = { query } as unknown as DatabaseAdapter;

    vi.mocked(insertNotification).mockResolvedValueOnce('inserted');

    await expect(recordStoreRefund(db, INPUT)).resolves.toMatchObject({
      request: { userId: REQUEST.user_id, status: 'refunded' },
      customerNotified: true,
    });

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[0]).toMatch(/select user_id, charge_id/u);
    expect(query.mock.calls[0]?.[1]).toEqual([REQUEST.id]);
    const [sql, parameters] = query.mock.calls[1]!;
    expect(sql).toMatch(/where id = \$1\s+and user_id = \$6/u);
    expect(sql).toContain("and status = 'pending'");
    expect(sql).toContain('and starts_with(charge_id, $5)');
    expect(sql).toContain('and ($3::bigint is null or $3::bigint <= charge_amount_cents)');
    expect(parameters).toEqual([
      REQUEST.id,
      INPUT.operatorUserId,
      INPUT.amountCents,
      INPUT.note,
      STORE_CHARGE_ID_PREFIX,
      REQUEST.user_id,
    ]);
    expect(insertNotification).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ userId: REQUEST.user_id }),
    );
  });

  it.each([
    { state: 'missing', rows: [] },
    { state: 'declined', rows: [{ ...REQUEST, status: 'declined' }] },
    { state: 'refunded', rows: [{ ...REQUEST, status: 'refunded' }] },
  ])('refuses a $state request before any decision or notification', async ({ rows }) => {
    const query = vi.fn().mockResolvedValueOnce(rows);
    const db = { query } as unknown as DatabaseAdapter;

    await expect(recordStoreRefund(db, INPUT)).rejects.toMatchObject({ status: 409 });

    expect(query).toHaveBeenCalledTimes(1);
    expect(insertNotification).not.toHaveBeenCalled();
  });

  it('does not notify success when the owner-bound update no longer matches', async () => {
    const query = vi.fn().mockResolvedValueOnce([REQUEST]).mockResolvedValueOnce([]);
    const db = { query } as unknown as DatabaseAdapter;

    await expect(recordStoreRefund(db, INPUT)).rejects.toMatchObject({ status: 409 });

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]?.[1]?.[5]).toBe(REQUEST.user_id);
    expect(insertNotification).not.toHaveBeenCalled();
  });
});

const DECIDED_STORE = {
  ...REQUEST,
  status: 'refunded',
  refund_amount_cents: REQUEST.charge_amount_cents,
  decision_note: INPUT.note,
  decided_at: '2026-10-02T00:00:00.000Z',
};
const DECIDED_DECLINE = {
  ...REQUEST,
  status: 'declined',
  decision_note: 'Outside the refund window.',
  decided_at: '2026-10-02T00:00:00.000Z',
};
const DECLINE_INPUT = {
  operatorUserId: 'operator-1',
  requestId: REQUEST.id,
  note: DECIDED_DECLINE.decision_note,
};

function transactionalDb(rows: unknown[][]) {
  const query = vi.fn();
  for (const result of rows) query.mockResolvedValueOnce(result);
  const db = {
    query,
    transaction: async <T>(fn: (tx: DatabaseAdapter) => Promise<T>) => fn(db),
  } as unknown as DatabaseAdapter;
  return { db, query };
}

describe('operator decision receipts', () => {
  it('keeps the recorded store refund and says the customer was not told when the notification insert throws', async () => {
    const query = vi.fn().mockResolvedValueOnce([REQUEST]).mockResolvedValueOnce([DECIDED_STORE]);
    const db = { query } as unknown as DatabaseAdapter;
    vi.mocked(insertNotification).mockRejectedValueOnce(new Error('insert failed'));

    await expect(recordStoreRefund(db, INPUT)).resolves.toMatchObject({
      request: { id: REQUEST.id, status: 'refunded' },
      customerNotified: false,
    });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('keeps the decline and says the customer was not told when the notification insert throws', async () => {
    const { db, query } = transactionalDb([[REQUEST], [DECIDED_DECLINE]]);
    vi.mocked(insertNotification).mockRejectedValueOnce(new Error('insert failed'));

    await expect(declineRefundRequest(db, DECLINE_INPUT)).resolves.toMatchObject({
      request: { id: REQUEST.id, status: 'declined' },
      customerNotified: false,
    });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('says the customer was not told when no notification was written', async () => {
    const { db } = transactionalDb([[REQUEST], [DECIDED_DECLINE]]);
    vi.mocked(insertNotification).mockResolvedValueOnce('invalid');

    await expect(declineRefundRequest(db, DECLINE_INPUT)).resolves.toMatchObject({
      customerNotified: false,
    });
  });

  it('counts a notification that already exists for this decision as told', async () => {
    const { db } = transactionalDb([[REQUEST], [DECIDED_DECLINE]]);
    vi.mocked(insertNotification).mockResolvedValueOnce('duplicate');

    await expect(declineRefundRequest(db, DECLINE_INPUT)).resolves.toMatchObject({
      request: { status: 'declined' },
      customerNotified: true,
    });
    expect(insertNotification).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ dedupeKey: `refund-request:${REQUEST.id}:declined` }),
    );
  });
});
