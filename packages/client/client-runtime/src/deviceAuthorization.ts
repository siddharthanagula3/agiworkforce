import {
  DEVICE_AUTHORIZATION_CODE_PATH,
  DEVICE_AUTHORIZATION_REFRESH_PATH,
  DEVICE_AUTHORIZATION_TOKEN_PATH,
  DeviceAuthorizationStartResponseSchema,
  DeviceTokenErrorSchema,
  DeviceTokenResponseSchema,
  type DeviceRefreshRequest,
  type DeviceTokenError,
} from '@agiworkforce/cloud-contracts';

const MIN_POLL_INTERVAL_MS = 3_000;
const MAX_POLL_INTERVAL_MS = 10_000;
const MAX_AUTH_WINDOW_MS = 15 * 60 * 1000;
const SLOW_DOWN_STEP_MS = 5_000;
const MAX_SLOWED_POLL_INTERVAL_MS = 60_000;

export type DeviceAuthorizationPost = (
  url: string,
  payload: unknown,
  headers?: Readonly<Record<string, string>>,
) => Promise<{ status: number; body: string }>;

export type DeviceAuthorizationSurface = 'cli' | 'desktop' | 'vscode' | 'chrome';

export interface DeviceAuthorizationRequest {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  pollIntervalMs: number;
  expiresInMs: number;
}

export type DeviceAuthorizationPollResult =
  | { kind: 'approved'; token: string; refreshToken?: string; expiresAt: number }
  | { kind: 'pending' }
  | { kind: 'slow_down'; intervalMs: number | null }
  | { kind: 'denied' }
  | { kind: 'expired' }
  | { kind: 'rejected'; message: string };

export type DeviceSessionRefreshResult =
  | { kind: 'renewed'; token: string; expiresAt: number; refreshToken: string }
  | { kind: 'unavailable' }
  | { kind: 'revoked' }
  | { kind: 'terms-required'; acceptanceUrl: string | null }
  | { kind: 'account-unavailable'; message: string };

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

function deviceError(body: unknown): DeviceTokenError | null {
  const parsed = DeviceTokenErrorSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

export async function requestDeviceAuthorization(
  origin: string,
  post: DeviceAuthorizationPost,
  surface: DeviceAuthorizationSurface = 'cli',
): Promise<DeviceAuthorizationRequest> {
  const trustedOrigin = new URL(origin).origin;
  const response = await post(`${trustedOrigin}${DEVICE_AUTHORIZATION_CODE_PATH}`, { surface });
  if (response.status < 200 || response.status >= 300) {
    throw new Error('Could not start AGI Cloud sign-in. Try again.');
  }

  const parsed = DeviceAuthorizationStartResponseSchema.safeParse(parseJson(response.body));
  if (!parsed.success) {
    throw new Error('AGI Cloud returned an invalid device authorization.');
  }
  const contract = parsed.data;

  const verificationUrl = new URL(contract.verification_uri_complete);
  if (verificationUrl.origin !== trustedOrigin) {
    throw new Error('AGI Cloud returned an untrusted verification URL.');
  }

  return {
    deviceCode: contract.device_code,
    userCode: contract.user_code,
    verificationUrl: verificationUrl.toString(),
    pollIntervalMs: Math.min(
      MAX_POLL_INTERVAL_MS,
      Math.max(MIN_POLL_INTERVAL_MS, contract.interval * 1000),
    ),
    expiresInMs: Math.min(MAX_AUTH_WINDOW_MS, contract.expires_in * 1000),
  };
}

export async function pollDeviceAuthorization(
  origin: string,
  deviceCode: string,
  post: DeviceAuthorizationPost,
): Promise<DeviceAuthorizationPollResult> {
  let response: { status: number; body: string };
  try {
    response = await post(`${new URL(origin).origin}${DEVICE_AUTHORIZATION_TOKEN_PATH}`, {
      device_code: deviceCode,
    });
  } catch {
    return { kind: 'pending' };
  }

  const body = parseJson(response.body);
  const refusal = deviceError(body);
  switch (refusal?.error) {
    case 'authorization_pending':
      return { kind: 'pending' };
    case 'slow_down':
      return {
        kind: 'slow_down',
        intervalMs: refusal.interval === undefined ? null : refusal.interval * 1000,
      };
    case 'terms_acceptance_required':
      return {
        kind: 'rejected',
        message: `Accept the updated Terms of Service at ${refusal.acceptance_url}, then sign in again.`,
      };
    case 'account_unavailable':
      return { kind: 'rejected', message: refusal.error_description };
    case 'access_denied':
      return { kind: 'denied' };
    case 'expired_token':
    case 'invalid_grant':
      return { kind: 'expired' };
    case undefined:
      break;
  }
  if (response.status < 200 || response.status >= 300) {
    if (response.status >= 500) {
      return {
        kind: 'rejected',
        message:
          `AGI Cloud's sign-in service failed (HTTP ${response.status}). ` +
          'This is a service fault, not a rejection of your account. Try again shortly.',
      };
    }
    return {
      kind: 'rejected',
      message: `AGI Cloud could not complete the device sign-in request (HTTP ${response.status}). Start again.`,
    };
  }

  const parsed = DeviceTokenResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error('AGI Cloud returned an invalid device credential.');
  }
  const tokenResponse = parsed.data;
  if (tokenResponse.token_type.toLowerCase() !== 'bearer') {
    return { kind: 'rejected', message: 'AGI Cloud returned an unsupported token type.' };
  }

  return {
    kind: 'approved',
    token: tokenResponse.access_token,
    ...(tokenResponse.refresh_token ? { refreshToken: tokenResponse.refresh_token } : {}),
    expiresAt: Date.now() + tokenResponse.expires_in * 1000,
  };
}

