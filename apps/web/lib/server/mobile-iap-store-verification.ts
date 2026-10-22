import 'server-only';

import { createHash } from 'node:crypto';
import {
  Environment,
  SignedDataVerifier,
  type AppTransaction,
  type JWSRenewalInfoDecodedPayload,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
} from '@apple/app-store-server-library';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import {
  normalizePurchaseCountry,
  purchaseCountryFromAppStoreStorefront,
  type MobileIapCatalogProduct,
  type MobileIapPlatform,
} from '@agiworkforce/types';
import { isProductionRuntime } from '@/lib/config/runtime-environment';
import { createError } from '@/lib/errors';
import { resolveMobileIapProduct } from '@/lib/server/mobile-iap-catalog';
import {
  grantsAccess,
  resolveGoogleSubscriptionLifecycle,
  type MobileIapEntitlementState,
} from '@/lib/server/mobile-iap-lifecycle';
import type { NormalizedEnvironment } from '@/lib/server/payments/domain';
import { normalizeEnvironment, normalizeProviderTimestamp } from '@/lib/server/payments/normalize';

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
  obfuscatedExternalAccountId: z.string().min(1).optional(),
  regionCode: z.string().optional(),
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
  externalAccountIdentifiers: z
    .object({ obfuscatedExternalAccountId: z.string().min(1).optional() })
    .optional(),
  outOfAppPurchaseContext: z
    .object({
      expiredExternalAccountIdentifiers: z
        .object({ obfuscatedExternalAccountId: z.string().min(1).optional() })
        .optional(),
    })
    .optional(),
  lineItems: z.array(
    z.object({
      productId: z.string(),
      expiryTime: z.string().datetime({ offset: true }),
      latestSuccessfulOrderId: z.string().min(1).optional(),
      autoRenewingPlan: z.object({ autoRenewEnabled: z.boolean().optional() }).optional(),
      prepaidPlan: z.unknown().optional(),
      offerDetails: z
        .object({ basePlanId: z.string().optional(), offerId: z.string().optional() })
        .optional(),
      deferredItemReplacement: z.object({ productId: z.string().min(1) }).optional(),
    }),
  ),
});

type GoogleSubscriptionPurchase = z.infer<typeof GoogleSubscriptionPurchaseSchema>;
type GoogleSubscriptionLineItem = GoogleSubscriptionPurchase['lineItems'][number];

const GOOGLE_ACKNOWLEDGED = 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED';

