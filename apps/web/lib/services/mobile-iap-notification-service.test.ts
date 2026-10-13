import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { MOBILE_IAP_PRODUCT_DEFINITIONS } from '@agiworkforce/types';
import {
  grantMobileIapPurchaseFromStore,
  processMobileIapLifecycleEvent,
  type MobileIapLifecycleEvent,
} from './mobile-iap-notification-service';
import { SubscriptionService } from './subscription-service';
import {
  recordMobileIapStoreCommission,
  recordVerifiedMobileIapPurchase,
} from './mobile-iap-ledger-service';
import { createError } from '@/lib/errors';
import { readStoreTestPurchasesAllowed } from '@/lib/feature-flags/store-test-purchase-gate';
import {
  hashMobileIapPurchaseToken,
  type VerifiedMobileIapPurchase,
} from '@/lib/server/mobile-iap-store-verification';

type LedgerModule = typeof import('./mobile-iap-ledger-service');

vi.mock('./mobile-iap-ledger-service', async (importOriginal) => ({
  ...(await importOriginal<LedgerModule>()),
  recordVerifiedMobileIapPurchase: vi.fn(),
  recordMobileIapStoreCommission: vi.fn(),
}));

vi.mock('@/lib/feature-flags/store-test-purchase-gate', () => ({
  readStoreTestPurchasesAllowed: vi.fn(async () => false),
}));

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

interface OwnerRow {
  plan_tier: string;
  status: string;
  stripe_subscription_id: string | null;
  apple_original_transaction_id: string | null;
  google_purchase_token: string | null;
  current_period_end: string | null;
}

const LIVE_PERIOD_END = '2999-01-01T00:00:00.000Z';

function ownerRow(overrides: Partial<OwnerRow> = {}): OwnerRow {
  return {
    plan_tier: 'pro',
    status: 'active',
    stripe_subscription_id: null,
    apple_original_transaction_id: 'original-1',
    google_purchase_token: null,
    current_period_end: LIVE_PERIOD_END,
    ...overrides,
  };
}