/**
 * RFC 8628 3.5: every slow_down adds five seconds to the polling interval for
 * the rest of the grant, or takes the server's interval when that is longer.
 */
export function slowedDevicePollIntervalMs(
  currentMs: number,
  result: Extract<DeviceAuthorizationPollResult, { kind: 'slow_down' }>,
): number {
  return Math.min(
    MAX_SLOWED_POLL_INTERVAL_MS,
    Math.max(currentMs + SLOW_DOWN_STEP_MS, result.intervalMs ?? 0),
  );
}

/**
 * Rotates a device session against the same endpoint every other surface uses.
 * A transport failure is 'unavailable', not 'revoked': losing the credential
 * because the network blinked would send the editor back through device code.
 */
export async function refreshDeviceSession(
  origin: string,
  refreshToken: string,
  post: DeviceAuthorizationPost,
): Promise<DeviceSessionRefreshResult> {
  let response: { status: number; body: string };
  try {
    const request: DeviceRefreshRequest = { refresh_token: refreshToken };
    response = await post(`${new URL(origin).origin}${DEVICE_AUTHORIZATION_REFRESH_PATH}`, request);
  } catch {
    return { kind: 'unavailable' };
  }

  const body = parseJson(response.body);
  const refusal = deviceError(body);
  if (refusal?.error === 'terms_acceptance_required') {
    return { kind: 'terms-required', acceptanceUrl: refusal.acceptance_url };
  }
  if (refusal?.error === 'invalid_grant') return { kind: 'revoked' };
  if (refusal?.error === 'account_unavailable') {
    return {
      kind: 'account-unavailable',
      message:
        refusal.error_description.trim() !== ''
          ? refusal.error_description
          : 'This AGI Cloud account cannot be used right now. Sign in on the web to see why.',
    };
  }
  if (response.status < 200 || response.status >= 300) return { kind: 'unavailable' };

  const parsed = DeviceTokenResponseSchema.safeParse(body);
  if (
    !parsed.success ||
    parsed.data.token_type.toLowerCase() !== 'bearer' ||
    parsed.data.refresh_token === undefined
  ) {
    return { kind: 'unavailable' };
  }
  return {
    kind: 'renewed',
    token: parsed.data.access_token,
    expiresAt: Date.now() + parsed.data.expires_in * 1000,
    refreshToken: parsed.data.refresh_token,
  };
}