export interface VerifiedMobileIapPurchase {
  platform: MobileIapPlatform;
  product: MobileIapCatalogProduct;
  storeTransactionId: string;
  purchaseTokenHash: string;
  originalTransactionId: string | null;
  purchasedAt: Date;
  expiresAt: Date | null;
  environment: NormalizedEnvironment;
  entitlementStatus: 'active' | 'expired' | 'revoked';
  purchaseCountry?: string | null;
  lifecycle?: MobileIapEntitlementState | 'pending';
  cancelAtPeriodEnd?: boolean;
  storeAcknowledged?: boolean;
  scheduledProduct?: MobileIapCatalogProduct | null;
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

function configuredAppleEnvironment(): Environment {
  const raw = process.env['APPLE_APP_STORE_ENVIRONMENT']?.trim().toLowerCase() ?? '';
  if (raw === '' || raw === 'production') return Environment.PRODUCTION;
  if (raw === 'sandbox') return Environment.SANDBOX;
  throw createError.serviceUnavailable('App Store verification environment is invalid.');
}

export type AppleNotificationChannel = 'production' | 'sandbox';

function sandboxNotificationsEnabled(): boolean {
  return (
    process.env['APPLE_APP_STORE_SANDBOX_NOTIFICATIONS_ENABLED']?.trim().toLowerCase() === 'true'
  );
}

// A sandbox notification is refused unless this deployment is itself sandbox or
// has opted in. One that is accepted is marked sandbox and can only move a
// receipt that was itself granted as a test purchase.
export function appleNotificationEnvironment(channel: AppleNotificationChannel): Environment {
  const configured = configuredAppleEnvironment();
  if (channel === 'production') return Environment.PRODUCTION;
  if (configured !== Environment.SANDBOX && !sandboxNotificationsEnabled()) {
    throw createError.forbidden('App Store sandbox notifications are not enabled here.');
  }
  return Environment.SANDBOX;
}

export function configuredAppleNotificationChannel(): AppleNotificationChannel {
  return configuredAppleEnvironment() === Environment.SANDBOX ? 'sandbox' : 'production';
}

export interface VerifiedAppleStoreNotification {
  notification: ResponseBodyV2DecodedPayload;
  transaction: JWSTransactionDecodedPayload | null;
  renewalInfo?: JWSRenewalInfoDecodedPayload | null;
  appTransaction?: AppTransaction | null;
  channel: AppleNotificationChannel;
}

function appleNotificationChannels(): AppleNotificationChannel[] {
  if (configuredAppleNotificationChannel() === 'sandbox') return ['sandbox'];
  return sandboxNotificationsEnabled() ? ['production', 'sandbox'] : ['production'];
}

// App Store Connect may send both environments to one URL. The verifier refuses
// a payload whose environment is not its own, so the channel is whichever of
// Apple's environments the signed payload itself names.
export async function verifyAppleStoreNotification(
  signedPayload: string,
  channel?: AppleNotificationChannel,
): Promise<VerifiedAppleStoreNotification> {
  const verifiers = (channel ? [channel] : appleNotificationChannels()).map((candidate) => ({
    channel: candidate,
    verifier: createAppleVerifier(appleNotificationEnvironment(candidate)),
  }));
  for (const candidate of verifiers) {
    try {
      const notification = await candidate.verifier.verifyAndDecodeNotification(signedPayload);
      const signedTransaction = notification.data?.signedTransactionInfo;
      const signedRenewalInfo = notification.data?.signedRenewalInfo;
      const signedAppTransaction = notification.appData?.signedAppTransactionInfo;
      return {
        notification,
        transaction: signedTransaction
          ? await candidate.verifier.verifyAndDecodeTransaction(signedTransaction)
          : null,
        renewalInfo: signedRenewalInfo
          ? await candidate.verifier.verifyAndDecodeRenewalInfo(signedRenewalInfo)
          : null,
        appTransaction: signedAppTransaction
          ? await candidate.verifier.verifyAndDecodeAppTransaction(signedAppTransaction)
          : null,
        channel: candidate.channel,
      };
    } catch {
      continue;
    }
  }
  throw createError.badRequest('Apple could not verify this server notification.');
}

// App Review and TestFlight buy in Apple's sandbox against the production
// server, so a production deployment tries the sandbox chain second. The
// environment is the one whose verifier accepted the signature, never one the
// caller states, and a sandbox result is granted only to an allowed account.
async function decodeAppleTransaction(
  signedTransaction: string,
): Promise<{ transaction: JWSTransactionDecodedPayload; environment: Environment }> {
  const configured = configuredAppleEnvironment();
  const verifiers = (
    configured === Environment.PRODUCTION
      ? [Environment.PRODUCTION, Environment.SANDBOX]
      : [configured]
  ).map((environment) => ({ environment, verifier: createAppleVerifier(environment) }));
  for (const candidate of verifiers) {
    try {
      return {
        transaction: await candidate.verifier.verifyAndDecodeTransaction(signedTransaction),
        environment: candidate.environment,
      };
    } catch {
      continue;
    }
  }
  throw createError.badRequest('Apple could not verify this transaction.');
}

export interface VerifiedAppleAppTransaction {
  appTransactionId: string;
  environment: NormalizedEnvironment;
}

// The app transaction is what Apple names in a RESCIND_CONSENT notification, so
// only one Apple signed for this app is recorded against an account.
export async function verifyAppleAppTransaction(
  signedAppTransaction: string,
): Promise<VerifiedAppleAppTransaction> {
  const configured = configuredAppleEnvironment();
  const environments =
    configured === Environment.PRODUCTION
      ? [Environment.PRODUCTION, Environment.SANDBOX]
      : [configured];
  for (const environment of environments) {
    let appTransaction: AppTransaction;
    try {
      appTransaction =
        await createAppleVerifier(environment).verifyAndDecodeAppTransaction(signedAppTransaction);
    } catch {
      continue;
    }
    if (!appTransaction.appTransactionId) {
      throw createError.badRequest('App Store app transaction has no identifier.');
    }
    return {
      appTransactionId: appTransaction.appTransactionId,
      environment: normalizeEnvironment(environment),
    };
  }
  throw createError.badRequest('Apple could not verify this app transaction.');
}

async function verifyApplePurchase(input: {
  product: MobileIapCatalogProduct;
  purchaseToken: string;
  appAccountToken: string;
}): Promise<VerifiedMobileIapPurchase> {
  const { transaction, environment } = await decodeAppleTransaction(input.purchaseToken);

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

  const expiresAt = normalizeProviderTimestamp(transaction.expiresDate, 'milliseconds');
  const purchasedAt = normalizeProviderTimestamp(transaction.purchaseDate, 'milliseconds');
  if (!purchasedAt) {
    throw createError.badRequest('App Store transaction is incomplete.');
  }
  const revoked = typeof transaction.revocationDate === 'number';
  const expired =
    transaction.isUpgraded === true || (expiresAt !== null && expiresAt.getTime() <= Date.now());

  return {
    platform: 'ios',
    product: input.product,
    storeTransactionId: transaction.transactionId,
    purchaseTokenHash: hashMobileIapPurchaseToken(input.purchaseToken),
    originalTransactionId: transaction.originalTransactionId ?? null,
    purchasedAt,
    expiresAt,
    environment: normalizeEnvironment(environment),
    entitlementStatus: revoked ? 'revoked' : expired ? 'expired' : 'active',
    purchaseCountry: purchaseCountryFromAppStoreStorefront(transaction.storefront),
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

function googlePurchasePath(kind: 'productsv2' | 'subscriptionsv2', purchaseToken: string): string {
  const packageName = process.env['GOOGLE_PLAY_PACKAGE_NAME']?.trim();
  if (!packageName)
    throw createError.serviceUnavailable('Google Play verification is not configured.');
  return `/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/${kind}/tokens/${encodeURIComponent(purchaseToken)}`;
}

async function readGoogleSubscription(purchaseToken: string): Promise<GoogleSubscriptionPurchase> {
  const response = GoogleSubscriptionPurchaseSchema.safeParse(
    await fetchGooglePurchase(googlePurchasePath('subscriptionsv2', purchaseToken)),
  );
  if (!response.success)
    throw createError.badRequest('Google Play returned an invalid subscription.');
  return response.data;
}

function googleSubscriptionAccountToken(purchase: GoogleSubscriptionPurchase): string | null {
  return (
    purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId ??
    purchase.outOfAppPurchaseContext?.expiredExternalAccountIdentifiers
      ?.obfuscatedExternalAccountId ??
    null
  );
}

// A deferred replacement issues its new token at once with two items: the one the
// buyer still owns, and the one that starts at renewal and has no successful order
// yet. Entitlement follows the owned item until Play drops it.
function ownedGoogleLineItem(
  purchase: GoogleSubscriptionPurchase,
): GoogleSubscriptionLineItem | undefined {
  const scheduled = new Set(
    purchase.lineItems.flatMap((item) =>
      item.deferredItemReplacement ? [item.deferredItemReplacement.productId] : [],
    ),
  );
  return (
    purchase.lineItems.find(
      (item) => item.latestSuccessfulOrderId && !scheduled.has(item.productId),
    ) ??
    purchase.lineItems.find((item) => !scheduled.has(item.productId)) ??
    purchase.lineItems[0]
  );
}

export interface GooglePlayPurchaseOwner {
  appAccountToken: string | null;
  productId: string | null;
  /** The order Play took real money for, when the purchase is paid and live. */
  chargedOrderId: string | null;
}

export async function readGooglePlayPurchaseOwner(input: {
  kind: 'subscription' | 'top_up';
  purchaseToken: string;
  productId?: string;
}): Promise<GooglePlayPurchaseOwner> {
  if (input.kind === 'top_up') {
    const response = GoogleProductPurchaseSchema.safeParse(
      await fetchGooglePurchase(googlePurchasePath('productsv2', input.purchaseToken)),
    );
    if (!response.success)
      throw createError.badRequest('Google Play returned an invalid purchase.');
    return {
      appAccountToken: response.data.obfuscatedExternalAccountId ?? null,
      productId:
        response.data.productLineItem.find((item) => item.productId === input.productId)
          ?.productId ?? null,
      chargedOrderId:
        response.data.purchaseStateContext.purchaseState === 'PURCHASED' &&
        !response.data.testPurchaseContext
          ? response.data.orderId
          : null,
    };
  }
  const purchase = await readGoogleSubscription(input.purchaseToken);
  const owned = ownedGoogleLineItem(purchase);
  const expiresAt = owned ? normalizeProviderTimestamp(owned.expiryTime) : null;
  const lifecycle = expiresAt
    ? resolveGoogleSubscriptionLifecycle({
        subscriptionState: purchase.subscriptionState,
        expiresAt,
        autoRenewEnabled: null,
        notificationType: null,
        now: new Date(),
      })
    : null;
  return {
    appAccountToken: googleSubscriptionAccountToken(purchase),
    productId: owned?.productId ?? null,
    chargedOrderId:
      lifecycle?.state === 'active' && !purchase.testPurchase
        ? (owned?.latestSuccessfulOrderId ??
          purchase.latestSuccessfulOrderId ??
          purchase.latestOrderId ??
          null)
        : null,
  };
}

async function verifyGooglePurchase(input: {
  product: MobileIapCatalogProduct;
  purchaseToken: string;
  appAccountToken: string;
  allowInactive?: boolean;
  notificationType?: number | null;
}): Promise<VerifiedMobileIapPurchase> {
  if (input.product.kind === 'top_up') {
    const response = GoogleProductPurchaseSchema.safeParse(
      await fetchGooglePurchase(googlePurchasePath('productsv2', input.purchaseToken)),
    );
    if (!response.success)
      throw createError.badRequest('Google Play returned an invalid purchase.');
    const lineItem = response.data.productLineItem.find(
      (item) => item.productId === input.product.productId,
    );
    const pending = response.data.purchaseStateContext.purchaseState === 'PENDING';
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
      purchasedAt: normalizeProviderTimestamp(response.data.purchaseCompletionTime) ?? new Date(),
      expiresAt: null,
      environment: normalizeEnvironment(
        response.data.testPurchaseContext ? 'sandbox' : 'production',
      ),
      entitlementStatus: grantable ? 'active' : 'revoked',
      purchaseCountry: normalizePurchaseCountry(response.data.regionCode),
      lifecycle: grantable ? 'active' : pending ? 'pending' : 'revoked',
      storeAcknowledged: response.data.acknowledgementState === GOOGLE_ACKNOWLEDGED,
    };
  }

  const purchase = await readGoogleSubscription(input.purchaseToken);
  const owned = ownedGoogleLineItem(purchase);
  const scheduledProductId = owned?.deferredItemReplacement?.productId ?? null;
  const requestedIsOwned = owned?.productId === input.product.productId;
  const requestedIsScheduled = scheduledProductId === input.product.productId;
  const ownedProduct = requestedIsOwned
    ? input.product
    : owned && (requestedIsScheduled || input.allowInactive)
      ? resolveMobileIapProduct('android', owned.productId)
      : null;
  const storeTransactionId =
    owned?.latestSuccessfulOrderId ?? purchase.latestSuccessfulOrderId ?? purchase.latestOrderId;
  if (
    googleSubscriptionAccountToken(purchase) !== input.appAccountToken ||
    !owned ||
    !ownedProduct ||
    ownedProduct.kind !== 'subscription' ||
    !storeTransactionId
  ) {
    throw createError.forbidden('This Google Play subscription does not belong to this account.');
  }
  const configuredBasePlan = ownedProduct.googleOffer?.basePlanId;
  const purchasedBasePlan = owned.offerDetails?.basePlanId;
  if (configuredBasePlan && purchasedBasePlan && configuredBasePlan !== purchasedBasePlan) {
    throw createError.forbidden('This Google Play base plan is not sold by AGI.');
  }

  const expiresAt = normalizeProviderTimestamp(owned.expiryTime);
  if (!expiresAt) {
    throw createError.badRequest('Google Play returned an invalid subscription.');
  }
  const purchasedAt = normalizeProviderTimestamp(purchase.startTime) ?? new Date();
  const lifecycle = resolveGoogleSubscriptionLifecycle({
    subscriptionState: purchase.subscriptionState,
    expiresAt,
    autoRenewEnabled:
      scheduledProductId !== null ? true : (owned.autoRenewingPlan?.autoRenewEnabled ?? null),
    notificationType: input.notificationType ?? null,
    now: new Date(),
  });
  const scheduledProduct =
    scheduledProductId === null
      ? null
      : requestedIsScheduled
        ? input.product
        : resolveMobileIapProduct('android', scheduledProductId);

  return {
    platform: 'android',
    product: ownedProduct,
    storeTransactionId,
    purchaseTokenHash: hashMobileIapPurchaseToken(input.purchaseToken),
    originalTransactionId: purchase.linkedPurchaseToken
      ? hashMobileIapPurchaseToken(purchase.linkedPurchaseToken)
      : null,
    purchasedAt,
    expiresAt,
    environment: normalizeEnvironment(purchase.testPurchase ? 'sandbox' : 'production'),
    entitlementStatus: lifecycle && grantsAccess(lifecycle.state) ? 'active' : 'expired',
    lifecycle: lifecycle?.state ?? 'pending',
    cancelAtPeriodEnd: lifecycle?.cancelAtPeriodEnd ?? false,
    storeAcknowledged: purchase.acknowledgementState === GOOGLE_ACKNOWLEDGED,
    scheduledProduct,
  };
}

export async function acknowledgeGooglePlayPurchase(input: {
  product: MobileIapCatalogProduct;
  purchaseToken: string;
}): Promise<void> {
  const packageName = process.env['GOOGLE_PLAY_PACKAGE_NAME']?.trim();
  if (!packageName)
    throw createError.serviceUnavailable('Google Play verification is not configured.');
  const collection = input.product.kind === 'subscription' ? 'subscriptions' : 'products';
  const accessToken = await getGoogleAccessToken();
  const response = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/${collection}/${encodeURIComponent(input.product.productId)}/tokens/${encodeURIComponent(input.purchaseToken)}:acknowledge`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(STORE_REQUEST_TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    throw createError.serviceUnavailable('Google Play did not acknowledge this purchase.');
  }
}

// A store test purchase moves no money, and both stores report it as one. On a
// production deployment the ledger grants it only to an account the operator has
// allowed, and never counts it as revenue.
export function isUnfundedStorePurchase(
  purchase: Pick<VerifiedMobileIapPurchase, 'environment'>,
): boolean {
  return purchase.environment === 'sandbox' && isProductionRuntime();
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
  notificationType?: number | null;
}): Promise<VerifiedMobileIapPurchase> {
  return verifyGooglePurchase({ ...input, allowInactive: true });
}

export function applePurchaseFromNotification(input: {
  verified: VerifiedAppleStoreNotification;
  product: MobileIapCatalogProduct;
}): VerifiedMobileIapPurchase | null {
  const transaction = input.verified.transaction;
  const signedTransaction = input.verified.notification.data?.signedTransactionInfo;
  if (
    !transaction?.transactionId ||
    !transaction.purchaseDate ||
    !signedTransaction ||
    transaction.productId !== input.product.productId ||
    transaction.inAppOwnershipType === 'FAMILY_SHARED' ||
    typeof transaction.revocationDate === 'number' ||
    transaction.isUpgraded === true ||
    (input.product.kind === 'top_up' && transaction.quantity !== 1)
  ) {
    return null;
  }
  const purchasedAt = normalizeProviderTimestamp(transaction.purchaseDate, 'milliseconds');
  const expiresAt = normalizeProviderTimestamp(transaction.expiresDate, 'milliseconds');
  if (!purchasedAt) return null;
  if (input.product.kind === 'subscription' && (!expiresAt || expiresAt.getTime() <= Date.now())) {
    return null;
  }
  return {
    platform: 'ios',
    product: input.product,
    storeTransactionId: transaction.transactionId,
    purchaseTokenHash: hashMobileIapPurchaseToken(signedTransaction),
    originalTransactionId: transaction.originalTransactionId ?? null,
    purchasedAt,
    expiresAt,
    environment: normalizeEnvironment(
      input.verified.channel === 'sandbox' ? Environment.SANDBOX : Environment.PRODUCTION,
    ),
    entitlementStatus: 'active',
    purchaseCountry: purchaseCountryFromAppStoreStorefront(transaction.storefront),
  };
}
