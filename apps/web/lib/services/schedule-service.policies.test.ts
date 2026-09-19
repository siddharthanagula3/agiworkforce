import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const mocks = vi.hoisted(() => ({
  evaluateScheduleCondition: vi.fn(),
  recordAuditEvent: vi.fn(),
  enqueueJob: vi.fn(),
}));

vi.mock('@/lib/server/claimed-user-scope-db', () => ({
  createClaimedUserScopedDb: vi.fn((db: DatabaseAdapter) => db),
}));
vi.mock('./schedule-condition-service', () => ({
  evaluateScheduleCondition: mocks.evaluateScheduleCondition,
}));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: mocks.recordAuditEvent }));
vi.mock('@/lib/jobs/job-service', () => ({ enqueueJob: mocks.enqueueJob }));

import {
  claimDueScheduleRuns,
  createSchedule as createScheduleWithPlan,
  finalizeScheduleRun,
  processClaimedScheduleRun,
  retryDelaySeconds,
  type ClaimedScheduleRun,
  type ScheduleInput,
} from './schedule-service';

function createSchedule(
  db: DatabaseAdapter,
  userId: string,
  input: ScheduleInput,
  options: { now?: Date } = {},
) {
  return createScheduleWithPlan(db, userId, input, { planTier: 'max', ...options });
}

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

const taskRow = {
  id: 'task-1',
  user_id: 'user-1',
  organization_id: null,
  project_id: null,
  name: 'Daily briefing',
  description: null,
  schedule_type: 'cron',
  cron_expression: '0 12 * * *',
  execute_at: null,
  interval_ms: null,
  timezone: 'UTC',
  is_enabled: true,
  expires_at: null,
  max_executions: null,
  execution_count: 1,
  action_type: 'agent',
  action_config: null,
  prompt: 'Brief me',
  model: 'auto-balanced',
  status: 'active',
  last_executed_at: null,
  next_execution_at: null,
  last_error: null,
  metadata: null,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-17T12:00:00.000Z',
  recurrence_rule: null,
  dayparts: null,
  retry_max_attempts: 2,
  retry_backoff_seconds: 300,
  retry_attempt: 0,
  retry_scheduled_for: null,
  missed_execution_policy: 'run_once',
  condition: null,
  condition_state: null,
};

const runRow = {
  id: 'run-1',
  task_id: 'task-1',
  status: 'failed',
  trigger_source: 'schedule',
  scheduled_for: '2026-09-17T12:00:00.000Z',
  started_at: '2026-09-17T12:00:00.000Z',
  completed_at: '2026-09-17T12:00:05.000Z',
  duration_ms: 5_000,
  result: null,
  error: 'provider refused',
  idempotency_key: 'schedule:2026-09-17T12:00:00.000Z',
  lease_expires_at: null,
  attempt_count: 1,
};

function claim(overrides: Partial<ClaimedScheduleRun> = {}): ClaimedScheduleRun {
  return {
    runId: 'run-1',
    scheduledFor: '2026-09-17T12:00:00.000Z',
    dueAt: '2026-09-17T12:00:00.000Z',
    triggerSource: 'schedule',
    startedAt: '2026-09-17T12:00:00.000Z',
    attemptCount: 1,
    scope: { userId: 'user-1', organizationId: null },
    task: {
      id: 'task-1',
      userId: 'user-1',
      name: 'Daily briefing',
      description: null,
      scheduleType: 'cron',
      cronExpression: '0 12 * * *',
      executeAt: null,
      intervalMs: null,
      timezone: 'UTC',
      isEnabled: true,
      expiresAt: null,
      maxExecutions: null,
      executionCount: 1,
      actionType: 'agent',
      actionConfig: null,
      prompt: 'Brief me',
      model: 'auto-balanced',
      status: 'active',
      lastExecutedAt: null,
      nextExecutionAt: null,
      lastError: null,
      metadata: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-17T12:00:00.000Z',
      retryMaxAttempts: 2,
      retryBackoffSeconds: 300,
      retryAttempt: 0,
      missedExecutionPolicy: 'run_once',
      condition: null,
      conditionState: null,
      recurrenceRule: null,
      dayparts: null,
    },
    ...overrides,
  };
}

