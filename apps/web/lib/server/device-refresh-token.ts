import 'server-only';

import crypto from 'node:crypto';

export const DEVICE_REFRESH_TOKEN_EXPIRES_SECONDS = 30 * 24 * 60 * 60;

export interface DeviceRefreshCredential {
  token: string;
  tokenHash: string;
  expiresAt: string;
}

export function hashDeviceRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export function createDeviceRefreshCredential(now = Date.now()): DeviceRefreshCredential {
  const token = crypto.randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashDeviceRefreshToken(token),
    expiresAt: new Date(now + DEVICE_REFRESH_TOKEN_EXPIRES_SECONDS * 1000).toISOString(),
  };
}
