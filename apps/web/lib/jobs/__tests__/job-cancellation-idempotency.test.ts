import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('server-only', () => ({}));

import { calculateDelay } from '@/lib/retry';

import { computeJobBackoffSeconds, JOB_QUEUE_POLICIES } from '../job-queues';
import {
  BACKGROUND_JOB_CANCELLATION,
  acknowledgeJobCancellation,
  isJobCancellationRequested,
  reapAbandonedCancellations,
  readJobCancellation,
  requestJobCancellation,
  watchJobCancellation,
} from '../cancellation';
import {
  JOB_RETRY_REASON,
  PermanentJobError,
  claimJobs,
  classifyJobFailure,
  completeJob,
  currentWorkerId,
  enqueueJob,
  failJob,
} from '../job-service';

function database(
  query: ReturnType<typeof vi.fn>,
  execute: ReturnType<typeof vi.fn> = vi.fn(async () => 1),
): DatabaseAdapter {
  return {
    query,
    execute,
    transaction: vi.fn(async (callback: (db: DatabaseAdapter) => Promise<unknown>) =>
      callback(database(query, execute)),
    ),
    withUser: vi.fn(),
    dispose: vi.fn(),
  } as unknown as DatabaseAdapter;
}

const claimedRow = {
  id: 'job-1',
  queue: 'media-generation',
  kind: 'media-generation.image-attempt',
  user_id: 'user-1',
  organization_id: null,
  tenant_key: 'user:user-1',
  payload: { jobId: 'image-1' },
  priority: 0,
  status: 'running',
  attempts: 1,
  max_attempts: 4,
  run_after: '2026-09-18T00:00:00.000Z',
  lease_expires_at: '2026-09-18T00:03:00.000Z',
  worker_id: 'iad1:42:abcd1234',
  idempotency_key: 'image-job:image-1:0',
  last_error: null,
  retry_reason: null,
  dead_reason: null,
  dead_lettered_at: null,
  cancel_requested_at: null,
  cancel_requested_by: null,
  cancel_reason: null,
  usage: null,
  origin_region: null,
  created_at: '2026-09-18T00:00:00.000Z',
  updated_at: '2026-09-18T00:00:00.000Z',
};

describe('worker ownership', () => {
  it('stamps the claiming worker onto the row and hands it back on the job', async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('pg_advisory_xact_lock')) return [];
      return [claimedRow];
    });

    const [job] = await claimJobs(database(query), { limit: 1, workerId: 'worker-a' });

    expect(job?.workerId).toBe('iad1:42:abcd1234');
    const [sql, params] = query.mock.calls[1] as unknown as [string, unknown[]];
    expect(sql).toContain('worker_id = $8::text');
    expect(params[7]).toBe('worker-a');
  });

  it('gives this process one stable identity when the caller names none', async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('pg_advisory_xact_lock')) return [];
      return [];
    });

    await claimJobs(database(query), { limit: 1 });
    const [, params] = query.mock.calls[1] as unknown as [string, unknown[]];

    expect(params[7]).toBe(currentWorkerId());
    expect(String(params[7]).length).toBeLessThanOrEqual(128);
  });

  it('fences a settle on the worker that holds the lease', async () => {
    const execute = vi.fn(async () => 0);
    const db = database(vi.fn(), execute);

    await expect(
      completeJob(db, { id: 'job-1', attempts: 1, workerId: 'worker-a' }, { ok: true }),
    ).resolves.toBe(false);

    const [sql, params] = execute.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('worker_id is not distinct from $4::text');
    expect(params[3]).toBe('worker-a');
  });

  it('fences a failure on the same worker and releases the lease on retry', async () => {
    const execute = vi.fn(async () => 1);
    await failJob(
      database(vi.fn(), execute),
      { id: 'job-1', queue: 'email', attempts: 1, maxAttempts: 8, workerId: 'worker-a' },
      new Error('fetch failed'),
    );

    const [sql, params] = execute.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('worker_id = null');
    expect(sql).toContain('worker_id is not distinct from $6::text');
    expect(params[5]).toBe('worker-a');
  });
});

describe('usage', () => {
  it('records what the job consumed on the job rather than inside its result', async () => {
    const execute = vi.fn(async () => 1);
    await completeJob(
      database(vi.fn(), execute),
      { id: 'job-1', attempts: 1, workerId: 'worker-a' },
      { frames: 5 },
      { costMicrousd: 1_250, units: 5, durationMs: 9_000 },
    );

    const [sql, params] = execute.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('usage = coalesce($5::jsonb, usage)');
    expect(JSON.parse(params[4] as string)).toEqual({
      costMicrousd: 1_250,
      units: 5,
      durationMs: 9_000,
    });
  });

  it('leaves the stored usage alone when a job reports none', async () => {
    const execute = vi.fn(async () => 1);
    await completeJob(database(vi.fn(), execute), { id: 'job-1', attempts: 1 }, null);
    const [, params] = execute.mock.calls[0] as unknown as [string, unknown[]];
    expect(params[4]).toBeNull();
  });
});

