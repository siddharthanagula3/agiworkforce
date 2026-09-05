import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('@/lib/server/claimed-user-scope-db', () => ({
  createClaimedUserScopedDb: vi.fn((db: DatabaseAdapter) => db),
}));

import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';

import {
  ScheduleConflictError,
  ScheduleNotFoundError,
  ScheduleValidationError,
  claimDueScheduleRuns,
  countSchedules,
  createSchedule,
  createManualScheduleRun,
  deleteSchedule,
  finalizeScheduleRun,
  getSchedule,
  listSchedules,
  listScheduleRuns,
  processClaimedScheduleRun,
  processDueScheduleRuns,
  setScheduleEnabled,
  updateSchedule,
  type ClaimedScheduleRun,
  type ScheduledExecutionResult,
  type ScheduledTaskExecutor,
} from './schedule-service';

function database(
  query: ReturnType<typeof vi.fn>,
  execute: ReturnType<typeof vi.fn> = vi.fn(),
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

const claim: ClaimedScheduleRun = {
  runId: 'run-1',
  scheduledFor: '2026-07-15T12:00:00.000Z',
  scope: {
    userId: 'user-1',
    organizationId: '11111111-1111-4111-8111-111111111111',
  },
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
    lastExecutedAt: '2026-07-15T12:00:00.000Z',
    nextExecutionAt: null,
    lastError: null,
    metadata: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-15T12:00:00.000Z',
  },
};

const taskRow = {
  id: 'task-1',
  user_id: 'user-1',
  organization_id: '11111111-1111-4111-8111-111111111111',
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
  last_executed_at: '2026-07-15T12:00:00.000Z',
  next_execution_at: null,
  last_error: null,
  metadata: null,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-15T12:00:00.000Z',
};

function runRow(status: 'success' | 'failed' | 'timeout' | 'cancelled', error: string = status) {
  return {
    id: 'run-1',
    task_id: 'task-1',
    status,
    trigger_source: 'schedule',
    scheduled_for: '2026-07-15T12:00:00.000Z',
    started_at: '2026-07-15T12:00:00.000Z',
    completed_at: '2026-07-15T12:00:02.000Z',
    duration_ms: 2000,
    result: status === 'success' ? { text: 'Done' } : null,
    error: status === 'success' ? null : error,
    idempotency_key: 'schedule:2026-07-15T12:00:00.000Z',
    lease_expires_at: null,
    attempt_count: 1,
  };
}

afterEach(() => vi.useRealTimers());

