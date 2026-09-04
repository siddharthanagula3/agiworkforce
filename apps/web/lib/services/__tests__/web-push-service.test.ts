import { createDecipheriv, createECDH, createHmac, randomBytes, type ECDH } from 'node:crypto';
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
const AUTH_TAG_BYTES = 16;

const {
  getWebPushPublicKey,
  isDeliverableSubscription,
  isWebPushConfigured,
  resetWebPushCredentialCache,
  sendWebPushToUser,
} = await import('../web-push-service');

function keyPair() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    publicKey: ecdh.getPublicKey().toString('base64url'),
    privateKey: ecdh.getPrivateKey().toString('base64url'),
  };
}

const VAPID = keyPair();
const SUBJECT = 'mailto:alerts@agiworkforce.test';

function subscriptionRow(host: string) {
  return {
    endpoint: `https://${host}/push/abc`,
    p256dh: keyPair().publicKey,
    auth: randomBytes(16).toString('base64url'),
  };
}

const MESSAGE = { title: 'Agent run finished', body: 'Your agent finished its run.' };

function registeredBrowser(host: string) {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const authSecret = randomBytes(16);
  return {
    ecdh,
    authSecret,
    row: {
      endpoint: `https://${host}/push/abc`,
      p256dh: ecdh.getPublicKey().toString('base64url'),
      auth: authSecret.toString('base64url'),
    },
  };
}

/**
 * An RFC 8291 / RFC 8188 receiver written from the specification rather than
 * from `web-push-service`, so it holds its own copy of every label, offset and
 * length. A drift in either, a renamed info string, a moved header field.
 * fails here instead of shipping a record every browser silently discards.
 */
function receiveWebPush(body: Buffer, ecdh: ECDH, authSecret: Buffer): string {
  const salt = body.subarray(0, 16);
  const keyIdLength = body.readUInt8(20);
  const serverPublicKey = body.subarray(21, 21 + keyIdLength);
  const record = body.subarray(21 + keyIdLength);

  const hmac = (key: Buffer, value: Buffer) => createHmac('sha256', key).update(value).digest();
  const expand = (prk: Buffer, info: Buffer, length: number) =>
    hmac(prk, Buffer.concat([info, Buffer.from([1])])).subarray(0, length);
  const encodingInfo = (label: string) =>
    Buffer.concat([Buffer.from(`Content-Encoding: ${label}`, 'utf8'), Buffer.from([0])]);

  const inputKeyMaterial = expand(
    hmac(authSecret, ecdh.computeSecret(serverPublicKey)),
    Buffer.concat([
      Buffer.from('WebPush: info', 'utf8'),
      Buffer.from([0]),
      ecdh.getPublicKey(),
      serverPublicKey,
    ]),
    32,
  );
  const pseudoRandomKey = hmac(salt, inputKeyMaterial);

  const decipher = createDecipheriv(
    'aes-128-gcm',
    expand(pseudoRandomKey, encodingInfo('aes128gcm'), 16),
    expand(pseudoRandomKey, encodingInfo('nonce'), 12),
    { authTagLength: AUTH_TAG_BYTES },
  );
  decipher.setAuthTag(record.subarray(record.length - AUTH_TAG_BYTES));
  const padded = Buffer.concat([
    decipher.update(record.subarray(0, record.length - AUTH_TAG_BYTES)),
    decipher.final(),
  ]);

  expect(padded.at(-1)).toBe(2);
  return padded.subarray(0, padded.length - 1).toString('utf8');
}

