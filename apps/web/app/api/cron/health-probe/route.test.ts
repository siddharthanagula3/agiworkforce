import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyCronRequest: vi.fn(),
  runHealthChecks: vi.fn(),
  sendSupportEmail: vi.fn(),
  getHandoffConfig: vi.fn(),
  getKeyValueStore: vi.fn(),
}));

vi.mock('@/lib/server/cron-auth', () => ({ verifyCronRequest: mocks.verifyCronRequest }));
vi.mock('@/lib/server/health-check', () => ({ runHealthChecks: mocks.runHealthChecks }));
vi.mock('@/lib/support/handoff/resend-client', () => ({
  sendSupportEmail: mocks.sendSupportEmail,
}));
vi.mock('@/lib/support/handoff/config', () => ({
  getHandoffConfig: mocks.getHandoffConfig,
  isValidEmail: vi.fn(() => true),
}));
vi.mock('@/lib/server/key-value', () => ({ getKeyValueStore: mocks.getKeyValueStore }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET } from './route';

function req() {
  return new Request('http://localhost/api/cron/health-probe') as never;
}

function health(status: 'healthy' | 'degraded' | 'unhealthy') {
  return {
    status,
    timestamp: '2026-08-09T06:15:00.000Z',
    checks: {
      database: {
        status: status === 'unhealthy' ? 'unhealthy' : 'healthy',
        message: 'unavailable',
      },
      stripe: { status: status === 'healthy' ? 'healthy' : 'unhealthy', message: 'unavailable' },
      environment: { status: 'healthy' },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyCronRequest.mockReturnValue(true);
  mocks.runHealthChecks.mockResolvedValue(health('healthy'));
  mocks.sendSupportEmail.mockResolvedValue({ delivered: true, providerMessageId: 'msg_1' });
  mocks.getHandoffConfig.mockReturnValue({ fallbackEmail: 'support@agiworkforce.com' });
  mocks.getKeyValueStore.mockReturnValue(null);
});

describe('health probe schedule', () => {
  const crons = (
    JSON.parse(readFileSync(resolve(process.cwd(), '../../vercel.json'), 'utf8')) as {
      crons?: Array<{ path: string; schedule: string }>;
    }
  ).crons;

  it('registers the probe on the ten-minute cadence the Pro plan accepts', () => {
    const entry = crons?.find((cron) => cron.path === '/api/cron/health-probe');
    expect(entry).toBeDefined();
    expect(entry?.schedule).toBe('*/10 * * * *');
  });
});

describe('GET /api/cron/health-probe', () => {
  it('401s and probes NOTHING without cron authorization', async () => {
    mocks.verifyCronRequest.mockReturnValue(false);

    const response = await GET(req());

    expect(response.status).toBe(401);
    expect(mocks.runHealthChecks).not.toHaveBeenCalled();
    expect(mocks.sendSupportEmail).not.toHaveBeenCalled();
  });

  it('stays silent while the platform is healthy', async () => {
    const response = await GET(req());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'healthy',
      alerted: false,
      delivery: 'not_needed',
    });
    expect(mocks.sendSupportEmail).not.toHaveBeenCalled();
  });

  it('pages a monitored mailbox when the platform cannot serve', async () => {
    mocks.runHealthChecks.mockResolvedValue(health('unhealthy'));

    const response = await GET(req());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'unhealthy',
      alerted: true,
      delivery: 'delivered',
      severity: 'critical',
    });
    expect(mocks.sendSupportEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendSupportEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'support@agiworkforce.com',
        subject: expect.stringContaining('CRITICAL'),
        text: expect.stringContaining('database'),
      }),
    );
    expect(mocks.sendSupportEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('docs/runbooks/incident-response.md'),
      }),
    );
  });

  it('notifies at WARNING for a Stripe-only degradation, not as an outage', async () => {
    mocks.runHealthChecks.mockResolvedValue(health('degraded'));

    const response = await GET(req());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ severity: 'warning', delivery: 'delivered' });
    expect(mocks.sendSupportEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining('WARNING') }),
    );
  });

  it('fails the cron run when an owed alert could not be delivered', async () => {
    mocks.runHealthChecks.mockResolvedValue(health('unhealthy'));
    mocks.sendSupportEmail.mockResolvedValue({
      delivered: false,
      reason: 'not_configured',
      detail: 'RESEND_API_KEY missing',
    });

    const response = await GET(req());

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      alerted: true,
      delivery: 'undeliverable',
      reason: 'not_configured',
    });
  });

  it('pages when a dependency hangs instead of stalling until the platform kills it', async () => {
    vi.useFakeTimers();
    try {
      mocks.runHealthChecks.mockImplementation(() => new Promise(() => {}));

      const pending = GET(req());
      await vi.advanceTimersByTimeAsync(8_001);
      const response = await pending;

      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({ status: 'probe_failed', alerted: true });
      expect(mocks.sendSupportEmail).toHaveBeenCalledTimes(1);
      expect(mocks.sendSupportEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('CRITICAL'),
          text: expect.stringContaining('timed out'),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('surfaces the missing-variable count when the environment check fails', async () => {
    mocks.runHealthChecks.mockResolvedValue({
      status: 'unhealthy',
      timestamp: '2026-08-09T06:15:00.000Z',
      checks: {
        database: { status: 'healthy' },
        stripe: { status: 'healthy' },
        environment: { status: 'unhealthy', missingCount: 2 },
      },
    });

    await GET(req());

    expect(mocks.sendSupportEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('environment: unhealthy (2 required environment variable(s)'),
      }),
    );
  });

  it('pages when the health checks themselves cannot run', async () => {
    mocks.runHealthChecks.mockRejectedValue(new Error('neon client exploded'));

    const response = await GET(req());

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ status: 'probe_failed', alerted: true });
    expect(mocks.sendSupportEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendSupportEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining('CRITICAL') }),
    );
  });
});

