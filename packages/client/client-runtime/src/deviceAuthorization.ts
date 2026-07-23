import type { DeviceAuthorizationStartResponse, TokenResponse } from '@agiworkforce/types';

const MIN_POLL_INTERVAL_MS = 3_000;
const MAX_POLL_INTERVAL_MS = 10_000;
const MAX_AUTH_WINDOW_MS = 15 * 60 * 1000;

export type DeviceAuthorizationPost = (
  url: string,
  payload: unknown,
  headers?: Readonly<Record<string, string>>,
) => Promise<{ status: number; body: string }>;

export interface DeviceAuthorizationRequest {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  pollIntervalMs: number;
  expiresInMs: number;
}

export type DeviceAuthorizationPollResult =
  | { kind: 'approved'; token: string; expiresAt: number }
  | { kind: 'pending' }
  | { kind: 'denied' }
  | { kind: 'expired' }
  | { kind: 'rejected'; message: string };

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
): Promise<DeviceAuthorizationRequest> {
  const trustedOrigin = new URL(origin).origin;
  const response = await post(`${trustedOrigin}/api/auth/device/code`, {});
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
  if (response.status === 400 && error === 'access_denied') {
    return { kind: 'denied' };
  }
  if (response.status === 400 && (error === 'expired_token' || error === 'invalid_grant')) {
    return { kind: 'expired' };
  }
  if (response.status < 200 || response.status >= 300) {
    return {
      kind: 'rejected',
      message: 'AGI Cloud rejected the device sign-in request. Start again.',
    };
  }

  const tokenResponse: TokenResponse = {
    access_token: requiredString(body, 'access_token'),
    token_type: requiredString(body, 'token_type'),
    expires_in: requiredPositiveNumber(body, 'expires_in'),
  };
  if (tokenResponse.token_type.toLowerCase() !== 'bearer') {
    return { kind: 'rejected', message: 'AGI Cloud returned an unsupported token type.' };
  }

  return {
    kind: 'approved',
    token: tokenResponse.access_token,
    expiresAt: Date.now() + tokenResponse.expires_in * 1000,
  };
}
