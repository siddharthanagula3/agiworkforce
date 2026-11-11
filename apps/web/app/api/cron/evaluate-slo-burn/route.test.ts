import { beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@/lib/server/slo/anomaly');

const mocks = vi.hoisted(() => ({
  verifyCronRequest: vi.fn(),
  evaluateBurnRates: vi.fn(),
  evaluateAnomalies: vi.fn(),
  notifyIncident: vi.fn(),
  clearIncident: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/cron-auth', () => ({ verifyCronRequest: mocks.verifyCronRequest }));
vi.mock('@/lib/server/slo/attainment', () => ({ evaluateBurnRates: mocks.evaluateBurnRates }));
vi.mock('@/lib/server/slo/anomaly', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  evaluateAnomalies: mocks.evaluateAnomalies,
}));
vi.mock('@/lib/server/incident/dispatch', () => ({
  notifyIncident: mocks.notifyIncident,
  clearIncident: mocks.clearIncident,
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: mocks.warn, error: mocks.error, debug: vi.fn() },
}));

import { NextRequest } from 'next/server';

import { GET } from './route';

const ROUTE = '/api/cron/evaluate-slo-burn';

function request(): NextRequest {
  return new NextRequest(`https://agiworkforce.com${ROUTE}`);
}

const FAST_BURN = {
  id: 'chat',
  domain: 'Chat',
  window: 'fast' as const,
  hours: 1,
  burnRate: 22.5,
  threshold: 14.4,
  samples: 400,
  attainment: 0.775,
  severity: 'critical' as const,
};

const COST_ANOMALY = {
  id: 'turn-cost' as const,
  sloId: 'billing-usage',
  unit: 'uUSD' as const,
  statement: 'What a served turn costs the platform.',
  severity: 'critical' as const,
  recent: 2_400,
  baseline: 1_000,
  ratio: 2.4,
  threshold: 2,
  samples: 500,
  baselineSamples: 9_000,
  dedupeKey: 'slo-anomaly:turn-cost:critical',
  owner: null,
};

function clean(alerts: unknown[] = [], failed: unknown[] = []) {
  return { alerts, failed };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyCronRequest.mockReturnValue(true);
  mocks.evaluateBurnRates.mockResolvedValue([]);
  mocks.evaluateAnomalies.mockResolvedValue(clean());
  mocks.clearIncident.mockResolvedValue(undefined);
  mocks.notifyIncident.mockResolvedValue({
    level: 1,
    notified: ['primary'],
    delivery: 'delivered',
    paged: 'paged',
    channel: 'paged',
  });
});

