import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('server-only', () => ({}));

import { runWithTraceContext } from '@/lib/observability/trace-context';

import { computeJobBackoffSeconds, JOB_QUEUE_POLICIES } from '../job-queues';
import {
  PermanentJobError,
  claimJobs,
  completeJob,
  enqueueJob,
  failJob,
  listDeadJobs,
  pruneFinishedJobs,
  reapExpiredJobLeases,
  readJobQueueStats,
  retryDeadJob,
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

const TRACE = {
  traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
  spanId: '00f067aa0ba902b7',
  sampled: true,
};

const jobRow = {
  id: 'job-1',
  queue: 'notifications',
  kind: 'notifications.schedule-completed',
  user_id: 'user-1',
  organization_id: null,
  tenant_key: 'user:user-1',
  payload: { taskId: 'task-1' },
  priority: 0,
  status: 'running',
  attempts: 1,
  max_attempts: 6,
  run_after: '2026-09-17T00:00:00.000Z',
  lease_expires_at: '2026-09-17T00:00:30.000Z',
  idempotency_key: 'schedule-run:run-1',
  last_error: null,
  dead_reason: null,
  dead_lettered_at: null,
  created_at: '2026-09-17T00:00:00.000Z',
  updated_at: '2026-09-17T00:00:00.000Z',
};

describe('enqueueJob', () => {
  it('routes a kind to its queue and returns the first job for a repeated key', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'job-1', status: 'queued' }]);

    const result = await enqueueJob(database(query), {
      kind: 'email.schedule-completed',
      userId: 'user-1',
      idempotencyKey: 'schedule-email:run-1',
      payload: { runId: 'run-1' },
    });

    expect(result).toEqual({ id: 'job-1', status: 'queued', created: false });
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('on conflict (queue, idempotency_key) where idempotency_key is not null');
    expect(params[0]).toBe('email');
    expect(params[6]).toBe(JOB_QUEUE_POLICIES.email.maxAttempts);
  });

  it('reports a brand new job as created', async () => {
    const query = vi.fn().mockResolvedValue([{ id: 'job-2', status: 'queued' }]);

    await expect(
      enqueueJob(database(query), {
        kind: 'webhooks.audit-stream-delivery',
        organizationId: '11111111-1111-4111-8111-111111111111',
        payload: {},
      }),
    ).resolves.toEqual({ id: 'job-2', status: 'queued', created: true });
  });

  it('refuses an idempotency key the unique index cannot hold', async () => {
    await expect(
      enqueueJob(database(vi.fn()), {
        kind: 'email.schedule-completed',
        idempotencyKey: 'short',
        payload: {},
      }),
    ).rejects.toThrow('8-255 characters');
  });

  it('stores the enqueuer trace in the payload so the worker can parent onto it', async () => {
    const query = vi.fn().mockResolvedValue([{ id: 'job-3', status: 'queued' }]);

    await runWithTraceContext(TRACE, () =>
      enqueueJob(database(query), {
        kind: 'email.schedule-completed',
        payload: { runId: 'run-1' },
      }),
    );

    const [, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    const payload = JSON.parse(params[4] as string) as Record<string, unknown>;
    expect(payload['runId']).toBe('run-1');
    expect(payload['traceparent']).toBe(`00-${TRACE.traceId}-${TRACE.spanId}-01`);
  });

  it('leaves the payload alone outside a trace', async () => {
    const query = vi.fn().mockResolvedValue([{ id: 'job-4', status: 'queued' }]);

    await enqueueJob(database(query), {
      kind: 'email.schedule-completed',
      payload: { runId: 'run-2' },
    });

    const [, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(JSON.parse(params[4] as string)).toEqual({ runId: 'run-2' });
  });

  it('refuses to hand back a job filed under another subject', async () => {
    const query = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await expect(
      enqueueJob(database(query), {
        kind: 'email.schedule-completed',
        userId: 'user-1',
        idempotencyKey: 'schedule-email:run-1',
        payload: {},
      }),
    ).rejects.toThrow('owned by another subject');
  });
});