beforeEach(() => {
  vi.clearAllMocks();
  resetWebPushCredentialCache();
  vi.stubEnv(VAPID_PUBLIC_KEY_ENV, VAPID.publicKey);
  vi.stubEnv(VAPID_PRIVATE_KEY_ENV, VAPID.privateKey);
  vi.stubEnv(VAPID_SUBJECT_ENV, SUBJECT);
  mocks.query.mockResolvedValue([subscriptionRow('push.example.test')]);
  mocks.execute.mockResolvedValue(undefined);
  mocks.fetch.mockResolvedValue({ ok: true, status: 201 });
  vi.stubGlobal('fetch', mocks.fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetWebPushCredentialCache();
});

describe('configuration', () => {
  it('is off, silently, when no VAPID key pair is set', async () => {
    vi.stubEnv(VAPID_PUBLIC_KEY_ENV, '');
    vi.stubEnv(VAPID_PRIVATE_KEY_ENV, '');
    resetWebPushCredentialCache();

    expect(isWebPushConfigured()).toBe(false);
    expect(getWebPushPublicKey()).toBeNull();
    await expect(sendWebPushToUser('user-1', MESSAGE)).resolves.toEqual({
      sent: 0,
      invalidated: 0,
    });
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('refuses a key pair that is not a P-256 pair rather than sending with it', () => {
    vi.stubEnv(VAPID_PRIVATE_KEY_ENV, 'dG9vLXNob3J0');
    resetWebPushCredentialCache();

    expect(isWebPushConfigured()).toBe(false);
  });

  it('publishes the public key the browser needs, and never the private one', () => {
    expect(getWebPushPublicKey()).toBe(VAPID.publicKey);
  });
});

describe('local validation', () => {
  it('rejects a subscription whose key material is the wrong size', () => {
    const valid = subscriptionRow('push.example.test');

    expect(isDeliverableSubscription(valid)).toBe(true);
    expect(isDeliverableSubscription({ ...valid, auth: 'c2hvcnQ' })).toBe(false);
    expect(isDeliverableSubscription({ ...valid, p256dh: 'c2hvcnQ' })).toBe(false);
  });

  it('rejects an endpoint that is not https', () => {
    const valid = subscriptionRow('push.example.test');

    expect(isDeliverableSubscription({ ...valid, endpoint: 'http://push.test/x' })).toBe(false);
    expect(isDeliverableSubscription({ ...valid, endpoint: 'not-a-url' })).toBe(false);
  });

  it('never sends to a malformed row it loaded from the database', async () => {
    mocks.query.mockResolvedValue([{ endpoint: 'https://push.test/x', p256dh: 'x', auth: 'y' }]);

    await expect(sendWebPushToUser('user-1', MESSAGE)).resolves.toEqual({
      sent: 0,
      invalidated: 0,
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

describe('delivery', () => {
  it('is scoped to the requesting user', async () => {
    await sendWebPushToUser('user-1', MESSAGE);

    const [sql, params] = mocks.query.mock.calls[0]!;
    expect(String(sql)).toContain('user_id = $1');
    expect(params).toEqual(['user-1']);
  });

  it('posts one encrypted record per subscription to its own endpoint', async () => {
    const rows = [subscriptionRow('push-a.test'), subscriptionRow('push-b.test')];
    mocks.query.mockResolvedValue(rows);

    const result = await sendWebPushToUser('user-1', MESSAGE);

    expect(result.sent).toBe(2);
    expect(mocks.fetch.mock.calls.map((call) => call[0])).toEqual(rows.map((r) => r.endpoint));
    for (const [, init] of mocks.fetch.mock.calls) {
      expect(init.headers['Content-Encoding']).toBe('aes128gcm');
      expect(init.headers.Authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
      expect(init.headers.TTL).toBeDefined();
    }
  });

  it('signs a token audienced to the push service origin, not the endpoint path', async () => {
    await sendWebPushToUser('user-1', MESSAGE);

    const authorization = mocks.fetch.mock.calls[0]![1].headers.Authorization as string;
    const jwt = authorization.slice('vapid t='.length, authorization.indexOf(', k='));
    const claims = JSON.parse(Buffer.from(jwt.split('.')[1]!, 'base64url').toString('utf8'));

    expect(claims.aud).toBe('https://push.example.test');
    expect(claims.sub).toBe(SUBJECT);
    expect(claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('sends a record a browser can actually decrypt', async () => {
    const browser = registeredBrowser('push.example.test');
    mocks.query.mockResolvedValue([browser.row]);

    await sendWebPushToUser('user-1', { ...MESSAGE, data: { runId: 'run-42' } });

    const body = Buffer.from(mocks.fetch.mock.calls[0]![1].body as Uint8Array);

    expect(JSON.parse(receiveWebPush(body, browser.ecdh, browser.authSecret))).toEqual({
      title: MESSAGE.title,
      body: MESSAGE.body,
      data: { runId: 'run-42' },
    });
  });

  it('sends a ciphertext, never the notification text in the clear', async () => {
    await sendWebPushToUser('user-1', { title: 'Agent run finished', body: 'secret-marker' });

    const body = Buffer.from(mocks.fetch.mock.calls[0]![1].body as Uint8Array);
    expect(body.includes(Buffer.from('secret-marker', 'utf8'))).toBe(false);
    expect(body.length).toBeGreaterThan(0);
  });

  it('sends nothing when the account has registered no browser', async () => {
    mocks.query.mockResolvedValue([]);

    await expect(sendWebPushToUser('user-1', MESSAGE)).resolves.toEqual({
      sent: 0,
      invalidated: 0,
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

describe('dead subscriptions', () => {
  it('prunes an endpoint the push service reports as gone', async () => {
    const rows = [subscriptionRow('push-a.test'), subscriptionRow('push-b.test')];
    mocks.query.mockResolvedValue(rows);
    mocks.fetch
      .mockResolvedValueOnce({ ok: true, status: 201 })
      .mockResolvedValueOnce({ ok: false, status: 410 });

    const result = await sendWebPushToUser('user-1', MESSAGE);

    expect(result).toEqual({ sent: 1, invalidated: 1 });
    const [sql, params] = mocks.execute.mock.calls[0]!;
    expect(String(sql)).toContain('delete from public.web_push_subscriptions');
    expect(params).toEqual([[rows[1]!.endpoint]]);
  });

  it('keeps a subscription that failed for any other reason', async () => {
    mocks.fetch.mockResolvedValue({ ok: false, status: 500 });

    const result = await sendWebPushToUser('user-1', MESSAGE);

    expect(result).toEqual({ sent: 0, invalidated: 0 });
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});

describe('never throws', () => {
  it('survives a push service outage', async () => {
    mocks.fetch.mockRejectedValue(new Error('network down'));

    await expect(sendWebPushToUser('user-1', MESSAGE)).resolves.toEqual({
      sent: 0,
      invalidated: 0,
    });
  });

  it('reports a lookup failure instead of throwing', async () => {
    mocks.query.mockRejectedValue(new Error('db down'));

    const result = await sendWebPushToUser('user-1', MESSAGE);

    expect(result.error).toBe('subscription_lookup_failed');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('survives a failed prune', async () => {
    mocks.fetch.mockResolvedValue({ ok: false, status: 404 });
    mocks.execute.mockRejectedValue(new Error('db down'));

    await expect(sendWebPushToUser('user-1', MESSAGE)).resolves.toMatchObject({ invalidated: 1 });
  });

  it('refuses a payload that cannot fit one record instead of sending a truncated one', async () => {
    const result = await sendWebPushToUser('user-1', {
      title: 'Agent run finished',
      body: 'x'.repeat(8_000),
    });

    expect(result.error).toBe('payload_too_large');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
