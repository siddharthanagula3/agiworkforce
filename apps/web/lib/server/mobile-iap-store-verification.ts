import 'server-only';

import { createHash } from 'node:crypto';
import {
  Environment,
  SignedDataVerifier,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
} from '@apple/app-store-server-library';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type { MobileIapCatalogProduct, MobileIapPlatform } from '@agiworkforce/types';
import { createError } from '@/lib/errors';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const STORE_REQUEST_TIMEOUT_MS = 15_000;

const GoogleServiceAccountSchema = z.object({
  client_email: z.string().email(),
  private_key: z.string().min(1),
});

const GoogleProductPurchaseSchema = z.object({
  productLineItem: z.array(
    z.object({
      productId: z.string(),
      productOfferDetails: z
        .object({
          quantity: z.number().int().positive().optional(),
          refundableQuantity: z.number().int().nonnegative().optional(),
        })
        .optional(),
    }),
  ),
  purchaseStateContext: z.object({ purchaseState: z.string() }),
  orderId: z.string().min(1),
  obfuscatedExternalAccountId: z.string().min(1),
  purchaseCompletionTime: z.string().datetime({ offset: true }),
  acknowledgementState: z.string().optional(),
  testPurchaseContext: z.unknown().optional(),
});

const GoogleSubscriptionPurchaseSchema = z.object({
  startTime: z.string().datetime({ offset: true }).optional(),
  subscriptionState: z.string(),
  latestOrderId: z.string().min(1).optional(),
  latestSuccessfulOrderId: z.string().min(1).optional(),
  linkedPurchaseToken: z.string().optional(),
  acknowledgementState: z.string().optional(),
  testPurchase: z.unknown().optional(),
  externalAccountIdentifiers: z.object({
    obfuscatedExternalAccountId: z.string().min(1),
  }),
  lineItems: z.array(
    z.object({
      productId: z.string(),
      expiryTime: z.string().datetime({ offset: true }),
      autoRenewingPlan: z.unknown().optional(),
      prepaidPlan: z.unknown().optional(),
    }),
  ),
});

export interface VerifiedMobileIapPurchase {
  platform: MobileIapPlatform;
  product: MobileIapCatalogProduct;
  storeTransactionId: string;
  purchaseTokenHash: string;
  originalTransactionId: string | null;
  purchasedAt: Date;
  expiresAt: Date | null;
  environment: string;
  entitlementStatus: 'active' | 'expired' | 'revoked';
}

export function hashMobileIapPurchaseToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function readAppleRootCertificates(): Buffer[] {
  const raw = process.env['APPLE_APP_STORE_ROOT_CA_CERTS_BASE64_JSON']?.trim();
  if (!raw) {
    throw createError.serviceUnavailable('App Store verification is not configured.');
  }
  try {
    const parsed = z.array(z.string().min(1)).min(1).parse(JSON.parse(raw));
    return parsed.map((certificate) => Buffer.from(certificate, 'base64'));
  } catch {
    throw createError.serviceUnavailable('App Store root certificates are invalid.');
  }
}

function createAppleVerifier(environment: Environment): SignedDataVerifier {
  const bundleId = process.env['APPLE_APP_STORE_BUNDLE_ID']?.trim();
  const appAppleId = Number(process.env['APPLE_APP_STORE_APP_ID']);
  if (!bundleId || !Number.isSafeInteger(appAppleId) || appAppleId <= 0) {
    throw createError.serviceUnavailable('App Store verification is not configured.');
  }
  return new SignedDataVerifier(
    readAppleRootCertificates(),
    true,
    environment,
    bundleId,
    environment === Environment.PRODUCTION ? appAppleId : undefined,
  );
}

// The trust environment must come from deployment config, never from the unverified JWS
// payload: a Sandbox-signed transaction is a free test purchase and must not unlock
// production entitlements.
function configuredAppleEnvironment(): Environment {
  const raw = process.env['APPLE_APP_STORE_ENVIRONMENT']?.trim().toLowerCase() ?? '';
  if (raw === '' || raw === 'production') return Environment.PRODUCTION;
  if (raw === 'sandbox') return Environment.SANDBOX;
  throw createError.serviceUnavailable('App Store verification environment is invalid.');
}

export interface VerifiedAppleStoreNotification {
  notification: ResponseBodyV2DecodedPayload;
  transaction: JWSTransactionDecodedPayload | null;
}