describe('schedule service persistence', () => {
  it('counts an account quota across workspaces with an explicit owner predicate', async () => {
    const query = vi.fn().mockResolvedValue([{ count: '7' }]);

    await expect(countSchedules(database(query), 'user-1')).resolves.toBe(7);

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('where user_id = $1');
    expect(sql).not.toContain('organization_id');
    expect(params).toEqual(['user-1']);
  });

  it('lists only the owner schedules with bounded pagination', async () => {
    const query = vi.fn().mockResolvedValue([taskRow]);

    const schedules = await listSchedules(database(query), 'user-1', { limit: 500, offset: -2 });

    expect(schedules).toHaveLength(1);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/where user_id = \$1/i);
    expect(params).toEqual(['user-1', 100, 0]);
  });

  it('filters the owner schedule list to one project when scoped', async () => {
    const query = vi.fn().mockResolvedValue([{ ...taskRow, project_id: 'project-1' }]);

    const schedules = await listSchedules(database(query), 'user-1', {
      limit: 50,
      offset: 0,
      projectId: 'project-1',
    });

    expect(schedules).toEqual([expect.objectContaining({ projectId: 'project-1' })]);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/where user_id = \$1 and project_id = \$2/i);
    expect(params).toEqual(['user-1', 'project-1', 50, 0]);
  });

  it('gets a schedule through an object-level owner predicate', async () => {
    const query = vi.fn().mockResolvedValue([taskRow]);

    await expect(getSchedule(database(query), 'user-1', 'task-1')).resolves.toMatchObject({
      id: 'task-1',
      userId: 'user-1',
    });
    expect(query.mock.calls[0]?.[1]).toEqual(['task-1', 'user-1']);
  });

  it('creates against the canonical 0009 columns and computes next_execution_at', async () => {
    const query = vi.fn().mockResolvedValue([taskRow]);

    await createSchedule(
      database(query),
      'user-1',
      {
        name: 'Daily briefing',
        prompt: 'Brief me',
        model: 'auto-balanced',
        recurrence: 'daily',
        timeOfDay: '12:00',
        timezone: 'UTC',
        isActive: true,
      },
      { now: new Date('2026-07-15T11:00:00.000Z') },
    );

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/schedule_type/i);
    expect(sql).toMatch(/next_execution_at/i);
    expect(sql).not.toMatch(/recurrence|time_of_day|is_active|next_run_at/i);
    expect(params).toContain('0 12 * * *');
    expect(params).toContain('2026-07-15T12:00:00.000Z');
  });

  it('verifies project ownership before persisting a project-scoped schedule', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'project-1' }])
      .mockResolvedValueOnce([{ ...taskRow, project_id: 'project-1' }]);

    const schedule = await createSchedule(
      database(query),
      'user-1',
      {
        name: 'Daily briefing',
        prompt: 'Brief me',
        model: 'auto-balanced',
        recurrence: 'daily',
        timeOfDay: '12:00',
        timezone: 'UTC',
        isActive: true,
        projectId: 'project-1',
      },
      { now: new Date('2026-07-15T11:00:00.000Z') },
    );

    expect(schedule.projectId).toBe('project-1');
    const [ownershipSql, ownershipParams] = query.mock.calls[0] as [string, unknown[]];
    expect(ownershipSql).toMatch(/user_projects/i);
    expect(ownershipParams).toEqual(['project-1', 'user-1']);
    const [insertSql, insertParams] = query.mock.calls[1] as [string, unknown[]];
    expect(insertSql).toMatch(/project_id/i);
    expect(insertParams).toContain('project-1');
  });

  it('rejects a schedule scoped to a project the account does not own', async () => {
    const query = vi.fn().mockResolvedValueOnce([]);

    await expect(
      createSchedule(database(query), 'user-1', {
        name: 'Daily briefing',
        prompt: 'Brief me',
        model: 'auto-balanced',
        recurrence: 'daily',
        timeOfDay: '12:00',
        timezone: 'UTC',
        isActive: true,
        projectId: 'someone-elses-project',
      }),
    ).rejects.toBeInstanceOf(ScheduleValidationError);
    expect(query).toHaveBeenCalledOnce();
  });

  it('rejects invalid timezone and cron input before persistence', async () => {
    const query = vi.fn();
    const db = database(query);
    await expect(
      createSchedule(db, 'user-1', {
        name: 'Bad cron',
        prompt: 'Brief me',
        model: 'auto-balanced',
        recurrence: 'custom',
        cronExpression: '60 * * * *',
        timezone: 'America/Not_Real',
        isActive: true,
      }),
    ).rejects.toBeInstanceOf(ScheduleValidationError);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects unknown request fields instead of silently accepting a typo', async () => {
    const query = vi.fn();
    await expect(
      createSchedule(database(query), 'user-1', {
        name: 'Typo',
        prompt: 'Do it',
        recurrence: 'daily',
        timeOfDay: '12:00',
        timezone: 'UTC',
        is_active: true,
      } as unknown as Parameters<typeof createSchedule>[2]),
    ).rejects.toThrow(/unknown.*is_active/i);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects unknown recurrence values and non-string timestamps explicitly', async () => {
    const query = vi.fn();
    const base = {
      name: 'Invalid schedule',
      prompt: 'Do it',
      timezone: 'UTC',
    };

    await expect(
      createSchedule(database(query), 'user-1', {
        ...base,
        recurrence: 'fortnightly',
      } as unknown as Parameters<typeof createSchedule>[2]),
    ).rejects.toThrow(/recurrence/i);
    await expect(
      createSchedule(database(query), 'user-1', {
        ...base,
        recurrence: 'once',
        scheduledAt: 1_784_120_400_000,
      } as unknown as Parameters<typeof createSchedule>[2]),
    ).rejects.toThrow(/scheduledAt.*string/i);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a disabled one-time schedule in the past before persistence', async () => {
    const query = vi.fn();

    await expect(
      createSchedule(
        database(query),
        'user-1',
        {
          name: 'Past task',
          prompt: 'Do it',
          model: 'auto-balanced',
          recurrence: 'once',
          scheduledAt: '2026-07-15T10:00:00.000Z',
          timezone: 'UTC',
          isActive: false,
        },
        { now: new Date('2026-07-15T11:00:00.000Z') },
      ),
    ).rejects.toThrow(/future/i);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects invalid booleans and a schedule that expires before its first occurrence', async () => {
    const query = vi.fn();
    const db = database(query);

    await expect(
      createSchedule(
        db,
        'user-1',
        {
          name: 'Bad boolean',
          prompt: 'Do it',
          recurrence: 'daily',
          timeOfDay: '12:00',
          timezone: 'UTC',
          isActive: 'yes',
        } as unknown as Parameters<typeof createSchedule>[2],
        { now: new Date('2026-07-15T11:00:00.000Z') },
      ),
    ).rejects.toThrow(/isActive.*boolean/i);

    await expect(
      createSchedule(
        db,
        'user-1',
        {
          name: 'Expires first',
          prompt: 'Do it',
          recurrence: 'daily',
          timeOfDay: '12:00',
          timezone: 'UTC',
          expiresAt: '2026-07-15T11:30:00.000Z',
        },
        { now: new Date('2026-07-15T11:00:00.000Z') },
      ),
    ).rejects.toThrow(/expiration.*first occurrence/i);
    expect(query).not.toHaveBeenCalled();
  });

  it('recomputes the next occurrence when enabling an owned paused schedule', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ ...taskRow, is_enabled: false, status: 'paused' }])
      .mockResolvedValueOnce([{ ...taskRow, next_execution_at: '2026-07-16T12:00:00.000Z' }]);

    await setScheduleEnabled(database(query), 'user-1', 'task-1', true, {
      now: new Date('2026-07-15T13:00:00.000Z'),
    });

    expect(query.mock.calls[1]?.[1]).toContain('2026-07-16T12:00:00.000Z');
  });

  it('does not enable a schedule whose next occurrence is at or after expiration', async () => {
    const query = vi.fn().mockResolvedValueOnce([
      {
        ...taskRow,
        is_enabled: false,
        status: 'paused',
        expires_at: '2026-07-15T11:30:00.000Z',
      },
    ]);

    await expect(
      setScheduleEnabled(database(query), 'user-1', 'task-1', true, {
        now: new Date('2026-07-15T11:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(ScheduleConflictError);
    expect(query).toHaveBeenCalledOnce();
  });

  it('updates canonical fields under the owner predicate', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([taskRow])
      .mockResolvedValueOnce([{ ...taskRow, name: 'Updated' }]);

    await updateSchedule(
      database(query),
      'user-1',
      'task-1',
      { name: 'Updated' },
      {
        now: new Date('2026-07-15T11:00:00.000Z'),
      },
    );

    const [sql, params] = query.mock.calls[1] as [string, unknown[]];
    expect(query.mock.calls[0]?.[0]).toMatch(/for update/i);
    expect(sql).toMatch(/where id = \$1 and user_id = \$2/i);
    expect(params.slice(0, 2)).toEqual(['task-1', 'user-1']);
  });

  it('re-verifies project ownership when moving a schedule to a different project', async () => {
    const query = vi.fn().mockResolvedValueOnce([taskRow]).mockResolvedValueOnce([]);

    await expect(
      updateSchedule(
        database(query),
        'user-1',
        'task-1',
        { projectId: 'someone-elses-project' },
        { now: new Date('2026-07-15T11:00:00.000Z') },
      ),
    ).rejects.toBeInstanceOf(ScheduleValidationError);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('preserves an interval anchor when editing non-scheduling fields', async () => {
    const intervalTask = {
      ...taskRow,
      schedule_type: 'interval',
      cron_expression: null,
      interval_ms: 300_000,
      next_execution_at: '2026-07-15T12:05:00.000Z',
      metadata: { productRecurrence: 'interval' },
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce([intervalTask])
      .mockResolvedValueOnce([{ ...intervalTask, name: 'Renamed' }]);

    await updateSchedule(
      database(query),
      'user-1',
      'task-1',
      {
        name: 'Renamed',
        description: null,
        prompt: 'Brief me',
        model: 'auto-balanced',
        recurrence: 'interval',
        cronExpression: null,
        scheduledAt: null,
        intervalMs: 300_000,
        timeOfDay: '09:00',
        daysOfWeek: [],
        dayOfMonth: null,
        timezone: 'UTC',
        isActive: true,
        expiresAt: null,
        maxExecutions: null,
      },
      {
        now: new Date('2026-07-15T12:01:00.000Z'),
      },
    );

    expect(query.mock.calls[1]?.[1]).toContain('2026-07-15T12:05:00.000Z');
  });

  it('reports deletion of a missing or cross-user task as not found', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const execute = vi.fn().mockResolvedValue(0);
    await expect(
      deleteSchedule(database(query, execute), 'other-user', 'task-1'),
    ).rejects.toBeInstanceOf(ScheduleNotFoundError);
  });

  it('does not delete a task while one of its runs is still executing', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([taskRow])
      .mockResolvedValueOnce([{ id: 'run-1' }]);
    const execute = vi.fn();

    await expect(
      deleteSchedule(database(query, execute), 'user-1', 'task-1'),
    ).rejects.toBeInstanceOf(ScheduleConflictError);
    expect(execute).not.toHaveBeenCalled();
  });

  it('claims due work atomically with row locking and occurrence idempotency', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        ...taskRow,
        run_id: 'run-1',
        run_started_at: '2026-07-15T12:00:00.000Z',
        scheduled_for: '2026-07-15T12:00:00.000Z',
        trigger_source: 'schedule',
      },
    ]);

    const claims = await claimDueScheduleRuns(database(query), { limit: 7, leaseSeconds: 45 });

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/for update skip locked/i);
    expect(sql).toMatch(/scheduled_task_runs/i);
    expect(sql).toMatch(/on conflict \(task_id, idempotency_key\) do nothing/i);
    expect(sql).toMatch(/update scheduled_tasks[\s\S]*status = 'expired'/i);
    expect(sql).toMatch(/expired_candidates[\s\S]*for update skip locked[\s\S]*limit \$1/i);
    expect(sql).toMatch(/is_enabled = true/i);
    expect(sql).toMatch(/status = 'active'/i);
    expect(params).toEqual([7, 45]);
    expect(claims[0]?.scope).toEqual({
      userId: 'user-1',
      organizationId: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('uses the canonical task_id schema and owner join for paginated run history', async () => {
    const query = vi.fn().mockResolvedValue([{ owner_task_id: 'task-1', id: null }]);

    await listScheduleRuns(database(query), 'user-1', 'task-1', { limit: 500, offset: -5 });

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/from scheduled_task_runs/i);
    expect(sql).toMatch(/scheduled_tasks/i);
    expect(sql).toMatch(/task_id/i);
    expect(sql).not.toMatch(/schedule_runs|schedule_id/i);
    expect(params).toEqual(['task-1', 'user-1', 100, 0]);
  });

  it('refuses a manual run for another user or a deleted task', async () => {
    const query = vi.fn().mockResolvedValue([]);

    await expect(
      createManualScheduleRun(database(query), {
        userId: 'attacker',
        taskId: 'task-1',
        idempotencyKey: 'manual-request-123',
        leaseSeconds: 45,
      }),
    ).rejects.toBeInstanceOf(ScheduleNotFoundError);
  });

  it('rejects a malformed manual idempotency key as caller validation', async () => {
    const query = vi.fn();
    await expect(
      createManualScheduleRun(database(query), {
        userId: 'user-1',
        taskId: 'task-1',
        idempotencyKey: 'bad key',
      }),
    ).rejects.toBeInstanceOf(ScheduleValidationError);
    expect(query).not.toHaveBeenCalled();
  });

  it('does not create a manual run for a disabled task', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        {
          ...taskRow,
          is_enabled: false,
          status: 'paused',
        },
      ])
      .mockResolvedValueOnce([]);

    await expect(
      createManualScheduleRun(database(query), {
        userId: 'user-1',
        taskId: 'task-1',
        idempotencyKey: 'manual-request-123',
        leaseSeconds: 45,
      }),
    ).rejects.toThrow(/disabled|paused/i);
  });

  it('replays an existing manual result even if the task was disabled afterward', async () => {
    const existing = {
      ...runRow('success'),
      trigger_source: 'manual',
      idempotency_key: 'manual:manual-request-123',
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ ...taskRow, is_enabled: false, status: 'paused' }])
      .mockResolvedValueOnce([existing]);

    await expect(
      createManualScheduleRun(database(query), {
        userId: 'user-1',
        taskId: 'task-1',
        idempotencyKey: 'manual-request-123',
        leaseSeconds: 45,
      }),
    ).resolves.toMatchObject({ replay: true, run: { status: 'success' } });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('creates a new manual run once and increments execution count in the same transaction', async () => {
    const running = {
      ...runRow('success'),
      status: 'running',
      trigger_source: 'manual',
      completed_at: null,
      duration_ms: null,
      result: null,
      idempotency_key: 'manual:manual-request-123',
      lease_expires_at: '2026-07-15T12:00:45.000Z',
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce([taskRow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([running]);
    const execute = vi.fn().mockResolvedValue(1);

    await expect(
      createManualScheduleRun(database(query, execute), {
        userId: 'user-1',
        taskId: 'task-1',
        idempotencyKey: 'manual-request-123',
      }),
    ).resolves.toMatchObject({ replay: false, run: { status: 'running' } });
    expect(query.mock.calls[2]?.[0]).toMatch(/insert into scheduled_task_runs/i);
    expect(execute).toHaveBeenCalledOnce();
  });

  it('finalizes a run only from running and advances the canonical task fields', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([taskRow])
      .mockResolvedValueOnce([runRow('success')])
      .mockResolvedValueOnce([{ id: 'task-1' }]);

    await finalizeScheduleRun(database(query), claim, {
      status: 'success',
      result: { text: 'Done' },
      completedAt: new Date('2026-07-15T12:00:02.000Z'),
    });

    const [runSql] = query.mock.calls[1] as [string, unknown[]];
    const [taskSql, taskParams] = query.mock.calls[2] as [string, unknown[]];
    expect(runSql).toMatch(/scheduled_task_runs/i);
    expect(runSql).toMatch(/status = 'running'/i);
    expect(taskSql).toMatch(/last_executed_at/i);
    expect(taskSql).toMatch(/next_execution_at/i);
    expect(taskSql).not.toMatch(/last_run_at|last_run_status/i);
    expect(taskParams).toContain('2026-07-16T12:00:00.000Z');
  });

  it('locks and uses the current task definition instead of a stale claimed recurrence', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        {
          ...taskRow,
          cron_expression: '0 18 * * *',
          updated_at: '2026-07-15T12:00:01.000Z',
        },
      ])
      .mockResolvedValueOnce([runRow('success')])
      .mockResolvedValueOnce([{ id: 'task-1' }]);

    await finalizeScheduleRun(database(query), claim, {
      status: 'success',
      result: { text: 'Done' },
      completedAt: new Date('2026-07-15T12:00:02.000Z'),
    });

    expect(query.mock.calls[0]?.[0]).toMatch(/scheduled_tasks[\s\S]*for update/i);
    expect(query.mock.calls[2]?.[1]).toContain('2026-07-15T18:00:00.000Z');
  });

  it('returns an already-terminal run without advancing its task twice', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([taskRow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([runRow('success')]);

    await expect(
      finalizeScheduleRun(database(query), claim, {
        status: 'success',
        result: { text: 'duplicate callback' },
        completedAt: new Date('2026-07-15T12:00:03.000Z'),
      }),
    ).resolves.toMatchObject({ status: 'success' });
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('completes an active manual schedule when the run reaches maxExecutions', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        {
          ...taskRow,
          max_executions: 1,
          execution_count: 1,
          next_execution_at: '2026-07-16T12:00:00.000Z',
        },
      ])
      .mockResolvedValueOnce([runRow('success')])
      .mockResolvedValueOnce([{ id: 'task-1' }]);

    await finalizeScheduleRun(
      database(query),
      {
        ...claim,
        triggerSource: 'manual',
        task: {
          ...claim.task,
          maxExecutions: 1,
          executionCount: 1,
          nextExecutionAt: '2026-07-16T12:00:00.000Z',
        },
      },
      {
        status: 'success',
        result: { text: 'Done' },
        completedAt: new Date('2026-07-15T12:00:02.000Z'),
      },
    );

    const [, params] = query.mock.calls[2] as [string, unknown[]];
    expect(params.slice(3)).toEqual([null, 'completed', false]);
  });
});