function harness(
  options: {
    duplicate?: boolean;
    owner?: OwnerRow | null;
    receiptEnvironment?: string | null;
    renewalStateClaimed?: boolean;
  } = {},
) {
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
            environment: options.receiptEnvironment ?? 'production',
          },
        ];
      }
      if (sql.includes('update public.mobile_iap_accounts')) {
        return options.renewalStateClaimed === false ? [] : [{ user_id: 'user-1' }];
      }
      if (sql.includes('update public.subscriptions')) return [{ id: 'sub-1' }];
      if (sql.includes('from public.subscriptions')) {
        const owner = options.owner === undefined ? ownerRow() : options.owner;
        return owner ? [{ ...owner }] : [];
      }
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
    environment: 'production',
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
            environment: 'production',
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
  function subscriptionEvent(overrides: Partial<MobileIapLifecycleEvent> = {}) {
    return event({
      product: subscription,
      expiresAt: new Date('2026-09-01T00:00:00.000Z'),
      ...overrides,
    });
  }

  function subscriptionWrite(h: ReturnType<typeof harness>) {
    const call = h.query.mock.calls.find(([sql]) =>
      String(sql).includes('update public.subscriptions'),
    );
    return { sql: String(call?.[0] ?? ''), params: call?.[1] };
  }

  it('keeps the plan through a grace period to the date the store names, allocating nothing', async () => {
    const h = harness();
    const allocate = vi.spyOn(SubscriptionService, 'allocateCreditsForPeriod');
    const graceEnd = new Date('2026-09-17T00:00:00.000Z');

    await expect(
      processMobileIapLifecycleEvent({
        db: h.db,
        event: subscriptionEvent({ entitlementStatus: 'grace', accessUntil: graceEnd }),
      }),
    ).resolves.toBe('processed');

    const write = subscriptionWrite(h);
    expect(write.sql).toContain("set status = 'active'");
    expect(write.sql).toContain('greatest(current_period_end');
    expect(write.params).toEqual(['user-1', graceEnd.toISOString(), '2026-08-01T00:00:00.000Z']);
    expect(allocate).not.toHaveBeenCalled();
    allocate.mockRestore();
  });

  it.each([
    ['on_hold', 'past_due'],
    ['paused', 'paused'],
  ] as const)('suspends a subscription that is %s without ending it', async (state, status) => {
    const h = harness();

    await expect(
      processMobileIapLifecycleEvent({
        db: h.db,
        event: subscriptionEvent({ entitlementStatus: state }),
      }),
    ).resolves.toBe('processed');

    const write = subscriptionWrite(h);
    expect(write.params).toEqual(['user-1', status, '2026-08-01T00:00:00.000Z']);
    expect(write.sql).not.toContain("plan_tier = 'free'");
    expect(write.sql).not.toContain('canceled_at');
  });

  it.each(['expired', 'revoked', 'refunded'] as const)(
    'ends the plan and marks the receipt when a subscription is %s',
    async (state) => {
      const h = harness();

      await expect(
        processMobileIapLifecycleEvent({
          db: h.db,
          event: subscriptionEvent({ entitlementStatus: state }),
        }),
      ).resolves.toBe('processed');

      expect(subscriptionWrite(h).sql).toContain("status = 'canceled', plan_tier = 'free'");
      expect(h.execute).toHaveBeenCalledWith(
        expect.stringContaining('update public.mobile_iap_transactions'),
        ['receipt-1', state, '2026-09-01T00:00:00.000Z'],
      );
    },
  );

  it('ignores a late App Store notice about a period that has since renewed', async () => {
    const h = harness();
    const original = h.query.getMockImplementation()!;
    h.query.mockImplementation(async (sql: string, params?: readonly unknown[]) => {
      if (sql.includes('update public.subscriptions')) return [];
      return original(sql, params);
    });

    await expect(
      processMobileIapLifecycleEvent({
        db: h.db,
        event: subscriptionEvent({ entitlementStatus: 'expired' }),
      }),
    ).resolves.toBe('stale');

    expect(
      h.execute.mock.calls.some((call: unknown[]) =>
        String(call[0]).includes('update public.mobile_iap_transactions'),
      ),
    ).toBe(false);
  });

  const googleOwner = ownerRow({
    apple_original_transaction_id: null,
    google_purchase_token: 'live-token',
  });

  function subscriptionWrites(h: ReturnType<typeof harness>) {
    return h.query.mock.calls.filter(([sql]) =>
      String(sql).includes('update public.subscriptions'),
    );
  }

  function receiptWrites(h: ReturnType<typeof harness>) {
    return h.execute.mock.calls.filter((call: unknown[]) =>
      String(call[0]).includes('update public.mobile_iap_transactions'),
    );
  }

  it('applies no period guard to the Google token a subscription is on, because Play state is read live', async () => {
    const h = harness({ owner: googleOwner });

    await expect(
      processMobileIapLifecycleEvent({
        db: h.db,
        event: subscriptionEvent({
          platform: 'android',
          entitlementStatus: 'expired',
          rawGooglePurchaseToken: 'live-token',
        }),
      }),
    ).resolves.toBe('processed');

    expect(subscriptionWrite(h).params).toEqual(['user-1', null]);
  });

  it.each(['expired', 'revoked', 'on_hold', 'paused', 'grace'] as const)(
    'leaves the live plan alone when a replaced Google token is reported %s',
    async (state) => {
      const h = harness({ owner: googleOwner });

      await expect(
        processMobileIapLifecycleEvent({
          db: h.db,
          event: subscriptionEvent({
            platform: 'android',
            entitlementStatus: state,
            accessUntil: new Date('2026-09-04T00:00:00.000Z'),
            rawGooglePurchaseToken: 'replaced-token',
          }),
        }),
      ).resolves.toBe('stale');

      expect(subscriptionWrites(h)).toEqual([]);
    },
  );

  it('still records that the replaced Google purchase itself has ended', async () => {
    const h = harness({ owner: googleOwner });

    await processMobileIapLifecycleEvent({
      db: h.db,
      event: subscriptionEvent({
        platform: 'android',
        entitlementStatus: 'expired',
        rawGooglePurchaseToken: 'replaced-token',
      }),
    });

    expect(receiptWrites(h)).toEqual([
      [expect.any(String), ['receipt-1', 'expired', '2026-09-01T00:00:00.000Z']],
    ]);
  });

  it.each([
    ['the App Store', ownerRow()],
    [
      'Stripe',
      ownerRow({ stripe_subscription_id: 'sub_live', apple_original_transaction_id: null }),
    ],
  ] as const)(
    'leaves a plan now billed through %s alone when a Google notice arrives late',
    async (_owner, owner) => {
      for (const state of ['expired', 'on_hold', 'active'] as const) {
        const h = harness({ owner });

        await expect(
          processMobileIapLifecycleEvent({
            db: h.db,
            event: subscriptionEvent({
              platform: 'android',
              entitlementStatus: state,
              rawGooglePurchaseToken: 'old-google-token',
            }),
          }),
        ).resolves.toBe('stale');

        expect(subscriptionWrites(h)).toEqual([]);
      }
    },
  );

  it.each(['expired', 'refunded', 'on_hold', 'grace', 'active'] as const)(
    'leaves a plan on another App Store subscription alone when a notice is %s',
    async (state) => {
      const h = harness({ owner: ownerRow({ apple_original_transaction_id: 'original-2' }) });

      await expect(
        processMobileIapLifecycleEvent({
          db: h.db,
          event: subscriptionEvent({
            entitlementStatus: state,
            accessUntil: new Date('2026-09-04T00:00:00.000Z'),
          }),
        }),
      ).resolves.toBe('stale');

      expect(subscriptionWrites(h)).toEqual([]);
    },
  );

  it('lets a purchase that is active at the store take a plan nobody else is paying for', async () => {
    const h = harness({
      owner: ownerRow({
        plan_tier: 'free',
        status: 'canceled',
        apple_original_transaction_id: 'original-2',
      }),
    });

    await expect(
      processMobileIapLifecycleEvent({ db: h.db, event: subscriptionEvent() }),
    ).resolves.toBe('processed');

    expect(subscriptionWrites(h)).toHaveLength(1);
  });

  it('keeps a newer auto-renew choice when an older App Store notice arrives after it', async () => {
    const h = harness({ renewalStateClaimed: false });
    const signedAt = new Date('2026-08-02T00:00:00.000Z');

    await expect(
      processMobileIapLifecycleEvent({
        db: h.db,
        event: subscriptionEvent({ cancelAtPeriodEnd: false, signedAt }),
      }),
    ).resolves.toBe('processed');

    const claim = h.query.mock.calls.find(([sql]) =>
      String(sql).includes('update public.mobile_iap_accounts'),
    );
    expect(String(claim?.[0])).toContain('renewal_state_signed_at <= $2');
    expect(claim?.[1]).toEqual(['user-1', signedAt.toISOString()]);
    const write = subscriptionWrite(h);
    expect(write.sql).toContain(
      'cancel_at_period_end = case when $10 then $7 else s.cancel_at_period_end end',
    );
    expect(write.params?.[9]).toBe(false);
  });

  it('sets the auto-renew choice from the newest App Store notice', async () => {
    const h = harness();

    await processMobileIapLifecycleEvent({
      db: h.db,
      event: subscriptionEvent({
        cancelAtPeriodEnd: true,
        signedAt: new Date('2026-08-03T00:00:00.000Z'),
      }),
    });

    expect(subscriptionWrite(h).params?.[9]).toBe(true);
  });

  it('never lets a sandbox notice move a receipt that was paid for', async () => {
    const h = harness({ receiptEnvironment: 'production' });

    await expect(
      processMobileIapLifecycleEvent({
        db: h.db,
        event: subscriptionEvent({ entitlementStatus: 'expired', environment: 'sandbox' }),
      }),
    ).resolves.toBe('stale');

    expect(subscriptionWrites(h)).toEqual([]);
    expect(receiptWrites(h)).toEqual([]);
  });

  describe('a test purchase renewing on a production deployment', () => {
    it('stops renewing once the operator no longer allows the account', async () => {
      vi.stubEnv('VERCEL_ENV', 'production');
      vi.mocked(readStoreTestPurchasesAllowed).mockResolvedValue(false);
      const h = harness({ receiptEnvironment: 'sandbox' });

      await expect(
        processMobileIapLifecycleEvent({
          db: h.db,
          event: subscriptionEvent({ environment: 'sandbox' }),
        }),
      ).resolves.toBe('stale');

      expect(subscriptionWrites(h)).toEqual([]);
      vi.unstubAllEnvs();
    });

    it('renews for an allowed account and records no store commission', async () => {
      vi.stubEnv('VERCEL_ENV', 'production');
      vi.mocked(readStoreTestPurchasesAllowed).mockResolvedValue(true);
      vi.mocked(recordMobileIapStoreCommission).mockClear();
      const h = harness({ receiptEnvironment: 'sandbox' });

      await expect(
        processMobileIapLifecycleEvent({
          db: h.db,
          event: subscriptionEvent({ environment: 'sandbox' }),
        }),
      ).resolves.toBe('processed');

      expect(readStoreTestPurchasesAllowed).toHaveBeenCalledWith('user-1');
      expect(recordMobileIapStoreCommission).not.toHaveBeenCalled();
      vi.unstubAllEnvs();
      vi.mocked(readStoreTestPurchasesAllowed).mockResolvedValue(false);
    });
  });

  it('carries usage into the new period when a notice reports an upgrade', async () => {
    const h = harness();
    const carry = vi
      .spyOn(SubscriptionService, 'carryCreditsForUpgradePeriod')
      .mockResolvedValue('account-1');
    const allocate = vi.spyOn(SubscriptionService, 'allocateCreditsForPeriod');
    const original = h.query.getMockImplementation()!;
    h.query.mockImplementation(async (sql: string, params?: readonly unknown[]) => {
      if (sql.includes('update public.subscriptions')) {
        return [
          {
            id: 'sub-1',
            plan_catalog_version: 2,
            previous_plan_tier: 'basic',
            previous_plan_catalog_version: 2,
            previous_period_end: '2026-08-15T00:00:00.000Z',
          },
        ];
      }
      return original(sql, params);
    });

    await processMobileIapLifecycleEvent({ db: h.db, event: subscriptionEvent() });

    expect(carry).toHaveBeenCalledWith(
      'user-1',
      'sub-1',
      'basic',
      'pro',
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-09-01T00:00:00.000Z'),
      expect.anything(),
      { previous: 2, next: 2 },
    );
    expect(allocate).not.toHaveBeenCalled();
    carry.mockRestore();
    allocate.mockRestore();
  });

  it('finds the subscription a Google plan change replaced through its linked token', async () => {
    const h = harness({
      owner: ownerRow({ apple_original_transaction_id: null, google_purchase_token: 'old-token' }),
    });

    await processMobileIapLifecycleEvent({
      db: h.db,
      event: subscriptionEvent({
        platform: 'android',
        purchaseTokenHash: 'hash-new',
        originalTransactionId: hashMobileIapPurchaseToken('old-token'),
        rawGooglePurchaseToken: 'new-token',
      }),
    });

    const anchor = h.query.mock.calls.find(([sql]) =>
      String(sql).includes('from public.mobile_iap_transactions receipt'),
    );
    expect(String(anchor?.[0])).toContain('receipt.purchase_token_hash = $4');
    expect(anchor?.[1]).toEqual([
      'android',
      'transaction-1',
      'hash-new',
      hashMobileIapPurchaseToken('old-token'),
    ]);
    expect(subscriptionWrite(h).params).toEqual(expect.arrayContaining(['new-token']));
  });
});

