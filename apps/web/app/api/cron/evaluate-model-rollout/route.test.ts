import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mocks = vi.hoisted(() => ({
  verifyCronRequest: vi.fn((_request: unknown) => true),
  readCohortMetrics: vi.fn(async (_start: Date, _end: Date) => [] as unknown[]),
  recordRolloutBenchmarks: vi.fn(async (_metrics: unknown, _start: Date, _end: Date) => 2),
  purgeExpiredRoutingTraces: vi.fn(async (_config: unknown, _nowMs: number) => 11),
  pageOnCall: vi.fn(async (_severity: string, _subject: string, _text: string) => 'paged'),
  sendSupportEmail: vi.fn(async (_input: unknown) => ({ delivered: true })),
  storeSet: vi.fn(async (_key: string, _value: unknown, _options?: unknown) => true),
}));

vi.mock('@/lib/server/cron-auth', () => ({
  verifyCronRequest: (request: unknown) => mocks.verifyCronRequest(request),
}));

vi.mock('@/lib/server/key-value', () => ({
  getKeyValueStore: () => ({
    set: (key: string, value: unknown, options?: unknown) => mocks.storeSet(key, value, options),
  }),
}));

vi.mock('@/lib/support/handoff/config', () => ({
  getHandoffConfig: () => ({ fallbackEmail: 'ops@example.com' }),
  isValidEmail: (value: string) => value.includes('@'),
}));

vi.mock('@/lib/support/handoff/resend-client', () => ({
  sendSupportEmail: (input: unknown) => mocks.sendSupportEmail(input),
}));

vi.mock('../health-probe/route', () => ({
  pageOnCall: (severity: string, subject: string, text: string) =>
    mocks.pageOnCall(severity, subject, text),
}));

vi.mock('@/lib/services/model-rollout/rollout-evaluation-service', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/services/model-rollout/rollout-evaluation-service')
  >('@/lib/services/model-rollout/rollout-evaluation-service');
  return {
    ...actual,
    readCohortMetrics: (start: Date, end: Date) => mocks.readCohortMetrics(start, end),
    recordRolloutBenchmarks: (metrics: unknown, start: Date, end: Date) =>
      mocks.recordRolloutBenchmarks(metrics, start, end),
    purgeExpiredRoutingTraces: (config: unknown, nowMs: number) =>
      mocks.purgeExpiredRoutingTraces(config, nowMs),
  };
});

import { GET } from './route';

function cohort(overrides: Record<string, unknown>) {
  return {
    slotId: 'coding_balanced',
    cohort: 'control',
    modelKey: 'promoted-model',
    lifecycleStage: 'promoted',
    samples: 100,
    failureRate: 0.01,
    latencyP50Ms: 800,
    latencyP95Ms: 1_200,
    costPerRequestMicrousd: 1_000,
    ...overrides,
  };
}

function request(): NextRequest {
  return new NextRequest('http://localhost:3000/api/cron/evaluate-model-rollout');
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyCronRequest.mockReturnValue(true);
  mocks.readCohortMetrics.mockResolvedValue([]);
  mocks.recordRolloutBenchmarks.mockResolvedValue(2);
  mocks.purgeExpiredRoutingTraces.mockResolvedValue(11);
  mocks.pageOnCall.mockResolvedValue('paged');
  mocks.sendSupportEmail.mockResolvedValue({ delivered: true });
  mocks.storeSet.mockResolvedValue(true);
});

describe('model rollout cron', () => {
  it('refuses a request that is not the scheduler', async () => {
    mocks.verifyCronRequest.mockReturnValue(false);
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(mocks.readCohortMetrics).not.toHaveBeenCalled();
  });

  it('records benchmarks and purges expired traces without paging when cohorts agree', async () => {
    mocks.readCohortMetrics.mockResolvedValue([
      cohort({}),
      cohort({ cohort: 'canary', modelKey: 'candidate-model' }),
    ]);
    const response = await GET(request());
    expect(await response.json()).toMatchObject({
      benchmarks: 2,
      purged: 11,
      alerts: 0,
      paged: 'not_needed',
    });
    expect(mocks.pageOnCall).not.toHaveBeenCalled();
  });

  it('pages on call and emails when a canary regresses', async () => {
    mocks.readCohortMetrics.mockResolvedValue([
      cohort({}),
      cohort({ cohort: 'canary', modelKey: 'candidate-model', failureRate: 0.4 }),
    ]);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(mocks.pageOnCall).toHaveBeenCalledWith(
      'warning',
      expect.stringContaining('model rollout regression'),
      expect.stringContaining('candidate-model'),
    );
    expect(mocks.sendSupportEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ops@example.com' }),
    );
  });

  it('pages once per candidate and kind while the dedup window holds', async () => {
    mocks.readCohortMetrics.mockResolvedValue([
      cohort({}),
      cohort({ cohort: 'canary', modelKey: 'candidate-model', failureRate: 0.4 }),
    ]);
    mocks.storeSet.mockResolvedValue(false);
    const response = await GET(request());
    expect(await response.json()).toMatchObject({ alerts: 1, paged: 'not_needed' });
    expect(mocks.pageOnCall).not.toHaveBeenCalled();
  });

  it('answers 500 rather than half-reporting when the cohort read fails', async () => {
    mocks.readCohortMetrics.mockRejectedValue(new Error('database down'));
    const response = await GET(request());
    expect(response.status).toBe(500);
  });
});
