import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  createDeviceRefreshCredential,
  DEVICE_REFRESH_TOKEN_EXPIRES_SECONDS,
  hashDeviceRefreshToken,
} from './device-refresh-token';

describe('device refresh credential', () => {
  it('creates a 256-bit opaque token while exposing only its hash for storage', () => {
    const now = Date.parse('2026-07-31T00:00:00.000Z');
    const credential = createDeviceRefreshCredential(now);

    expect(credential.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(credential.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(credential.tokenHash).toBe(hashDeviceRefreshToken(credential.token));
    expect(credential.tokenHash).not.toContain(credential.token);
    expect(credential.expiresAt).toBe(
      new Date(now + DEVICE_REFRESH_TOKEN_EXPIRES_SECONDS * 1000).toISOString(),
    );
  });

  it('generates independent credentials', () => {
    expect(createDeviceRefreshCredential().token).not.toBe(createDeviceRefreshCredential().token);
  });
});