function finalizeDatabase(task = taskRow, run = runRow) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('for update')) return [task];
    if (sql.includes('update scheduled_task_runs')) return [run];
    return [];
  });
  return { db: database(query), query };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enqueueJob.mockResolvedValue({ id: 'job-1', status: 'queued', created: true });
});

describe('recurrence rules and event-only tasks', () => {
  it('stores a normalized rule with its anchor and takes COUNT as the run limit', async () => {
    const query = vi.fn().mockResolvedValue([taskRow]);

    await createSchedule(
      database(query),
      'user-1',
      {
        name: 'Quarterly review',
        prompt: 'Summarize the quarter',
        recurrence: 'rrule',
        recurrenceRule: 'FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=1;BYHOUR=9;BYMINUTE=0;COUNT=4',
        timezone: 'UTC',
      },
      { now: new Date('2026-09-17T12:00:00.000Z') },
    );

    const [, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(params[3]).toBe('rrule');
    expect(params[17]).toContain('DTSTART:20260917T120000');
    expect(params[17]).toContain('FREQ=MONTHLY;INTERVAL=3');
    expect(params[10]).toBe(4);
    // Anchored on the creation month, so INTERVAL=3 counts September, December, March.
    expect(params[14]).toBe('2026-12-01T09:00:00.000Z');
  });

  it('refuses a rule the scheduler cannot honour', async () => {
    await expect(
      createSchedule(database(vi.fn()), 'user-1', {
        name: 'Too often',
        prompt: 'Check',
        recurrence: 'rrule',
        recurrenceRule: 'FREQ=HOURLY;BYMINUTE=0,5',
        timezone: 'UTC',
      }),
    ).rejects.toThrow(/cannot fire more often/);
  });

  it('creates an event-only task with no clock occurrence', async () => {
    const query = vi.fn().mockResolvedValue([{ ...taskRow, schedule_type: 'event' }]);

    await createSchedule(database(query), 'user-1', {
      name: 'On a failed build',
      prompt: 'Investigate the failure',
      recurrence: 'event',
      timezone: 'UTC',
    });

    const [, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(params[3]).toBe('event');
    expect(params[14]).toBeNull();
  });

  it('refuses dayparts on a task with no clock schedule', async () => {
    await expect(
      createSchedule(database(vi.fn()), 'user-1', {
        name: 'On a failed build',
        prompt: 'Investigate',
        recurrence: 'event',
        timezone: 'UTC',
        dayparts: [{ days: [1], start: '09:00', end: '17:00' }],
      }),
    ).rejects.toThrow(/clock schedules/);
  });
});

describe('claiming a retry', () => {
  it('claims the retry occurrence under its own idempotency key without spending a run', async () => {
    const query = vi.fn().mockResolvedValue([]);

    await claimDueScheduleRuns(database(query), { limit: 5 });

    const [sql] = query.mock.calls[0] as unknown as [string];
    expect(sql).toContain('coalesce(retry_scheduled_for, next_execution_at) as scheduled_for');
    expect(sql).toContain("':retry:' || due_retry_attempt::text");
    expect(sql).toContain('due_retry_attempt + 1');
    expect(sql).toContain('case when due.due_retry_attempt = 0 then 1 else 0 end');
    expect(sql).toContain('or retry_attempt > 0');
  });
});

describe('retrying a failed occurrence', () => {
  it('schedules the retry after the backoff and keeps the occurrence it belongs to', async () => {
    const { db, query } = finalizeDatabase();

    await finalizeScheduleRun(db, claim(), {
      status: 'failed',
      error: 'provider refused',
      completedAt: new Date('2026-09-17T12:00:05.000Z'),
    });

    const update = query.mock.calls.find(([sql]) =>
      String(sql).includes('update scheduled_tasks'),
    ) as unknown as [string, unknown[]];
    expect(update[1][3]).toBe(
      new Date(
        new Date('2026-09-17T12:00:05.000Z').getTime() + retryDelaySeconds(300, 0) * 1_000,
      ).toISOString(),
    );
    expect(update[1][6]).toBe(1);
    expect(update[1][7]).toBe('2026-09-17T12:00:00.000Z');
  });

  it('moves on to the next occurrence once the retries are spent', async () => {
    const { db, query } = finalizeDatabase();

    await finalizeScheduleRun(db, claim({ attemptCount: 3 }), {
      status: 'failed',
      error: 'provider refused',
      completedAt: new Date('2026-09-17T12:00:05.000Z'),
    });

    const update = query.mock.calls.find(([sql]) =>
      String(sql).includes('update scheduled_tasks'),
    ) as unknown as [string, unknown[]];
    expect(update[1][3]).toBe('2026-09-18T12:00:00.000Z');
    expect(update[1][6]).toBe(0);
    expect(update[1][7]).toBeNull();
  });

  it('does not retry a run someone started by hand', async () => {
    const { db, query } = finalizeDatabase();

    await finalizeScheduleRun(db, claim({ triggerSource: 'manual' }), {
      status: 'failed',
      error: 'provider refused',
      completedAt: new Date('2026-09-17T12:00:05.000Z'),
    });

    const update = query.mock.calls.find(([sql]) =>
      String(sql).includes('update scheduled_tasks'),
    ) as unknown as [string, unknown[]];
    expect(update[1][8]).toBe(false);
  });
});

describe('missed occurrences', () => {
  it('skips a late occurrence when the policy says to, and audits the decision', async () => {
    const { db } = finalizeDatabase(
      { ...taskRow, missed_execution_policy: 'skip' },
      { ...runRow, status: 'cancelled' },
    );
    const executor = vi.fn();

    const run = await processClaimedScheduleRun(
      db,
      claim({
        task: { ...claim().task, missedExecutionPolicy: 'skip' },
        dueAt: '2026-09-17T10:00:00.000Z',
      }),
      executor,
      { timeoutMs: 1_000, now: () => new Date('2026-09-17T12:00:00.000Z') },
    );

    expect(executor).not.toHaveBeenCalled();
    expect(run.status).toBe('cancelled');
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'schedule_missed_execution', outcome: 'failure' }),
    );
  });

  it('gives back the execution an occurrence it never ran had spent', async () => {
    const execute = vi.fn(async () => 1);
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('for update')) return [{ ...taskRow, missed_execution_policy: 'skip' }];
      if (sql.includes('update scheduled_task_runs')) return [{ ...runRow, status: 'cancelled' }];
      return [];
    });

    await processClaimedScheduleRun(
      database(query, execute),
      claim({
        task: { ...claim().task, missedExecutionPolicy: 'skip' },
        dueAt: '2026-09-17T10:00:00.000Z',
      }),
      vi.fn(),
      { timeoutMs: 1_000, now: () => new Date('2026-09-17T12:00:00.000Z') },
    );

    const [sql] = execute.mock.calls[0] as unknown as [string];
    expect(sql).toContain('execution_count = greatest(execution_count - 1, 0)');
  });

  it('runs a late occurrence once when the policy says to, and records that it was late', async () => {
    const { db } = finalizeDatabase(taskRow, { ...runRow, status: 'success' });
    const executor = vi.fn(async () => ({ text: 'done', model: 'auto-balanced' }));

    await processClaimedScheduleRun(db, claim({ dueAt: '2026-09-17T10:00:00.000Z' }), executor, {
      timeoutMs: 1_000,
      now: () => new Date('2026-09-17T12:00:00.000Z'),
    });

    expect(executor).toHaveBeenCalledTimes(1);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'schedule_missed_execution', outcome: 'success' }),
    );
  });

  it('treats an on-time occurrence as nothing to report', async () => {
    const { db } = finalizeDatabase(taskRow, { ...runRow, status: 'success' });
    const executor = vi.fn(async () => ({ text: 'done', model: 'auto-balanced' }));

    await processClaimedScheduleRun(db, claim(), executor, {
      timeoutMs: 1_000,
      now: () => new Date('2026-09-17T12:00:10.000Z'),
    });

    expect(executor).toHaveBeenCalled();
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });
});

