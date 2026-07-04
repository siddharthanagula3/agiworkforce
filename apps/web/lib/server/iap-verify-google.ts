/**
 * Google Play Developer API — subscription purchase verification.
 *
 * Docs: https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptions/get
 *
 * Uses a service-account OAuth2 JWT-bearer flow (no `googleapis` dependency):
 * sign a short-lived RS256 assertion with the service account's private key,
 * exchange it for an access token at Google's token endpoint, then call the
 * Android Publisher API with that token.
 */
import 'server-only';
import jwt from 'jsonwebtoken';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

export interface GoogleSubscriptionInfo {
  expiryTimeMillis: number;
  autoRenewing: boolean;
  /** Present when the subscription was canceled/refunded/revoked. */
  cancelReason: number | null;
  paymentState: number | null;
  startTimeMillis: number | null;
}

interface GoogleServiceAccount {
  client_email: string;
  private_key: string;
}

function getGoogleServiceAccount(): GoogleServiceAccount | null {
  const raw = process.env['GOOGLE_PLAY_SERVICE_ACCOUNT_JSON'];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<GoogleServiceAccount>;
    if (!parsed.client_email || !parsed.private_key) return null;
    return { client_email: parsed.client_email, private_key: parsed.private_key };
  } catch {
    return null;
  }
}

async function getAccessToken(account: GoogleServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      iss: account.client_email,
      scope: PUBLISHER_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    },
    account.private_key,
    { algorithm: 'RS256' },
  );

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    logger.error(
      { status: response.status, body },
      'iap/verify: Google OAuth2 token exchange failed',
    );
    throw createError.internal('Failed to authenticate with Google Play Developer API');
  }

  const { access_token } = (await response.json()) as { access_token?: string };
  if (!access_token) {
    throw createError.internal('Google token response missing access_token');
  }
  return access_token;
}

/**
 * Verifies an Android subscription purchase against the Play Developer API.
 *
 * Fails closed (throws `createError.serviceUnavailable`) when the Google
 * service account isn't configured, rather than accepting the purchase
 * unverified.
 */
export async function verifyGoogleSubscription(
  purchaseToken: string,
  productId: string,
): Promise<GoogleSubscriptionInfo> {
  const account = getGoogleServiceAccount();
  const packageName = process.env['GOOGLE_PLAY_PACKAGE_NAME'];
  if (!account || !packageName) {
    logger.error(
      'iap/verify: Google Play Developer API is not configured ' +
        '(GOOGLE_PLAY_SERVICE_ACCOUNT_JSON / GOOGLE_PLAY_PACKAGE_NAME)',
    );
    throw createError.serviceUnavailable(
      'Google purchase verification is not configured on the server',
    );
  }

  const accessToken = await getAccessToken(account);

  const url =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
    `${encodeURIComponent(packageName)}/purchases/subscriptions/` +
    `${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    logger.error(
      { status: response.status, body, productId },
      'iap/verify: Google Play Developer API rejected subscription lookup',
    );
    throw createError.badRequest('Google could not verify this purchase');
  }

  const data = (await response.json()) as {
    expiryTimeMillis?: string;
    startTimeMillis?: string;
    autoRenewing?: boolean;
    cancelReason?: number;
    paymentState?: number;
  };

  if (!data.expiryTimeMillis) {
    throw createError.internal('Google subscription response missing expiryTimeMillis');
  }

  return {
    expiryTimeMillis: Number(data.expiryTimeMillis),
    startTimeMillis: data.startTimeMillis ? Number(data.startTimeMillis) : null,
    autoRenewing: Boolean(data.autoRenewing),
    cancelReason: typeof data.cancelReason === 'number' ? data.cancelReason : null,
    paymentState: typeof data.paymentState === 'number' ? data.paymentState : null,
  };
}
