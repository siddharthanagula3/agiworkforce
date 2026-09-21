import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  MOBILE_IAP_PRODUCT_DEFINITIONS,
  type MobileIapProductDefinition,
} from '@agiworkforce/types';

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

const ACCOUNT_TOKEN = '00000000-0000-4000-8000-000000000042';
const PURCHASE_TOKEN = 'fixture-purchase-token-long-enough';
const FAR_FUTURE = '2099-01-01T00:00:00.000Z';

function storeProductId(product: MobileIapProductDefinition): string {
  return `fixture.${product.key}`;
}

function catalogProduct(product: MobileIapProductDefinition) {
  return { ...product, productId: storeProductId(product) } as MobileIapProductDefinition & {
    productId: string;
  };
}

// `rejects.toThrow` compares the rejection against the realm's Error, which is
// not reliable under a shared worker; the refusal message is the claim, so read it.
async function refusalMessage(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'no refusal';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function googleBody(product: MobileIapProductDefinition, testPurchase: boolean): unknown {
  if (product.kind === 'top_up') {
    return {
      productLineItem: [
        {
          productId: storeProductId(product),
          productOfferDetails: { quantity: 1, refundableQuantity: 1 },
        },
      ],
      purchaseStateContext: { purchaseState: 'PURCHASED' },
      orderId: `fixture-order-${product.key}`,
      obfuscatedExternalAccountId: ACCOUNT_TOKEN,
      purchaseCompletionTime: '2026-08-01T00:00:00.000Z',
      ...(testPurchase ? { testPurchaseContext: { fopType: 'TEST' } } : {}),
    };
  }
  return {
    startTime: '2026-08-01T00:00:00.000Z',
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    latestSuccessfulOrderId: `fixture-order-${product.key}`,
    externalAccountIdentifiers: { obfuscatedExternalAccountId: ACCOUNT_TOKEN },
    lineItems: [{ productId: storeProductId(product), expiryTime: FAR_FUTURE }],
    ...(testPurchase ? { testPurchase: {} } : {}),
  };
}

function stubGooglePurchase(product: MobileIapProductDefinition, testPurchase: boolean): void {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(response({ access_token: 'fixture-access-token' }))
      .mockResolvedValueOnce(response(googleBody(product, testPurchase))),
  );
}

function verifyAndroid(product: MobileIapProductDefinition) {
  return verifyMobileIapPurchase({
    platform: 'android',
    product: catalogProduct(product),
    purchaseToken: PURCHASE_TOKEN,
    appAccountToken: ACCOUNT_TOKEN,
  });
}

