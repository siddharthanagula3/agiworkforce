import { randomUUID } from 'node:crypto';
import { PostgresDatabaseAdapter, type DatabaseAdapter } from '@agiworkforce/data-layer';
import { MOBILE_IAP_PRODUCT_DEFINITIONS, type MobileIapCatalogProduct } from '@agiworkforce/types';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

type LoggerModule = typeof import('@/lib/logger');
type NeonDbModule = typeof import('@/lib/server/neon-db');
type RuntimeEnvironmentModule = typeof import('@/lib/config/runtime-environment');

const liveDatabaseUrl = process.env['AGI_LIVE_DATABASE_URL'] ?? '';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function isLoopbackDatabase(connectionString: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(connectionString).hostname);
  } catch {
    return false;
  }
}

const live = process.env['AGI_TEST_LIVE_MOBILE_IAP'] === '1' && isLoopbackDatabase(liveDatabaseUrl);

if (live) process.env['AGI_KV_PROVIDER'] = 'none';

const scope = vi.hoisted(() => ({
  db: null as DatabaseAdapter | null,
  production: false,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<NeonDbModule>()),
  getNeonDb: () => scope.db,
}));
vi.mock('@/lib/config/runtime-environment', async (importOriginal) => {
  const actual = await importOriginal<RuntimeEnvironmentModule>();
  return {
    ...actual,
    isProductionRuntime: () => scope.production || actual.isProductionRuntime(),
  };
});
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { removeFlagOverride, setFlagOverride } =
  await import('@/lib/feature-flags/flag-admin-service');
const { resetFlagDefinitionCache } = await import('@/lib/feature-flags/flag-store');
const { STORE_TEST_PURCHASES_FLAG_KEY } = await import('@/lib/feature-flags/store-test-purchases');
const { hashMobileIapPurchaseToken } = await import('@/lib/server/mobile-iap-store-verification');
const { recordStoreRefund } = await import('./billing-refund-service');
const { recordVerifiedMobileIapPurchase, STORE_TEST_PURCHASE_REFUSED } =
  await import('./mobile-iap-ledger-service');
const { grantMobileIapPurchaseFromStore, processMobileIapLifecycleEvent } =
  await import('./mobile-iap-notification-service');

type VerifiedPurchase = Parameters<typeof recordVerifiedMobileIapPurchase>[0]['verified'];
type LifecycleEvent = Parameters<typeof processMobileIapLifecycleEvent>[0]['event'];

function planProduct(planTier: 'pro' | 'max'): MobileIapCatalogProduct {
  return {
    ...MOBILE_IAP_PRODUCT_DEFINITIONS.find(
      (item) => item.kind === 'subscription' && item.planTier === planTier,
    )!,
    productId: `live.fixture.${planTier}`,
  };
}

const PRO = planProduct('pro');
const MAX = planProduct('max');

const DAY_MS = 86_400_000;
const NOW = Date.now();
const PERIOD_START = new Date(NOW - 10 * DAY_MS);
const PERIOD_END = new Date(NOW + 20 * DAY_MS);
const CHANGED_AT = new Date(NOW - DAY_MS);
const NEXT_PERIOD_END = new Date(NOW + 29 * DAY_MS);

class RollBack extends Error {}

const database = live ? new PostgresDatabaseAdapter({ connectionString: liveDatabaseUrl }) : null;

// Migration 0362 changes two checks. Until a database has it, the cases that
// need them are skipped by name and the rest still run.
async function constraintMentions(constraint: string, text: string): Promise<boolean> {
  if (!database) return false;
  const rows = await database.query<{ definition: string }>(
    `select pg_get_constraintdef(oid) as definition from pg_constraint where conname = $1`,
    [constraint],
  );
  return rows.some((row) => row.definition.includes(text));
}

const storeRefundsClosable = await constraintMentions(
  'billing_refund_requests_refund_is_recorded',
  'mobile_iap',
);
const pausedIsRecordable = await constraintMentions('subscriptions_status_check', 'paused');

afterAll(async () => {
  await database?.dispose();
});

afterEach(() => {
  scope.db = null;
  scope.production = false;
  resetFlagDefinitionCache();
});

