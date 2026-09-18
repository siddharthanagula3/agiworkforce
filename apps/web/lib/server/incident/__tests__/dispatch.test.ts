import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendSupportEmail: vi.fn(),
  getKeyValueStore: vi.fn(),
  error: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/support/handoff/resend-client', () => ({
  sendSupportEmail: mocks.sendSupportEmail,
}));
vi.mock('@/lib/support/handoff/config', () => ({
  getHandoffConfig: () => ({ fallbackEmail: 'support@agiworkforce.com' }),
  isValidEmail: (value: string) => value.includes('@'),
}));
vi.mock('@/lib/server/key-value', () => ({ getKeyValueStore: mocks.getKeyValueStore }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: mocks.error, debug: vi.fn() },
}));

import { clearIncident, notifyIncident } from '../dispatch';
import {
  ONCALL_ESCALATE_AFTER_MINUTES_ENV,
  ONCALL_ROTATION_ENV,
  ONCALL_ROTATION_START_ENV,
} from '../on-call';
import { INCIDENT_CHANNEL_WEBHOOK_ENV, PAGER_WEBHOOK_ENV } from '../pager';
import {
  OUT_OF_BAND_WEBHOOK_ENV,
  STATUS_MIRROR_WRITE_URL_ENV,
  STATUS_MIRROR_URL_ENV,
  statusMirrorUrl,
} from '../out-of-band';

const NOW = new Date('2026-09-07T00:00:00.000Z');
const LATER = new Date('2026-09-07T00:20:00.000Z');

function memoryStore() {
  const values = new Map<string, unknown>();
  return {
    values,
    store: {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      set: vi.fn(async (key: string, value: unknown) => {
        values.set(key, value);
        return true;
      }),
      delete: vi.fn(async (key: string) => (values.delete(key) ? 1 : 0)),
    },
  };
}

