import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { MOBILE_IAP_PRODUCT_DEFINITIONS } from '@agiworkforce/types';
import { verifyGooglePlayLifecyclePurchase } from './mobile-iap-store-verification';

const topUp = {
  ...MOBILE_IAP_PRODUCT_DEFINITIONS.find((item) => item.kind === 'top_up')!,
  productId: 'fixture.topup',
};
const accountToken = '00000000-0000-4000-8000-000000000001';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Google Play server verification', () => {
  beforeEach(() => {
    process.env['GOOGLE_PLAY_SERVICE_ACCOUNT_JSON'] = JSON.stringify({
      client_email: 'fixture@example.com',
      private_key: 'fixture-private-key',
    });
    process.env['GOOGLE_PLAY_PACKAGE_NAME'] = 'com.fixture.app';
    vi.spyOn(jwt, 'sign').mockImplementation(() => 'fixture-signed-assertion' as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env['GOOGLE_PLAY_SERVICE_ACCOUNT_JSON'];
    delete process.env['GOOGLE_PLAY_PACKAGE_NAME'];
  });

  it('accepts only an account-bound purchased quantity-one product', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ access_token: 'fixture-access-token' }))
      .mockResolvedValueOnce(
        response({
          productLineItem: [
            {
              productId: topUp.productId,
              productOfferDetails: { quantity: 1, refundableQuantity: 1 },
            },
          ],
          purchaseStateContext: { purchaseState: 'PURCHASED' },
          orderId: 'fixture-order-1',
          obfuscatedExternalAccountId: accountToken,
          purchaseCompletionTime: '2026-08-01T00:00:00.000Z',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      verifyGooglePlayLifecyclePurchase({
        product: topUp,
        purchaseToken: 'fixture-purchase-token-long-enough',
        appAccountToken: accountToken,
      }),
    ).resolves.toMatchObject({
      entitlementStatus: 'active',
      storeTransactionId: 'fixture-order-1',
    });
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/purchases/productsv2/tokens/');
  });

  it('classifies a fully refunded product as revoked for lifecycle processing', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response({ access_token: 'fixture-access-token' }))
        .mockResolvedValueOnce(
          response({
            productLineItem: [
              {
                productId: topUp.productId,
                productOfferDetails: { quantity: 1, refundableQuantity: 0 },
              },
            ],
            purchaseStateContext: { purchaseState: 'CANCELLED' },
            orderId: 'fixture-order-1',
            obfuscatedExternalAccountId: accountToken,
            purchaseCompletionTime: '2026-08-01T00:00:00.000Z',
          }),
        ),
    );
    await expect(
      verifyGooglePlayLifecyclePurchase({
        product: topUp,
        purchaseToken: 'fixture-purchase-token-long-enough',
        appAccountToken: accountToken,
      }),
    ).resolves.toMatchObject({ entitlementStatus: 'revoked' });
  });

  it('rejects a valid store purchase bound to a different AGI account', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response({ access_token: 'fixture-access-token' }))
        .mockResolvedValueOnce(
          response({
            productLineItem: [{ productId: topUp.productId }],
            purchaseStateContext: { purchaseState: 'PURCHASED' },
            orderId: 'fixture-order-1',
            obfuscatedExternalAccountId: '00000000-0000-4000-8000-000000000002',
            purchaseCompletionTime: '2026-08-01T00:00:00.000Z',
          }),
        ),
    );
    await expect(
      verifyGooglePlayLifecyclePurchase({
        product: topUp,
        purchaseToken: 'fixture-purchase-token-long-enough',
        appAccountToken: accountToken,
      }),
    ).rejects.toThrow(/not grantable/i);
  });
});