// The services open their own transaction. Inside the one this suite rolls back,
// that becomes a savepoint, so a refused grant still undoes its own writes.
function nestable(tx: DatabaseAdapter): DatabaseAdapter {
  let savepoints = 0;
  const adapter: DatabaseAdapter = new Proxy(tx, {
    get(target, property) {
      if (property === 'transaction') {
        return async <T>(run: (inner: DatabaseAdapter) => Promise<T>): Promise<T> => {
          const savepoint = `store_purchase_${(savepoints += 1)}`;
          await target.execute(`savepoint ${savepoint}`);
          try {
            const result = await run(adapter);
            await target.execute(`release savepoint ${savepoint}`);
            return result;
          } catch (error) {
            await target.execute(`rollback to savepoint ${savepoint}`);
            throw error;
          }
        };
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return adapter;
}

interface Account {
  db: DatabaseAdapter;
  userId: string;
  appAccountToken: string;
}

async function withAccount(run: (account: Account) => Promise<void>): Promise<void> {
  const userId = `qa-store-purchase-${randomUUID()}`;
  await database!
    .transaction(async (tx) => {
      const db = nestable(tx);
      scope.db = db;
      await db.execute(`insert into public.profiles (id, email) values ($1, $2)`, [
        userId,
        `${userId}@example.test`,
      ]);
      const [binding] = await db.query<{ app_account_token: string }>(
        `insert into public.mobile_iap_accounts (user_id) values ($1) returning app_account_token`,
        [userId],
      );
      await run({ db, userId, appAccountToken: binding!.app_account_token });
      throw new RollBack();
    })
    .catch((error: unknown) => {
      if (!(error instanceof RollBack)) throw error;
    });
}

interface StoredSubscription {
  plan_tier: string;
  status: string;
  stripe_subscription_id: string | null;
  apple_original_transaction_id: string | null;
  google_purchase_token: string | null;
  cancel_at_period_end: boolean | null;
  period_start: string | null;
  period_end: string | null;
}

async function readSubscription(account: Account): Promise<StoredSubscription | undefined> {
  const [row] = await account.db.query<StoredSubscription>(
    `select plan_tier, status, stripe_subscription_id, apple_original_transaction_id,
            google_purchase_token, cancel_at_period_end,
            to_char(current_period_start at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as period_start,
            to_char(current_period_end at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as period_end
       from public.subscriptions
      where user_id = $1`,
    [account.userId],
  );
  return row;
}

async function seedSubscription(
  account: Account,
  owner: {
    planTier?: string;
    status?: string;
    stripe?: string | null;
    apple?: string | null;
    google?: string | null;
    periodEnd?: Date;
  },
): Promise<void> {
  await account.db.execute(
    `insert into public.subscriptions (
       user_id, status, plan_tier, stripe_subscription_id,
       apple_original_transaction_id, google_purchase_token,
       current_period_start, current_period_end, cancel_at_period_end
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, false)`,
    [
      account.userId,
      owner.status ?? 'active',
      owner.planTier ?? 'pro',
      owner.stripe ?? null,
      owner.apple ?? null,
      owner.google ?? null,
      PERIOD_START.toISOString(),
      (owner.periodEnd ?? PERIOD_END).toISOString(),
    ],
  );
}

async function seedReceipt(
  account: Account,
  receipt: {
    platform: 'ios' | 'android';
    storeTransactionId: string;
    purchaseTokenHash: string;
    originalTransactionId?: string | null;
    environment?: 'production' | 'sandbox';
  },
): Promise<void> {
  await account.db.execute(
    `insert into public.mobile_iap_transactions (
       user_id, platform, product_key, product_id, product_kind, store_transaction_id,
       purchase_token_hash, original_transaction_id, plan_tier, units_granted,
       intended_amount_cents, status, environment, purchased_at, expires_at, processed_at
     ) values ($1, $2, $3, $4, 'subscription', $5, $6, $7, 'pro', 0, 2000, 'active', $8, $9, $10, now())`,
    [
      account.userId,
      receipt.platform,
      PRO.key,
      PRO.productId,
      receipt.storeTransactionId,
      receipt.purchaseTokenHash,
      receipt.originalTransactionId ?? null,
      receipt.environment ?? 'production',
      PERIOD_START.toISOString(),
      PERIOD_END.toISOString(),
    ],
  );
}

interface FiledRequest {
  charge_id: string;
  status: string;
  decided_by: string | null;
  stripe_refund_id: string | null;
  refund_amount_cents: string | number | null;
}

async function readRefundRequests(account: Account): Promise<FiledRequest[]> {
  return account.db.query<FiledRequest>(
    `select charge_id, status, decided_by, stripe_refund_id, refund_amount_cents
       from public.billing_refund_requests
      where user_id = $1
      order by created_at`,
    [account.userId],
  );
}

async function readCreditAccounts(
  account: Account,
  periodEnd: Date,
): Promise<{ allocated: string; period_start: string }[]> {
  return account.db.query<{ allocated: string; period_start: string }>(
    `select credits_allocated_microusd::text as allocated,
            to_char(period_start at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as period_start
       from public.token_credits
      where user_id = $1 and period_end = $2`,
    [account.userId, periodEnd.toISOString()],
  );
}

function appleEvent(account: Account, overrides: Partial<LifecycleEvent> = {}): LifecycleEvent {
  const storeTransactionId = overrides.storeTransactionId ?? `apple-tx-${randomUUID()}`;
  return {
    platform: 'ios',
    notificationId: `notice-${randomUUID()}`,
    eventType: 'DID_RENEW',
    product: PRO,
    storeTransactionId,
    purchaseTokenHash: hashMobileIapPurchaseToken(`signed-${storeTransactionId}`),
    originalTransactionId: 'apple-original',
    appAccountToken: account.appAccountToken,
    purchasedAt: PERIOD_START,
    expiresAt: PERIOD_END,
    entitlementStatus: 'active',
    cancelAtPeriodEnd: false,
    environment: 'production',
    signedAt: null,
    ...overrides,
  };
}

function googleEvent(
  account: Account,
  purchaseToken: string,
  overrides: Partial<LifecycleEvent> = {},
): LifecycleEvent {
  return {
    platform: 'android',
    notificationId: `message-${randomUUID()}`,
    eventType: 'google:2',
    product: PRO,
    storeTransactionId: `GPA.${randomUUID()}`,
    purchaseTokenHash: hashMobileIapPurchaseToken(purchaseToken),
    originalTransactionId: null,
    appAccountToken: account.appAccountToken,
    purchasedAt: PERIOD_START,
    expiresAt: PERIOD_END,
    entitlementStatus: 'active',
    cancelAtPeriodEnd: false,
    rawGooglePurchaseToken: purchaseToken,
    environment: 'production',
    signedAt: null,
    ...overrides,
  };
}

function applePurchase(overrides: Partial<VerifiedPurchase> = {}): VerifiedPurchase {
  const storeTransactionId = overrides.storeTransactionId ?? `apple-tx-${randomUUID()}`;
  return {
    platform: 'ios',
    product: PRO,
    storeTransactionId,
    purchaseTokenHash: hashMobileIapPurchaseToken(`signed-${storeTransactionId}`),
    originalTransactionId: 'apple-original',
    purchasedAt: PERIOD_START,
    expiresAt: PERIOD_END,
    environment: 'production',
    entitlementStatus: 'active',
    ...overrides,
  };
}

function googlePurchase(
  purchaseToken: string,
  overrides: Partial<VerifiedPurchase> = {},
): VerifiedPurchase {
  return {
    platform: 'android',
    product: PRO,
    storeTransactionId: `GPA.${randomUUID()}`,
    purchaseTokenHash: hashMobileIapPurchaseToken(purchaseToken),
    originalTransactionId: null,
    purchasedAt: PERIOD_START,
    expiresAt: PERIOD_END,
    environment: 'production',
    entitlementStatus: 'active',
    lifecycle: 'active',
    cancelAtPeriodEnd: false,
    ...overrides,
  };
}

// llm-guardrail-allow: needs AGI_TEST_LIVE_MOBILE_IAP=1 and a loopback AGI_LIVE_DATABASE_URL at a migrated Postgres; every case runs in a transaction it rolls back.
describe.skipIf(!live)('store purchases against the real statements', () => {
  describe('a charge for a plan another purchase owns', () => {
    it('leaves a web plan alone and files the App Store renewal for refund exactly once', async () => {
      await withAccount(async (account) => {
        await seedSubscription(account, { stripe: `sub_${randomUUID().replaceAll('-', '')}` });
        await seedReceipt(account, {
          platform: 'ios',
          storeTransactionId: 'apple-first',
          purchaseTokenHash: hashMobileIapPurchaseToken('signed-apple-first'),
          originalTransactionId: 'apple-original',
        });
        const before = await readSubscription(account);

        const renewal = appleEvent(account, { storeTransactionId: 'apple-renewal' });
        const first = await processMobileIapLifecycleEvent({ db: account.db, event: renewal });
        const replay = await processMobileIapLifecycleEvent({
          db: account.db,
          event: { ...renewal, notificationId: `notice-${randomUUID()}` },
        });

        expect([first, replay]).toEqual(['stale', 'stale']);
        expect(await readSubscription(account)).toEqual(before);
        expect(await readRefundRequests(account)).toEqual([
          expect.objectContaining({ charge_id: 'mobile_iap:ios:apple-renewal', status: 'pending' }),
        ]);
      });
    });

    it('leaves an App Store plan alone and files the Google Play renewal for refund exactly once', async () => {
      await withAccount(async (account) => {
        const token = `play-token-${randomUUID()}`;
        await seedSubscription(account, { apple: `apple-${randomUUID()}` });
        await seedReceipt(account, {
          platform: 'android',
          storeTransactionId: 'GPA.first',
          purchaseTokenHash: hashMobileIapPurchaseToken(token),
        });
        const before = await readSubscription(account);

        const renewal = googleEvent(account, token, { storeTransactionId: 'GPA.first..0' });
        await processMobileIapLifecycleEvent({ db: account.db, event: renewal });
        await processMobileIapLifecycleEvent({
          db: account.db,
          event: { ...renewal, notificationId: `message-${randomUUID()}` },
        });

        expect(await readSubscription(account)).toEqual(before);
        expect(await readRefundRequests(account)).toEqual([
          expect.objectContaining({
            charge_id: 'mobile_iap:android:GPA.first..0',
            status: 'pending',
          }),
        ]);
      });
    });

    it('does not file a declined request again when the store replays the notice', async () => {
      await withAccount(async (account) => {
        await seedSubscription(account, { stripe: `sub_${randomUUID().replaceAll('-', '')}` });
        await seedReceipt(account, {
          platform: 'ios',
          storeTransactionId: 'apple-first',
          purchaseTokenHash: hashMobileIapPurchaseToken('signed-apple-first'),
          originalTransactionId: 'apple-original',
        });
        const renewal = appleEvent(account, { storeTransactionId: 'apple-renewal' });
        await processMobileIapLifecycleEvent({ db: account.db, event: renewal });
        await account.db.execute(
          `update public.billing_refund_requests
              set status = 'declined', decided_by = 'operator', decided_at = now()
            where user_id = $1`,
          [account.userId],
        );

        await processMobileIapLifecycleEvent({
          db: account.db,
          event: { ...renewal, notificationId: `notice-${randomUUID()}` },
        });

        expect(await readRefundRequests(account)).toEqual([
          expect.objectContaining({
            charge_id: 'mobile_iap:ios:apple-renewal',
            status: 'declined',
          }),
        ]);
      });
    });

    it('files nothing for a sandbox renewal, which charged nobody', async () => {
      await withAccount(async (account) => {
        await seedSubscription(account, { stripe: `sub_${randomUUID().replaceAll('-', '')}` });
        await seedReceipt(account, {
          platform: 'ios',
          storeTransactionId: 'apple-first',
          purchaseTokenHash: hashMobileIapPurchaseToken('signed-apple-first'),
          originalTransactionId: 'apple-original',
          environment: 'sandbox',
        });

        await processMobileIapLifecycleEvent({
          db: account.db,
          event: appleEvent(account, {
            storeTransactionId: 'apple-renewal',
            environment: 'sandbox',
          }),
        });

        expect(await readRefundRequests(account)).toEqual([]);
      });
    });
  });

  describe('a client verify for a plan another purchase owns', () => {
    it('refuses a second Apple ID, keeps the first plan and files the charge exactly once', async () => {
      await withAccount(async (account) => {
        await seedSubscription(account, { apple: 'apple-original' });
        const before = await readSubscription(account);
        const second = applePurchase({
          originalTransactionId: 'apple-other-id',
          storeTransactionId: 'apple-other-tx',
          product: MAX,
        });
        const verify = () =>
          recordVerifiedMobileIapPurchase({
            db: account.db,
            userId: account.userId,
            purchaseToken: 'signed-apple-other-tx',
            verified: second,
          });

        await expect(verify()).rejects.toMatchObject({ statusCode: 409 });
        await expect(verify()).rejects.toMatchObject({ statusCode: 409 });

        expect(await readSubscription(account)).toEqual(before);
        expect(await readRefundRequests(account)).toEqual([
          expect.objectContaining({
            charge_id: 'mobile_iap:ios:apple-other-tx',
            status: 'pending',
          }),
        ]);
      });
    });

    it('refuses a Play token that does not replace the one on the plan', async () => {
      await withAccount(async (account) => {
        const owner = `play-token-${randomUUID()}`;
        await seedSubscription(account, { google: owner });
        const before = await readSubscription(account);
        const stranger = `play-token-${randomUUID()}`;

        await expect(
          recordVerifiedMobileIapPurchase({
            db: account.db,
            userId: account.userId,
            purchaseToken: stranger,
            verified: googlePurchase(stranger, { storeTransactionId: 'GPA.stranger' }),
          }),
        ).rejects.toMatchObject({ statusCode: 409 });

        expect(await readSubscription(account)).toEqual(before);
        expect(await readRefundRequests(account)).toEqual([
          expect.objectContaining({ charge_id: 'mobile_iap:android:GPA.stranger' }),
        ]);
      });
    });

    it('closes the filed request once the same purchase is granted', async () => {
      await withAccount(async (account) => {
        await seedSubscription(account, { stripe: `sub_${randomUUID().replaceAll('-', '')}` });
        const purchase = applePurchase({ storeTransactionId: 'apple-waiting' });
        const verify = () =>
          recordVerifiedMobileIapPurchase({
            db: account.db,
            userId: account.userId,
            purchaseToken: 'signed-apple-waiting',
            verified: purchase,
          });
        await expect(verify()).rejects.toMatchObject({ statusCode: 409 });
        await account.db.execute(
          `update public.subscriptions set status = 'canceled', plan_tier = 'free' where user_id = $1`,
          [account.userId],
        );

        const granted = await verify();

        expect(granted.status).toBe('active');
        expect(await readRefundRequests(account)).toEqual([
          expect.objectContaining({
            charge_id: 'mobile_iap:ios:apple-waiting',
            status: 'declined',
            decided_by: 'automatic',
          }),
        ]);
      });
    });
  });

  // llm-guardrail-allow: needs the refund check from migration 0362; a live database without it cannot store this row.
  it.skipIf(!storeRefundsClosable)(
    'closes a store charge as refunded with no Stripe refund',
    async () => {
      await withAccount(async (account) => {
        await seedSubscription(account, { stripe: `sub_${randomUUID().replaceAll('-', '')}` });
        await expect(
          recordVerifiedMobileIapPurchase({
            db: account.db,
            userId: account.userId,
            purchaseToken: 'signed-apple-refundable',
            verified: applePurchase({ storeTransactionId: 'apple-refundable' }),
          }),
        ).rejects.toMatchObject({ statusCode: 409 });
        const [filed] = await account.db.query<{ id: string }>(
          `select id from public.billing_refund_requests where user_id = $1`,
          [account.userId],
        );

        const closed = await recordStoreRefund(account.db, {
          operatorUserId: 'operator-1',
          requestId: filed!.id,
          amountCents: null,
          note: 'Refunded through App Store.',
        });

        expect(closed.status).toBe('refunded');
        expect(await readRefundRequests(account)).toEqual([
          expect.objectContaining({
            status: 'refunded',
            stripe_refund_id: null,
            decided_by: 'operator',
          }),
        ]);
      });
    },
  );

  it('keeps the plan when the Play token it replaced expires', async () => {
    await withAccount(async (account) => {
      const replaced = `play-token-${randomUUID()}`;
      const current = `play-token-${randomUUID()}`;
      await seedSubscription(account, { google: current, planTier: 'pro' });
      await seedReceipt(account, {
        platform: 'android',
        storeTransactionId: 'GPA.replaced',
        purchaseTokenHash: hashMobileIapPurchaseToken(replaced),
      });
      const before = await readSubscription(account);

      const outcome = await processMobileIapLifecycleEvent({
        db: account.db,
        event: googleEvent(account, replaced, {
          storeTransactionId: 'GPA.replaced',
          eventType: 'google:13',
          entitlementStatus: 'expired',
          cancelAtPeriodEnd: true,
        }),
      });

      expect(outcome).toBe('stale');
      expect(await readSubscription(account)).toEqual(before);
      const [receipt] = await account.db.query<{ status: string }>(
        `select status from public.mobile_iap_transactions where store_transaction_id = 'GPA.replaced' and user_id = $1`,
        [account.userId],
      );
      expect(receipt?.status).toBe('expired');
    });
  });

  // llm-guardrail-allow: needs the paused status from migration 0362; a live database without it rejects the write.
  it.skipIf(!pausedIsRecordable)(
    'records a Play pause, which keeps the plan on record and grants nothing',
    async () => {
      await withAccount(async (account) => {
        const token = `play-token-${randomUUID()}`;
        await seedSubscription(account, { google: token });
        await seedReceipt(account, {
          platform: 'android',
          storeTransactionId: 'GPA.first',
          purchaseTokenHash: hashMobileIapPurchaseToken(token),
        });

        const outcome = await processMobileIapLifecycleEvent({
          db: account.db,
          event: googleEvent(account, token, {
            storeTransactionId: 'GPA.first',
            eventType: 'google:10',
            entitlementStatus: 'paused',
          }),
        });

        expect(outcome).toBe('processed');
        expect(await readSubscription(account)).toMatchObject({
          status: 'paused',
          plan_tier: 'pro',
        });
      });
    },
  );

  it('suspends a plan the store put on hold', async () => {
    await withAccount(async (account) => {
      await seedSubscription(account, { apple: 'apple-original' });
      await seedReceipt(account, {
        platform: 'ios',
        storeTransactionId: 'apple-first',
        purchaseTokenHash: hashMobileIapPurchaseToken('signed-apple-first'),
        originalTransactionId: 'apple-original',
      });

      await processMobileIapLifecycleEvent({
        db: account.db,
        event: appleEvent(account, {
          storeTransactionId: 'apple-first',
          eventType: 'DID_FAIL_TO_RENEW',
          entitlementStatus: 'on_hold',
        }),
      });

      expect(await readSubscription(account)).toMatchObject({
        status: 'past_due',
        plan_tier: 'pro',
      });
    });
  });

  describe('the auto-renew choice', () => {
    it('is not turned back on by an App Store notice signed before the one that turned it off', async () => {
      await withAccount(async (account) => {
        await seedSubscription(account, { apple: 'apple-original' });
        await seedReceipt(account, {
          platform: 'ios',
          storeTransactionId: 'apple-first',
          purchaseTokenHash: hashMobileIapPurchaseToken('signed-apple-first'),
          originalTransactionId: 'apple-original',
        });
        const event = appleEvent(account, { storeTransactionId: 'apple-first' });

        await processMobileIapLifecycleEvent({
          db: account.db,
          event: { ...event, cancelAtPeriodEnd: true, signedAt: new Date(NOW - 1_000) },
        });
        await processMobileIapLifecycleEvent({
          db: account.db,
          event: {
            ...event,
            notificationId: `notice-${randomUUID()}`,
            cancelAtPeriodEnd: false,
            signedAt: new Date(NOW - 60_000),
          },
        });

        expect((await readSubscription(account))?.cancel_at_period_end).toBe(true);
      });
    });

    it('is not turned back on by a Play notice for an event before the one that turned it off', async () => {
      await withAccount(async (account) => {
        const token = `play-token-${randomUUID()}`;
        await seedSubscription(account, { google: token });
        await seedReceipt(account, {
          platform: 'android',
          storeTransactionId: 'GPA.first',
          purchaseTokenHash: hashMobileIapPurchaseToken(token),
        });
        const event = googleEvent(account, token, { storeTransactionId: 'GPA.first' });

        await processMobileIapLifecycleEvent({
          db: account.db,
          event: { ...event, cancelAtPeriodEnd: true, signedAt: new Date(NOW - 1_000) },
        });
        await processMobileIapLifecycleEvent({
          db: account.db,
          event: {
            ...event,
            notificationId: `message-${randomUUID()}`,
            cancelAtPeriodEnd: false,
            signedAt: new Date(NOW - 60_000),
          },
        });

        expect((await readSubscription(account))?.cancel_at_period_end).toBe(true);
      });
    });

    it('follows the newer notice when they arrive in order', async () => {
      await withAccount(async (account) => {
        const token = `play-token-${randomUUID()}`;
        await seedSubscription(account, { google: token });
        await seedReceipt(account, {
          platform: 'android',
          storeTransactionId: 'GPA.first',
          purchaseTokenHash: hashMobileIapPurchaseToken(token),
        });
        const event = googleEvent(account, token, { storeTransactionId: 'GPA.first' });

        await processMobileIapLifecycleEvent({
          db: account.db,
          event: { ...event, cancelAtPeriodEnd: true, signedAt: new Date(NOW - 60_000) },
        });
        await processMobileIapLifecycleEvent({
          db: account.db,
          event: {
            ...event,
            notificationId: `message-${randomUUID()}`,
            cancelAtPeriodEnd: false,
            signedAt: new Date(NOW - 1_000),
          },
        });

        expect((await readSubscription(account))?.cancel_at_period_end).toBe(false);
      });
    });
  });

  describe('a plan change allocates its period once', () => {
    async function subscribeOnPlay(account: Account): Promise<string> {
      const token = `play-token-${randomUUID()}`;
      await recordVerifiedMobileIapPurchase({
        db: account.db,
        userId: account.userId,
        purchaseToken: token,
        verified: googlePurchase(token),
      });
      return token;
    }

    function playUpgrade(replaced: string): { token: string; verified: VerifiedPurchase } {
      const token = `play-token-${randomUUID()}`;
      return {
        token,
        verified: googlePurchase(token, {
          product: MAX,
          originalTransactionId: hashMobileIapPurchaseToken(replaced),
          purchasedAt: CHANGED_AT,
          expiresAt: PERIOD_END,
          storeTransactionId: 'GPA.upgrade',
        }),
      };
    }

    function noticeFor(account: Account, token: string, verified: VerifiedPurchase) {
      return googleEvent(account, token, {
        product: verified.product,
        storeTransactionId: verified.storeTransactionId,
        originalTransactionId: verified.originalTransactionId,
        purchasedAt: verified.purchasedAt,
        expiresAt: verified.expiresAt,
        eventType: 'google:4',
      });
    }

    it('on Play when the app verifies a same-cycle upgrade before the notice arrives', async () => {
      await withAccount(async (account) => {
        const first = await subscribeOnPlay(account);
        const upgrade = playUpgrade(first);

        await recordVerifiedMobileIapPurchase({
          db: account.db,
          userId: account.userId,
          purchaseToken: upgrade.token,
          verified: upgrade.verified,
        });
        const afterVerify = await readCreditAccounts(account, PERIOD_END);
        await processMobileIapLifecycleEvent({
          db: account.db,
          event: noticeFor(account, upgrade.token, upgrade.verified),
        });

        expect(afterVerify).toHaveLength(1);
        expect(await readCreditAccounts(account, PERIOD_END)).toEqual(afterVerify);
        expect(await readSubscription(account)).toMatchObject({
          plan_tier: 'max',
          google_purchase_token: upgrade.token,
          period_start: PERIOD_START.toISOString(),
        });
      });
    });

    it('on Play when the notice for a same-cycle upgrade arrives before the app verifies', async () => {
      await withAccount(async (account) => {
        const first = await subscribeOnPlay(account);
        const upgrade = playUpgrade(first);

        const grant = await grantMobileIapPurchaseFromStore({
          db: account.db,
          appAccountToken: account.appAccountToken,
          purchaseToken: upgrade.token,
          verified: upgrade.verified,
        });
        await processMobileIapLifecycleEvent({
          db: account.db,
          event: noticeFor(account, upgrade.token, upgrade.verified),
        });
        const afterNotice = await readCreditAccounts(account, PERIOD_END);
        const verified = await recordVerifiedMobileIapPurchase({
          db: account.db,
          userId: account.userId,
          purchaseToken: upgrade.token,
          verified: upgrade.verified,
        });

        expect(grant).toBe('granted');
        expect(verified.status).toBe('already_processed');
        expect(afterNotice).toHaveLength(1);
        expect(await readCreditAccounts(account, PERIOD_END)).toEqual(afterNotice);
      });
    });

    it('on Play for a deferred downgrade, whose new token still carries the old plan', async () => {
      await withAccount(async (account) => {
        const first = await subscribeOnPlay(account);
        const before = await readCreditAccounts(account, PERIOD_END);
        const token = `play-token-${randomUUID()}`;
        const deferred = googlePurchase(token, {
          originalTransactionId: hashMobileIapPurchaseToken(first),
          purchasedAt: CHANGED_AT,
          storeTransactionId: 'GPA.deferred',
        });

        await grantMobileIapPurchaseFromStore({
          db: account.db,
          appAccountToken: account.appAccountToken,
          purchaseToken: token,
          verified: deferred,
        });
        await processMobileIapLifecycleEvent({
          db: account.db,
          event: noticeFor(account, token, deferred),
        });

        expect(before).toHaveLength(1);
        expect(await readCreditAccounts(account, PERIOD_END)).toEqual(before);
      });
    });

    async function subscribeOnAppStore(account: Account): Promise<void> {
      await recordVerifiedMobileIapPurchase({
        db: account.db,
        userId: account.userId,
        purchaseToken: 'signed-apple-first',
        verified: applePurchase({ storeTransactionId: 'apple-first' }),
      });
    }

    const appStoreUpgrade = applePurchase({
      product: MAX,
      storeTransactionId: 'apple-upgrade',
      purchasedAt: CHANGED_AT,
      expiresAt: NEXT_PERIOD_END,
    });

    function appStoreUpgradeNotice(account: Account): LifecycleEvent {
      return appleEvent(account, {
        product: MAX,
        storeTransactionId: 'apple-upgrade',
        purchasedAt: CHANGED_AT,
        expiresAt: NEXT_PERIOD_END,
        eventType: 'DID_CHANGE_RENEWAL_PREF',
      });
    }

    it('on the App Store when the app verifies an upgrade before the notice arrives', async () => {
      await withAccount(async (account) => {
        await subscribeOnAppStore(account);

        await recordVerifiedMobileIapPurchase({
          db: account.db,
          userId: account.userId,
          purchaseToken: 'signed-apple-upgrade',
          verified: appStoreUpgrade,
        });
        const afterVerify = await readCreditAccounts(account, NEXT_PERIOD_END);
        await processMobileIapLifecycleEvent({
          db: account.db,
          event: appStoreUpgradeNotice(account),
        });

        expect(afterVerify).toHaveLength(1);
        expect(await readCreditAccounts(account, NEXT_PERIOD_END)).toEqual(afterVerify);
      });
    });

    it('on the App Store when the notice for an upgrade arrives before the app verifies', async () => {
      await withAccount(async (account) => {
        await subscribeOnAppStore(account);

        await processMobileIapLifecycleEvent({
          db: account.db,
          event: appStoreUpgradeNotice(account),
        });
        const afterNotice = await readCreditAccounts(account, NEXT_PERIOD_END);
        const verified = await recordVerifiedMobileIapPurchase({
          db: account.db,
          userId: account.userId,
          purchaseToken: 'signed-apple-upgrade',
          verified: appStoreUpgrade,
        });

        expect(verified.status).toBe('already_processed');
        expect(afterNotice).toHaveLength(1);
        expect(await readCreditAccounts(account, NEXT_PERIOD_END)).toEqual(afterNotice);
      });
    });
  });

  describe('a store test purchase on production', () => {
    const sandboxPurchase = () =>
      applePurchase({ storeTransactionId: 'apple-sandbox', environment: 'sandbox' });

    async function verifySandbox(account: Account) {
      return recordVerifiedMobileIapPurchase({
        db: account.db,
        userId: account.userId,
        purchaseToken: 'signed-apple-sandbox',
        verified: sandboxPurchase(),
      });
    }

    it('is refused, and writes nothing, while no flag has ever been defined', async () => {
      await withAccount(async (account) => {
        scope.production = true;
        await account.db.execute(`delete from public.feature_flag_definitions where key = $1`, [
          STORE_TEST_PURCHASES_FLAG_KEY,
        ]);
        resetFlagDefinitionCache();

        await expect(verifySandbox(account)).rejects.toMatchObject({
          statusCode: 403,
          message: STORE_TEST_PURCHASE_REFUSED,
        });

        expect(await readSubscription(account)).toBeUndefined();
        expect(await readRefundRequests(account)).toEqual([]);
        const receipts = await account.db.query(
          `select id from public.mobile_iap_transactions where user_id = $1`,
          [account.userId],
        );
        expect(receipts).toEqual([]);
      });
    });

    it('is granted once the operator allows the account, from a database with no flag, and refused again when removed', async () => {
      await withAccount(async (account) => {
        scope.production = true;
        await account.db.execute(`delete from public.feature_flag_definitions where key = $1`, [
          STORE_TEST_PURCHASES_FLAG_KEY,
        ]);
        resetFlagDefinitionCache();
        const operator = {
          userId: account.userId,
          request: new Request('https://agiworkforce.com/api/admin/feature-flags'),
        };

        await setFlagOverride(operator, STORE_TEST_PURCHASES_FLAG_KEY, {
          subject: 'user',
          subjectId: account.userId,
          variant: 'on',
          expiresAt: null,
        });
        const granted = await verifySandbox(account);
        await removeFlagOverride(operator, STORE_TEST_PURCHASES_FLAG_KEY, 'user', account.userId);
        const renewal = await processMobileIapLifecycleEvent({
          db: account.db,
          event: appleEvent(account, {
            storeTransactionId: 'apple-sandbox-renewal',
            environment: 'sandbox',
            purchasedAt: PERIOD_END,
            expiresAt: NEXT_PERIOD_END,
          }),
        });

        expect(granted.status).toBe('active');
        expect(renewal).toBe('stale');
        expect((await readSubscription(account))?.period_end).toBe(PERIOD_END.toISOString());
      });
    });
  });
});
