import type { DeviceAuthorizationStartResponse, TokenResponse } from '@agiworkforce/types';

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

function parseRecord(body: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(body) as unknown;
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`AGI Cloud returned an invalid ${key}.`);
  }
  return value;
}

function requiredPositiveNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`AGI Cloud returned an invalid ${key}.`);
  }
  return value;
}

export async function requestDeviceAuthorization(
  origin: string,
  post: DeviceAuthorizationPost,
  surface: DeviceAuthorizationSurface = 'cli',
): Promise<DeviceAuthorizationRequest> {
  const trustedOrigin = new URL(origin).origin;
  const response = await post(`${trustedOrigin}/api/auth/device/code`, { surface });
  if (response.status < 200 || response.status >= 300) {
    throw new Error('Could not start AGI Cloud sign-in. Try again.');
  }

  const raw = parseRecord(response.body);
  const contract: DeviceAuthorizationStartResponse = {
    device_code: requiredString(raw, 'device_code'),
    user_code: requiredString(raw, 'user_code'),
    verification_uri: requiredString(raw, 'verification_uri'),
    verification_uri_complete: requiredString(raw, 'verification_uri_complete'),
    interval: requiredPositiveNumber(raw, 'interval'),
    expires_in: requiredPositiveNumber(raw, 'expires_in'),
  };

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
    response = await post(`${new URL(origin).origin}/api/auth/device/token`, {
      device_code: deviceCode,
    });
  } catch {
    return { kind: 'pending' };
  }

  const body = parseRecord(response.body);
  const error = typeof body['error'] === 'string' ? body['error'] : undefined;
  if (response.status === 403 && error === 'authorization_pending') {
    return { kind: 'pending' };
  }
  if (error === 'slow_down') {
    const interval = body['interval'];
    return {
      kind: 'slow_down',
      intervalMs:
        typeof interval === 'number' && Number.isFinite(interval) && interval > 0
          ? interval * 1000
          : null,
    };
  }
  if (response.status === 403 && error === 'terms_acceptance_required') {
    const acceptanceUrl =
      typeof body['acceptance_url'] === 'string' ? body['acceptance_url'] : undefined;
    return {
      kind: 'rejected',
      message: acceptanceUrl
        ? `Accept the updated Terms of Service at ${acceptanceUrl}, then sign in again.`
        : 'Accept the updated Terms of Service on agiworkforce.com, then sign in again.',
    };
  }
  if (response.status === 403 && error === 'account_unavailable') {
    return {
      kind: 'rejected',
      message:
        typeof body['error_description'] === 'string'
          ? body['error_description']
          : 'This AGI Workforce account cannot sign in right now.',
    };
  }
  if (response.status === 400 && error === 'access_denied') {
    return { kind: 'denied' };
  }
  if (response.status === 400 && (error === 'expired_token' || error === 'invalid_grant')) {
    return { kind: 'expired' };
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

  const tokenResponse: TokenResponse = {
    access_token: requiredString(body, 'access_token'),
    ...(typeof body['refresh_token'] === 'string'
      ? { refresh_token: requiredString(body, 'refresh_token') }
      : {}),
    token_type: requiredString(body, 'token_type'),
    expires_in: requiredPositiveNumber(body, 'expires_in'),
  };
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
    response = await post(`${new URL(origin).origin}/api/auth/device/refresh`, {
      refresh_token: refreshToken,
    });
  } catch {
    return { kind: 'unavailable' };
  }

  const body = parseRecord(response.body);
  const error = typeof body['error'] === 'string' ? body['error'] : undefined;
  if (error === 'terms_acceptance_required') {
    const url = body['acceptance_url'];
    return { kind: 'terms-required', acceptanceUrl: typeof url === 'string' ? url : null };
  }
  if (error === 'invalid_grant') return { kind: 'revoked' };
  if (error === 'account_unavailable') {
    const description = body['error_description'];
    return {
      kind: 'account-unavailable',
      message:
        typeof description === 'string' && description.trim() !== ''
          ? description
          : 'This AGI Cloud account cannot be used right now. Sign in on the web to see why.',
    };
  }
  if (response.status < 200 || response.status >= 300) return { kind: 'unavailable' };

  try {
    const tokenType = requiredString(body, 'token_type');
    if (tokenType.toLowerCase() !== 'bearer') return { kind: 'unavailable' };
    return {
      kind: 'renewed',
      token: requiredString(body, 'access_token'),
      expiresAt: Date.now() + requiredPositiveNumber(body, 'expires_in') * 1000,
      refreshToken: requiredString(body, 'refresh_token'),
    };
  } catch {
    return { kind: 'unavailable' };
  }
}