describe('a purchase the store reports before the app does', () => {
  const verified = {
    platform: 'ios',
    product: subscription,
    storeTransactionId: 'transaction-9',
    purchaseTokenHash: 'hash-9',
    originalTransactionId: 'transaction-9',
    purchasedAt: new Date('2026-08-01T00:00:00.000Z'),
    expiresAt: new Date('2026-09-01T00:00:00.000Z'),
    environment: 'production',
    entitlementStatus: 'active',
  } as VerifiedMobileIapPurchase;

  function accountDb(userId: string | null) {
    return {
      query: vi.fn(async () => (userId ? [{ user_id: userId }] : [])),
    } as unknown as DatabaseAdapter;
  }

  it('is granted to the account its store token is bound to', async () => {
    vi.mocked(recordVerifiedMobileIapPurchase).mockResolvedValue({
      success: true,
      kind: 'subscription',
      productKey: subscription.key,
      status: 'active',
    });
    const db = accountDb('user-7');

    await expect(
      grantMobileIapPurchaseFromStore({
        db,
        appAccountToken: '00000000-0000-4000-8000-000000000007',
        purchaseToken: 'signed-transaction',
        verified,
      }),
    ).resolves.toBe('granted');
    expect(recordVerifiedMobileIapPurchase).toHaveBeenCalledWith({
      db,
      userId: 'user-7',
      purchaseToken: 'signed-transaction',
      verified,
    });
  });

  it('is left alone when no account holds that store token', async () => {
    vi.mocked(recordVerifiedMobileIapPurchase).mockClear();

    await expect(
      grantMobileIapPurchaseFromStore({
        db: accountDb(null),
        appAccountToken: '00000000-0000-4000-8000-000000000008',
        purchaseToken: 'signed-transaction',
        verified,
      }),
    ).resolves.toBe('unknown_account');
    expect(recordVerifiedMobileIapPurchase).not.toHaveBeenCalled();
  });

  it('does not make the store retry a charge the ledger refused and filed for refund', async () => {
    vi.mocked(recordVerifiedMobileIapPurchase).mockRejectedValue(
      createError.conflict('This subscription is billed on the web.'),
    );

    await expect(
      grantMobileIapPurchaseFromStore({
        db: accountDb('user-7'),
        appAccountToken: '00000000-0000-4000-8000-000000000007',
        purchaseToken: 'signed-transaction',
        verified,
      }),
    ).resolves.toBe('refund_filed');
  });

  it.each([
    ['a test purchase, which charged nobody', { environment: 'sandbox' as const }, 409],
    ['a refusal that files nothing', {}, 403],
  ])('reports %s as not grantable', async (_case, overrides, statusCode) => {
    vi.mocked(recordVerifiedMobileIapPurchase).mockRejectedValue(
      statusCode === 409
        ? createError.conflict('This subscription is billed on the web.')
        : createError.forbidden('This store receipt belongs to another account.'),
    );

    await expect(
      grantMobileIapPurchaseFromStore({
        db: accountDb('user-7'),
        appAccountToken: '00000000-0000-4000-8000-000000000007',
        purchaseToken: 'signed-transaction',
        verified: { ...verified, ...overrides },
      }),
    ).resolves.toBe('not_grantable');
  });

  it('lets the store retry when the ledger fails for a reason that may pass', async () => {
    vi.mocked(recordVerifiedMobileIapPurchase).mockRejectedValue(new Error('connection reset'));

    await expect(
      grantMobileIapPurchaseFromStore({
        db: accountDb('user-7'),
        appAccountToken: '00000000-0000-4000-8000-000000000007',
        purchaseToken: 'signed-transaction',
        verified,
      }),
    ).rejects.toThrow(/connection reset/);
  });
});