describe('schedule run lifecycle', () => {
  it('records a successful terminal result', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([taskRow])
      .mockResolvedValueOnce([runRow('success')])
      .mockResolvedValueOnce([{ id: 'task-1' }]);
    const execute = vi.fn().mockResolvedValue({ text: 'Finished', model: 'model-1' });
    const scopedDb = database(query);

    const result = await processClaimedScheduleRun(scopedDb, claim, execute, {
      timeoutMs: 1000,
      now: () => new Date('2026-07-15T12:00:02.000Z'),
    });

    expect(result.status).toBe('success');
    expect(execute).toHaveBeenCalledWith(claim.task, expect.any(AbortSignal), 'run-1', {
      ...claim.scope,
      db: scopedDb,
    });
  });

  it('records executor failures and still advances a recurring task', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([taskRow])
      .mockResolvedValueOnce([runRow('failed', 'provider unavailable')])
      .mockResolvedValueOnce([{ id: 'task-1' }]);

    const result = await processClaimedScheduleRun(
      database(query),
      claim,
      vi.fn().mockRejectedValue(new Error('provider unavailable')),
      {
        timeoutMs: 1000,
        now: () => new Date('2026-07-15T12:00:02.000Z'),
      },
    );

    expect(result).toMatchObject({ status: 'failed', error: 'provider unavailable' });
    expect(query.mock.calls[2]?.[1]).toContain('2026-07-16T12:00:00.000Z');
  });

  it('records timeout as a terminal state', async () => {
    vi.useFakeTimers();
    const query = vi
      .fn()
      .mockResolvedValueOnce([taskRow])
      .mockResolvedValueOnce([runRow('timeout')])
      .mockResolvedValueOnce([{ id: 'task-1' }]);
    const execute = vi.fn(
      (_task, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
    );

    const pending = processClaimedScheduleRun(
      database(query),
      claim,
      execute as ScheduledTaskExecutor,
      {
        timeoutMs: 50,
        now: () => new Date('2026-07-15T12:00:02.000Z'),
      },
    );
    await vi.advanceTimersByTimeAsync(50);

    await expect(pending).resolves.toMatchObject({ status: 'timeout' });
  });

  it('enforces timeout even when an executor ignores cancellation', async () => {
    vi.useFakeTimers();
    const query = vi
      .fn()
      .mockResolvedValueOnce([taskRow])
      .mockResolvedValueOnce([runRow('timeout')])
      .mockResolvedValueOnce([{ id: 'task-1' }]);
    const execute = vi.fn(() => new Promise<ScheduledExecutionResult>(() => {}));

    const pending = processClaimedScheduleRun(database(query), claim, execute, {
      timeoutMs: 50,
      now: () => new Date('2026-07-15T12:00:02.000Z'),
    });
    await vi.advanceTimersByTimeAsync(50);

    await expect(pending).resolves.toMatchObject({ status: 'timeout' });
  });

  it('records caller cancellation separately from timeout', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([taskRow])
      .mockResolvedValueOnce([runRow('cancelled')])
      .mockResolvedValueOnce([{ id: 'task-1' }]);
    const controller = new AbortController();
    const execute = vi.fn(
      (_task, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
    );

    const pending = processClaimedScheduleRun(
      database(query),
      claim,
      execute as ScheduledTaskExecutor,
      {
        timeoutMs: 1000,
        signal: controller.signal,
        now: () => new Date('2026-07-15T12:00:02.000Z'),
      },
    );
    controller.abort(new DOMException('client disconnected', 'AbortError'));

    await expect(pending).resolves.toMatchObject({ status: 'cancelled' });
  });
});