describe(`GET ${ROUTE}`, () => {
  it('admits only the scheduler credential, and measures nothing without it', async () => {
    mocks.verifyCronRequest.mockReturnValue(false);

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mocks.evaluateBurnRates).not.toHaveBeenCalled();
  });

  it('pages nobody while every objective is inside its budget', async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      burning: 0,
      paged: 'not_needed',
      anomalies: { evaluation: 'completed', detected: 0 },
    });
    expect(mocks.notifyIncident).not.toHaveBeenCalled();
  });

  it('pages on a cost spike no objective can burn for, as its own incident', async () => {
    mocks.evaluateAnomalies.mockResolvedValue(clean([COST_ANOMALY]));

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(mocks.notifyIncident).toHaveBeenCalledTimes(1);
    expect(mocks.notifyIncident).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'slo-anomaly:critical',
        severity: 'critical',
        source: 'slo-anomaly',
        text: expect.stringContaining('2.40x'),
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      burning: 0,
      anomalies: {
        evaluation: 'completed',
        detected: 1,
        severity: 'critical',
        delivery: 'delivered',
        series: ['turn-cost'],
      },
    });
  });

  it('answers 500 and names the failure when the anomaly read itself fails', async () => {
    mocks.evaluateAnomalies.mockRejectedValue(new Error('connection terminated'));

    const response = await GET(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      burning: 0,
      anomalies: {
        evaluation: 'incomplete',
        detected: 0,
        failedSeries: ['turn-cost', 'turn-latency', 'turn-time-to-first-token'],
      },
    });
    expect(mocks.error).toHaveBeenCalled();
  });

  it('pages the series it could read and answers 500 for the one it could not', async () => {
    mocks.evaluateAnomalies.mockResolvedValue(
      clean([COST_ANOMALY], [{ id: 'turn-latency', error: 'connection terminated' }]),
    );

    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(mocks.notifyIncident).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toMatchObject({
      anomalies: {
        evaluation: 'incomplete',
        detected: 1,
        series: ['turn-cost'],
        failedSeries: ['turn-latency'],
      },
    });
    expect(mocks.clearIncident).not.toHaveBeenCalledWith(expect.stringContaining('slo-anomaly'));
  });

  it('answers 500 when a detected anomaly reached no transport', async () => {
    mocks.evaluateAnomalies.mockResolvedValue(clean([COST_ANOMALY]));
    mocks.notifyIncident.mockResolvedValue({
      level: 1,
      notified: ['primary'],
      delivery: 'undeliverable',
      paged: 'unconfigured',
      channel: 'unconfigured',
      reason: 'no api key',
    });

    const response = await GET(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      burning: 0,
      anomalies: { detected: 1, delivery: 'undeliverable', paged: 'unconfigured' },
    });
  });

  it('keeps the burn receipt separate from a failed anomaly delivery', async () => {
    mocks.evaluateBurnRates.mockResolvedValue([FAST_BURN]);
    mocks.evaluateAnomalies.mockResolvedValue(clean([COST_ANOMALY]));
    mocks.notifyIncident
      .mockResolvedValueOnce({
        level: 1,
        notified: ['primary'],
        delivery: 'undeliverable',
        paged: 'unconfigured',
        channel: 'unconfigured',
      })
      .mockResolvedValueOnce({
        level: 1,
        notified: ['primary'],
        delivery: 'delivered',
        paged: 'paged',
        channel: 'paged',
      });

    const response = await GET(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      delivery: 'delivered',
      anomalies: { delivery: 'undeliverable' },
    });
  });

  it('retires the escalation clock of every severity that is no longer firing', async () => {
    await GET(request());

    expect(mocks.clearIncident.mock.calls.map(([key]) => key).sort()).toEqual([
      'slo-anomaly:critical',
      'slo-anomaly:warning',
      'slo-burn:critical',
      'slo-burn:warning',
    ]);
  });

  it('keeps the severity that is still firing and retires the other', async () => {
    mocks.evaluateBurnRates.mockResolvedValue([FAST_BURN]);

    await GET(request());

    expect(mocks.clearIncident).toHaveBeenCalledWith('slo-burn:warning');
    expect(mocks.clearIncident).not.toHaveBeenCalledWith('slo-burn:critical');
  });

  it('retires nothing when the burn evaluation itself failed', async () => {
    mocks.evaluateBurnRates.mockRejectedValue(new Error('connection terminated'));

    await GET(request());

    expect(mocks.clearIncident).not.toHaveBeenCalled();
  });

  it('retires nothing for the anomaly family while a series is unread', async () => {
    mocks.evaluateAnomalies.mockResolvedValue(
      clean([], [{ id: 'turn-cost', error: 'connection terminated' }]),
    );

    await GET(request());

    expect(mocks.clearIncident).not.toHaveBeenCalledWith(expect.stringContaining('slo-anomaly'));
    expect(mocks.clearIncident).toHaveBeenCalledWith('slo-burn:critical');
  });

  it('raises an incident naming the burning domain when a fast burn fires', async () => {
    mocks.evaluateBurnRates.mockResolvedValue([FAST_BURN]);

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(mocks.notifyIncident).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'critical',
        subject: expect.stringContaining('Chat'),
        text: expect.stringContaining('burning 22.5x'),
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      burning: 1,
      severity: 'critical',
      paged: 'paged',
      escalationLevel: 1,
    });
  });

  it('warns rather than pages critical when only the slow window is burning', async () => {
    mocks.evaluateBurnRates.mockResolvedValue([
      { ...FAST_BURN, window: 'slow', hours: 6, burnRate: 7.2, threshold: 6, severity: 'warning' },
    ]);

    await GET(request());

    expect(mocks.notifyIncident).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'warning', subject: expect.stringContaining('WARNING') }),
    );
  });

  it('answers 200 when only the pager or channel accepted the alert', async () => {
    mocks.evaluateBurnRates.mockResolvedValue([FAST_BURN]);
    mocks.notifyIncident.mockResolvedValue({
      level: 1,
      notified: ['primary'],
      delivery: 'delivered',
      paged: 'unconfigured',
      channel: 'paged',
      reason: 'no api key',
    });

    const response = await GET(request());

    expect(response.status).toBe(200);
  });

  it('answers 500 when neither the email nor the pager reached a human', async () => {
    mocks.evaluateBurnRates.mockResolvedValue([FAST_BURN]);
    mocks.notifyIncident.mockResolvedValue({
      level: 3,
      notified: ['primary'],
      delivery: 'undeliverable',
      paged: 'unconfigured',
      channel: 'unconfigured',
      reason: 'no api key',
    });

    const response = await GET(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ delivery: 'undeliverable' });
  });

  it('answers 500 without leaking the failure to the scheduler body', async () => {
    mocks.evaluateBurnRates.mockRejectedValue(new Error('connection terminated'));

    const response = await GET(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Internal server error' });
    expect(mocks.error).toHaveBeenCalled();
  });
});
