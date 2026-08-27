import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const WORKER_SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../../public/sw.js'),
  'utf8',
);

const ORIGIN = 'https://app.example.test';
const RUN_ID = 'run-42';

type Listener = (event: Record<string, unknown>) => void;

interface Worker {
  listeners: Map<string, Listener>;
  showNotification: ReturnType<typeof vi.fn>;
  getSubscription: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  matchAll: ReturnType<typeof vi.fn>;
  openWindow: ReturnType<typeof vi.fn>;
  claim: ReturnType<typeof vi.fn>;
}

function loadWorker(): Worker {
  const listeners = new Map<string, Listener>();
  const worker: Worker = {
    listeners,
    showNotification: vi.fn().mockResolvedValue(undefined),
    getSubscription: vi.fn().mockResolvedValue(null),
    subscribe: vi.fn(),
    matchAll: vi.fn().mockResolvedValue([]),
    openWindow: vi.fn().mockResolvedValue(undefined),
    claim: vi.fn().mockResolvedValue(undefined),
  };

  const scope = {
    addEventListener: (type: string, handler: Listener) => listeners.set(type, handler),
    skipWaiting: vi.fn(),
    location: { origin: ORIGIN },
    clients: { claim: worker.claim, matchAll: worker.matchAll, openWindow: worker.openWindow },
    registration: {
      showNotification: worker.showNotification,
      pushManager: { getSubscription: worker.getSubscription, subscribe: worker.subscribe },
    },
  };

  new Function('self', WORKER_SOURCE)(scope);
  return worker;
}

async function dispatch(
  worker: Worker,
  type: string,
  event: Record<string, unknown>,
): Promise<void> {
  const pending: unknown[] = [];
  worker.listeners.get(type)!({ ...event, waitUntil: (value: unknown) => pending.push(value) });
  await Promise.all(pending);
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

describe('push', () => {
  it('renders the payload and tags the card with the run it is about', async () => {
    const worker = loadWorker();

    await dispatch(worker, 'push', {
      data: {
        json: () => ({ title: 'Approval needed', body: 'Sign off', data: { runId: RUN_ID } }),
      },
    });

    const [title, options] = worker.showNotification.mock.calls[0]!;
    expect(title).toBe('Approval needed');
    expect(options.body).toBe('Sign off');
    expect(options.data.url).toBe(`/tasks?run=${RUN_ID}`);
    expect(options.tag).toBe(`/tasks?run=${RUN_ID}`);
  });

  it('still renders something when the payload is not JSON', async () => {
    const worker = loadWorker();

    await dispatch(worker, 'push', {
      data: {
        json: () => {
          throw new Error('not json');
        },
        text: () => 'a plain body',
      },
    });

    const [title, options] = worker.showNotification.mock.calls[0]!;
    expect(title).toBe('AGI');
    expect(options.body).toBe('a plain body');
    expect(options.data.url).toBe('/tasks');
  });

  it('shows a card even with no payload at all, which is what userVisibleOnly requires', async () => {
    const worker = loadWorker();

    await dispatch(worker, 'push', { data: null });

    expect(worker.showNotification).toHaveBeenCalledTimes(1);
  });
});

describe('notificationclick', () => {
  it('navigates an open tab on the same path instead of opening a second one', async () => {
    const worker = loadWorker();
    const navigate = vi.fn().mockResolvedValue(undefined);
    const focus = vi.fn().mockResolvedValue({ navigate });
    worker.matchAll.mockResolvedValue([{ url: `${ORIGIN}/tasks`, focus }]);

    await dispatch(worker, 'notificationclick', {
      notification: { close: vi.fn(), data: { url: `/tasks?run=${RUN_ID}` } },
    });

    expect(focus).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(`${ORIGIN}/tasks?run=${RUN_ID}`);
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it('opens a window when no tab is on that path', async () => {
    const worker = loadWorker();
    worker.matchAll.mockResolvedValue([{ url: `${ORIGIN}/settings`, focus: vi.fn() }]);

    await dispatch(worker, 'notificationclick', {
      notification: { close: vi.fn(), data: { url: `/tasks?run=${RUN_ID}` } },
    });

    expect(worker.openWindow).toHaveBeenCalledWith(`${ORIGIN}/tasks?run=${RUN_ID}`);
  });

  it('closes the card it was fired from', async () => {
    const worker = loadWorker();
    const close = vi.fn();

    await dispatch(worker, 'notificationclick', { notification: { close, data: {} } });

    expect(close).toHaveBeenCalled();
  });
});

describe('pushsubscriptionchange', () => {
  it('re-registers the rotated endpoint with a CSRF token', async () => {
    const worker = loadWorker();
    const rotated = {
      options: { applicationServerKey: new Uint8Array([1]) },
      toJSON: () => ({
        endpoint: 'https://push.example.test/new',
        keys: { p256dh: 'p', auth: 'a' },
      }),
    };
    worker.subscribe.mockResolvedValue(rotated);
    fetchMock.mockImplementation(async (url: string) =>
      url === '/api/csrf'
        ? { ok: true, json: async () => ({ token: 'csrf-token' }) }
        : { ok: true },
    );

    await dispatch(worker, 'pushsubscriptionchange', {
      oldSubscription: { options: { applicationServerKey: new Uint8Array([1]) } },
    });

    const post = fetchMock.mock.calls.find((call) => call[1]?.method === 'POST')!;
    expect(post[0]).toBe('/api/web-push');
    expect(post[1].headers['x-csrf-token']).toBe('csrf-token');
    expect(JSON.parse(post[1].body).endpoint).toBe('https://push.example.test/new');
  });

  it('registers nothing when there is no key to re-subscribe with', async () => {
    const worker = loadWorker();

    await dispatch(worker, 'pushsubscriptionchange', {});

    expect(worker.subscribe).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not post an unauthenticated registration when the CSRF fetch fails', async () => {
    const worker = loadWorker();
    worker.subscribe.mockResolvedValue({
      options: { applicationServerKey: new Uint8Array([1]) },
      toJSON: () => ({ endpoint: 'https://push.example.test/new' }),
    });
    fetchMock.mockResolvedValue({ ok: false });

    await dispatch(worker, 'pushsubscriptionchange', {
      newSubscription: {
        options: { applicationServerKey: new Uint8Array([1]) },
        toJSON: () => ({ endpoint: 'https://push.example.test/new' }),
      },
    });

    expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'POST')).toBe(false);
  });
});
