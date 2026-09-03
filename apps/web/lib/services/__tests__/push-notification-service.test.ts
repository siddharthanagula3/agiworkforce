import { createECDH, randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), fetch: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: mocks.query, execute: mocks.execute }),
}));

const VAPID_PUBLIC_KEY_ENV = 'WEB_PUSH_VAPID_PUBLIC_KEY';
const VAPID_PRIVATE_KEY_ENV = 'WEB_PUSH_VAPID_PRIVATE_KEY';
const VAPID_SUBJECT_ENV = 'WEB_PUSH_VAPID_SUBJECT';

const { getPushTokensForUser, sendPushToUser } = await import('../push-notification-service');
const { resetWebPushCredentialCache } = await import('../web-push-service');

const TOKEN_A = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const TOKEN_B = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]';

function expoReturns(tickets: Array<Record<string, unknown>>) {
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: tickets }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockResolvedValue([{ push_token: TOKEN_A }]);
  mocks.execute.mockResolvedValue(undefined);
  vi.stubGlobal('fetch', mocks.fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getPushTokensForUser', () => {
  it('is scoped to the requesting user', async () => {
    await getPushTokensForUser('user-1');

    const [sql, params] = mocks.query.mock.calls[0]!;
    expect(String(sql)).toContain('user_id = $1');
    expect(params).toEqual(['user-1']);
  });

  it('drops values that are not push tokens', async () => {
    mocks.query.mockResolvedValue([
      { push_token: TOKEN_A },
      { push_token: 'https://evil.test/webhook' },
      { push_token: 'not-a-token' },
    ]);

    await expect(getPushTokensForUser('user-1')).resolves.toEqual([TOKEN_A]);
  });
});

