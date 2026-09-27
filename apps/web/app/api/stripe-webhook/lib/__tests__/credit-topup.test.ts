import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { handleCreditTopUp } from '../db';
import { dispatchStripeEvent } from '../handlers';

const PACK_METADATA = {
  type: 'credit_topup',
  conversion: 'usd_1_to_credits_50_v2',
  amount_usd: '20',
  price_cents: '2000',
  discount_percent: '0',
  credit_amount_cents: '500',
  top_up_units: '1000',
  auto_reload: 'false',
};

function topUpSession(overrides: Record<string, unknown> = {}): Stripe.Checkout.Session {
  return {
    id: 'cs_topup_123',
    metadata: { ...PACK_METADATA, user_id: 'user_123' },
    currency: 'usd',
    amount_subtotal: 2_000,
    amount_total: 2_166,
    payment_intent: 'pi_123',
    automatic_tax: { enabled: true, status: 'complete' },
    total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: 166 },
    ...overrides,
  } as unknown as Stripe.Checkout.Session;
}

function database() {
  let balanceReads = 0;
  return {
    query: vi.fn(async (sql: string): Promise<Array<Record<string, unknown>>> => {
      if (sql.includes('from credit_transactions')) return [];
      if (sql.includes('from subscriptions')) {
        return [
          {
            id: 'sub_db_123',
            current_period_start: '2026-08-01',
            current_period_end: '2026-09-01',
          },
        ];
      }
      if (sql.includes('from token_credits') && sql.includes('subscription_id')) {
        return [{ id: 'credits_123' }];
      }
      if (sql.includes('remaining_microusd')) {
        balanceReads += 1;
        return [{ remaining_microusd: balanceReads === 1 ? 2_000_000 : 7_000_000 }];
      }
      return [];
    }),
    execute: vi.fn(async () => 1),
  };
}

function stripe() {
  return {
    paymentIntents: {
      retrieve: vi.fn(async () => ({
        id: 'pi_123',
        status: 'succeeded',
        currency: 'usd',
        amount_received: 2_166,
      })),
    },
  };
}

describe('credit top-up settlement', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  it('adds the $20 pack as 1,000 credits once while allowing tax on top', async () => {
    const db = database();
    const provider = stripe();

    await handleCreditTopUp(
      db as unknown as DatabaseAdapter,
      provider as unknown as Stripe,
      topUpSession(),
    );

    expect(provider.paymentIntents.retrieve).toHaveBeenCalledWith('pi_123');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('and period_start = $3 and period_end = $4'),
      ['user_123', 'sub_db_123', '2026-08-01', '2026-09-01'],
    );
    expect(db.execute).toHaveBeenCalledWith('select add_credits_microusd($1, $2, $3, $4, $5, $6)', [
      'user_123',
      'credits_123',
      5_000_000,
      'Credit top-up purchase cs_topup_123',
      'purchase',
      '{}',
    ]);
  });

  it('records where a pack was bought so local law can set when it expires', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-27T12:00:00.000Z'));
    const db = database();

    await handleCreditTopUp(
      db as unknown as DatabaseAdapter,
      stripe() as unknown as Stripe,
      topUpSession({ customer_details: { address: { country: 'JP' } } }),
    );

    const grant = (db.execute.mock.calls as unknown as Array<[string, unknown[]]>).find(([sql]) =>
      sql.includes('add_credits_microusd'),
    );
    expect(JSON.parse(String(grant?.[1][5]))).toEqual({
      purchase_country: 'JP',
      purchase_expires_at: '2027-03-27T12:00:00.000Z',
    });
  });

  it('rejects metadata that grants more than 50 credits per dollar', async () => {
    const db = database();
    const provider = stripe();

    await expect(
      handleCreditTopUp(
        db as unknown as DatabaseAdapter,
        provider as unknown as Stripe,
        topUpSession({
          metadata: { ...PACK_METADATA, user_id: 'user_123', top_up_units: '2000' },
        }),
      ),
    ).rejects.toThrow('Invalid credit top-up metadata');
    expect(provider.paymentIntents.retrieve).not.toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('does not reapply a Checkout Session delivered by a second Stripe event', async () => {
    const db = database();
    db.query.mockResolvedValueOnce([{ id: 'transaction_123' }]);
    const provider = stripe();

    await handleCreditTopUp(
      db as unknown as DatabaseAdapter,
      provider as unknown as Stripe,
      topUpSession(),
    );

    expect(provider.paymentIntents.retrieve).not.toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('does not mark a subscription past due when an async top-up payment fails', async () => {
    const db = database();
    await dispatchStripeEvent(
      db as unknown as DatabaseAdapter,
      stripe() as unknown as Stripe,
      {
        id: 'evt_123',
        type: 'checkout.session.async_payment_failed',
        data: { object: topUpSession({ customer: 'cus_123' }) },
      } as unknown as Stripe.Event,
    );

    expect(db.execute).not.toHaveBeenCalled();
  });

  it('revokes purchased balance but not sales tax on a full top-up refund', async () => {
    const db = database();
    db.query.mockImplementation(async (sql: string): Promise<Array<Record<string, unknown>>> => {
      if (sql.includes('from profiles')) return [{ id: 'user_123' }];
      if (sql.includes('sum(-amount_microusd)')) return [{ revoked: 0 }];
      return [];
    });

    await dispatchStripeEvent(
      db as unknown as DatabaseAdapter,
      stripe() as unknown as Stripe,
      {
        id: 'evt_refund_123',
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_topup_123',
            customer: 'cus_123',
            amount: 2_166,
            amount_refunded: 2_166,
            refunded: true,
            metadata: PACK_METADATA,
          },
        },
      } as unknown as Stripe.Event,
    );

    expect(db.execute).toHaveBeenCalledWith('select handle_top_up_refund_microusd($1, $2, $3)', [
      'user_123',
      5_000_000,
      'Refund for charge ch_topup_123',
    ]);
    expect(db.execute).not.toHaveBeenCalledWith(
      expect.stringContaining('update subscriptions'),
      expect.anything(),
    );
  });
});
