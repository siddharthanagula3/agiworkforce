/**
 * Apple App Store Server API — signed-transaction verification.
 *
 * Docs: https://developer.apple.com/documentation/appstoreserverapi
 *
 * Flow:
 *  1. Client sends the StoreKit 2 JWS transaction representation (the
 *     unified `purchaseToken` react-native-iap exposes for iOS — see
 *     `PurchaseCommon.purchaseToken` in react-native-iap's types).
 *  2. We decode (not verify) its payload locally purely to read
 *     `transactionId` — the payload is NOT trusted at this point.
 *  3. We call Apple's App Store Server API directly over TLS, authenticated
 *     with our own ES256 service JWT, to re-fetch the signed transaction.
 *     Trust comes from that direct Apple-authenticated HTTPS round trip, not
 *     from the client-submitted JWS.
 */
import 'server-only';
import jwt from 'jsonwebtoken';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';

const APPLE_AUD = 'appstoreconnect-v1';
const PRODUCTION_BASE_URL = 'https://api.storekit.itunes.apple.com';
const SANDBOX_BASE_URL = 'https://api.storekit-sandbox.itunes.apple.com';

export interface AppleTransactionInfo {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  purchaseDate: number;
  expiresDate: number | null;
  revocationDate: number | null;
  environment: 'Production' | 'Sandbox';
}

function getAppleServerConfig(): {
  keyId: string;
  issuerId: string;
  privateKey: string;
  bundleId: string;
} | null {
  const keyId = process.env['APPLE_APP_STORE_KEY_ID'];
  const issuerId = process.env['APPLE_APP_STORE_ISSUER_ID'];
  const bundleId = process.env['APPLE_APP_STORE_BUNDLE_ID'];
  // Support the private key as either raw PEM (with literal \n escapes, the
  // common way to store multi-line secrets in a single env var) or base64.
  const rawPrivateKey = process.env['APPLE_APP_STORE_PRIVATE_KEY'];
  if (!keyId || !issuerId || !bundleId || !rawPrivateKey) {
    return null;
  }
  const privateKey = rawPrivateKey.includes('BEGIN PRIVATE KEY')
    ? rawPrivateKey.replace(/\\n/g, '\n')
    : Buffer.from(rawPrivateKey, 'base64').toString('utf8');
  return { keyId, issuerId, privateKey, bundleId };
}

function signAppStoreServerJwt(config: {
  keyId: string;
  issuerId: string;
  privateKey: string;
  bundleId: string;
}): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: config.issuerId,
      iat: now,
      exp: now + 300,
      aud: APPLE_AUD,
      bid: config.bundleId,
    },
    config.privateKey,
    { algorithm: 'ES256', keyid: config.keyId },
  );
}

function decodeJwsPayload(jws: string): Record<string, unknown> {
  const parts = jws.split('.');
  if (parts.length !== 3 || !parts[1]) {
    throw createError.badRequest('Malformed transaction JWS');
  }
  const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
  return JSON.parse(payloadJson) as Record<string, unknown>;
}

/**
 * Verifies an iOS purchase against Apple's App Store Server API.
 *
 * Fails closed (throws `createError.serviceUnavailable`) when Apple server
 * credentials aren't configured, rather than accepting the purchase
 * unverified.
 */
export async function verifyAppleTransaction(
  signedTransactionJws: string,
  expectedProductId: string,
): Promise<AppleTransactionInfo> {
  const config = getAppleServerConfig();
  if (!config) {
    logger.error(
      'iap/verify: Apple App Store Server API is not configured ' +
        '(APPLE_APP_STORE_KEY_ID / APPLE_APP_STORE_ISSUER_ID / APPLE_APP_STORE_BUNDLE_ID / APPLE_APP_STORE_PRIVATE_KEY)',
    );
    throw createError.serviceUnavailable(
      'Apple purchase verification is not configured on the server',
    );
  }

  const clientPayload = decodeJwsPayload(signedTransactionJws);
  const transactionId = clientPayload['transactionId'];
  if (typeof transactionId !== 'string' || !transactionId) {
    throw createError.badRequest('Transaction JWS is missing transactionId');
  }

  const serverJwt = signAppStoreServerJwt(config);
  const environmentHint = process.env['APPLE_APP_STORE_ENVIRONMENT'];
  const baseUrl = environmentHint === 'sandbox' ? SANDBOX_BASE_URL : PRODUCTION_BASE_URL;

  const response = await fetch(`${baseUrl}/inApps/v1/transactions/${transactionId}`, {
    headers: { Authorization: `Bearer ${serverJwt}` },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    logger.error(
      { status: response.status, body, transactionId },
      'iap/verify: Apple App Store Server API rejected transaction lookup',
    );
    throw createError.badRequest('Apple could not verify this transaction');
  }

  const { signedTransactionInfo } = (await response.json()) as { signedTransactionInfo?: string };
  if (!signedTransactionInfo) {
    throw createError.internal('Apple response missing signedTransactionInfo');
  }

  // Trusted: this payload came directly from Apple's authenticated API
  // response above, not from the client-submitted JWS decoded earlier.
  const verified = decodeJwsPayload(signedTransactionInfo);

  const productId = verified['productId'];
  if (productId !== expectedProductId) {
    logger.error(
      { expectedProductId, actualProductId: productId, transactionId },
      'iap/verify: Apple transaction productId does not match request',
    );
    throw createError.badRequest('Transaction productId does not match requested product');
  }

  const originalTransactionId = verified['originalTransactionId'];
  if (typeof originalTransactionId !== 'string' || !originalTransactionId) {
    throw createError.internal('Apple transaction missing originalTransactionId');
  }

  return {
    transactionId,
    originalTransactionId,
    productId,
    purchaseDate: Number(verified['purchaseDate']) || Date.now(),
    expiresDate: verified['expiresDate'] ? Number(verified['expiresDate']) : null,
    revocationDate: verified['revocationDate'] ? Number(verified['revocationDate']) : null,
    environment: verified['environment'] === 'Sandbox' ? 'Sandbox' : 'Production',
  };
}
