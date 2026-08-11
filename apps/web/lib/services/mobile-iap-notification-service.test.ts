import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { MOBILE_IAP_PRODUCT_DEFINITIONS } from '@agiworkforce/types';
import {
  processMobileIapLifecycleEvent,
  type MobileIapLifecycleEvent,
} from './mobile-iap-notification-service';

const topUp = {
  ...MOBILE_IAP_PRODUCT_DEFINITIONS.find((item) => item.kind === 'top_up')!,
  productId: 'fixture.topup',
};
const subscription = {
  ...MOBILE_IAP_PRODUCT_DEFINITIONS.find(
    (item) => item.kind === 'subscription' && item.planTier === 'pro',
  )!,
  productId: 'fixture.subscription',
};

function harness(options: { duplicate?: boolean } = {}) {
  const execute = vi.fn(async () => undefined);
  const query = vi.fn(
    async (sql: string, _params?: readonly unknown[]): Promise<Record<string, unknown>[]> => {
      if (sql.includes('insert into public.mobile_iap_notification_receipts')) {
        return options.duplicate ? [] : [{ notification_id: 'notice-1' }];
      }
      if (sql.includes('from public.mobile_iap_transactions receipt')) {
        return [
          {
            id: 'receipt-1',
            user_id: 'user-1',
            app_account_token: '00000000-0000-4000-8000-000000000001',
            intended_amount_cents: 1_000,
            refunded_amount_cents: 0,
          },
        ];
      }
      if (sql.includes('update public.subscriptions')) return [{ id: 'sub-1' }];
      if (sql.includes('get_or_create_credit_account')) {
        return [{ get_or_create_credit_account: 'account-1' }];
      }
      return [];
    },
  );
  const db = {
    query,
    execute,
    transaction: vi.fn(async (callback: (tx: DatabaseAdapter) => Promise<unknown>) =>
      callback(db as unknown as DatabaseAdapter),
    ),
  } as unknown as DatabaseAdapter;
  return { db, query, execute };
}

function event(overrides: Partial<MobileIapLifecycleEvent> = {}): MobileIapLifecycleEvent {
  return {
    platform: 'ios',
    notificationId: 'notice-1',
    eventType: 'fixture-event',
    product: topUp,
    storeTransactionId: 'transaction-1',
    purchaseTokenHash: 'hash-1',
    originalTransactionId: 'original-1',
    appAccountToken: '00000000-0000-4000-8000-000000000001',
    purchasedAt: new Date('2026-08-01T00:00:00.000Z'),
    expiresAt: null,
    entitlementStatus: 'active',
    cancelAtPeriodEnd: false,
    ...overrides,
  };
}

describe('mobile IAP lifecycle ledger', () => {
  it('makes notification replay a no-op before any entitlement mutation', async () => {
    const h = harness({ duplicate: true });
    await expect(processMobileIapLifecycleEvent({ db: h.db, event: event() })).resolves.toBe(
      'duplicate',
    );
    expect(h.query).toHaveBeenCalledTimes(1);
    expect(h.execute).not.toHaveBeenCalled();
  });

  it('revokes the purchased top-up allocation exactly once on refund', async () => {
    const h = harness();
    await expect(
      processMobileIapLifecycleEvent({
        db: h.db,
        event: event({ entitlementStatus: 'refunded', refundFraction: 0.5 }),
      }),
    ).resolves.toBe('processed');
    expect(h.execute).toHaveBeenCalledWith('select public.handle_top_up_refund($1, $2, $3)', [
      'user-1',
      500,
      expect.stringContaining('transaction-1'),
    ]);
  });

  it('renews a subscription in the same store scope and allocates only that period', async () => {
    const h = harness();
    const periodEnd = new Date('2026-09-01T00:00:00.000Z');
    await expect(
      processMobileIapLifecycleEvent({
        db: h.db,
        event: event({
          product: subscription,
          entitlementStatus: 'active',
          expiresAt: periodEnd,
          cancelAtPeriodEnd: true,
        }),
      }),
    ).resolves.toBe('processed');
    const subscriptionUpdate = h.query.mock.calls.find(([sql]) =>
      String(sql).includes('update public.subscriptions'),
    );
    expect(subscriptionUpdate?.[1]).toEqual(expect.arrayContaining(['pro', true]));
    expect(
      h.query.mock.calls.some(([sql]) => String(sql).includes('get_or_create_credit_account')),
    ).toBe(true);
  });

  it('re-grants only the amount previously revoked when Apple reverses a refund', async () => {
    const h = harness();
    h.query.mockImplementation(async (sql: string) => {
      if (sql.includes('insert into public.mobile_iap_notification_receipts')) {
        return [{ notification_id: 'notice-1' }];
      }
      if (sql.includes('from public.mobile_iap_transactions receipt')) {
        return [
          {
            id: 'receipt-1',
            user_id: 'user-1',
            app_account_token: '00000000-0000-4000-8000-000000000001',
            intended_amount_cents: 1_000,
            refunded_amount_cents: 500,
          },
        ];
      }
      if (sql.includes('public.get_credit_balance')) return [{ account_id: 'account-1' }];
      return [];
    });
    await expect(
      processMobileIapLifecycleEvent({
        db: h.db,
        event: event({ entitlementStatus: 'restored' }),
      }),
    ).resolves.toBe('processed');
    expect(h.execute).toHaveBeenCalledWith('select public.add_credits($1, $2, $3, $4, $5)', [
      'user-1',
      'account-1',
      500,
      expect.stringContaining('refund reversed'),
      'purchase',
    ]);
  });

  it('rejects a verified event whose account token differs from the receipt owner', async () => {
    const h = harness();
    await expect(
      processMobileIapLifecycleEvent({
        db: h.db,
        event: event({ appAccountToken: '00000000-0000-4000-8000-000000000002' }),
      }),
    ).rejects.toThrow(/account binding/i);
  });
});
