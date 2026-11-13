import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { MOBILE_IAP_PRODUCT_DEFINITIONS, topUpBudgetCentsForCredits } from '@agiworkforce/types';
import {
  grantMobileIapPurchaseFromStore,
  processMobileIapLifecycleEvent,
  recordAppleConsentRescission,
  registerAppleAppTransaction,
  type MobileIapLifecycleEvent,
} from './mobile-iap-notification-service';
import { SubscriptionService } from './subscription-service';
import {
  recordMobileIapStoreCommission,
  recordVerifiedMobileIapPurchase,
  storeChargeId,
} from './mobile-iap-ledger-service';
import { createError } from '@/lib/errors';
import { MICROUSD_PER_LEDGER_CENT } from '@/lib/server/managed-usage-policy';
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

function grantedMicrousd(fractionOfPrice: number): number {
  return Math.round(
    topUpBudgetCentsForCredits(topUp.units) * MICROUSD_PER_LEDGER_CENT * fractionOfPrice,
  );
}

function harness(
  options: {
    duplicate?: boolean;
    owner?: OwnerRow | null;
    receiptEnvironment?: string | null;
    renewalStateClaimed?: boolean;
    refundedAmountCents?: number;
    refundStateSignedAt?: string | null;
  } = {},
) {
  const execute = vi.fn(async (_sql: string, _params?: readonly unknown[]) => undefined);
  const query = vi.fn(
    async (sql: string, params?: readonly unknown[]): Promise<Record<string, unknown>[]> => {
      if (sql.includes('insert into public.mobile_iap_notification_receipts')) {
        return options.duplicate ? [] : [{ notification_id: 'notice-1' }];
      }
      if (sql.includes('from public.mobile_iap_transactions receipt')) {
        return [
          {
            id: 'receipt-1',
            user_id: 'user-1',
            app_account_token: '00000000-0000-4000-8000-000000000001',
            units_granted: topUp.units,
            intended_amount_cents: 1_000,
            refunded_amount_cents: options.refundedAmountCents ?? 0,
            refund_state_signed_at: options.refundStateSignedAt ?? null,
            environment: options.receiptEnvironment ?? 'production',
          },
        ];
      }
      if (sql.includes('from public.credit_transactions')) {
        const description = String(params?.[1]);
        const rows = sql.includes("transaction_type = 'refund'") ? revokedFromBalance : grants;
        return [{ total: String(rows[description] ?? 0) }];
      }
      if (sql.includes('get_credit_balance_microusd')) return [{ account_id: 'account-1' }];
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

  function refundCalls(h: ReturnType<typeof harness>) {
    return h.execute.mock.calls.filter((call: unknown[]) =>
      String(call[0]).includes('handle_top_up_refund'),
    );
  }

  it('takes back the credit a refunded top-up granted, not its price in ledger cents', async () => {
    const h = harness();
    await expect(
      processMobileIapLifecycleEvent({
        db: h.db,
        event: event({ entitlementStatus: 'refunded' }),
      }),
    ).resolves.toBe('processed');
    expect(h.execute).toHaveBeenCalledWith(
      'select public.handle_top_up_refund_microusd($1, $2, $3)',
      ['user-1', grantedMicrousd(0.5), expect.stringContaining('transaction-1')],
    );
  });

  it('revokes the credit budget the pack granted, not its retail price, on a full refund', async () => {
    const h = harness();
    await processMobileIapLifecycleEvent({
      db: h.db,
      event: event({ entitlementStatus: 'refunded' }),
    });
    expect(grantedMicrousd(1)).toBeLessThan(1_000 * MICROUSD_PER_LEDGER_CENT);
    expect(h.execute).toHaveBeenCalledWith(
      'select public.handle_top_up_refund_microusd($1, $2, $3)',
      ['user-1', grantedMicrousd(1), expect.stringContaining('transaction-1')],
    );
  });

  it('revokes only the part of the grant not already revoked by an earlier partial refund', async () => {
    const h = harness({ refundedAmountCents: 500 });
    await processMobileIapLifecycleEvent({
      db: h.db,
      event: event({ entitlementStatus: 'refunded' }),
    });
    expect(h.execute).toHaveBeenCalledWith(
      'select public.handle_top_up_refund_microusd($1, $2, $3)',
      [
        'user-1',
        grantedMicrousd(1) - grantedMicrousd(0.5),
        expect.stringContaining('transaction-1'),
      ],
    );
  });

  it('settles the commission of a renewal inside the notification transaction', async () => {
    vi.mocked(recordMobileIapStoreCommission).mockClear();
    const h = harness();
    await processMobileIapLifecycleEvent({
      db: h.db,
      event: event({
        product: subscription,
        entitlementStatus: 'active',
        expiresAt: new Date('2026-09-01T00:00:00.000Z'),
      }),
    });
    expect(recordMobileIapStoreCommission).toHaveBeenCalledTimes(1);
    expect(recordMobileIapStoreCommission).toHaveBeenCalledWith(
      h.db,
      expect.objectContaining({ userId: 'user-1', storeTransactionId: 'transaction-1' }),
    );
  });

  it('settles the commission of a top-up charge notice so a missed posting is repaired', async () => {
    vi.mocked(recordMobileIapStoreCommission).mockClear();
    const h = harness();
    await expect(
      processMobileIapLifecycleEvent({ db: h.db, event: event({ entitlementStatus: 'active' }) }),
    ).resolves.toBe('processed');
    expect(recordMobileIapStoreCommission).toHaveBeenCalledWith(
      h.db,
      expect.objectContaining({ userId: 'user-1', product: topUp }),
    );
  });

  it('fails the notice, so the store redelivers it, when the commission cannot be posted', async () => {
    vi.mocked(recordMobileIapStoreCommission).mockRejectedValueOnce(new Error('cogs unavailable'));
    const h = harness();
    await expect(
      processMobileIapLifecycleEvent({ db: h.db, event: event({ entitlementStatus: 'active' }) }),
    ).rejects.toThrow('cogs unavailable');
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
    expect(h.execute).toHaveBeenCalledWith(
      expect.stringMatching(/where charge_id = \$1 and user_id = \$3 and status = 'pending'/u),
      [storeChargeId('ios', 'transaction-1'), expect.any(String), 'user-1'],
    );
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
            units_granted: topUp.units,
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
    expect(h.execute).toHaveBeenCalledWith(
      'select public.add_credits_microusd($1, $2, $3, $4, $5)',
      [
        'user-1',
        'account-1',
        grantedMicrousd(0.5),
        expect.stringContaining('refund reversed'),
        'purchase',
      ],
    );
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

  describe('a Play snapshot read before a newer one was committed', () => {
    const readAt = new Date('2026-08-02T00:00:00.000Z');

    it.each(['on_hold', 'paused', 'grace', 'expired'] as const)(
      'does not let an older %s snapshot overwrite the newer state',
      async (state) => {
        const h = harness({ owner: googleOwner, renewalStateClaimed: false });

        await expect(
          processMobileIapLifecycleEvent({
            db: h.db,
            event: subscriptionEvent({
              platform: 'android',
              entitlementStatus: state,
              accessUntil: new Date('2026-09-04T00:00:00.000Z'),
              rawGooglePurchaseToken: 'live-token',
              signedAt: readAt,
            }),
          }),
        ).resolves.toBe('stale');

        expect(subscriptionWrites(h)).toEqual([]);
        expect(receiptWrites(h)).toEqual([]);
      },
    );

    it('does not let an older active snapshot overwrite a newer suspension', async () => {
      const h = harness({ owner: googleOwner, renewalStateClaimed: false });

      await expect(
        processMobileIapLifecycleEvent({
          db: h.db,
          event: subscriptionEvent({
            platform: 'android',
            entitlementStatus: 'active',
            rawGooglePurchaseToken: 'live-token',
            signedAt: readAt,
          }),
        }),
      ).resolves.toBe('stale');

      expect(subscriptionWrites(h)).toEqual([]);
    });

    it('applies the newest snapshot and advances the watermark it read', async () => {
      const h = harness({ owner: googleOwner });

      await expect(
        processMobileIapLifecycleEvent({
          db: h.db,
          event: subscriptionEvent({
            platform: 'android',
            entitlementStatus: 'on_hold',
            rawGooglePurchaseToken: 'live-token',
            signedAt: readAt,
          }),
        }),
      ).resolves.toBe('processed');

      const claim = h.query.mock.calls.find(([sql]) =>
        String(sql).includes('update public.mobile_iap_accounts'),
      );
      expect(claim?.[1]).toEqual(['user-1', readAt.toISOString()]);
      expect(subscriptionWrites(h)).toHaveLength(1);
    });
  });

  describe('a refund and its reversal delivered out of order', () => {
    const refundSignedAt = new Date('2026-08-02T00:00:00.000Z');
    const reversalSignedAt = new Date('2026-08-03T00:00:00.000Z');

    function refundStateWrite(h: ReturnType<typeof harness>) {
      return h.execute.mock.calls.find((call: unknown[]) =>
        String(call[0]).includes('refund_state_signed_at = $2'),
      );
    }

    function creditMovements(
      h: ReturnType<typeof harness>,
      fn: 'handle_top_up_refund' | 'add_credits',
    ) {
      return h.execute.mock.calls.filter((call: unknown[]) => String(call[0]).includes(fn));
    }

    it('records a reversal that has nothing to restore yet, so the older refund is not applied later', async () => {
      const h = harness();

      await expect(
        processMobileIapLifecycleEvent({
          db: h.db,
          event: event({ entitlementStatus: 'restored', signedAt: reversalSignedAt }),
        }),
      ).resolves.toBe('processed');

      expect(refundStateWrite(h)?.[1]).toEqual(['receipt-1', reversalSignedAt.toISOString()]);
      expect(creditMovements(h, 'add_credits')).toEqual([]);
    });

    it.each(['refunded', 'revoked'] as const)(
      'ignores an older %s notice once a newer reversal was recorded',
      async (state) => {
        const h = harness({ refundStateSignedAt: reversalSignedAt.toISOString() });

        await expect(
          processMobileIapLifecycleEvent({
            db: h.db,
            event: event({ entitlementStatus: state, signedAt: refundSignedAt }),
          }),
        ).resolves.toBe('stale');

        expect(creditMovements(h, 'handle_top_up_refund')).toEqual([]);
        expect(refundStateWrite(h)).toBeUndefined();
      },
    );

    it('applies a refund signed after the last recorded refund state and records its time', async () => {
      const h = harness({ refundStateSignedAt: refundSignedAt.toISOString() });

      await expect(
        processMobileIapLifecycleEvent({
          db: h.db,
          event: event({ entitlementStatus: 'refunded', signedAt: reversalSignedAt }),
        }),
      ).resolves.toBe('processed');

      expect(creditMovements(h, 'handle_top_up_refund')).toHaveLength(1);
      expect(refundStateWrite(h)?.[1]).toEqual(['receipt-1', reversalSignedAt.toISOString()]);
    });

    it('ignores an older reversal once a newer refund was recorded', async () => {
      const h = harness({
        refundedAmountCents: 1_000,
        refundStateSignedAt: reversalSignedAt.toISOString(),
      });

      await expect(
        processMobileIapLifecycleEvent({
          db: h.db,
          event: event({ entitlementStatus: 'restored', signedAt: refundSignedAt }),
        }),
      ).resolves.toBe('stale');

      expect(creditMovements(h, 'add_credits')).toEqual([]);
    });
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

// developer.apple.com/documentation/appstoreservernotifications/notificationtype:
// RESCIND_CONSENT "indicates the parent or guardian has withdrawn consent for a
// child's app usage", and names the install through appData, not an account.
describe('App Store RESCIND_CONSENT', () => {
  function consentDb(state: {
    mapped: Array<{ appTransactionId: string; userId: string }>;
    appleBilled?: Set<string>;
  }) {
    const receipts = new Set<string>();
    const rescinded = new Set<string>();
    const ended: string[] = [];
    const appleBilled = state.appleBilled ?? new Set(state.mapped.map((row) => row.userId));
    const query = vi.fn(
      async (sql: string, params: readonly unknown[] = []): Promise<Record<string, unknown>[]> => {
        if (sql.includes('insert into public.mobile_iap_notification_receipts')) {
          const id = String(params[0]);
          if (receipts.has(id)) return [];
          receipts.add(id);
          return [{ notification_id: id }];
        }
        if (sql.includes('join public.mobile_app_consent_rescissions')) {
          const userId = String(params[0]);
          const match = state.mapped.find(
            (row) => row.userId === userId && rescinded.has(row.appTransactionId),
          );
          return match ? [{ app_transaction_id: match.appTransactionId }] : [];
        }
        if (sql.includes('from public.mobile_app_transactions')) {
          return state.mapped
            .filter((row) => row.appTransactionId === params[0])
            .map((row) => ({ user_id: row.userId }));
        }
        if (sql.includes('from public.subscriptions')) {
          const userId = String(params[0]);
          return appleBilled.has(userId) ? [{ apple_original_transaction_id: 'original-1' }] : [];
        }
        if (sql.includes('update public.subscriptions')) {
          const userId = String(params[0]);
          ended.push(userId);
          appleBilled.delete(userId);
          return [{ id: `sub-${userId}` }];
        }
        return [];
      },
    );
    const execute = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      if (sql.includes('insert into public.mobile_app_consent_rescissions')) {
        rescinded.add(String(params[0]));
      }
      if (sql.includes('insert into public.mobile_app_transactions')) {
        state.mapped.push({ appTransactionId: String(params[0]), userId: String(params[1]) });
      }
      return undefined;
    });
    const db = {
      query,
      execute,
      transaction: vi.fn(async (callback: (tx: DatabaseAdapter) => Promise<unknown>) =>
        callback(db as unknown as DatabaseAdapter),
      ),
    } as unknown as DatabaseAdapter;
    return { db, query, execute, ended, rescinded };
  }

  const rescission = { notificationId: 'consent-notice-1', environment: 'production' as const };

  it('ends the Apple-billed plan of every account mapped to the install and is a no-op on replay', async () => {
    const h = consentDb({
      mapped: [
        { appTransactionId: 'app-tx-1', userId: 'user-1' },
        { appTransactionId: 'app-tx-1', userId: 'user-2' },
      ],
    });

    await expect(
      recordAppleConsentRescission({ db: h.db, appTransactionId: 'app-tx-1', ...rescission }),
    ).resolves.toBe('consent_rescinded');
    expect(h.ended).toEqual(['user-1', 'user-2']);
    expect(h.execute).toHaveBeenCalledWith(expect.stringContaining("set status = 'revoked'"), [
      'user-1',
      'original-1',
    ]);

    const writesBeforeReplay = h.execute.mock.calls.length;
    await expect(
      recordAppleConsentRescission({ db: h.db, appTransactionId: 'app-tx-1', ...rescission }),
    ).resolves.toBe('duplicate');
    expect(h.ended).toEqual(['user-1', 'user-2']);
    expect(h.execute.mock.calls.length).toBe(writesBeforeReplay);
  });

  it('records an install no account has registered yet and reports it distinctly', async () => {
    const h = consentDb({ mapped: [] });

    await expect(
      recordAppleConsentRescission({ db: h.db, appTransactionId: 'app-tx-9', ...rescission }),
    ).resolves.toBe('unknown_app_transaction');
    expect(h.rescinded.has('app-tx-9')).toBe(true);
    expect(h.ended).toEqual([]);
  });

  it('ends the plan of an account that registers an install after its consent was withdrawn', async () => {
    const h = consentDb({ mapped: [], appleBilled: new Set(['user-3']) });
    await recordAppleConsentRescission({ db: h.db, appTransactionId: 'app-tx-3', ...rescission });

    await expect(
      registerAppleAppTransaction({
        db: h.db,
        userId: 'user-3',
        appTransactionId: 'app-tx-3',
        environment: 'production',
      }),
    ).resolves.toEqual({ consentWithdrawn: true });
    expect(h.ended).toEqual(['user-3']);
  });

  it('registers an install with consent intact without touching the plan', async () => {
    const h = consentDb({ mapped: [] });

    await expect(
      registerAppleAppTransaction({
        db: h.db,
        userId: 'user-4',
        appTransactionId: 'app-tx-4',
        environment: 'sandbox',
      }),
    ).resolves.toEqual({ consentWithdrawn: false });
    expect(h.execute).toHaveBeenCalledWith(
      expect.stringContaining('insert into public.mobile_app_transactions'),
      ['app-tx-4', 'user-4', 'sandbox'],
    );
    expect(h.ended).toEqual([]);
  });

  it('refuses a renewal for an account whose consent was withdrawn and files the charge for refund', async () => {
    const h = harness();
    const original = h.query.getMockImplementation()!;
    h.query.mockImplementation(async (sql: string, params?: readonly unknown[]) => {
      if (sql.includes('join public.mobile_app_consent_rescissions')) {
        return [{ app_transaction_id: 'app-tx-1' }];
      }
      return original(sql, params);
    });

    await expect(
      processMobileIapLifecycleEvent({
        db: h.db,
        event: event({
          product: subscription,
          entitlementStatus: 'active',
          expiresAt: new Date('2026-09-01T00:00:00.000Z'),
        }),
      }),
    ).resolves.toBe('stale');
    expect(
      h.query.mock.calls.some(([sql]) => String(sql).includes('update public.subscriptions')),
    ).toBe(false);
    expect(h.execute).toHaveBeenCalledWith(
      expect.stringContaining('insert into public.billing_refund_requests'),
      expect.arrayContaining([
        'user-1',
        storeChargeId('ios', 'transaction-1'),
        expect.stringContaining('withdrew consent'),
      ]),
    );
  });
});