describe('due-schedule batch isolation', () => {
  it('keeps sweeping after one claim fails to finalize', async () => {
    vi.mocked(createClaimedUserScopedDb).mockClear();
    const claimRow = (runId: string) => ({
      ...taskRow,
      run_id: runId,
      run_started_at: claim.scheduledFor,
      scheduled_for: claim.scheduledFor,
      trigger_source: 'schedule',
    });

    const query = vi.fn(async (sql: string) => {
      if (sql.includes('lease_expires_at < now()')) return [];
      if (sql.includes('expired_candidates')) return [claimRow('run-1'), claimRow('run-2')];
      return [];
    });

    const db = database(query);
    let finalizeCalls = 0;
    vi.spyOn(db, 'transaction').mockImplementation(async () => {
      finalizeCalls += 1;
      if (finalizeCalls <= 2) throw new Error('stored timing is unparseable');
      return { id: 'run-2', status: 'success' } as never;
    });

    const executor = vi.fn().mockResolvedValue({ text: 'ok', model: 'model-1' });

    const summary = await processDueScheduleRuns({
      limit: 2,
      concurrency: 1,
      timeoutMs: 1000,
      db,
      executor: executor as unknown as ScheduledTaskExecutor,
    });

    expect(finalizeCalls).toBe(3);
    expect(executor).toHaveBeenCalledTimes(2);
    expect(createClaimedUserScopedDb).toHaveBeenNthCalledWith(1, db, claim.scope);
    expect(createClaimedUserScopedDb).toHaveBeenNthCalledWith(2, db, claim.scope);
    expect(summary.claimed).toBe(2);
  });
});