describe('sendPushToUser, delivery', () => {
  it('sends one message per registered device', async () => {
    mocks.query.mockResolvedValue([{ push_token: TOKEN_A }, { push_token: TOKEN_B }]);
    expoReturns([{ status: 'ok' }, { status: 'ok' }]);

    const result = await sendPushToUser('user-1', { title: 'Done', body: 'Task finished' });

    expect(result.sent).toBe(2);
    const body = JSON.parse(String(mocks.fetch.mock.calls[0]![1].body)) as Array<{ to: string }>;
    expect(body.map((entry) => entry.to)).toEqual([TOKEN_A, TOKEN_B]);
  });

  it('sends nothing when the account has no devices', async () => {
    mocks.query.mockResolvedValue([]);

    const result = await sendPushToUser('user-1', { title: 'Done', body: 'x' });

    expect(result).toEqual({ sent: 0, invalidated: 0 });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

describe('sendPushToUser, dead tokens', () => {
  it('clears a token Expo reports as unregistered', async () => {
    mocks.query.mockResolvedValue([{ push_token: TOKEN_A }, { push_token: TOKEN_B }]);
    expoReturns([{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }]);

    const result = await sendPushToUser('user-1', { title: 'Done', body: 'x' });

    expect(result.sent).toBe(1);
    expect(result.invalidated).toBe(1);
    const [sql, params] = mocks.execute.mock.calls[0]!;
    expect(String(sql)).toContain('set push_token = null');
    expect(params).toEqual([[TOKEN_B]]);
  });

  it('keeps the device row so the user still sees the device', async () => {
    expoReturns([{ status: 'error', details: { error: 'DeviceNotRegistered' } }]);

    await sendPushToUser('user-1', { title: 'Done', body: 'x' });

    expect(String(mocks.execute.mock.calls[0]![0])).not.toMatch(/delete\s+from/i);
  });

  it('does not clear tokens for other kinds of error', async () => {
    expoReturns([{ status: 'error', details: { error: 'MessageRateExceeded' } }]);

    const result = await sendPushToUser('user-1', { title: 'Done', body: 'x' });

    expect(result.invalidated).toBe(0);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});

describe('sendPushToUser, never throws', () => {
  it('survives a provider outage', async () => {
    mocks.fetch.mockRejectedValue(new Error('network down'));

    await expect(sendPushToUser('user-1', { title: 'x', body: 'y' })).resolves.toEqual({
      sent: 0,
      invalidated: 0,
    });
  });

  it('survives a non-200 from Expo', async () => {
    mocks.fetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

    await expect(sendPushToUser('user-1', { title: 'x', body: 'y' })).resolves.toMatchObject({
      sent: 0,
    });
  });

  it('reports a token-lookup failure instead of throwing', async () => {
    mocks.query.mockRejectedValue(new Error('db down'));

    const result = await sendPushToUser('user-1', { title: 'x', body: 'y' });

    expect(result.error).toBe('token_lookup_failed');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('survives a failed cleanup', async () => {
    expoReturns([{ status: 'error', details: { error: 'DeviceNotRegistered' } }]);
    mocks.execute.mockRejectedValue(new Error('db down'));

    await expect(sendPushToUser('user-1', { title: 'x', body: 'y' })).resolves.toBeDefined();
  });
});

describe('sendPushToUser, every transport the account registered', () => {
  const EXPO_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
  const WEB_ENDPOINT = 'https://push.example.test/push/abc';

  function p256Key(): string {
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    return ecdh.getPublicKey().toString('base64url');
  }

  function vapidPair() {
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    return {
      publicKey: ecdh.getPublicKey().toString('base64url'),
      privateKey: ecdh.getPrivateKey().toString('base64url'),
    };
  }

  beforeEach(() => {
    const vapid = vapidPair();
    vi.stubEnv(VAPID_PUBLIC_KEY_ENV, vapid.publicKey);
    vi.stubEnv(VAPID_PRIVATE_KEY_ENV, vapid.privateKey);
    vi.stubEnv(VAPID_SUBJECT_ENV, 'mailto:alerts@agiworkforce.test');
    resetWebPushCredentialCache();

    mocks.query.mockImplementation(async (sql: string) =>
      String(sql).includes('web_push_subscriptions')
        ? [
            {
              endpoint: WEB_ENDPOINT,
              p256dh: p256Key(),
              auth: randomBytes(16).toString('base64url'),
            },
          ]
        : [{ push_token: TOKEN_A }],
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetWebPushCredentialCache();
  });

  it('reaches the phone and the browser from one notice', async () => {
    mocks.fetch.mockImplementation(async (url: string) =>
      url === EXPO_ENDPOINT
        ? { ok: true, json: async () => ({ data: [{ status: 'ok' }] }) }
        : { ok: true, status: 201 },
    );

    const result = await sendPushToUser('user-1', { title: 'Agent run finished', body: 'x' });

    expect(result.sent).toBe(2);
    expect(mocks.fetch.mock.calls.map((call) => call[0]).sort()).toEqual(
      [EXPO_ENDPOINT, WEB_ENDPOINT].sort(),
    );
  });

  it('still notifies the browser when the mobile provider is down', async () => {
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url === EXPO_ENDPOINT) throw new Error('expo down');
      return { ok: true, status: 201 };
    });

    await expect(
      sendPushToUser('user-1', { title: 'Agent run finished', body: 'x' }),
    ).resolves.toMatchObject({ sent: 1 });
  });

  it('still notifies the phone when the push service is down', async () => {
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url !== EXPO_ENDPOINT) throw new Error('push service down');
      return { ok: true, json: async () => ({ data: [{ status: 'ok' }] }) };
    });

    await expect(
      sendPushToUser('user-1', { title: 'Agent run finished', body: 'x' }),
    ).resolves.toMatchObject({ sent: 1 });
  });

  it('leaves out a transport the caller has no opt-in for', async () => {
    mocks.fetch.mockImplementation(async (url: string) =>
      url === EXPO_ENDPOINT
        ? { ok: true, json: async () => ({ data: [{ status: 'ok' }] }) }
        : { ok: true, status: 201 },
    );

    const result = await sendPushToUser(
      'user-1',
      { title: 'Scheduled task finished', body: 'x' },
      { expo: true, web: false },
    );

    expect(result.sent).toBe(1);
    expect(mocks.fetch.mock.calls.map((call) => call[0])).toEqual([EXPO_ENDPOINT]);
  });

  it('still reaches the browser when the mobile opt-in is off', async () => {
    mocks.fetch.mockImplementation(async () => ({ ok: true, status: 201 }));

    const result = await sendPushToUser(
      'user-1',
      { title: 'Agent run finished', body: 'x' },
      { expo: false },
    );

    expect(result.sent).toBe(1);
    expect(mocks.fetch.mock.calls.map((call) => call[0])).toEqual([WEB_ENDPOINT]);
  });
});