describe('condition watches', () => {
  const condition = { kind: 'url_changed' as const, url: 'https://example.com/status' };

  it('does not run the task when the watched condition does not hold, and keeps the check', async () => {
    const { db } = finalizeDatabase(taskRow, { ...runRow, status: 'cancelled' });
    mocks.evaluateScheduleCondition.mockResolvedValue({
      checkedAt: '2026-09-17T12:00:00.000Z',
      met: false,
      detail: 'The watched page has not changed',
      contentSha256: 'abc',
    });
    const executor = vi.fn();

    const run = await processClaimedScheduleRun(
      db,
      claim({ task: { ...claim().task, condition } }),
      executor,
      { timeoutMs: 1_000, now: () => new Date('2026-09-17T12:00:01.000Z') },
    );

    expect(executor).not.toHaveBeenCalled();
    expect(run.status).toBe('cancelled');
    expect(mocks.evaluateScheduleCondition).toHaveBeenCalledWith(
      condition,
      null,
      expect.anything(),
    );
  });

  it('runs the task when the condition holds', async () => {
    const { db } = finalizeDatabase(taskRow, { ...runRow, status: 'success' });
    mocks.evaluateScheduleCondition.mockResolvedValue({
      checkedAt: '2026-09-17T12:00:00.000Z',
      met: true,
      detail: 'The watched page changed',
      contentSha256: 'def',
    });
    const executor = vi.fn(async () => ({ text: 'done', model: 'auto-balanced' }));

    await processClaimedScheduleRun(db, claim({ task: { ...claim().task, condition } }), executor, {
      timeoutMs: 1_000,
      now: () => new Date('2026-09-17T12:00:01.000Z'),
    });

    expect(executor).toHaveBeenCalledTimes(1);
  });

  it('does not check a condition for a run a trigger or a person started', async () => {
    const { db } = finalizeDatabase(taskRow, { ...runRow, status: 'success' });
    const executor = vi.fn(async () => ({ text: 'done', model: 'auto-balanced' }));

    await processClaimedScheduleRun(
      db,
      claim({ triggerSource: 'webhook', task: { ...claim().task, condition } }),
      executor,
      { timeoutMs: 1_000, now: () => new Date('2026-09-17T12:00:01.000Z') },
    );

    expect(mocks.evaluateScheduleCondition).not.toHaveBeenCalled();
    expect(executor).toHaveBeenCalled();
  });
});

