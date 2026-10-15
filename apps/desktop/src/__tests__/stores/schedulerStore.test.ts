import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';

const mockInvoke = vi.fn();

vi.mock('../../lib/tauri-mock', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn(),
  once: vi.fn(),
  isTauri: false,
  isTauriContext: () => false,
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

import {
  type ScheduledJob,
  type TaskSchedule,
  completeSchedule,
  getProblemSummary,
  getScheduleSummary,
  inferTaskInterval,
  scheduledTaskFromJob,
  useSchedulerStore,
} from '../../stores/schedulerStore';
import { getSimpleErrorMessage } from '../../lib/errorMessages';

const ZONE = 'America/New_York';

function inZone(timeZone: string) {
  const options = Intl.DateTimeFormat().resolvedOptions();
  return vi
    .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
    .mockReturnValue({ ...options, timeZone });
}

function storedJob(overrides: Partial<ScheduledJob> = {}): ScheduledJob {
  return {
    id: 'job-1',
    name: 'Morning summary',
    schedule: '0 9 * * *',
    actionType: 'agiTask',
    actionData: { prompt: 'Summarise my inbox' },
    status: 'active',
    createdAt: '2026-07-25T00:00:00.000Z',
    updatedAt: '2026-07-25T00:00:00.000Z',
    lastRun: null,
    nextRun: null,
    runCount: 0,
    failureCount: 0,
    description: null,
    ...overrides,
  };
}

describe('schedulerStore, Tauri command wiring', () => {
  let zone: ReturnType<typeof inZone>;

  beforeEach(() => {
    vi.clearAllMocks();
    zone = inZone(ZONE);
    useSchedulerStore.setState({ jobs: [], tasks: [], isLoading: false, error: null });
  });

  afterEach(() => zone.mockRestore());

  it('listJobs invokes scheduler_list_jobs (not scheduler_get_jobs)', async () => {
    mockInvoke.mockResolvedValueOnce([]);

    await useSchedulerStore.getState().listJobs();

    expect(mockInvoke).toHaveBeenCalledWith('scheduler_list_jobs');
  });

  it('shows a job stored before schedules were typed as the UTC cron it runs on', async () => {
    mockInvoke.mockResolvedValueOnce([
      storedJob({ id: 'weekly-memory', name: 'memory_weekly_decay', schedule: '0 0 4 * * 1' }),
    ]);

    await useSchedulerStore.getState().fetchTasks();

    const schedule = useSchedulerStore.getState().tasks[0]?.schedule;
    expect(schedule).toEqual({
      type: 'recurring',
      interval: 'custom',
      cronExpression: '0 0 4 * * 1',
      timezone: 'UTC',
    });
    expect(schedule && getScheduleSummary(schedule)).toBe('Every week (UTC)');
  });

  it('shows a typed job as the schedule it was given, with its problem and its kind', () => {
    const plan: TaskSchedule = {
      type: 'recurring',
      interval: 'weekly',
      timeOfDay: '16:00',
      weekday: 5,
      timezone: ZONE,
    };
    const task = scheduledTaskFromJob(
      storedJob({
        plan,
        status: 'failed',
        failureCount: 3,
        lastProblem: { kind: 'failed', reason: 'no connection' },
      }),
    );

    expect(task.schedule).toEqual(plan);
    expect(task.actionType).toBe('agiTask');
    expect(getScheduleSummary(task.schedule)).toBe('Every Friday at 16:00');
    expect(getProblemSummary(task)).toBe(
      'Stopped after 3 failed runs in a row. Last error: no connection',
    );
    expect(
      getProblemSummary({
        ...task,
        status: 'active',
        lastProblem: { kind: 'skipped', reason: 'Switch to Cloud to run it.' },
      }),
    ).toBe('Last run skipped: Switch to Cloud to run it.');
    expect(getProblemSummary({ ...task, status: 'active', lastProblem: null })).toBeNull();
  });

  it.each([
    [
      { type: 'recurring', interval: 'hourly' },
      { type: 'recurring', interval: 'hourly' },
    ],
    [
      { type: 'recurring', interval: 'daily' },
      { type: 'recurring', interval: 'daily', timeOfDay: '09:00' },
    ],
    [
      { type: 'recurring', interval: 'weekly', timeOfDay: '07:30', weekday: 3 },
      { type: 'recurring', interval: 'weekly', timeOfDay: '07:30', weekday: 3 },
    ],
    [
      { type: 'recurring', interval: 'weekly', cronExpression: '0 9 * * *' },
      { type: 'recurring', interval: 'weekly', timeOfDay: '09:00', weekday: 1 },
    ],
    [
      { type: 'recurring', interval: 'monthly' },
      { type: 'recurring', interval: 'monthly', timeOfDay: '09:00', dayOfMonth: 1 },
    ],
    [
      { type: 'recurring', interval: 'custom', cronExpression: ' 0 9 * * 1 ' },
      { type: 'recurring', interval: 'custom', cronExpression: '0 9 * * 1' },
    ],
    [
      { type: 'once', runAt: 1_800_000_000_000, interval: 'daily' },
      { type: 'once', runAt: 1_800_000_000_000 },
    ],
  ] as const)('createTask sends %j as the schedule the form shows', async (chosen, sent) => {
    mockInvoke.mockResolvedValueOnce('job-123');
    mockInvoke.mockResolvedValueOnce([]);

    await useSchedulerStore.getState().createTask({
      name: 'Morning summary',
      description: 'Before stand-up',
      prompt: 'Summarise my inbox',
      schedule: chosen as TaskSchedule,
    });

    expect(mockInvoke).toHaveBeenCalledWith('scheduler_add_job', {
      name: 'Morning summary',
      prompt: 'Summarise my inbox',
      description: 'Before stand-up',
      schedule: { ...sent, timezone: ZONE },
    });
  });

  it('updateTask sends the edited schedule, not the one the task had', async () => {
    mockInvoke.mockResolvedValueOnce(true);
    mockInvoke.mockResolvedValueOnce([]);

    await useSchedulerStore.getState().updateTask('job-1', {
      name: 'Weekly summary',
      description: '',
      prompt: 'Summarise the week',
      schedule: {
        type: 'recurring',
        interval: 'weekly',
        timeOfDay: '16:00',
        weekday: 5,
        cronExpression: '0 9 * * *',
        timezone: 'Europe/Paris',
      },
    });

    expect(mockInvoke).toHaveBeenCalledWith('scheduler_update_job', {
      id: 'job-1',
      updates: {
        name: 'Weekly summary',
        description: '',
        prompt: 'Summarise the week',
        schedule: {
          type: 'recurring',
          interval: 'weekly',
          timeOfDay: '16:00',
          weekday: 5,
          timezone: 'Europe/Paris',
        },
      },
    });
  });

  it('sends a stored schedule back unchanged, so an untouched one is not an edit', () => {
    const stored: TaskSchedule[] = [
      { type: 'once', runAt: 1_800_000_000_000, timezone: 'Asia/Tokyo' },
      { type: 'recurring', interval: 'hourly', timezone: ZONE },
      { type: 'recurring', interval: 'daily', timeOfDay: '06:45', timezone: ZONE },
      {
        type: 'recurring',
        interval: 'monthly',
        timeOfDay: '09:00',
        dayOfMonth: 28,
        timezone: ZONE,
      },
      { type: 'recurring', interval: 'custom', cronExpression: '0 0 3 * * *', timezone: 'UTC' },
    ];
    for (const schedule of stored) {
      expect(completeSchedule(schedule)).toEqual(schedule);
    }
  });

  it("states the time zone of a schedule that is not in this computer's zone", () => {
    const daily: TaskSchedule = { type: 'recurring', interval: 'daily', timeOfDay: '09:00' };
    expect(getScheduleSummary({ ...daily, timezone: ZONE })).toBe('Every day at 09:00');
    expect(getScheduleSummary({ ...daily, timezone: 'Europe/Paris' })).toBe(
      'Every day at 09:00 (Europe/Paris)',
    );
    expect(
      getScheduleSummary({
        type: 'recurring',
        interval: 'monthly',
        dayOfMonth: 15,
        timezone: ZONE,
      }),
    ).toBe('Day 15 of every month at 09:00');
    expect(
      getScheduleSummary({
        type: 'recurring',
        interval: 'custom',
        cronExpression: '*/15 9-17 * * 1-5',
        timezone: ZONE,
      }),
    ).toBe('Custom: */15 9-17 * * 1-5');
  });

  it('keeps the reason a scheduler command gives for refusing', () => {
    expect(
      getSimpleErrorMessage({
        type: 'Generic',
        details: 'Pick a time in the future for a task that runs once.',
      }),
    ).toBe('Pick a time in the future for a task that runs once.');
    expect(getSimpleErrorMessage({ type: 'Generic', details: '' })).toBe(
      'Something went wrong. Please try again.',
    );
  });

  it.each([
    ['0 0 * * * *', 'hourly'],
    ['0 0 3 * * *', 'daily'],
    ['0 0 4 * * 1', 'weekly'],
    ['0 0 4 1 * *', 'monthly'],
    ['0 9 * * *', 'daily'],
    ['15 9 * * 2', 'weekly'],
    ['0 9 1 * *', 'monthly'],
    ['*/15 9-17 * * 1-5', 'custom'],
    ['0 9,17 * * *', 'custom'],
    ['30 0 9 * * *', 'custom'],
    ['0 9 * 6 *', 'custom'],
    ['not a cron expression', 'custom'],
  ] as const)('infers %s as %s', (cronExpression, expectedInterval) => {
    expect(inferTaskInterval(cronExpression)).toBe(expectedInterval);
  });

  it('getNextRuns invokes scheduler_get_next_runs with a limit parameter', async () => {
    mockInvoke.mockResolvedValueOnce([]);

    await useSchedulerStore.getState().getNextRuns(5);

    expect(mockInvoke).toHaveBeenCalledWith('scheduler_get_next_runs', { limit: 5 });
  });

  it('getNextRuns defaults to limit 10 when no argument provided', async () => {
    mockInvoke.mockResolvedValueOnce([]);

    await useSchedulerStore.getState().getNextRuns();

    expect(mockInvoke).toHaveBeenCalledWith('scheduler_get_next_runs', { limit: 10 });
  });
});
