import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import {
  pollDeviceAuthorization,
  requestDeviceAuthorization,
  revokeDeviceAuthorization,
  signInToAgiCloud,
  signOutOfAgiCloud,
  tryOpenDeviceAuthorizationUrl,
  type DeviceAuthPost,
} from '../features/account-auth/deviceAuth';
import { getAccountToken } from '../utils/api';

const ACCOUNT_TOKEN_KEY = 'agiWorkforce.accountToken';
const ACCOUNT_TOKEN_EXPIRES_AT_KEY = 'agiWorkforce.accountTokenExpiresAt';
const ACCOUNT_TOKEN_EXPIRED_KEY = 'agiWorkforce.accountTokenExpired';

/// A SecretStorage double that records every write, so a test can assert both
/// that the credential went here and that nothing else ever saw it.
function createSecretStorage(): vscode.SecretStorage & {
  entries: Map<string, string>;
  stored: Array<[string, string]>;
  deleted: string[];
} {
  const entries = new Map<string, string>();
  const stored: Array<[string, string]> = [];
  const deleted: string[] = [];
  return {
    entries,
    stored,
    deleted,
    get: (key: string) => Promise.resolve(entries.get(key)),
    store: (key: string, value: string) => {
      entries.set(key, value);
      stored.push([key, value]);
      return Promise.resolve();
    },
    delete: (key: string) => {
      entries.delete(key);
      deleted.push(key);
      return Promise.resolve();
    },
    onDidChange: (() => ({
      dispose: () => undefined,
    })) as unknown as vscode.SecretStorage['onDidChange'],
  };
}

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

    expect(post).toHaveBeenCalledWith('https://agiworkforce.com/api/auth/device/code', {
      surface: 'vscode',
    });
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

  it('does not block device polling when VS Code cannot confirm the browser launch', async () => {
    const neverResolves = vi.fn(() => new Promise<boolean>(() => undefined));

    await expect(
      tryOpenDeviceAuthorizationUrl(
        'https://agiworkforce.com/auth/device?user_code=ABCD-2345',
        neverResolves,
        1,
      ),
    ).resolves.toBe('unconfirmed');
  });

  it('distinguishes a rejected browser launch from an accepted launch', async () => {
    await expect(
      tryOpenDeviceAuthorizationUrl(
        'https://agiworkforce.com/auth/device?user_code=ABCD-2345',
        vi.fn().mockResolvedValue(false),
        25,
      ),
    ).resolves.toBe('rejected');
    await expect(
      tryOpenDeviceAuthorizationUrl(
        'https://agiworkforce.com/auth/device?user_code=ABCD-2345',
        vi.fn().mockResolvedValue(true),
        25,
      ),
    ).resolves.toBe('opened');
  });
});

describe('VS Code AGI Cloud credential storage', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const startBody = JSON.stringify({
    device_code: '8cc8544f-7d36-4ec3-aae2-ce49740fa59c',
    user_code: 'ABCD-2345',
    verification_uri: 'https://agiworkforce.com/auth/device',
    verification_uri_complete: 'https://agiworkforce.com/auth/device?user_code=ABCD-2345',
    interval: 5,
    expires_in: 900,
  });

  it('puts an approved token in SecretStorage and nowhere else', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_750_000_000_000);
    const secrets = createSecretStorage();
    const post = vi.fn<DeviceAuthPost>(async (url) =>
      url.endsWith('/api/auth/device/code')
        ? { status: 200, body: startBody }
        : {
            status: 200,
            body: JSON.stringify({
              access_token: 'signed-developer-token',
              token_type: 'Bearer',
              expires_in: 604800,
            }),
          },
    );

    const signedIn = signInToAgiCloud(secrets, post, vi.fn().mockResolvedValue(true));
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(signedIn).resolves.toBe(true);
    expect(secrets.stored).toEqual([
      [ACCOUNT_TOKEN_KEY, 'signed-developer-token'],
      // Approval lands one poll interval after the clock was pinned.
      [ACCOUNT_TOKEN_EXPIRES_AT_KEY, String(1_750_000_000_000 + 5_000 + 604_800_000)],
    ]);
    // The token is readable only back through SecretStorage.
    await expect(getAccountToken(secrets)).resolves.toBe('signed-developer-token');
    expect(secrets.entries.get(ACCOUNT_TOKEN_KEY)).toBe('signed-developer-token');
  });

  it('keeps a denied sign-in out of storage entirely', async () => {
    vi.useFakeTimers();
    const secrets = createSecretStorage();
    const post = vi.fn<DeviceAuthPost>(async (url) =>
      url.endsWith('/api/auth/device/code')
        ? { status: 200, body: startBody }
        : { status: 400, body: JSON.stringify({ error: 'access_denied' }) },
    );

    const signedIn = signInToAgiCloud(secrets, post, vi.fn().mockResolvedValue(true));
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(signedIn).resolves.toBe(false);
    expect(secrets.stored).toEqual([]);
    expect(secrets.entries.size).toBe(0);
  });

  it('clears every stored credential key on sign-out', async () => {
    const secrets = createSecretStorage();
    await secrets.store(ACCOUNT_TOKEN_KEY, 'signed-developer-token');
    await secrets.store(ACCOUNT_TOKEN_EXPIRES_AT_KEY, String(Date.now() + 60_000));
    const post = vi.fn<DeviceAuthPost>().mockResolvedValue({ status: 200, body: '{}' });

    await expect(signOutOfAgiCloud(secrets, post)).resolves.toBe(true);

    expect(secrets.deleted).toEqual(
      expect.arrayContaining([
        ACCOUNT_TOKEN_KEY,
        ACCOUNT_TOKEN_EXPIRES_AT_KEY,
        ACCOUNT_TOKEN_EXPIRED_KEY,
      ]),
    );
    expect(secrets.entries.size).toBe(0);
    await expect(getAccountToken(secrets)).resolves.toBeUndefined();
  });

  it('revokes remotely before clearing, and still clears when revocation fails', async () => {
    const secrets = createSecretStorage();
    await secrets.store(ACCOUNT_TOKEN_KEY, 'signed-developer-token');
    const post = vi.fn<DeviceAuthPost>().mockRejectedValue(new Error('offline'));

    await expect(signOutOfAgiCloud(secrets, post)).resolves.toBe(false);

    expect(post).toHaveBeenCalledWith(
      'https://api.agiworkforce.com/api/auth/logout',
      {},
      expect.objectContaining({ Authorization: 'Bearer signed-developer-token' }),
    );
    expect(secrets.entries.size).toBe(0);
  });
});
