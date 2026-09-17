import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const mocks = vi.hoisted(() => ({
  claimJobs: vi.fn(),
  completeJob: vi.fn(),
  failJob: vi.fn(),
  reapExpiredJobLeases: vi.fn(),
  pruneFinishedJobs: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/observability/error-capture', () => ({ captureWorkerFailure: vi.fn() }));
vi.mock('@/lib/observability/span', () => ({
  withSpan: (_name: string, _options: unknown, run: (span: unknown) => unknown) =>
    run({ setAttributes: vi.fn() }),
}));
vi.mock('../job-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../job-service')>();
  return {
    ...actual,
    claimJobs: mocks.claimJobs,
    completeJob: mocks.completeJob,
    failJob: mocks.failJob,
    reapExpiredJobLeases: mocks.reapExpiredJobLeases,
    pruneFinishedJobs: mocks.pruneFinishedJobs,
  };
});

import { drainBackgroundJobs } from '../job-drain';
import { PermanentJobError, type BackgroundJob } from '../job-service';

const db = {} as DatabaseAdapter;

function job(overrides: Partial<BackgroundJob> = {}): BackgroundJob {
  return {
    id: 'job-1',
    queue: 'notifications',
    kind: 'notifications.schedule-completed',
    userId: 'user-1',
    organizationId: null,
    tenantKey: 'user:user-1',
    payload: {},
    priority: 0,
    status: 'running',
    attempts: 1,
    maxAttempts: 6,
    runAfter: '2026-09-17T00:00:00.000Z',
    leaseExpiresAt: '2026-09-17T00:00:30.000Z',
    idempotencyKey: null,
    lastError: null,
    deadReason: null,
    deadLetteredAt: null,
    createdAt: '2026-09-17T00:00:00.000Z',
    updatedAt: '2026-09-17T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.reapExpiredJobLeases.mockResolvedValue({ requeued: 0, deadLettered: 0 });
  mocks.pruneFinishedJobs.mockResolvedValue(0);
  mocks.completeJob.mockResolvedValue(true);
  mocks.failJob.mockResolvedValue('retry');
  mocks.claimJobs.mockResolvedValue([]);
});

describe('drainBackgroundJobs', () => {
  it('reaps expired leases before it claims anything', async () => {
    const order: string[] = [];
    mocks.reapExpiredJobLeases.mockImplementation(async () => {
      order.push('reap');
      return { requeued: 1, deadLettered: 0 };
    });
    mocks.claimJobs.mockImplementation(async () => {
      order.push('claim');
      return [];
    });

    const summary = await drainBackgroundJobs({
      db,
      handlers: {},
      budgetMs: 120_000,
      maxInFlight: 4,
    });

    expect(order[0]).toBe('reap');
    expect(summary.reaped).toEqual({ requeued: 1, deadLettered: 0 });
    expect(summary.drained).toBe(true);
  });

  it('runs a claimed job through its handler and settles it', async () => {
    const handler = vi.fn(async () => ({ pushed: true }));
    mocks.claimJobs.mockResolvedValueOnce([job()]).mockResolvedValue([]);

    const summary = await drainBackgroundJobs({
      db,
      handlers: { 'notifications.schedule-completed': handler },
      budgetMs: 120_000,
      maxInFlight: 4,
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(mocks.completeJob).toHaveBeenCalledWith(db, expect.objectContaining({ id: 'job-1' }), {
      pushed: true,
    });
    expect(summary).toMatchObject({ claimed: 1, succeeded: 1, retried: 0, deadLettered: 0 });
  });

  it('fails a job whose handler throws and counts the outcome the queue decided', async () => {
    mocks.claimJobs.mockResolvedValueOnce([job()]).mockResolvedValue([]);
    mocks.failJob.mockResolvedValue('dead');

    const summary = await drainBackgroundJobs({
      db,
      handlers: {
        'notifications.schedule-completed': async () => {
          throw new Error('handler exploded');
        },
      },
      budgetMs: 120_000,
      maxInFlight: 4,
    });

    expect(mocks.failJob).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ id: 'job-1' }),
      expect.any(Error),
    );
    expect(summary).toMatchObject({ succeeded: 0, deadLettered: 1 });
  });

  it('dead-letters a job whose kind has no handler instead of retrying it forever', async () => {
    mocks.claimJobs
      .mockResolvedValueOnce([job({ kind: 'email.schedule-completed' })])
      .mockResolvedValue([]);
    mocks.failJob.mockResolvedValue('dead');

    await drainBackgroundJobs({ db, handlers: {}, budgetMs: 120_000, maxInFlight: 4 });

    const error = (mocks.failJob.mock.calls as unknown as unknown[][])[0]?.[2];
    expect(error).toBeInstanceOf(PermanentJobError);
  });

  it('tells the handler when it is running the final attempt', async () => {
    mocks.claimJobs
      .mockResolvedValueOnce([job({ attempts: 6, maxAttempts: 6 })])
      .mockResolvedValue([]);
    const handler = vi.fn(async () => undefined);

    await drainBackgroundJobs({
      db,
      handlers: { 'notifications.schedule-completed': handler },
      budgetMs: 120_000,
      maxInFlight: 4,
    });

    expect((handler.mock.calls as unknown as unknown[][])[0]?.[0]).toMatchObject({
      isFinalAttempt: true,
    });
  });

  it('claims only from queues whose lease fits the remaining budget', async () => {
    await drainBackgroundJobs({ db, handlers: {}, budgetMs: 40_000, maxInFlight: 4 });

    const queues = (
      mocks.claimJobs.mock.calls as unknown as Array<[unknown, { queues: string[] }]>
    )[0]?.[1]?.queues as string[];
    expect(queues).toContain('notifications');
    expect(queues).not.toContain('data-deletion');
  });

  it('claims nothing when no queue lease fits the budget, and says it did not drain', async () => {
    const summary = await drainBackgroundJobs({
      db,
      handlers: {},
      budgetMs: 6_000,
      maxInFlight: 4,
    });

    expect(mocks.claimJobs).not.toHaveBeenCalled();
    expect(summary.drained).toBe(false);
  });

  it('stops a handler that ignores its budget and lets the queue decide the outcome', async () => {
    vi.useFakeTimers();
    mocks.claimJobs.mockResolvedValueOnce([job()]).mockResolvedValue([]);

    const draining = drainBackgroundJobs({
      db,
      handlers: {
        'notifications.schedule-completed': () => new Promise(() => undefined),
      },
      budgetMs: 60_000,
      maxInFlight: 1,
    });
    await vi.advanceTimersByTimeAsync(30_000);
    await draining;
    vi.useRealTimers();

    expect(mocks.failJob).toHaveBeenCalled();
    expect(String((mocks.failJob.mock.calls as unknown as unknown[][])[0]?.[2])).toContain(
      'time budget',
    );
  });
});