export async function verifyAppleStoreNotification(
  signedPayload: string,
): Promise<VerifiedAppleStoreNotification> {
  const verifier = createAppleVerifier(configuredAppleEnvironment());
  try {
    const notification = await verifier.verifyAndDecodeNotification(signedPayload);
    const signedTransaction = notification.data?.signedTransactionInfo;
    return {
      notification,
      transaction: signedTransaction
        ? await verifier.verifyAndDecodeTransaction(signedTransaction)
        : null,
    };
  } catch {
    throw createError.badRequest('Apple could not verify this server notification.');
  }
}

async function verifyApplePurchase(input: {
  product: MobileIapCatalogProduct;
  purchaseToken: string;
  appAccountToken: string;
}): Promise<VerifiedMobileIapPurchase> {
  const environment = configuredAppleEnvironment();
  const verifier = createAppleVerifier(environment);

  let transaction;
  try {
    transaction = await verifier.verifyAndDecodeTransaction(input.purchaseToken);
  } catch {
    throw createError.badRequest('Apple could not verify this transaction.');
  }

  if (
    transaction.productId !== input.product.productId ||
    transaction.appAccountToken !== input.appAccountToken
  ) {
    throw createError.forbidden('This App Store transaction does not belong to this account.');
  }
  if (
    !transaction.transactionId ||
    !transaction.purchaseDate ||
    transaction.inAppOwnershipType === 'FAMILY_SHARED'
  ) {
    throw createError.badRequest('App Store transaction is incomplete.');
  }
  if (input.product.kind === 'top_up' && transaction.quantity !== 1) {
    throw createError.badRequest('Top-up purchases must have quantity one.');
  }

  const expiresAt = transaction.expiresDate ? new Date(transaction.expiresDate) : null;
  const revoked = typeof transaction.revocationDate === 'number';
  const expired = expiresAt !== null && expiresAt.getTime() <= Date.now();

  return {
    platform: 'ios',
    product: input.product,
    storeTransactionId: transaction.transactionId,
    purchaseTokenHash: hashMobileIapPurchaseToken(input.purchaseToken),
    originalTransactionId: transaction.originalTransactionId ?? null,
    purchasedAt: new Date(transaction.purchaseDate),
    expiresAt,
    environment: String(transaction.environment ?? environment),
    entitlementStatus: revoked ? 'revoked' : expired ? 'expired' : 'active',
  };
}

function readGoogleServiceAccount(): z.infer<typeof GoogleServiceAccountSchema> {
  const raw = process.env['GOOGLE_PLAY_SERVICE_ACCOUNT_JSON']?.trim();
  if (!raw) throw createError.serviceUnavailable('Google Play verification is not configured.');
  try {
    return GoogleServiceAccountSchema.parse(JSON.parse(raw));
  } catch {
    throw createError.serviceUnavailable('Google Play service credentials are invalid.');
  }
}

async function getGoogleAccessToken(): Promise<string> {
  const account = readGoogleServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      iss: account.client_email,
      scope: GOOGLE_PUBLISHER_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    },
    account.private_key,
    { algorithm: 'RS256' },
  );
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    signal: AbortSignal.timeout(STORE_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw createError.serviceUnavailable('Google Play verification is temporarily unavailable.');
  }
  const parsed = z.object({ access_token: z.string().min(1) }).safeParse(await response.json());
  if (!parsed.success) throw createError.serviceUnavailable('Google Play authentication failed.');
  return parsed.data.access_token;
}

