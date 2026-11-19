import { createECDH, randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  fetch: vi.fn(),
  enqueueJob: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/jobs/job-service', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  enqueueJob: mocks.enqueueJob,
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: mocks.query, execute: mocks.execute }),
}));
// Web push goes through the vetted fetch; the real resolver would ask DNS about a test host.
vi.mock('@/lib/egress-policy', async () => {
  const actual = await vi.importActual<ImportedModule0>('@/lib/egress-policy');
  return {
    ...actual,
    pinnedPublicFetch: (...args: unknown[]) => mocks.fetch(...args),
    assertResolvedPublicHostname: async () => undefined,
  };
});

const VAPID_PUBLIC_KEY_ENV = 'WEB_PUSH_VAPID_PUBLIC_KEY';
const VAPID_PRIVATE_KEY_ENV = 'WEB_PUSH_VAPID_PRIVATE_KEY';
const VAPID_SUBJECT_ENV = 'WEB_PUSH_VAPID_SUBJECT';

const { deviceAcceptsNotice, getPushTokensForUser, resumeDeferredPush, sendPushToUser } =
  await import('../push-notification-service');
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
  it('survives a provider outage and says the request never got through', async () => {
    mocks.fetch.mockRejectedValue(new Error('network down'));

    await expect(sendPushToUser('user-1', { title: 'x', body: 'y' })).resolves.toEqual({
      sent: 0,
      invalidated: 0,
      transportFailures: 1,
    });
  });

  it('survives a non-200 from Expo and says the request never got through', async () => {
    mocks.fetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

    await expect(sendPushToUser('user-1', { title: 'x', body: 'y' })).resolves.toEqual({
      sent: 0,
      invalidated: 0,
      transportFailures: 1,
    });
  });

  it('reports no transport failure for a push the provider accepted', async () => {
    expoReturns([{ status: 'ok' }]);

    const result = await sendPushToUser('user-1', { title: 'x', body: 'y' });

    expect(result.sent).toBeGreaterThan(0);
    expect(result).not.toHaveProperty('transportFailures');
  });

  it('reports a token-lookup failure instead of throwing', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (String(sql).includes('user_settings')) return [];
      throw new Error('db down');
    });

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
      // Node strips a leading zero byte about once in 256 keys; a VAPID key is always 32.
      privateKey: Buffer.concat([Buffer.alloc(32), ecdh.getPrivateKey()])
        .subarray(-32)
        .toString('base64url'),
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

function devicePreferences(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    timezone: 'UTC',
    categories: { approvals: true, task_updates: false },
    eventTypes: { agent_approval_needed: true, task_completed: false },
    quietHours: { enabled: false, days: [], startTime: '22:00', endTime: '07:00', timezone: 'UTC' },
    ...overrides,
  };
}