describe('a store purchase made in the test environment', () => {
  beforeEach(() => {
    process.env['GOOGLE_PLAY_SERVICE_ACCOUNT_JSON'] = JSON.stringify({
      client_email: 'fixture@example.com',
      private_key: 'fixture-private-key',
    });
    process.env['GOOGLE_PLAY_PACKAGE_NAME'] = 'com.fixture.app';
    vi.spyOn(jwt, 'sign').mockImplementation(() => 'fixture-signed-assertion' as never);
    apple.environments.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    delete process.env['GOOGLE_PLAY_SERVICE_ACCOUNT_JSON'];
    delete process.env['GOOGLE_PLAY_PACKAGE_NAME'];
  });

  it.each(MOBILE_IAP_PRODUCT_DEFINITIONS.map((product) => [product.key, product] as const))(
    'is refused on a production deployment for %s',
    async (_key, product) => {
      vi.stubEnv('VERCEL_ENV', 'production');
      stubGooglePurchase(product, true);
      expect(await refusalMessage(verifyAndroid(product))).toMatch(/test environment/i);
    },
  );

  it.each(MOBILE_IAP_PRODUCT_DEFINITIONS.map((product) => [product.key, product] as const))(
    'is accepted off production for %s, so testers can still exercise the flow',
    async (_key, product) => {
      vi.stubEnv('VERCEL_ENV', 'preview');
      stubGooglePurchase(product, false);
      await expect(verifyAndroid(product)).resolves.toMatchObject({
        environment: 'production',
        entitlementStatus: 'active',
      });

      stubGooglePurchase(product, true);
      await expect(verifyAndroid(product)).resolves.toMatchObject({
        environment: 'sandbox',
        entitlementStatus: 'active',
      });
    },
  );

  it('never grants a funded purchase the test-environment refusal', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    for (const product of MOBILE_IAP_PRODUCT_DEFINITIONS) {
      stubGooglePurchase(product, false);
      await expect(verifyAndroid(product)).resolves.toMatchObject({
        environment: 'production',
        entitlementStatus: 'active',
      });
    }
  });

  it('is revoked rather than renewed when the store reports its lifecycle in production', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    const product = MOBILE_IAP_PRODUCT_DEFINITIONS.find((item) => item.kind === 'subscription')!;
    stubGooglePurchase(product, true);
    await expect(
      verifyGooglePlayLifecyclePurchase({
        product: catalogProduct(product),
        purchaseToken: PURCHASE_TOKEN,
        appAccountToken: ACCOUNT_TOKEN,
      }),
    ).resolves.toMatchObject({ environment: 'sandbox', entitlementStatus: 'revoked' });
  });

  it('cannot be smuggled past App Store verification by the transaction claiming production', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('APPLE_APP_STORE_ENVIRONMENT', 'sandbox');
    vi.stubEnv('APPLE_APP_STORE_BUNDLE_ID', 'com.fixture.app');
    vi.stubEnv('APPLE_APP_STORE_APP_ID', '1234567890');
    vi.stubEnv(
      'APPLE_APP_STORE_ROOT_CA_CERTS_BASE64_JSON',
      JSON.stringify([Buffer.from('fixture-root').toString('base64')]),
    );
    const product = MOBILE_IAP_PRODUCT_DEFINITIONS.find((item) => item.kind === 'subscription')!;
    apple.verifyAndDecodeTransaction.mockResolvedValue({
      productId: storeProductId(product),
      appAccountToken: ACCOUNT_TOKEN,
      transactionId: 'fixture-apple-transaction',
      purchaseDate: Date.parse('2026-08-01T00:00:00.000Z'),
      expiresDate: Date.parse(FAR_FUTURE),
      environment: 'Production',
    });

    expect(
      await refusalMessage(
        verifyMobileIapPurchase({
          platform: 'ios',
          product: catalogProduct(product),
          purchaseToken: PURCHASE_TOKEN,
          appAccountToken: ACCOUNT_TOKEN,
        }),
      ),
    ).toMatch(/test environment/i);
    expect(apple.environments).toEqual(['Sandbox']);
  });

  it('reads the App Store environment off deployment config, not off the transaction', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('APPLE_APP_STORE_ENVIRONMENT', 'production');
    vi.stubEnv('APPLE_APP_STORE_BUNDLE_ID', 'com.fixture.app');
    vi.stubEnv('APPLE_APP_STORE_APP_ID', '1234567890');
    vi.stubEnv(
      'APPLE_APP_STORE_ROOT_CA_CERTS_BASE64_JSON',
      JSON.stringify([Buffer.from('fixture-root').toString('base64')]),
    );
    const product = MOBILE_IAP_PRODUCT_DEFINITIONS.find((item) => item.kind === 'subscription')!;
    apple.verifyAndDecodeTransaction.mockResolvedValue({
      productId: storeProductId(product),
      appAccountToken: ACCOUNT_TOKEN,
      transactionId: 'fixture-apple-transaction',
      purchaseDate: Date.parse('2026-08-01T00:00:00.000Z'),
      expiresDate: Date.parse(FAR_FUTURE),
      environment: 'Sandbox',
    });

    await expect(
      verifyMobileIapPurchase({
        platform: 'ios',
        product: catalogProduct(product),
        purchaseToken: PURCHASE_TOKEN,
        appAccountToken: ACCOUNT_TOKEN,
      }),
    ).resolves.toMatchObject({ environment: 'production' });
    expect(apple.environments).toEqual(['Production']);
  });
});
