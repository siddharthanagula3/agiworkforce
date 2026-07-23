import { describe, expect, it, vi } from 'vitest';
import {
  pollDeviceAuthorization,
  requestDeviceAuthorization,
  revokeDeviceAuthorization,
  type DeviceAuthPost,
} from '../features/account-auth/deviceAuth';

describe('VS Code AGI Cloud device authorization', () => {
  it('starts the shared RFC 8628 flow and accepts a same-origin prefilled approval URL', async () => {
    const post = vi.fn<DeviceAuthPost>().mockResolvedValue({
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

    const result = await requestDeviceAuthorization('https://agiworkforce.com', post);

    expect(post).toHaveBeenCalledWith('https://agiworkforce.com/api/auth/device/code', {});
    expect(result.userCode).toBe('ABCD-2345');
    expect(result.verificationUrl).toBe('https://agiworkforce.com/auth/device?user_code=ABCD-2345');
    expect(result.pollIntervalMs).toBe(5_000);
    expect(result.expiresInMs).toBe(900_000);
  });

  it('rejects an approval URL that leaves the trusted AGI web origin', async () => {
    const post = vi.fn<DeviceAuthPost>().mockResolvedValue({
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
      'untrusted verification URL',
    );
  });

  it('maps authorization_pending to a retryable poll result', async () => {
    const post = vi.fn<DeviceAuthPost>().mockResolvedValue({
      status: 403,
      body: JSON.stringify({ error: 'authorization_pending' }),
    });

    await expect(
      pollDeviceAuthorization(
        'https://agiworkforce.com',
        '8cc8544f-7d36-4ec3-aae2-ce49740fa59c',
        post,
      ),
    ).resolves.toEqual({ kind: 'pending' });
  });

  it('returns a durable token and absolute expiry after approval', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_750_000_000_000);
    const post = vi.fn<DeviceAuthPost>().mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        access_token: 'signed-developer-token',
        token_type: 'Bearer',
        expires_in: 604800,
      }),
    });

    await expect(
      pollDeviceAuthorization(
        'https://agiworkforce.com',
        '8cc8544f-7d36-4ec3-aae2-ce49740fa59c',
        post,
      ),
    ).resolves.toEqual({
      kind: 'approved',
      token: 'signed-developer-token',
      expiresAt: 1_750_604_800_000,
    });
  });

  it('treats expired and denied device codes as terminal outcomes', async () => {
    const expiredPost = vi.fn<DeviceAuthPost>().mockResolvedValue({
      status: 400,
      body: JSON.stringify({ error: 'expired_token' }),
    });
    const deniedPost = vi.fn<DeviceAuthPost>().mockResolvedValue({
      status: 400,
      body: JSON.stringify({ error: 'access_denied' }),
    });

    await expect(
      pollDeviceAuthorization(
        'https://agiworkforce.com',
        '8cc8544f-7d36-4ec3-aae2-ce49740fa59c',
        expiredPost,
      ),
    ).resolves.toEqual({ kind: 'expired' });
    await expect(
      pollDeviceAuthorization(
        'https://agiworkforce.com',
        '8cc8544f-7d36-4ec3-aae2-ce49740fa59c',
        deniedPost,
      ),
    ).resolves.toEqual({ kind: 'denied' });
  });

  it('revokes an approved editor credential through the shared gateway logout route', async () => {
    const post = vi.fn<DeviceAuthPost>().mockResolvedValue({
      status: 200,
      body: JSON.stringify({ ok: true, revoked: true }),
    });

    await expect(
      revokeDeviceAuthorization('https://api.agiworkforce.com', 'signed-developer-token', post),
    ).resolves.toBe(true);

    expect(post).toHaveBeenCalledWith(
      'https://api.agiworkforce.com/api/auth/logout',
      {},
      {
        Authorization: 'Bearer signed-developer-token',
        'X-Requested-With': 'XMLHttpRequest',
      },
    );
  });

  it('reports a remote revocation failure without throwing', async () => {
    const post = vi.fn<DeviceAuthPost>().mockRejectedValue(new Error('offline'));

    await expect(
      revokeDeviceAuthorization('https://api.agiworkforce.com', 'signed-developer-token', post),
    ).resolves.toBe(false);
  });
});