async function fetchGooglePurchase(path: string): Promise<unknown> {
  const accessToken = await getGoogleAccessToken();
  const response = await fetch(`https://androidpublisher.googleapis.com${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(STORE_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw createError.badRequest('Google Play could not verify this purchase.');
  return response.json();
}

async function verifyGooglePurchase(input: {
  product: MobileIapCatalogProduct;
  purchaseToken: string;
  appAccountToken: string;
  allowInactive?: boolean;
}): Promise<VerifiedMobileIapPurchase> {
  const packageName = process.env['GOOGLE_PLAY_PACKAGE_NAME']?.trim();
  if (!packageName)
    throw createError.serviceUnavailable('Google Play verification is not configured.');
  const encodedPackage = encodeURIComponent(packageName);
  const encodedToken = encodeURIComponent(input.purchaseToken);

  if (input.product.kind === 'top_up') {
    const response = GoogleProductPurchaseSchema.safeParse(
      await fetchGooglePurchase(
        `/androidpublisher/v3/applications/${encodedPackage}/purchases/productsv2/tokens/${encodedToken}`,
      ),
    );
    if (!response.success)
      throw createError.badRequest('Google Play returned an invalid purchase.');
    const lineItem = response.data.productLineItem.find(
      (item) => item.productId === input.product.productId,
    );
    const grantable =
      response.data.purchaseStateContext.purchaseState === 'PURCHASED' &&
      (lineItem?.productOfferDetails?.quantity ?? 1) === 1 &&
      (lineItem?.productOfferDetails?.refundableQuantity ?? 1) >= 1;
    if (
      response.data.obfuscatedExternalAccountId !== input.appAccountToken ||
      !lineItem ||
      (!grantable && !input.allowInactive)
    ) {
      throw createError.forbidden('This Google Play purchase is not grantable to this account.');
    }
    return {
      platform: 'android',
      product: input.product,
      storeTransactionId: response.data.orderId,
      purchaseTokenHash: hashMobileIapPurchaseToken(input.purchaseToken),
      originalTransactionId: null,
      purchasedAt: new Date(response.data.purchaseCompletionTime),
      expiresAt: null,
      environment: response.data.testPurchaseContext ? 'test' : 'production',
      entitlementStatus: grantable ? 'active' : 'revoked',
    };
  }

  const response = GoogleSubscriptionPurchaseSchema.safeParse(
    await fetchGooglePurchase(
      `/androidpublisher/v3/applications/${encodedPackage}/purchases/subscriptionsv2/tokens/${encodedToken}`,
    ),
  );
  if (!response.success)
    throw createError.badRequest('Google Play returned an invalid subscription.');
  const lineItem = response.data.lineItems.find(
    (item) => item.productId === input.product.productId,
  );
  const storeTransactionId = response.data.latestSuccessfulOrderId ?? response.data.latestOrderId;
  if (
    response.data.externalAccountIdentifiers.obfuscatedExternalAccountId !==
      input.appAccountToken ||
    !lineItem ||
    !storeTransactionId
  ) {
    throw createError.forbidden('This Google Play subscription does not belong to this account.');
  }

  const expiresAt = new Date(lineItem.expiryTime);
  const state = response.data.subscriptionState;
  const activeState = [
    'SUBSCRIPTION_STATE_ACTIVE',
    'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
    'SUBSCRIPTION_STATE_CANCELED',
  ].includes(state);
  const expired = expiresAt.getTime() <= Date.now() || !activeState;
  if (expired && !input.allowInactive) {
    return {
      platform: 'android',
      product: input.product,
      storeTransactionId,
      purchaseTokenHash: hashMobileIapPurchaseToken(input.purchaseToken),
      originalTransactionId: response.data.linkedPurchaseToken
        ? hashMobileIapPurchaseToken(response.data.linkedPurchaseToken)
        : null,
      purchasedAt: new Date(response.data.startTime ?? Date.now()),
      expiresAt,
      environment: response.data.testPurchase ? 'test' : 'production',
      entitlementStatus: 'expired',
    };
  }

  return {
    platform: 'android',
    product: input.product,
    storeTransactionId,
    purchaseTokenHash: hashMobileIapPurchaseToken(input.purchaseToken),
    originalTransactionId: response.data.linkedPurchaseToken
      ? hashMobileIapPurchaseToken(response.data.linkedPurchaseToken)
      : null,
    purchasedAt: new Date(response.data.startTime ?? Date.now()),
    expiresAt,
    environment: response.data.testPurchase ? 'test' : 'production',
    entitlementStatus: expired ? 'expired' : 'active',
  };
}

export async function verifyMobileIapPurchase(input: {
  platform: MobileIapPlatform;
  product: MobileIapCatalogProduct;
  purchaseToken: string;
  appAccountToken: string;
}): Promise<VerifiedMobileIapPurchase> {
  return input.platform === 'ios' ? verifyApplePurchase(input) : verifyGooglePurchase(input);
}

export async function verifyGooglePlayLifecyclePurchase(input: {
  product: MobileIapCatalogProduct;
  purchaseToken: string;
  appAccountToken: string;
}): Promise<VerifiedMobileIapPurchase> {
  return verifyGooglePurchase({ ...input, allowInactive: true });
}
