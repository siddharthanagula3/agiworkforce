import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), addCsrfHeaders: vi.fn() }));

vi.mock('@/lib/client/csrf', () => ({ addCsrfHeaders: mocks.addCsrfHeaders }));

const {
  disableWebPush,
  enableWebPush,
  fetchVapidPublicKey,
  isWebPushSupported,
  syncExistingSubscription,
} = await import('../web-push-client');

const ENDPOINT = 'https://push.example.test/push/abc';
const PUBLIC_KEY =
  'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';

function subscription(overrides: Partial<PushSubscription> = {}) {
  return {
    endpoint: ENDPOINT,
    toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: 'p', auth: 'a' } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as PushSubscription;
}

function installBrowser(options: {
  permission?: NotificationPermission;
  existing?: PushSubscription | null;
  subscribe?: ReturnType<typeof vi.fn>;
}) {
  const pushManager = {
    getSubscription: vi.fn().mockResolvedValue(options.existing ?? null),
    subscribe: options.subscribe ?? vi.fn().mockResolvedValue(subscription()),
  };
  const registration = { pushManager } as unknown as ServiceWorkerRegistration;

  vi.stubGlobal('navigator', {
    serviceWorker: {
      register: vi.fn().mockResolvedValue(registration),
      ready: Promise.resolve(registration),
    },
  });
  vi.stubGlobal('PushManager', class {});
  vi.stubGlobal('Notification', {
    permission: options.permission ?? 'default',
    requestPermission: vi.fn().mockResolvedValue(options.permission ?? 'granted'),
  });
  return pushManager;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  mocks.addCsrfHeaders.mockImplementation(async (headers: Record<string, string>) => ({
    ...headers,
    'x-csrf-token': 'token',
  }));
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ publicKey: PUBLIC_KEY }) });
  vi.stubGlobal('fetch', mocks.fetch);
});

describe('support detection', () => {
  it('reports no support when the browser has no PushManager', () => {
    vi.stubGlobal('navigator', {});
    expect(isWebPushSupported()).toBe(false);
  });

  it('reports support only when worker, push and notification APIs are all present', () => {
    installBrowser({});
    expect(isWebPushSupported()).toBe(true);
  });
});

describe('server configuration', () => {
  it('returns null when the deployment publishes no key', async () => {
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ publicKey: null }) });
    await expect(fetchVapidPublicKey()).resolves.toBeNull();
  });

  it('returns null instead of throwing when the endpoint is unreachable', async () => {
    mocks.fetch.mockRejectedValue(new Error('offline'));
    await expect(fetchVapidPublicKey()).resolves.toBeNull();
  });
});

describe('enableWebPush', () => {
  it('asks for permission, subscribes with the server key, and registers the result', async () => {
    const pushManager = installBrowser({ permission: 'granted' });

    await expect(enableWebPush()).resolves.toBe('enabled');

    const key = pushManager.subscribe.mock.calls[0]![0].applicationServerKey as Uint8Array;
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(65);
    expect(pushManager.subscribe.mock.calls[0]![0].userVisibleOnly).toBe(true);

    const post = mocks.fetch.mock.calls.find((call) => call[1]?.method === 'POST')!;
    expect(post[0]).toBe('/api/web-push');
    expect(JSON.parse(post[1].body)).toEqual({
      endpoint: ENDPOINT,
      keys: { p256dh: 'p', auth: 'a' },
    });
    expect(post[1].headers['x-csrf-token']).toBe('token');
  });

  it('does not subscribe when the user denies the prompt', async () => {
    const pushManager = installBrowser({ permission: 'denied' });

    await expect(enableWebPush()).resolves.toBe('denied');
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('reuses a subscription the browser already holds', async () => {
    const pushManager = installBrowser({ permission: 'granted', existing: subscription() });

    await expect(enableWebPush()).resolves.toBe('enabled');
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('takes out a fresh endpoint when the held one belongs to the previous account', async () => {
    const stale = subscription();
    const pushManager = installBrowser({ permission: 'granted', existing: stale });
    let posts = 0;
    mocks.fetch.mockImplementation(async (_url: string, init?: { method?: string }) => {
      if (init?.method !== 'POST')
        return { ok: true, json: async () => ({ publicKey: PUBLIC_KEY }) };
      posts += 1;
      return posts === 1 ? { ok: false, status: 403 } : { ok: true, status: 200 };
    });

    await expect(enableWebPush()).resolves.toBe('enabled');
    expect(stale.unsubscribe).toHaveBeenCalled();
    expect(pushManager.subscribe).toHaveBeenCalledTimes(1);
    expect(posts).toBe(2);
  });

  it('does not retry a refusal that is not a claimed endpoint', async () => {
    const stale = subscription();
    const pushManager = installBrowser({ permission: 'granted', existing: stale });
    mocks.fetch.mockImplementation(async (_url: string, init?: { method?: string }) =>
      init?.method === 'POST'
        ? { ok: false, status: 500 }
        : { ok: true, json: async () => ({ publicKey: PUBLIC_KEY }) },
    );

    await expect(enableWebPush()).resolves.toBe('unavailable');
    expect(stale.unsubscribe).not.toHaveBeenCalled();
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });
});

describe('syncExistingSubscription', () => {
  it('re-registers a live subscription so a pruned row comes back', async () => {
    installBrowser({ permission: 'granted', existing: subscription() });

    await syncExistingSubscription();

    expect(mocks.fetch.mock.calls.some((call) => call[1]?.method === 'POST')).toBe(true);
  });

  it('posts nothing when the browser holds no subscription', async () => {
    installBrowser({ permission: 'default' });

    await syncExistingSubscription();

    expect(mocks.fetch.mock.calls.some((call) => call[1]?.method === 'POST')).toBe(false);
  });
});

describe('disableWebPush', () => {
  it('tells the server before unsubscribing locally', async () => {
    const live = subscription();
    installBrowser({ permission: 'granted', existing: live });

    await expect(disableWebPush()).resolves.toBe(true);

    const remove = mocks.fetch.mock.calls.find((call) => call[1]?.method === 'DELETE')!;
    expect(JSON.parse(remove[1].body)).toEqual({ endpoint: ENDPOINT });
    expect(live.unsubscribe).toHaveBeenCalled();
  });
});
