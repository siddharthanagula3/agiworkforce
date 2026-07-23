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

    expect(post).toHaveBeenCalledWith('https://agiworkforce.com/api/auth/device/code', {});
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

  it('returns a validated bearer credential with its absolute expiry', async () => {
    const post = vi.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        access_token: 'device-token',
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
      expiresAt: 1_600_000,
    });

    now.mockRestore();
  });
});