import {
  createUpstashKeyValueStore,
  type KeyValueStore,
  type UpstashRedisLike,
} from '@agiworkforce/key-value';

function asKeyValueStore(client: unknown): KeyValueStore {
  return createUpstashKeyValueStore(client as UpstashRedisLike);
}

function fakeStreakRedis() {
  const store = new Map<string, number>();
  return {
    incrby: vi.fn(async (key: string, amount: number) => {
      const next = (store.get(key) ?? 0) + amount;
      store.set(key, next);
      return next;
    }),
    expire: vi.fn(async () => 1),
    del: vi.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
  };
}

describe('health probe consecutive-failure debounce', () => {
  it('holds the page on the first miss and pages on the second consecutive miss', async () => {
    const redis = fakeStreakRedis();
    mocks.getKeyValueStore.mockReturnValue(asKeyValueStore(redis));
    mocks.runHealthChecks.mockResolvedValue(health('unhealthy'));

    const first = await GET(req());
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      status: 'unhealthy',
      alerted: false,
      delivery: 'not_needed',
    });
    expect(mocks.sendSupportEmail).not.toHaveBeenCalled();

    const second = await GET(req());
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({
      status: 'unhealthy',
      alerted: true,
      delivery: 'delivered',
    });
    expect(mocks.sendSupportEmail).toHaveBeenCalledTimes(1);
  });

  it('resets the streak once the platform recovers, so the next miss holds again', async () => {
    const redis = fakeStreakRedis();
    mocks.getKeyValueStore.mockReturnValue(asKeyValueStore(redis));
    mocks.runHealthChecks.mockResolvedValue(health('unhealthy'));
    await GET(req());

    mocks.runHealthChecks.mockResolvedValue(health('healthy'));
    await GET(req());
    expect(redis.del).toHaveBeenCalledWith('agi-health-probe:consecutive-failures');

    mocks.runHealthChecks.mockResolvedValue(health('unhealthy'));
    const afterRecovery = await GET(req());
    expect(await afterRecovery.json()).toMatchObject({ alerted: false });
    expect(mocks.sendSupportEmail).not.toHaveBeenCalled();
  });

  it('fails open and pages on the first miss when redis is unavailable', async () => {
    mocks.getKeyValueStore.mockReturnValue(null);
    mocks.runHealthChecks.mockResolvedValue(health('unhealthy'));

    const response = await GET(req());

    expect(await response.json()).toMatchObject({ alerted: true, delivery: 'delivered' });
    expect(mocks.sendSupportEmail).toHaveBeenCalledTimes(1);
  });

  it('fails open and pages immediately when the streak tracker throws', async () => {
    const redis = fakeStreakRedis();
    redis.incrby.mockRejectedValue(new Error('redis unavailable'));
    mocks.getKeyValueStore.mockReturnValue(asKeyValueStore(redis));
    mocks.runHealthChecks.mockResolvedValue(health('unhealthy'));

    const response = await GET(req());

    expect(await response.json()).toMatchObject({ alerted: true, delivery: 'delivered' });
  });
});
