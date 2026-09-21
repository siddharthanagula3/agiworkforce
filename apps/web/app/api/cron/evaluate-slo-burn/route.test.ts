import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyCronRequest: vi.fn(),
  evaluateBurnRates: vi.fn(),
  evaluateAnomalies: vi.fn(),
  notifyIncident: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/cron-auth', () => ({ verifyCronRequest: mocks.verifyCronRequest }));
vi.mock('@/lib/server/slo/attainment', () => ({ evaluateBurnRates: mocks.evaluateBurnRates }));
vi.mock('@/lib/server/slo/anomaly', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/slo/anomaly')>()),
  evaluateAnomalies: mocks.evaluateAnomalies,
}));
vi.mock('@/lib/server/incident/dispatch', () => ({ notifyIncident: mocks.notifyIncident }));
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyCronRequest.mockReturnValue(true);
  mocks.evaluateBurnRates.mockResolvedValue([]);
  mocks.evaluateAnomalies.mockResolvedValue([]);
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
      anomalies: { detected: 0 },
    });
    expect(mocks.notifyIncident).not.toHaveBeenCalled();
  });

  it('pages on a cost spike no objective can burn for, as its own incident', async () => {
    mocks.evaluateAnomalies.mockResolvedValue([COST_ANOMALY]);

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
      anomalies: { detected: 1, severity: 'critical', series: ['turn-cost'] },
    });
  });

  it('keeps answering the scheduler when the anomaly read itself fails', async () => {
    mocks.evaluateAnomalies.mockRejectedValue(new Error('connection terminated'));

    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ anomalies: { detected: 0 } });
    expect(mocks.error).toHaveBeenCalled();
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
