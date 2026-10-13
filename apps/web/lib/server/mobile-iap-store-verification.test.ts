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
  acknowledgeGooglePlayPurchase,
  readGooglePlayPurchaseOwner,
  verifyGooglePlayLifecyclePurchase,
  verifyMobileIapPurchase,
} from './mobile-iap-store-verification';

const topUp = {
  ...MOBILE_IAP_PRODUCT_DEFINITIONS.find((item) => item.kind === 'top_up')!,
  productId: 'fixture.topup',
};
const accountToken = '00000000-0000-4000-8000-000000000001';
const definition = (tier: string) =>
  MOBILE_IAP_PRODUCT_DEFINITIONS.find(
    (item) => item.kind === 'subscription' && item.planTier === tier,
  )!;
const pro = {
  ...definition('pro'),
  productId: 'agi_pro',
  googleOffer: { basePlanId: 'monthly', offerId: null },
};
const basic = {
  ...definition('basic'),
  productId: 'agi_basic',
  googleOffer: { basePlanId: 'monthly', offerId: null },
};
const purchaseToken = 'fixture-purchase-token-long-enough';
const FAR_FUTURE = '2099-01-01T00:00:00.000Z';

function googleSubscription(overrides: Record<string, unknown> = {}) {
  return {
    startTime: '2026-08-01T00:00:00.000Z',
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
    externalAccountIdentifiers: { obfuscatedExternalAccountId: accountToken },
    lineItems: [
      {
        productId: pro.productId,
        expiryTime: FAR_FUTURE,
        latestSuccessfulOrderId: 'GPA.1111',
        autoRenewingPlan: { autoRenewEnabled: true },
        offerDetails: { basePlanId: 'monthly' },
      },
    ],
    ...overrides,
  };
}

