import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const mocks = vi.hoisted(() => ({
  claimJobs: vi.fn(),
  completeJob: vi.fn(),
  failJob: vi.fn(),
  reapExpiredJobLeases: vi.fn(),
  pruneFinishedJobs: vi.fn(),
  readJobQueueStats: vi.fn(),
  recordQueueDepth: vi.fn(),
  recordQueueWait: vi.fn(),
  recordQueueAge: vi.fn(),
  notifyIncident: vi.fn(),
  clearIncident: vi.fn(),
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
vi.mock('@/lib/observability/metrics', () => ({
  recordQueueDepth: mocks.recordQueueDepth,
  recordQueueWait: mocks.recordQueueWait,
  recordQueueAge: mocks.recordQueueAge,
}));
vi.mock('@/lib/server/incident/dispatch', () => ({
  notifyIncident: mocks.notifyIncident,
  clearIncident: mocks.clearIncident,
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
    readJobQueueStats: mocks.readJobQueueStats,
  };
});

import { getTraceContext } from '@/lib/observability/trace-context';

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
    originRegion: null,
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
  mocks.readJobQueueStats.mockResolvedValue([]);
  mocks.notifyIncident.mockResolvedValue({ paged: 'paged', delivery: 'delivered', level: 1 });
  mocks.clearIncident.mockResolvedValue(undefined);
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

  it('runs the job inside the trace the payload carried from the enqueuer', async () => {
    const traceId = 'a'.repeat(32);
    mocks.claimJobs
      .mockResolvedValueOnce([
        job({ payload: { traceparent: `00-${traceId}-${'b'.repeat(16)}-01` } }),
      ])
      .mockResolvedValue([]);
    let seen: string | null = null;
    const handler = vi.fn(async () => {
      seen = getTraceContext()?.traceId ?? null;
    });

    await drainBackgroundJobs({
      db,
      handlers: { 'notifications.schedule-completed': handler },
      budgetMs: 120_000,
      maxInFlight: 4,
    });

    expect(seen).toBe(traceId);
  });

  it('records how long each claimed job waited to become runnable', async () => {
    const runAfter = '2026-09-17T00:00:00.000Z';
    mocks.claimJobs.mockResolvedValueOnce([job({ runAfter })]).mockResolvedValue([]);
    const claimedAt = Date.parse(runAfter) + 7_500;

    await drainBackgroundJobs({
      db,
      handlers: { 'notifications.schedule-completed': async () => undefined },
      budgetMs: 120_000,
      maxInFlight: 4,
      now: () => claimedAt,
    });

    expect(mocks.recordQueueWait).toHaveBeenCalledWith({
      queue: 'notifications',
      waitMs: 7_500,
    });
  });

  it('records the backlog every queue is left holding', async () => {
    mocks.readJobQueueStats.mockResolvedValue([
      {
        queue: 'notifications',
        queued: 3,
        running: 1,
        dead: 2,
        maxConcurrency: 4,
        oldestQueuedAt: null,
        oldestQueuedAgeMs: 0,
        stuck: 0,
      },
    ]);

    await drainBackgroundJobs({ db, handlers: {}, budgetMs: 120_000, maxInFlight: 4 });

    expect(mocks.recordQueueDepth).toHaveBeenCalledWith({
      queue: 'notifications',
      status: 'queued',
      count: 3,
    });
    expect(mocks.recordQueueDepth).toHaveBeenCalledWith({
      queue: 'notifications',
      status: 'running',
      count: 1,
    });
    expect(mocks.recordQueueDepth).toHaveBeenCalledWith({
      queue: 'notifications',
      status: 'dead',
      count: 2,
    });
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

describe('background queue health', () => {
  function stats(overrides: Record<string, unknown> = {}) {
    return [
      {
        queue: 'notifications',
        queued: 0,
        running: 0,
        dead: 0,
        maxConcurrency: 4,
        oldestQueuedAt: null,
        oldestQueuedAgeMs: 0,
        stuck: 0,
        ...overrides,
      },
    ];
  }

  async function drain() {
    return drainBackgroundJobs({ db, handlers: {}, budgetMs: 120_000, maxInFlight: 4 });
  }

  it('exports the queue age and the stuck count alongside the depth', async () => {
    mocks.readJobQueueStats.mockResolvedValue(stats({ oldestQueuedAgeMs: 61_000, stuck: 2 }));

    await drain();

    expect(mocks.recordQueueAge).toHaveBeenCalledWith({
      queue: 'notifications',
      oldestQueuedAgeMs: 61_000,
      stuck: 2,
    });
  });

  it('pages when a job is running on a lease nobody renewed', async () => {
    mocks.readJobQueueStats.mockResolvedValue(stats({ stuck: 3 }));

    const summary = await drain();

    expect(mocks.notifyIncident).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'job-health:notifications', severity: 'warning' }),
    );
    expect(summary.unhealthyQueues).toEqual(['notifications']);
  });

  it('pages at critical when a queue has not been picked up for an hour', async () => {
    mocks.readJobQueueStats.mockResolvedValue(stats({ queued: 4, oldestQueuedAgeMs: 3_600_000 }));

    await drain();

    expect(mocks.notifyIncident).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'critical', source: 'job-health' }),
    );
  });

  it('clears the incident once the queue drains again, so it can fire next time', async () => {
    mocks.readJobQueueStats.mockResolvedValue(stats());

    const summary = await drain();

    expect(mocks.notifyIncident).not.toHaveBeenCalled();
    expect(mocks.clearIncident).toHaveBeenCalledWith('job-health:notifications');
    expect(summary.unhealthyQueues).toEqual([]);
  });
});
