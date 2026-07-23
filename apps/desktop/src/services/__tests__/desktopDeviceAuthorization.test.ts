import { describe, expect, it, vi } from 'vitest';

import { authorizeDesktopDevice } from '../desktopDeviceAuthorization';

describe('authorizeDesktopDevice', () => {
  it('opens the browser approval URL, polls, and returns the approved credential', async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        body: JSON.stringify({
          device_code: '8cc8544f-7d36-4ec3-aae2-ce49740fa59c',
          user_code: 'ABCD-2345',
          verification_uri: 'https://agiworkforce.com/auth/device',
          verification_uri_complete: 'https://agiworkforce.com/auth/device?user_code=ABCD-2345',
          interval: 3,
          expires_in: 900,
        }),
      })
      .mockResolvedValueOnce({
        status: 403,
        body: JSON.stringify({ error: 'authorization_pending' }),
      })
      .mockResolvedValueOnce({
        status: 200,
        body: JSON.stringify({
          access_token: 'approved-token',
          token_type: 'Bearer',
          expires_in: 600,
        }),
      });
    const openExternal = vi.fn().mockResolvedValue(undefined);
    const wait = vi.fn().mockResolvedValue(undefined);

    const result = await authorizeDesktopDevice({
      origin: 'https://agiworkforce.com',
      post,
      openExternal,
      wait,
    });

    expect(openExternal).toHaveBeenCalledWith(
      'https://agiworkforce.com/auth/device?user_code=ABCD-2345',
    );
    expect(wait).toHaveBeenCalledTimes(2);
    expect(result.accessToken).toBe('approved-token');
  });

  it.each([
    [400, 'access_denied', /denied/i],
    [400, 'expired_token', /expired/i],
  ] as const)('surfaces terminal device authorization outcomes', async (status, error, message) => {
    const post = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        body: JSON.stringify({
          device_code: '8cc8544f-7d36-4ec3-aae2-ce49740fa59c',
          user_code: 'ABCD-2345',
          verification_uri: 'https://agiworkforce.com/auth/device',
          verification_uri_complete: 'https://agiworkforce.com/auth/device?user_code=ABCD-2345',
          interval: 3,
          expires_in: 900,
        }),
      })
      .mockResolvedValueOnce({ status, body: JSON.stringify({ error }) });

    await expect(
      authorizeDesktopDevice({
        origin: 'https://agiworkforce.com',
        post,
        openExternal: vi.fn().mockResolvedValue(undefined),
        wait: vi.fn().mockResolvedValue(undefined),
      }),
    ).rejects.toThrow(message);
  });

  it('stops cleanly when the caller aborts', async () => {
    const controller = new AbortController();
    const post = vi.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        device_code: '8cc8544f-7d36-4ec3-aae2-ce49740fa59c',
        user_code: 'ABCD-2345',
        verification_uri: 'https://agiworkforce.com/auth/device',
        verification_uri_complete: 'https://agiworkforce.com/auth/device?user_code=ABCD-2345',
        interval: 3,
        expires_in: 900,
      }),
    });

    await expect(
      authorizeDesktopDevice({
        origin: 'https://agiworkforce.com',
        post,
        openExternal: async () => {
          controller.abort();
        },
        wait: vi.fn().mockResolvedValue(undefined),
        signal: controller.signal,
      }),
    ).rejects.toThrow(/cancelled/i);
  });
});
