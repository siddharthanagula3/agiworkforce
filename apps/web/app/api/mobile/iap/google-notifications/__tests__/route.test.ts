import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const { mockIdentity, mockLifecycleVerify, mockDb } = vi.hoisted(() => ({
  mockIdentity: vi.fn(),
  mockLifecycleVerify: vi.fn(),
  mockDb: { current: null as unknown },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => mockDb.current }));
vi.mock('@/lib/server/google-pubsub-push-identity', () => ({
  verifyGooglePubSubPushIdentity: mockIdentity,
}));
vi.mock('@/lib/server/mobile-iap-store-verification', () => ({
  hashMobileIapPurchaseToken: (token: string) => `hash:${token}`,
  verifyGooglePlayLifecyclePurchase: mockLifecycleVerify,
}));

import { POST } from '../route';

const PRODUCT_ID = 'com.agiworkforce.topup10';
const PURCHASE_TOKEN = 'google-purchase-token-long-enough-for-the-schema';
const APP_ACCOUNT_TOKEN = '00000000-0000-4000-8000-000000000001';
const PACKAGE_NAME = 'com.agiworkforce.app';

function notification(messageId: string) {
  const payload = Buffer.from(
    JSON.stringify({
      packageName: PACKAGE_NAME,
      oneTimeProductNotification: {
        notificationType: 2,
        purchaseToken: PURCHASE_TOKEN,
        sku: PRODUCT_ID,
      },
    }),
    'utf8',
  ).toString('base64');
  return new Request('http://localhost:3000/api/mobile/iap/google-notifications', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer pubsub-token' },
    body: JSON.stringify({ message: { data: payload, messageId } }),
  }) as never;
}

function harness() {
  const seenNotifications = new Set<string>();
  const execute = vi.fn(async (_sql: string, _params?: readonly unknown[]) => undefined);
  const query = vi.fn(async (sql: string, params?: readonly unknown[]) => {
    if (sql.includes('insert into public.mobile_iap_notification_receipts')) {
      const id = String(params?.[1]);
      if (seenNotifications.has(id)) return [];
      seenNotifications.add(id);
      return [{ notification_id: id }];
    }
    if (sql.includes('from public.mobile_iap_transactions receipt')) {
      return [
        {
          id: 'receipt-1',
          user_id: 'user-1',
          app_account_token: APP_ACCOUNT_TOKEN,
          intended_amount_cents: 1000,
          refunded_amount_cents: 0,
          product_id: PRODUCT_ID,
        },
      ];
    }
    return [];
  });
  const db = {
    query,
    execute,
    transaction: vi.fn(async (callback: (tx: DatabaseAdapter) => Promise<unknown>) =>
      callback(db as unknown as DatabaseAdapter),
    ),
  };
  mockDb.current = db;
  return { query, execute };
}

describe('POST /api/mobile/iap/google-notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIdentity.mockResolvedValue({ ok: true });
    mockLifecycleVerify.mockResolvedValue({
      storeTransactionId: 'store-transaction-1',
      originalTransactionId: null,
      purchasedAt: new Date('2026-09-01T00:00:00.000Z'),
      expiresAt: null,
      entitlementStatus: 'active',
    });
    vi.stubEnv('MOBILE_IAP_ENABLED', 'true');
    vi.stubEnv('GOOGLE_PLAY_PACKAGE_NAME', PACKAGE_NAME);
    vi.stubEnv('MOBILE_IAP_GOOGLE_PRODUCT_IDS_JSON', JSON.stringify({ top_up_10: PRODUCT_ID }));
  });

  afterEach(() => vi.unstubAllEnvs());

  it('refunds a canceled one-time purchase once, however often Pub/Sub redelivers it', async () => {
    const h = harness();

    const first = await POST(notification('message-1'));
    await expect(first.json()).resolves.toMatchObject({ status: 'processed' });
    const second = await POST(notification('message-1'));
    await expect(second.json()).resolves.toMatchObject({ status: 'duplicate' });

    const refunds = h.execute.mock.calls.filter(([sql]) =>
      String(sql).includes('public.handle_top_up_refund'),
    );
    expect(refunds).toHaveLength(1);
    expect(refunds[0]?.[1]).toEqual([
      'user-1',
      1000,
      expect.stringContaining('store-transaction-1'),
    ]);
  });

  it('refuses a notification whose Pub/Sub identity is not the configured service account', async () => {
    const h = harness();
    mockIdentity.mockResolvedValue({ ok: false, reason: 'not_authorized' });

    const response = await POST(notification('message-2'));

    expect(response.status).toBe(403);
    expect(h.execute).not.toHaveBeenCalled();
    expect(mockLifecycleVerify).not.toHaveBeenCalled();
  });

  it('refuses a notification for another Play package', async () => {
    const h = harness();
    vi.stubEnv('GOOGLE_PLAY_PACKAGE_NAME', 'com.someone.else');

    const response = await POST(notification('message-3'));

    expect(response.status).toBe(403);
    expect(h.execute).not.toHaveBeenCalled();
  });
});