describe('cancellation', () => {
  it('cancels a queued job outright because no worker holds it', async () => {
    const query = vi.fn().mockResolvedValueOnce([{ id: 'job-1' }]);

    await expect(
      requestJobCancellation(database(query), {
        jobId: 'job-1',
        userId: 'user-1',
        requestedBy: 'user-1',
      }),
    ).resolves.toBe('cancelled');

    const [sql] = query.mock.calls[0] as unknown as [string];
    expect(sql).toContain("status = 'queued'");
    expect(sql).toContain("set status = 'cancelled'");
  });

  it('only records the request against a running job, leaving the lease with its worker', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'job-1' }]);

    await expect(
      requestJobCancellation(database(query), {
        jobId: 'job-1',
        userId: 'user-1',
        requestedBy: 'user-1',
        reason: 'the user closed the tab',
      }),
    ).resolves.toBe('requested');

    const [sql] = query.mock.calls[1] as unknown as [string];
    expect(sql).toContain("status = 'running'");
    expect(sql).not.toContain("set status = 'cancelled'");
    expect(sql).not.toContain('lease_expires_at = null');
  });

  it('tells a caller when the job has already finished or was never there', async () => {
    const settled = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: 'succeeded' }]);
    await expect(
      requestJobCancellation(database(settled), {
        jobId: 'job-1',
        userId: 'user-1',
        requestedBy: 'user-1',
      }),
    ).resolves.toBe('not-cancellable');

    const missing = vi.fn().mockResolvedValue([]);
    await expect(
      requestJobCancellation(database(missing), { jobId: 'job-9', requestedBy: 'user-1' }),
    ).resolves.toBe('unknown');
  });

  it('acknowledges under the worker fence and keeps the partial output', async () => {
    const execute = vi.fn(async () => 1);
    await expect(
      acknowledgeJobCancellation(
        database(vi.fn(), execute),
        { id: 'job-1', attempts: 1, workerId: 'worker-a' },
        { frames: 3 },
      ),
    ).resolves.toBe(true);

    const [sql, params] = execute.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('worker_id is not distinct from $3::text');
    expect(sql).toContain('result = coalesce($4::jsonb, result)');
    expect(params[2]).toBe('worker-a');
    expect(JSON.parse(params[3] as string)).toEqual({ frames: 3 });
    expect(BACKGROUND_JOB_CANCELLATION.partialOutputRetained).toBe(true);
  });

  it('refuses to acknowledge for a worker that no longer owns the lease', async () => {
    const execute = vi.fn(async () => 0);
    await expect(
      acknowledgeJobCancellation(database(vi.fn(), execute), {
        id: 'job-1',
        attempts: 1,
        workerId: 'worker-stale',
      }),
    ).resolves.toBe(false);
  });

  it('reads the request a worker polls for, and reports a cancelled row as requested', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        status: 'running',
        cancel_requested_at: '2026-09-18T00:01:00.000Z',
        cancel_requested_by: 'user-1',
        cancel_reason: 'the user closed the tab',
        worker_id: 'worker-a',
      },
    ]);
    const db = database(query);

    await expect(readJobCancellation(db, 'job-1')).resolves.toEqual({
      status: 'running',
      requestedAt: '2026-09-18T00:01:00.000Z',
      requestedBy: 'user-1',
      reason: 'the user closed the tab',
      workerId: 'worker-a',
    });
    await expect(isJobCancellationRequested(db, 'job-1')).resolves.toBe(true);

    const quiet = database(
      vi.fn().mockResolvedValue([
        {
          status: 'running',
          cancel_requested_at: null,
          cancel_requested_by: null,
          cancel_reason: null,
          worker_id: 'worker-a',
        },
      ]),
    );
    await expect(isJobCancellationRequested(quiet, 'job-1')).resolves.toBe(false);
  });

  it('propagates a recorded cancellation onto the handler AbortSignal', async () => {
    vi.useFakeTimers();
    try {
      const query = vi.fn().mockResolvedValue([
        {
          status: 'running',
          cancel_requested_at: '2026-09-18T00:01:00.000Z',
          cancel_requested_by: 'user-1',
          cancel_reason: null,
          worker_id: 'worker-a',
        },
      ]);
      const controller = new AbortController();
      const watch = watchJobCancellation(database(query), { id: 'job-1' }, controller, {
        pollMs: 250,
      });

      await vi.advanceTimersByTimeAsync(300);
      expect(controller.signal.aborted).toBe(true);
      watch.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('finishes a cancellation whose worker died holding the lease', async () => {
    const execute = vi.fn(async () => 2);
    await expect(reapAbandonedCancellations(database(vi.fn(), execute))).resolves.toBe(2);
    const [sql] = execute.mock.calls[0] as unknown as [string];
    expect(sql).toContain('cancel_requested_at is not null');
    expect(sql).toContain('lease_expires_at < now()');
  });

  it('states what cancellation cannot stop rather than leaving a caller to guess', () => {
    expect(BACKGROUND_JOB_CANCELLATION.cannotBeStopped.length).toBeGreaterThan(0);
    expect(BACKGROUND_JOB_CANCELLATION.propagatesTo).toContain('background-worker');
    expect(BACKGROUND_JOB_CANCELLATION.propagatesTo).toContain('provider-stream');
    expect(BACKGROUND_JOB_CANCELLATION.resumable).toBe(false);
  });
});

describe('retry backoff, jitter and reason', () => {
  it('grows the delay exponentially and caps it at the queue ceiling', () => {
    const policy = JOB_QUEUE_POLICIES.email;
    const mid = () => 0.5;
    const first = computeJobBackoffSeconds(policy, 1, mid);
    const second = computeJobBackoffSeconds(policy, 2, mid);
    const far = computeJobBackoffSeconds(policy, 20, mid);

    expect(second).toBeGreaterThan(first);
    expect(far).toBeLessThanOrEqual(policy.backoffMaxSeconds);
  });

  it('spreads retries across a jitter band instead of stacking them on one second', () => {
    const policy = JOB_QUEUE_POLICIES.webhooks;
    const low = computeJobBackoffSeconds(policy, 3, () => 0);
    const high = computeJobBackoffSeconds(policy, 3, () => 1);

    expect(low).toBeLessThan(high);
    expect(low / high).toBeGreaterThan(0.5);
  });

  it('keeps the shared retry helper jittered, and identical without it', () => {
    const options = {
      initialDelayMs: 1_000,
      maxDelayMs: 30_000,
      backoffMultiplier: 2,
      jitter: true,
    };
    const samples = new Set(Array.from({ length: 24 }, () => calculateDelay(3, options)));
    expect(samples.size).toBeGreaterThan(1);

    const fixed = calculateDelay(3, { ...options, jitter: false });
    expect(calculateDelay(3, { ...options, jitter: false })).toBe(fixed);
    expect(fixed).toBe(4_000);
  });

  it('classifies a failure from the shared taxonomy and stores that class, not the prose', async () => {
    expect(classifyJobFailure(new PermanentJobError('undeliverable'))).toEqual({
      reason: JOB_RETRY_REASON.permanent,
      disposition: 'terminal',
    });
    expect(classifyJobFailure(new Error('ECONNREFUSED 10.0.0.1:443')).reason).toBe(
      'connection_never_established',
    );

    const execute = vi.fn(async () => 1);
    await failJob(
      database(vi.fn(), execute),
      { id: 'job-1', queue: 'email', attempts: 1, maxAttempts: 8 },
      new Error('fetch failed'),
    );
    const [sql, params] = execute.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('retry_reason = $5');
    expect(params[4]).toBe('connection_lost_in_flight');
  });
});

describe('enqueue idempotency', () => {
  it.each([
    ['schedule execution', 'notifications.schedule-completed' as const, 'schedule-run:run-1'],
    ['an external write', 'webhooks.audit-stream-delivery' as const, 'audit-stream:org-1:b1'],
    ['provisioning', 'media-generation.image-attempt' as const, 'image-job:image-1:0'],
  ])(
    'carries a key through %s so a repeated enqueue returns the first job',
    async (_label, kind, key) => {
      const query = vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'job-1', status: 'running' }]);

      await expect(
        enqueueJob(database(query), { kind, idempotencyKey: key, payload: {} }),
      ).resolves.toEqual({ id: 'job-1', status: 'running', created: false });

      const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
      expect(sql).toContain('on conflict (queue, idempotency_key)');
      expect(params[8]).toBe(key);
    },
  );

  it('refuses an enqueue whose key cannot identify the work', async () => {
    await expect(
      enqueueJob(database(vi.fn()), {
        kind: 'email.schedule-completed',
        idempotencyKey: '   ',
        payload: {},
      }),
    ).rejects.toThrow('8-255 characters');
  });
});
