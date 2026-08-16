import { describe, expect, it, vi } from 'vitest';

import { pollDeviceAuthorization, requestDeviceAuthorization } from '../deviceAuthorization';

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