function stubGoogle(...bodies: unknown[]) {
  const fetchMock = vi.fn();
  for (const body of bodies) {
    fetchMock
      .mockResolvedValueOnce(response({ access_token: 'fixture-access-token' }))
      .mockResolvedValueOnce(body instanceof Response ? body : response(body));
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

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

describe('Google Play subscription states', () => {
  beforeEach(() => {
    process.env['GOOGLE_PLAY_SERVICE_ACCOUNT_JSON'] = JSON.stringify({
      client_email: 'fixture@example.com',
      private_key: 'fixture-private-key',
    });
    process.env['GOOGLE_PLAY_PACKAGE_NAME'] = 'com.fixture.app';
    process.env['MOBILE_IAP_GOOGLE_PRODUCT_IDS_JSON'] = JSON.stringify({
      [pro.key]: { productId: pro.productId, basePlanId: 'monthly' },
      [basic.key]: { productId: basic.productId, basePlanId: 'monthly' },
    });
    vi.spyOn(jwt, 'sign').mockImplementation(() => 'fixture-signed-assertion' as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env['GOOGLE_PLAY_SERVICE_ACCOUNT_JSON'];
    delete process.env['GOOGLE_PLAY_PACKAGE_NAME'];
    delete process.env['MOBILE_IAP_GOOGLE_PRODUCT_IDS_JSON'];
  });

  function lifecycle(body: unknown, notificationType: number | null = null) {
    stubGoogle(body);
    return verifyGooglePlayLifecyclePurchase({
      product: pro,
      purchaseToken,
      appAccountToken: accountToken,
      notificationType,
    });
  }

  it.each([
    ['SUBSCRIPTION_STATE_ACTIVE', 'active', 'active'],
    ['SUBSCRIPTION_STATE_CANCELED', 'active', 'active'],
    ['SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'grace', 'active'],
    ['SUBSCRIPTION_STATE_ON_HOLD', 'on_hold', 'expired'],
    ['SUBSCRIPTION_STATE_PAUSED', 'paused', 'expired'],
    ['SUBSCRIPTION_STATE_EXPIRED', 'expired', 'expired'],
    ['SUBSCRIPTION_STATE_PENDING', 'pending', 'expired'],
    ['SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED', 'pending', 'expired'],
  ])('reads %s as %s', async (subscriptionState, state, entitlementStatus) => {
    await expect(lifecycle(googleSubscription({ subscriptionState }))).resolves.toMatchObject({
      lifecycle: state,
      entitlementStatus,
      storeAcknowledged: false,
    });
  });

  it('reports a cancellation as access that ends with the paid period', async () => {
    await expect(
      lifecycle(googleSubscription({ subscriptionState: 'SUBSCRIPTION_STATE_CANCELED' })),
    ).resolves.toMatchObject({ lifecycle: 'active', cancelAtPeriodEnd: true });
  });

  it('reads an expiry reported by a revocation notice as revoked', async () => {
    await expect(
      lifecycle(googleSubscription({ subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED' }), 12),
    ).resolves.toMatchObject({ lifecycle: 'revoked' });
  });

  it('refuses to grant a subscription that is on hold when the app asks', async () => {
    stubGoogle(googleSubscription({ subscriptionState: 'SUBSCRIPTION_STATE_ON_HOLD' }));
    await expect(
      verifyMobileIapPurchase({
        platform: 'android',
        product: pro,
        purchaseToken,
        appAccountToken: accountToken,
      }),
    ).resolves.toMatchObject({ entitlementStatus: 'expired' });
  });

  it('keeps the plan the buyer still owns when a downgrade is deferred to renewal', async () => {
    stubGoogle(
      googleSubscription({
        linkedPurchaseToken: 'previous-purchase-token',
        lineItems: [
          {
            productId: pro.productId,
            expiryTime: FAR_FUTURE,
            latestSuccessfulOrderId: 'GPA.1111',
            autoRenewingPlan: { autoRenewEnabled: false },
            offerDetails: { basePlanId: 'monthly' },
            deferredItemReplacement: { productId: basic.productId },
          },
          {
            productId: basic.productId,
            expiryTime: FAR_FUTURE,
            offerDetails: { basePlanId: 'monthly' },
          },
        ],
      }),
    );

    const verified = await verifyMobileIapPurchase({
      platform: 'android',
      product: basic,
      purchaseToken,
      appAccountToken: accountToken,
    });

    expect(verified).toMatchObject({
      entitlementStatus: 'active',
      cancelAtPeriodEnd: false,
      storeTransactionId: 'GPA.1111',
    });
    expect(verified.product.key).toBe(pro.key);
    expect(verified.scheduledProduct?.key).toBe(basic.key);
    expect(verified.originalTransactionId).toMatch(/^[0-9a-f]{64}$/);
  });

  it('follows the item Play now reports once a deferred change has taken effect', async () => {
    const verified = await lifecycle(
      googleSubscription({
        lineItems: [
          {
            productId: basic.productId,
            expiryTime: FAR_FUTURE,
            latestSuccessfulOrderId: 'GPA.2222',
            offerDetails: { basePlanId: 'monthly' },
          },
        ],
      }),
    );

    expect(verified.product.key).toBe(basic.key);
    expect(verified.storeTransactionId).toBe('GPA.2222');
  });

  it('refuses a purchase of a product the buyer asked for but Play did not sell', async () => {
    stubGoogle(googleSubscription());
    await expect(
      verifyMobileIapPurchase({
        platform: 'android',
        product: basic,
        purchaseToken,
        appAccountToken: accountToken,
      }),
    ).rejects.toThrow(/does not belong to this account/i);
  });

  it('refuses a base plan this deployment does not sell', async () => {
    stubGoogle(
      googleSubscription({
        lineItems: [
          {
            productId: pro.productId,
            expiryTime: FAR_FUTURE,
            latestSuccessfulOrderId: 'GPA.1111',
            offerDetails: { basePlanId: 'prepaid-weekly' },
          },
        ],
      }),
    );
    await expect(
      verifyMobileIapPurchase({
        platform: 'android',
        product: pro,
        purchaseToken,
        appAccountToken: accountToken,
      }),
    ).rejects.toThrow(/base plan/i);
  });

  it('binds a resubscription made in Play to the account the expired one named', async () => {
    stubGoogle(
      googleSubscription({
        externalAccountIdentifiers: undefined,
        outOfAppPurchaseContext: {
          expiredExternalAccountIdentifiers: { obfuscatedExternalAccountId: accountToken },
        },
      }),
    );
    await expect(
      readGooglePlayPurchaseOwner({ kind: 'subscription', purchaseToken }),
    ).resolves.toMatchObject({
      appAccountToken: accountToken,
      productId: pro.productId,
    });
  });

  it('names the owner and product of a one-time purchase', async () => {
    stubGoogle({
      productLineItem: [{ productId: topUp.productId }],
      purchaseStateContext: { purchaseState: 'PURCHASED' },
      orderId: 'GPA.3333',
      obfuscatedExternalAccountId: accountToken,
      purchaseCompletionTime: '2026-08-01T00:00:00.000Z',
    });
    await expect(
      readGooglePlayPurchaseOwner({
        kind: 'top_up',
        purchaseToken,
        productId: topUp.productId,
      }),
    ).resolves.toMatchObject({ appAccountToken: accountToken, productId: topUp.productId });
  });

  it('reports a one-time purchase still awaiting payment as pending, not revoked', async () => {
    stubGoogle({
      productLineItem: [{ productId: topUp.productId }],
      purchaseStateContext: { purchaseState: 'PENDING' },
      orderId: 'GPA.3333',
      obfuscatedExternalAccountId: accountToken,
      purchaseCompletionTime: '2026-08-01T00:00:00.000Z',
    });
    await expect(
      verifyGooglePlayLifecyclePurchase({
        product: topUp,
        purchaseToken,
        appAccountToken: accountToken,
      }),
    ).resolves.toMatchObject({ lifecycle: 'pending', entitlementStatus: 'revoked' });
  });

  it.each([
    [pro, 'subscriptions/agi_pro'],
    [topUp, 'products/fixture.topup'],
  ])('acknowledges %o on the endpoint for its product type', async (product, path) => {
    const fetchMock = stubGoogle(new Response(null, { status: 200 }));

    await acknowledgeGooglePlayPurchase({ product, purchaseToken });

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe(
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.fixture.app/purchases/${path}/tokens/${purchaseToken}:acknowledge`,
    );
    expect(init.method).toBe('POST');
  });

  it('fails loudly when Play does not take the acknowledgement', async () => {
    stubGoogle(new Response('{}', { status: 503 }));
    await expect(acknowledgeGooglePlayPurchase({ product: pro, purchaseToken })).rejects.toThrow(
      /did not acknowledge/i,
    );
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

  it('tries the production chain and then the sandbox chain, and refuses what neither signed', async () => {
    await expect(
      verifyMobileIapPurchase({
        platform: 'ios',
        product: topUp,
        purchaseToken: sandboxHintedJws,
        appAccountToken: accountToken,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(apple.environments).toEqual(['Production', 'Sandbox']);
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
