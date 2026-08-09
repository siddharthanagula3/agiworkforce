/**
 * The probe is the only thing that turns a failing health check into a message
 * a human receives. Two properties matter more than the happy path: it must not
 * page for a Stripe-only degradation as if the platform were down, and it must
 * NOT report success when the alert never left the building.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyCronRequest: vi.fn(),
  runHealthChecks: vi.fn(),
  sendSupportEmail: vi.fn(),
  getHandoffConfig: vi.fn(),
}));

vi.mock('@/lib/server/cron-auth', () => ({ verifyCronRequest: mocks.verifyCronRequest }));
vi.mock('@/lib/server/health-check', () => ({ runHealthChecks: mocks.runHealthChecks }));
vi.mock('@/lib/support/handoff/resend-client', () => ({
  sendSupportEmail: mocks.sendSupportEmail,
}));
vi.mock('@/lib/support/handoff/config', () => ({ getHandoffConfig: mocks.getHandoffConfig }));
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
});

describe('health probe schedule', () => {
  // A probe nothing invokes is the exact defect this route was written to close,
  // so the registration is asserted rather than assumed. The root vercel.json is
  // the only cron registry — the Vercel project's Root Directory is the repo root.
  const crons = (
    JSON.parse(readFileSync(resolve(process.cwd(), '../../vercel.json'), 'utf8')) as {
      crons?: Array<{ path: string; schedule: string }>;
    }
  ).crons;

  it('registers the probe on a daily schedule the Hobby plan accepts', () => {
    const entry = crons?.find((cron) => cron.path === '/api/cron/health-probe');
    expect(entry).toBeDefined();
    // Daily, and every field before the day-of-month must be a fixed value:
    // Hobby REJECTS the whole deploy for any sub-daily cron
    // (PROD-VERCEL-DEPLOY-TOPOLOGY-01), which would take the site down to
    // improve its monitoring. Tighten only after the Pro upgrade.
    expect(entry?.schedule).toMatch(/^\d+ \d+ \* \* \*$/u);
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

    // 500 is the point: a silent 200 here would be an alerting path that
    // reports success while the incident goes unread.
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      alerted: true,
      delivery: 'undeliverable',
      reason: 'not_configured',
    });
  });

  it('pages when a dependency hangs instead of stalling until the platform kills it', async () => {
    // The likeliest outage this probe exists for: Neon or Stripe stops
    // answering rather than refusing. Without the race the invocation is
    // terminated mid-await and NO mail is sent — a silent failure of the one
    // path that reaches a human.
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
    // health-check.ts withholds the NAMES as an information-disclosure risk, so
    // the count is the only detail an environment outage can carry.
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