describe('claimJobs', () => {
  it('claims fairly across tenants under each queue concurrency limit, skipping locked rows', async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('pg_advisory_xact_lock')) return [];
      return [jobRow];
    });

    const claimed = await claimJobs(database(query), { limit: 5 });

    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({ id: 'job-1', queue: 'notifications', attempts: 1 });
    const [lockSql] = query.mock.calls[0] as unknown as [string];
    expect(lockSql).toContain('pg_advisory_xact_lock');
    const [claimSql, params] = query.mock.calls[1] as unknown as [string, unknown[]];
    expect(claimSql).toContain('for update skip locked');
    expect(claimSql).toContain('partition by pool.queue, pool.tenant_key');
    expect(claimSql).toContain('queue_ranked.queue_turn <= slots.available');
    expect(claimSql).toContain("status = 'running'");
    expect(params[1]).toEqual(
      (params[0] as string[]).map((queue) => JOB_QUEUE_POLICIES[queue as 'email'].maxConcurrency),
    );
    expect(params[4]).toBe(5);
  });

  it('claims nothing when no queue is asked for', async () => {
    const query = vi.fn();
    await expect(claimJobs(database(query), { queues: [], limit: 5 })).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('failJob', () => {
  it('re-queues with exponential backoff while attempts remain', async () => {
    const execute = vi.fn(async () => 1);
    const outcome = await failJob(
      database(vi.fn(), execute),
      { id: 'job-1', queue: 'email', attempts: 2, maxAttempts: 8 },
      new Error('provider timeout'),
      { random: () => 0.5 },
    );

    expect(outcome).toBe('retry');
    const [sql, params] = execute.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("set status = 'queued'");
    expect(sql).toContain('make_interval(secs => $3)');
    expect(params[2]).toBe(computeJobBackoffSeconds(JOB_QUEUE_POLICIES.email, 2, () => 0.5));
    expect(params[3]).toBe(2);
  });

  it('dead-letters with a reason when the attempts are spent', async () => {
    const execute = vi.fn(async () => 1);
    const outcome = await failJob(
      database(vi.fn(), execute),
      { id: 'job-1', queue: 'email', attempts: 8, maxAttempts: 8 },
      new Error('provider timeout'),
    );

    expect(outcome).toBe('dead');
    const [sql, params] = execute.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("set status = 'dead'");
    expect(params[2]).toContain('Gave up after 8 attempts');
  });

  it('dead-letters immediately on a permanent failure, whatever the attempts', async () => {
    const execute = vi.fn(async () => 1);
    const outcome = await failJob(
      database(vi.fn(), execute),
      { id: 'job-1', queue: 'email', attempts: 1, maxAttempts: 8 },
      new PermanentJobError('the address is not deliverable'),
    );

    expect(outcome).toBe('dead');
    const [, permanentParams] = execute.mock.calls[0] as unknown as [string, unknown[]];
    expect(permanentParams[2]).toContain('Permanent failure');
  });

  it('reports a write that hit no running row as stale rather than retried', async () => {
    const execute = vi.fn(async () => 0);
    await expect(
      failJob(
        database(vi.fn(), execute),
        { id: 'job-1', queue: 'email', attempts: 1, maxAttempts: 8 },
        new Error('boom'),
      ),
    ).resolves.toBe('stale');
  });
});

describe('completeJob', () => {
  it('settles only the attempt it ran', async () => {
    const execute = vi.fn(async () => 1);
    await expect(
      completeJob(database(vi.fn(), execute), { id: 'job-1', attempts: 3 }, { ok: true }),
    ).resolves.toBe(true);
    const [sql, params] = execute.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("status = 'running' and attempts = $3");
    expect(params[2]).toBe(3);
  });
});

describe('lease reaping and pruning', () => {
  it('re-queues an expired lease that still has attempts and dead-letters the last one', async () => {
    const execute = vi.fn(async () => 1);
    const summary = await reapExpiredJobLeases(database(vi.fn(), execute));

    const statements = (execute.mock.calls as unknown as unknown[][]).map((call) =>
      String(call[0]),
    );
    expect(statements.some((sql) => sql.includes('attempts >= max_attempts'))).toBe(true);
    expect(statements.some((sql) => sql.includes('attempts < max_attempts'))).toBe(true);
    expect(summary.requeued).toBeGreaterThan(0);
    expect(summary.deadLettered).toBeGreaterThan(0);
  });

  it('deletes settled jobs in bounded batches per queue', async () => {
    const execute = vi.fn(async () => 5);
    await expect(pruneFinishedJobs(database(vi.fn(), execute))).resolves.toBeGreaterThan(0);
    const [sql] = execute.mock.calls[0] as unknown as [string];
    expect(sql).toContain("status in ('succeeded', 'cancelled')");
    expect(sql).toContain('limit $3');
  });
});

describe('admin reads and retries', () => {
  it('reports every queue even when nothing is in it', async () => {
    const query = vi
      .fn()
      .mockResolvedValue([
        { queue: 'email', queued: '2', running: '1', dead: '3', oldest_queued_at: null },
      ]);

    const stats = await readJobQueueStats(database(query));

    expect(stats.find((entry) => entry.queue === 'email')).toMatchObject({
      queued: 2,
      running: 1,
      dead: 3,
      maxConcurrency: JOB_QUEUE_POLICIES.email.maxConcurrency,
    });
    expect(stats.find((entry) => entry.queue === 'webhooks')).toMatchObject({ queued: 0, dead: 0 });
  });

  it('lists dead jobs newest first and requeues one from zero attempts', async () => {
    const query = vi
      .fn()
      .mockResolvedValue([{ ...jobRow, status: 'dead', dead_reason: 'gave up' }]);
    const execute = vi.fn(async () => 1);
    const db = database(query, execute);

    await listDeadJobs(db, { limit: 10, offset: 0, queue: 'email' });
    const [listSql] = query.mock.calls[0] as unknown as [string];
    expect(listSql).toContain('order by dead_lettered_at desc');

    await expect(retryDeadJob(db, 'job-1')).resolves.toBe(true);
    const [retrySql] = execute.mock.calls[0] as unknown as [string];
    expect(retrySql).toContain('attempts = 0');
    expect(retrySql).toContain("status = 'dead'");
  });
});
