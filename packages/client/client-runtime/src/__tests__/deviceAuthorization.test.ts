import { describe, expect, it, vi } from 'vitest';

import {
  pollDeviceAuthorization,
  requestDeviceAuthorization,
  slowedDevicePollIntervalMs,
} from '../deviceAuthorization';

describe('shared device authorization client', () => {
  it('starts authorization against the trusted origin and validates the browser URL', async () => {
    const post = vi.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        device_code: '8cc8544f-7d36-4ec3-aae2-ce49740fa59c',
        user_code: 'ABCD-2345',
        verification_uri: 'https://agiworkforce.com/auth/device',
        verification_uri_complete: 'https://agiworkforce.com/auth/device?user_code=ABCD-2345',
        interval: 5,
        expires_in: 900,
      }),
    });

    const result = await requestDeviceAuthorization('https://agiworkforce.com/path', post);

    expect(post).toHaveBeenCalledWith('https://agiworkforce.com/api/auth/device/code', {
      surface: 'cli',
    });
    expect(result).toEqual({
      deviceCode: '8cc8544f-7d36-4ec3-aae2-ce49740fa59c',
      userCode: 'ABCD-2345',
      verificationUrl: 'https://agiworkforce.com/auth/device?user_code=ABCD-2345',
      pollIntervalMs: 5_000,
      expiresInMs: 900_000,
    });
  });

  it('rejects a browser verification URL on another origin', async () => {
    const post = vi.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        device_code: '8cc8544f-7d36-4ec3-aae2-ce49740fa59c',
        user_code: 'ABCD-2345',
        verification_uri: 'https://agiworkforce.com/auth/device',
        verification_uri_complete: 'https://attacker.example/collect?user_code=ABCD-2345',
        interval: 5,
        expires_in: 900,
      }),
    });

    await expect(requestDeviceAuthorization('https://agiworkforce.com', post)).rejects.toThrow(
      /untrusted verification URL/i,
    );
  });

  it.each([
    [403, 'authorization_pending', { kind: 'pending' }],
    [400, 'access_denied', { kind: 'denied' }],
    [400, 'expired_token', { kind: 'expired' }],
    [400, 'invalid_grant', { kind: 'expired' }],
  ] as const)('maps HTTP %s %s to a typed result', async (status, error, expected) => {
    const post = vi.fn().mockResolvedValue({
      status,
      body: JSON.stringify({ error }),
    });

    await expect(
      pollDeviceAuthorization(
        'https://agiworkforce.com',
        '8cc8544f-7d36-4ec3-aae2-ce49740fa59c',
        post,
      ),
    ).resolves.toEqual(expected);
  });

  it.each([500, 502, 503, 504])(
    'reports HTTP %s as a service fault, never as an account rejection',
    async (status) => {
      const post = vi.fn().mockResolvedValue({ status, body: '{"error":"Internal Server Error"}' });

      const result = await pollDeviceAuthorization(
        'https://agiworkforce.com',
        '8cc8544f-7d36-4ec3-aae2-ce49740fa59c',
        post,
      );

      expect(result.kind).toBe('rejected');
      const message = result.kind === 'rejected' ? result.message : '';
      expect(message).toContain(`HTTP ${status}`);
      expect(message).toMatch(/service fault, not a rejection of your account/i);
      expect(message).not.toMatch(/rejected the device sign-in request/i);
    },
  );

  it.each([
    [429, '{"error":"slow_down"}', null],
    [400, '{"error":"slow_down","interval":9}', 9_000],
  ] as const)(
    'reports HTTP %s slow_down as its own result with the server interval',
    async (status, body, intervalMs) => {
      const post = vi.fn().mockResolvedValue({ status, body });

      const result = await pollDeviceAuthorization(
        'https://agiworkforce.com',
        '8cc8544f-7d36-4ec3-aae2-ce49740fa59c',
        post,
      );

      expect(result).toEqual({ kind: 'slow_down', intervalMs });
    },
  );

  it('adds five seconds per slow_down, or takes a longer server interval', () => {
    expect(slowedDevicePollIntervalMs(3_000, { kind: 'slow_down', intervalMs: null })).toBe(8_000);
    expect(slowedDevicePollIntervalMs(3_000, { kind: 'slow_down', intervalMs: 20_000 })).toBe(
      20_000,
    );
    expect(slowedDevicePollIntervalMs(58_000, { kind: 'slow_down', intervalMs: null })).toBe(
      60_000,
    );
  });

  it('names the terms step and its link when the account must accept first', async () => {
    const post = vi.fn().mockResolvedValue({
      status: 403,
      body: JSON.stringify({
        error: 'terms_acceptance_required',
        acceptance_url: 'https://agiworkforce.com/login/complete?redirectTo=%2F',
      }),
    });

    const result = await pollDeviceAuthorization(
      'https://agiworkforce.com',
      '8cc8544f-7d36-4ec3-aae2-ce49740fa59c',
      post,
    );

    expect(result.kind).toBe('rejected');
    expect(result.kind === 'rejected' ? result.message : '').toContain(
      'https://agiworkforce.com/login/complete?redirectTo=%2F',
    );
  });

  it('names the status for a non-2xx below 500 instead of claiming a rejection', async () => {
    const post = vi.fn().mockResolvedValue({ status: 404, body: '{}' });

    const result = await pollDeviceAuthorization(
      'https://agiworkforce.com',
      '8cc8544f-7d36-4ec3-aae2-ce49740fa59c',
      post,
    );

    expect(result.kind).toBe('rejected');
    const message = result.kind === 'rejected' ? result.message : '';
    expect(message).toContain('HTTP 404');
    expect(message).not.toMatch(/rejected the device sign-in request/i);
  });

  it('returns a validated bearer credential with its absolute expiry', async () => {
    const post = vi.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        access_token: 'device-token',
        refresh_token: 'refresh-token-with-at-least-forty-random-looking-characters',
        token_type: 'Bearer',
        expires_in: 600,
      }),
    });
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);

    await expect(
      pollDeviceAuthorization(
        'https://agiworkforce.com',
        '8cc8544f-7d36-4ec3-aae2-ce49740fa59c',
        post,
      ),
    ).resolves.toEqual({
      kind: 'approved',
      token: 'device-token',
      refreshToken: 'refresh-token-with-at-least-forty-random-looking-characters',
      expiresAt: 1_600_000,
    });

    now.mockRestore();
  });
});