describe('sendPushToUser, quiet hours', () => {
  const noon = new Date('2026-09-29T12:00:00Z');
  const quietPreferences = {
    quietHours: {
      enabled: true,
      days: [0, 1, 2, 3, 4, 5, 6],
      startTime: '11:00',
      endTime: '13:00',
      timezone: 'UTC',
    },
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(noon);
    mocks.query.mockImplementation(async (sql: string) =>
      String(sql).includes('user_settings')
        ? [{ preferences: quietPreferences }]
        : [{ push_token: TOKEN_A, push_preferences: null }],
    );
    expoReturns([{ status: 'ok' }]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('holds a routine notice inside the account quiet hours', async () => {
    const result = await sendPushToUser('user-1', {
      title: 'Done',
      body: 'x',
      data: { type: 'schedule_run' },
    });

    expect(result.sent).toBe(0);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('delivers a notice whose quiet-hours type is urgent although its routing type is not', async () => {
    const result = await sendPushToUser('user-1', {
      title: 'Needs you',
      body: 'x',
      data: { type: 'schedule_run' },
      quietHoursType: 'agent_approval_needed',
    });

    expect(result.sent).toBe(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('applies the quiet-hours type to the device preference as well', () => {
    const deviceQuiet = devicePreferences({ eventTypes: {}, ...quietPreferences });
    expect(deviceAcceptsNotice(deviceQuiet, 'schedule_run', noon)).toBe(false);
    expect(deviceAcceptsNotice(deviceQuiet, 'schedule_run', noon, 'agent_failed')).toBe(true);
  });
});

describe('sendPushToUser, unreadable quiet hours', () => {
  const noon = new Date('2026-09-29T12:00:00Z');
  const outsideWindow = new Date('2026-09-29T15:00:00Z');
  const quietPreferences = {
    quietHours: {
      enabled: true,
      days: [0, 1, 2, 3, 4, 5, 6],
      startTime: '11:00',
      endTime: '13:00',
      timezone: 'UTC',
    },
  };
  const transports = { expo: true, web: false };
  const routine = { title: 'Done', body: 'x', data: { type: 'schedule_run' } };
  let settingsReadable: boolean;
  let stored: unknown;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(noon);
    settingsReadable = false;
    stored = quietPreferences;
    mocks.enqueueJob.mockResolvedValue({ id: 'job-1', status: 'queued', created: true });
    mocks.query.mockImplementation(async (sql: string) => {
      if (String(sql).includes('user_settings')) {
        if (!settingsReadable) throw new Error('connection reset');
        return [{ preferences: stored }];
      }
      return [{ push_token: TOKEN_A, push_preferences: null }];
    });
    expoReturns([{ status: 'ok' }]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('defers a holdable notice instead of sending or losing it', async () => {
    const result = await sendPushToUser('user-1', routine, transports);

    expect(result).toEqual({ sent: 0, invalidated: 0, deferred: true });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.enqueueJob).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      expect.objectContaining({
        kind: 'notifications.deferred-push',
        userId: 'user-1',
        payload: { message: routine, transports: { expo: true, web: false } },
      }),
    );
  });

  it('still delivers a notice that quiet hours never hold, without reading the setting', async () => {
    const result = await sendPushToUser(
      'user-1',
      { ...routine, quietHoursType: 'agent_approval_needed' },
      transports,
    );

    expect(result.sent).toBe(1);
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes('user_settings'))).toBe(
      false,
    );
  });

  it('reports the failure when the notice cannot be queued either', async () => {
    mocks.enqueueJob.mockRejectedValue(new Error('queue down'));

    const result = await sendPushToUser('user-1', routine, transports);

    expect(result).toEqual({ sent: 0, invalidated: 0, error: 'quiet_hours_unreadable' });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('treats a saved schedule it cannot interpret like an unreadable one', async () => {
    settingsReadable = true;
    stored = {
      quietHours: {
        enabled: true,
        days: [],
        startTime: '11:00',
        endTime: '13:00',
        timezone: 'UTC',
      },
    };

    const result = await sendPushToUser('user-1', routine, transports);

    expect(result.deferred).toBe(true);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('keeps the readable behaviour: deliver outside the window, hold inside it', async () => {
    settingsReadable = true;

    expect((await sendPushToUser('user-1', routine, transports)).sent).toBe(0);
    expect(mocks.fetch).not.toHaveBeenCalled();

    vi.setSystemTime(outsideWindow);
    expect((await sendPushToUser('user-1', routine, transports)).sent).toBe(1);
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
  });

  it('retries a deferred notice while the setting is unreadable and sends it once after recovery', async () => {
    vi.setSystemTime(outsideWindow);
    const retry = resumeDeferredPush('user-1', routine, { expo: true, web: false }, false);
    await expect(retry).rejects.toMatchObject({ name: 'QuietHoursUnreadableError' });
    expect(mocks.fetch).not.toHaveBeenCalled();

    settingsReadable = true;
    await expect(
      resumeDeferredPush('user-1', routine, { expo: true, web: false }, false),
    ).resolves.toMatchObject({ sent: 1 });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('holds a deferred notice that recovery finds inside the window, as a readable hold would', async () => {
    settingsReadable = true;

    await expect(
      resumeDeferredPush('user-1', routine, { expo: true, web: false }, false),
    ).resolves.toEqual({ held: true });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('gives up on the last attempt without sending, leaving the notice in the feed', async () => {
    await expect(
      resumeDeferredPush('user-1', routine, { expo: true, web: false }, true),
    ).resolves.toEqual({ dropped: 'quiet_hours_unreadable' });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

describe('device push preferences', () => {
  const noon = new Date('2026-09-29T12:00:00Z');

  it('delivers everything to a device that has not said what it wants', () => {
    expect(deviceAcceptsNotice(null, 'task_completed', noon)).toBe(true);
    expect(deviceAcceptsNotice({ garbage: true }, 'task_completed', noon)).toBe(true);
  });

  it('skips a notice type the device turned off', () => {
    expect(deviceAcceptsNotice(devicePreferences(), 'task_completed', noon)).toBe(false);
    expect(deviceAcceptsNotice(devicePreferences(), 'agent_approval_needed', noon)).toBe(true);
  });

  it("holds a notice inside the device's quiet hours", () => {
    const quiet = devicePreferences({
      eventTypes: {},
      quietHours: {
        enabled: true,
        days: [0, 1, 2, 3, 4, 5, 6],
        startTime: '11:00',
        endTime: '13:00',
        timezone: 'UTC',
      },
    });
    expect(deviceAcceptsNotice(quiet, 'task_completed', noon)).toBe(false);
  });

  it('only sends to the devices that want the notice', async () => {
    mocks.query.mockResolvedValue([
      { push_token: TOKEN_A, push_preferences: devicePreferences() },
      { push_token: TOKEN_B, push_preferences: null },
    ]);

    await expect(getPushTokensForUser('user-1', 'task_completed', noon)).resolves.toEqual([
      TOKEN_B,
    ]);
  });

  it('sends a product update only to a device that turned it on', () => {
    const optedIn = devicePreferences({ eventTypes: { product_update: true } });
    const optedOut = devicePreferences({ eventTypes: { product_update: false } });
    const olderApp = devicePreferences({ eventTypes: { task_completed: true } });
    expect(deviceAcceptsNotice(optedIn, 'product_update', noon)).toBe(true);
    expect(deviceAcceptsNotice(optedOut, 'product_update', noon)).toBe(false);
    expect(deviceAcceptsNotice(olderApp, 'product_update', noon)).toBe(false);
    expect(deviceAcceptsNotice(null, 'product_update', noon)).toBe(false);
    expect(deviceAcceptsNotice({ garbage: true }, 'product_update', noon)).toBe(false);
  });

  it('holds a product update inside quiet hours even when it is on', () => {
    const quiet = devicePreferences({
      eventTypes: { product_update: true },
      quietHours: {
        enabled: true,
        days: [0, 1, 2, 3, 4, 5, 6],
        startTime: '11:00',
        endTime: '13:00',
        timezone: 'UTC',
      },
    });
    expect(deviceAcceptsNotice(quiet, 'product_update', noon)).toBe(false);
  });

  it('lets a device mute scheduled runs alone', () => {
    const scheduledOff = devicePreferences({
      eventTypes: { schedule_run: false, task_completed: true, agent_approval_needed: true },
    });
    expect(deviceAcceptsNotice(scheduledOff, 'schedule_run', noon)).toBe(false);
    expect(deviceAcceptsNotice(scheduledOff, 'task_completed', noon)).toBe(true);
  });
});

type ImportedModule0 = typeof import('@/lib/egress-policy');

type ImportedModule1 = typeof import('@/lib/jobs/job-service');
