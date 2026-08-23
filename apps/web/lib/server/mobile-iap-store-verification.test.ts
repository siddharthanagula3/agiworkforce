import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { MOBILE_IAP_PRODUCT_DEFINITIONS } from '@agiworkforce/types';

const apple = vi.hoisted(() => ({
  environments: [] as string[],
  verifyAndDecodeTransaction: vi.fn(),
}));

vi.mock('@apple/app-store-server-library', () => ({
  Environment: { SANDBOX: 'Sandbox', PRODUCTION: 'Production' },
  SignedDataVerifier: class {
    constructor(_roots: unknown, _online: boolean, environment: string) {
      apple.environments.push(environment);
    }
    verifyAndDecodeTransaction = apple.verifyAndDecodeTransaction;
  },
}));

import {
  verifyGooglePlayLifecyclePurchase,
  verifyMobileIapPurchase,
} from './mobile-iap-store-verification';

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

describe('Apple App Store server verification', () => {
  const sandboxHintedJws = [
    Buffer.from(JSON.stringify({ alg: 'ES256' })).toString('base64url'),
    Buffer.from(JSON.stringify({ environment: 'Sandbox', productId: topUp.productId })).toString(
      'base64url',
    ),
    'sig',
  ].join('.');

  beforeEach(() => {
    apple.environments.length = 0;
    apple.verifyAndDecodeTransaction.mockReset();
    apple.verifyAndDecodeTransaction.mockRejectedValue(new Error('not signed by Apple'));
    vi.stubEnv('APPLE_APP_STORE_BUNDLE_ID', 'com.fixture.app');
    vi.stubEnv('APPLE_APP_STORE_APP_ID', '123456');
    vi.stubEnv(
      'APPLE_APP_STORE_ROOT_CA_CERTS_BASE64_JSON',
      JSON.stringify([Buffer.from('fixture-root').toString('base64')]),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('verifies against production no matter what environment the unverified payload claims', async () => {
    await expect(
      verifyMobileIapPurchase({
        platform: 'ios',
        product: topUp,
        purchaseToken: sandboxHintedJws,
        appAccountToken: accountToken,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(apple.environments).toEqual(['Production']);
  });

  it('uses the sandbox verifier only when the deployment opts in', async () => {
    vi.stubEnv('APPLE_APP_STORE_ENVIRONMENT', 'sandbox');
    await verifyMobileIapPurchase({
      platform: 'ios',
      product: topUp,
      purchaseToken: sandboxHintedJws,
      appAccountToken: accountToken,
    }).catch(() => undefined);
    expect(apple.environments).toEqual(['Sandbox']);
  });

  it('refuses to run with an unrecognised environment setting', async () => {
    vi.stubEnv('APPLE_APP_STORE_ENVIRONMENT', 'staging');
    await expect(
      verifyMobileIapPurchase({
        platform: 'ios',
        product: topUp,
        purchaseToken: sandboxHintedJws,
        appAccountToken: accountToken,
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(apple.environments).toEqual([]);
  });
});