const ALERT = {
  key: 'health-probe',
  severity: 'critical' as const,
  subject: '[AGI CRITICAL] production health unhealthy',
  text: 'Database unreachable.',
};

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sendSupportEmail.mockResolvedValue({ delivered: true });
  mocks.getKeyValueStore.mockReturnValue(null);
  process.env[ONCALL_ROTATION_ENV] = 'ada:ada@agiworkforce.com,grace:grace@agiworkforce.com';
  process.env[ONCALL_ROTATION_START_ENV] = NOW.toISOString();
  process.env[ONCALL_ESCALATE_AFTER_MINUTES_ENV] = '10';
  delete process.env[PAGER_WEBHOOK_ENV];
  delete process.env[INCIDENT_CHANNEL_WEBHOOK_ENV];
  delete process.env[OUT_OF_BAND_WEBHOOK_ENV];
  delete process.env[STATUS_MIRROR_WRITE_URL_ENV];
  delete process.env[STATUS_MIRROR_URL_ENV];
  vi.unstubAllGlobals();
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('incident dispatch', () => {
  it('addresses the responder the rotation says is holding the pager', async () => {
    const result = await notifyIncident(ALERT, NOW);

    expect(result.notified).toEqual(['ada']);
    expect(mocks.sendSupportEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendSupportEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ada@agiworkforce.com' }),
    );
  });

  it('falls back to the monitored mailbox when no rotation is configured', async () => {
    delete process.env[ONCALL_ROTATION_ENV];

    const result = await notifyIncident(ALERT, NOW);

    expect(result.notified).toEqual(['support mailbox']);
    expect(mocks.sendSupportEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'support@agiworkforce.com' }),
    );
  });

  it('escalates to the second responder once the condition survives the window', async () => {
    const { store } = memoryStore();
    mocks.getKeyValueStore.mockReturnValue(store);

    const first = await notifyIncident(ALERT, NOW);
    const second = await notifyIncident(ALERT, LATER);

    expect(first.level).toBe(1);
    expect(second.level).toBe(3);
    expect(second.notified).toEqual(['ada', 'grace']);
  });

  it('starts the next incident of the same kind at level one once the last one cleared', async () => {
    const { store, values } = memoryStore();
    mocks.getKeyValueStore.mockReturnValue(store);

    await notifyIncident(ALERT, NOW);
    await clearIncident(ALERT.key);
    expect(values.size).toBe(0);

    await expect(notifyIncident(ALERT, LATER)).resolves.toMatchObject({ level: 1 });
  });

  it('stays at level one when no key-value store is available to remember the incident', async () => {
    await expect(notifyIncident(ALERT, LATER)).resolves.toMatchObject({ level: 1 });
  });

  it('posts to the pager and the incident channel when both are configured', async () => {
    process.env[PAGER_WEBHOOK_ENV] = 'https://pager.example.test/hook';
    process.env[INCIDENT_CHANNEL_WEBHOOK_ENV] = 'https://chat.example.test/hook';
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response('', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await notifyIncident(ALERT, NOW);

    expect(result.paged).toBe('paged');
    expect(result.channel).toBe('paged');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(bodies.map((body) => body.source)).toEqual(['health-probe', 'incident-channel']);
    expect(bodies[0].target).toBe('ada');
  });

  it('reports an unconfigured pager rather than pretending someone was woken', async () => {
    const result = await notifyIncident(ALERT, NOW);

    expect(result.paged).toBe('unconfigured');
    expect(result.channel).toBe('unconfigured');
  });

  it('says nobody was told when the email, the pager and the channel all failed', async () => {
    mocks.sendSupportEmail.mockResolvedValue({ delivered: false, reason: 'no api key' });

    const result = await notifyIncident(ALERT, NOW);

    expect(result.delivery).toBe('undeliverable');
    expect(result.reason).toBe('no api key');
    expect(mocks.error).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'health-probe' }),
      expect.stringContaining('no human has been told'),
    );
  });

  it('reaches the responder on a transport that is not the email vendor when Resend is down', async () => {
    mocks.sendSupportEmail.mockResolvedValue({ delivered: false, reason: 'resend unreachable' });
    process.env[OUT_OF_BAND_WEBHOOK_ENV] = 'https://out-of-band.example.test/hook';
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response('', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await notifyIncident(ALERT, NOW);

    expect(result.outOfBand).toBe('paged');
    expect(result.delivery).toBe('delivered');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://out-of-band.example.test/hook');
    expect(mocks.error).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('no human has been told'),
    );
  });

  it('does not use the fallback transport when a channel already carried the alert', async () => {
    process.env[PAGER_WEBHOOK_ENV] = 'https://pager.example.test/hook';
    process.env[OUT_OF_BAND_WEBHOOK_ENV] = 'https://out-of-band.example.test/hook';
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response('', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await notifyIncident(ALERT, NOW);

    expect(result.outOfBand).toBe('unconfigured');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('publishes the incident to an origin this deployment does not serve', async () => {
    mocks.sendSupportEmail.mockResolvedValue({ delivered: false, reason: 'resend unreachable' });
    process.env[STATUS_MIRROR_WRITE_URL_ENV] = 'https://mirror.example.test/status.json';
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response('', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await notifyIncident(ALERT, NOW);

    const mirrorCall = fetchMock.mock.calls.find(
      ([url]) => url === 'https://mirror.example.test/status.json',
    );
    expect(mirrorCall?.[1]).toMatchObject({ method: 'PUT' });
    expect(JSON.parse(String((mirrorCall?.[1] as RequestInit).body))).toMatchObject({
      status: 'disrupted',
      headline: ALERT.subject,
    });
  });

  it('still says nobody was told when the fallback transport also fails', async () => {
    mocks.sendSupportEmail.mockResolvedValue({ delivered: false, reason: 'no api key' });
    process.env[OUT_OF_BAND_WEBHOOK_ENV] = 'https://out-of-band.example.test/hook';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 })),
    );

    const result = await notifyIncident(ALERT, NOW);

    expect(result.outOfBand).toBe('failed');
    expect(result.delivery).toBe('undeliverable');
    expect(mocks.error).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'health-probe' }),
      expect.stringContaining('no human has been told'),
    );
  });

  it('reports no status mirror rather than a broken link when none is configured', () => {
    expect(statusMirrorUrl()).toBeUndefined();
    process.env[STATUS_MIRROR_URL_ENV] = 'https://status.example.test';
    expect(statusMirrorUrl()).toBe('https://status.example.test');
  });

  it('carries the escalation level into the text a responder reads', async () => {
    await notifyIncident(ALERT, NOW);

    expect(mocks.sendSupportEmail).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('Escalation level 1') }),
    );
  });
});
