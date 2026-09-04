import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  checkAlerts: vi.fn(),
  pageOnCall: vi.fn(),
  consumePendingSecurityAnomalyCheck: vi.fn(),
}));

vi.mock('@/lib/services/security-monitoring-service', () => ({
  SecurityMonitoringService: { checkAlerts: mocks.checkAlerts },
}));
vi.mock('../health-probe/route', () => ({ pageOnCall: mocks.pageOnCall }));
vi.mock('@/lib/security-audit', () => ({
  consumePendingSecurityAnomalyCheck: mocks.consumePendingSecurityAnomalyCheck,
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET } from './route';

const CRON_SECRET = 'anomaly-drill-secret';
const savedEnv = { ...process.env };

function req(withAuth = true): Request {
  return new Request('http://localhost/api/cron/page-security-anomalies', {
    headers: withAuth ? { authorization: `Bearer ${CRON_SECRET}` } : {},
  });
}

function alert(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    alert_name: 'High Auth Failures',
    triggered: true,
    current_count: 80,
    threshold: 50,
    window_minutes: 15,
    severity: 'warning' as const,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...savedEnv, CRON_SECRET };
  mocks.checkAlerts.mockResolvedValue([]);
  mocks.pageOnCall.mockResolvedValue('paged');
  mocks.consumePendingSecurityAnomalyCheck.mockResolvedValue(null);
});

afterEach(() => {
  process.env = { ...savedEnv };
});

describe('GET /api/cron/page-security-anomalies', () => {
  it('401s without the cron auth header and never evaluates alerts', async () => {
    const response = await GET(req(false) as never);

    expect(response.status).toBe(401);
    expect(mocks.checkAlerts).not.toHaveBeenCalled();
  });

  it('accepts a correct bearer cron auth header', async () => {
    const response = await GET(req() as never);

    expect(response.status).toBe(200);
    expect(mocks.checkAlerts).toHaveBeenCalledOnce();
  });

  it('does nothing when no threshold has been crossed', async () => {
    mocks.checkAlerts.mockResolvedValue([alert({ triggered: false })]);

    const response = await GET(req() as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ triggered: 0, paged: 'not_needed' });
    expect(mocks.pageOnCall).not.toHaveBeenCalled();
  });

  it('pages on-call when a threshold is triggered', async () => {
    mocks.checkAlerts.mockResolvedValue([alert()]);

    const response = await GET(req() as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      triggered: 1,
      severity: 'warning',
      paged: 'paged',
    });
    expect(mocks.pageOnCall).toHaveBeenCalledWith(
      'warning',
      expect.stringContaining('High Auth Failures'),
      expect.stringContaining('80/50'),
    );
  });

  it('escalates to critical when any triggered alert is critical', async () => {
    mocks.checkAlerts.mockResolvedValue([
      alert({ severity: 'warning' }),
      alert({ alert_name: 'Suspicious Activity', severity: 'critical' }),
    ]);

    await GET(req() as never);

    expect(mocks.pageOnCall).toHaveBeenCalledWith(
      'critical',
      expect.any(String),
      expect.any(String),
    );
  });

  it('ignores an alert that did not cross its threshold while paging for one that did', async () => {
    mocks.checkAlerts.mockResolvedValue([
      alert({ alert_name: 'Rate Limit Abuse', triggered: false }),
      alert({ alert_name: 'Invalid Signatures', severity: 'critical' }),
    ]);

    const response = await GET(req() as never);

    await expect(response.json()).resolves.toMatchObject({ triggered: 1 });
    expect(mocks.pageOnCall).toHaveBeenCalledWith(
      'critical',
      expect.not.stringContaining('Rate Limit Abuse'),
      expect.any(String),
    );
  });

  it('still returns 200 when no pager is configured, so the cron never fails on that alone', async () => {
    mocks.checkAlerts.mockResolvedValue([alert()]);
    mocks.pageOnCall.mockResolvedValue('unconfigured');

    const response = await GET(req() as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ paged: 'unconfigured' });
  });

  it('returns 500 when the threshold check itself fails', async () => {
    mocks.checkAlerts.mockRejectedValue(new Error('security_audit_logs unavailable'));

    const response = await GET(req() as never);

    expect(response.status).toBe(500);
    expect(mocks.pageOnCall).not.toHaveBeenCalled();
  });

  it('skips Postgres entirely when no security events were written since the last check', async () => {
    mocks.consumePendingSecurityAnomalyCheck.mockResolvedValue(false);

    const response = await GET(req() as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ triggered: 0, paged: 'not_needed' });
    expect(mocks.checkAlerts).not.toHaveBeenCalled();
  });

  it('runs the threshold check when security events were written since the last check', async () => {
    mocks.consumePendingSecurityAnomalyCheck.mockResolvedValue(true);
    mocks.checkAlerts.mockResolvedValue([alert()]);

    const response = await GET(req() as never);

    expect(response.status).toBe(200);
    expect(mocks.checkAlerts).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toMatchObject({ triggered: 1 });
  });

  it('falls through to the threshold check when the activity marker cannot be read', async () => {
    mocks.consumePendingSecurityAnomalyCheck.mockResolvedValue(null);

    const response = await GET(req() as never);

    expect(response.status).toBe(200);
    expect(mocks.checkAlerts).toHaveBeenCalledOnce();
  });
});