describe('announcing a finished run', () => {
  it('queues the notification rather than delivering it inside the run', async () => {
    const { db } = finalizeDatabase(taskRow, { ...runRow, status: 'success' });
    const executor = vi.fn(async () => ({ text: 'done', model: 'auto-balanced' }));

    await processClaimedScheduleRun(db, claim(), executor, {
      timeoutMs: 1_000,
      now: () => new Date('2026-09-17T12:00:05.000Z'),
    });

    expect(mocks.enqueueJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        kind: 'notifications.schedule-completed',
        userId: 'user-1',
        idempotencyKey: 'schedule-run:run-1',
      }),
    );
  });

  it('says nothing for a run that was skipped or cancelled', async () => {
    const { db } = finalizeDatabase(taskRow, { ...runRow, status: 'cancelled' });
    mocks.evaluateScheduleCondition.mockResolvedValue({
      checkedAt: '2026-09-17T12:00:00.000Z',
      met: false,
      detail: 'unchanged',
      contentSha256: null,
    });

    await processClaimedScheduleRun(
      db,
      claim({
        task: { ...claim().task, condition: { kind: 'url_changed', url: 'https://example.com/s' } },
      }),
      vi.fn(),
      { timeoutMs: 1_000, now: () => new Date('2026-09-17T12:00:01.000Z') },
    );

    expect(mocks.enqueueJob).not.toHaveBeenCalled();
  });
});
