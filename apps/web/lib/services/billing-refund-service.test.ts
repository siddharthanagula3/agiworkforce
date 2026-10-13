import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { STORE_CHARGE_ID_PREFIX } from '@/lib/billing/refund-requests';
import { recordNotification } from './notification-service';
import { recordStoreRefund } from './billing-refund-service';

type NotificationModule = typeof import('./notification-service');

vi.mock('server-only', () => ({}));
vi.mock('./notification-service', async (importOriginal) => ({
  ...(await importOriginal<NotificationModule>()),
  recordNotification: vi.fn(),
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

    await expect(recordStoreRefund(db, INPUT)).resolves.toMatchObject({
      userId: REQUEST.user_id,
      status: 'refunded',
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
    expect(recordNotification).toHaveBeenCalledWith(
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
    expect(recordNotification).not.toHaveBeenCalled();
  });

  it('does not notify success when the owner-bound update no longer matches', async () => {
    const query = vi.fn().mockResolvedValueOnce([REQUEST]).mockResolvedValueOnce([]);
    const db = { query } as unknown as DatabaseAdapter;

    await expect(recordStoreRefund(db, INPUT)).rejects.toMatchObject({ status: 409 });

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]?.[1]?.[5]).toBe(REQUEST.user_id);
    expect(recordNotification).not.toHaveBeenCalled();
  });
});
