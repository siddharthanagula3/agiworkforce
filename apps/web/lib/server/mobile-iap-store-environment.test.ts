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
    private readonly environment: string;
    constructor(_roots: unknown, _online: boolean, environment: string) {
      this.environment = environment;
      apple.environments.push(environment);
    }
    verifyAndDecodeTransaction = (signed: string) =>
      apple.verifyAndDecodeTransaction(signed, this.environment);
  },
}));

import {
  isUnfundedStorePurchase,
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
    'is verified on production and named a test purchase for %s, so the ledger can gate it',
    async (_key, product) => {
      vi.stubEnv('VERCEL_ENV', 'production');
      stubGooglePurchase(product, true);
      const verified = await verifyAndroid(product);
      expect(verified).toMatchObject({ environment: 'sandbox', entitlementStatus: 'active' });
      expect(isUnfundedStorePurchase(verified)).toBe(true);
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

  it('never names a funded purchase a test purchase', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    for (const product of MOBILE_IAP_PRODUCT_DEFINITIONS) {
      stubGooglePurchase(product, false);
      const verified = await verifyAndroid(product);
      expect(verified).toMatchObject({ environment: 'production', entitlementStatus: 'active' });
      expect(isUnfundedStorePurchase(verified)).toBe(false);
    }
  });

  it('keeps its test marking when the store reports its lifecycle in production', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    const product = MOBILE_IAP_PRODUCT_DEFINITIONS.find((item) => item.kind === 'subscription')!;
    stubGooglePurchase(product, true);
    await expect(
      verifyGooglePlayLifecyclePurchase({
        product: catalogProduct(product),
        purchaseToken: PURCHASE_TOKEN,
        appAccountToken: ACCOUNT_TOKEN,
      }),
    ).resolves.toMatchObject({ environment: 'sandbox', entitlementStatus: 'active' });
  });

  function stubAppleConfiguration(environment: 'production' | 'sandbox'): void {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('APPLE_APP_STORE_ENVIRONMENT', environment);
    vi.stubEnv('APPLE_APP_STORE_BUNDLE_ID', 'com.fixture.app');
    vi.stubEnv('APPLE_APP_STORE_APP_ID', '1234567890');
    vi.stubEnv(
      'APPLE_APP_STORE_ROOT_CA_CERTS_BASE64_JSON',
      JSON.stringify([Buffer.from('fixture-root').toString('base64')]),
    );
  }

  const subscription = MOBILE_IAP_PRODUCT_DEFINITIONS.find((item) => item.kind === 'subscription')!;

  // The real verifier refuses a payload whose environment is not its own.
  function appleSigns(signedIn: 'Production' | 'Sandbox', claimed: string = signedIn): void {
    apple.verifyAndDecodeTransaction.mockImplementation(
      async (_signed: string, verifierEnvironment: string) => {
        if (verifierEnvironment !== signedIn) throw new Error('INVALID_ENVIRONMENT');
        return {
          productId: storeProductId(subscription),
          appAccountToken: ACCOUNT_TOKEN,
          transactionId: 'fixture-apple-transaction',
          purchaseDate: Date.parse('2026-08-01T00:00:00.000Z'),
          expiresDate: Date.parse(FAR_FUTURE),
          environment: claimed,
        };
      },
    );
  }

  function verifyApple() {
    return verifyMobileIapPurchase({
      platform: 'ios',
      product: catalogProduct(subscription),
      purchaseToken: PURCHASE_TOKEN,
      appAccountToken: ACCOUNT_TOKEN,
    });
  }

  it('cannot pass as paid by claiming production inside a sandbox-signed transaction', async () => {
    stubAppleConfiguration('sandbox');
    appleSigns('Sandbox', 'Production');

    const verified = await verifyApple();

    expect(verified.environment).toBe('sandbox');
    expect(isUnfundedStorePurchase(verified)).toBe(true);
    expect(apple.environments).toEqual(['Sandbox']);
  });

  it('verifies an App Review sandbox transaction on production and names it a test purchase', async () => {
    stubAppleConfiguration('production');
    appleSigns('Sandbox');

    const verified = await verifyApple();

    expect(verified).toMatchObject({ environment: 'sandbox', entitlementStatus: 'active' });
    expect(isUnfundedStorePurchase(verified)).toBe(true);
  });

  it('names a transaction Apple signed in production as paid', async () => {
    stubAppleConfiguration('production');
    appleSigns('Production');

    const verified = await verifyApple();

    expect(verified.environment).toBe('production');
    expect(isUnfundedStorePurchase(verified)).toBe(false);
  });

  it("refuses a transaction neither of Apple's environments signed", async () => {
    stubAppleConfiguration('production');
    apple.verifyAndDecodeTransaction.mockRejectedValue(new Error('not signed by Apple'));

    expect(await refusalMessage(verifyApple())).toMatch(/could not verify/i);
  });

  it('treats a transaction the customer upgraded away from as no longer active', async () => {
    stubAppleConfiguration('production');
    apple.verifyAndDecodeTransaction.mockResolvedValue({
      productId: storeProductId(subscription),
      appAccountToken: ACCOUNT_TOKEN,
      transactionId: 'fixture-apple-transaction',
      purchaseDate: Date.parse('2026-08-01T00:00:00.000Z'),
      expiresDate: Date.parse(FAR_FUTURE),
      isUpgraded: true,
    });

    await expect(verifyApple()).resolves.toMatchObject({ entitlementStatus: 'expired' });
  });
});
