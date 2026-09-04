import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  getScheduleSummary,
  inferTaskInterval,
  useSchedulerStore,
} from '../../stores/schedulerStore';

describe('schedulerStore, Tauri command wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSchedulerStore.setState({ jobs: [], tasks: [], isLoading: false, error: null });
  });

  it('addJob invokes scheduler_add_job (not scheduler_create_job or other variants)', async () => {
    mockInvoke.mockResolvedValueOnce('job-123');
    mockInvoke.mockResolvedValueOnce([]);

    await useSchedulerStore.getState().addJob('Test Job', '0 9 * * *', 'briefing', '{}');

    expect(mockInvoke).toHaveBeenCalledWith(
      'scheduler_add_job',
      expect.objectContaining({
        name: 'Test Job',
        schedule: '0 9 * * *',
        actionType: 'briefing',
        actionData: {},
      }),
    );
  });

  it('removeJob invokes scheduler_remove_job (not scheduler_delete_job)', async () => {
    mockInvoke.mockResolvedValueOnce(true);

    await useSchedulerStore.getState().removeJob('job-456');

    expect(mockInvoke).toHaveBeenCalledWith('scheduler_remove_job', { jobId: 'job-456' });
  });

  it('pauseJob invokes scheduler_pause_job', async () => {
    mockInvoke.mockResolvedValueOnce(true);

    await useSchedulerStore.getState().pauseJob('job-789');

    expect(mockInvoke).toHaveBeenCalledWith('scheduler_pause_job', { jobId: 'job-789' });
  });

  it('resumeJob invokes scheduler_resume_job', async () => {
    mockInvoke.mockResolvedValueOnce(true);

    await useSchedulerStore.getState().resumeJob('job-101');

    expect(mockInvoke).toHaveBeenCalledWith('scheduler_resume_job', { jobId: 'job-101' });
  });

  it('listJobs invokes scheduler_list_jobs (not scheduler_get_jobs)', async () => {
    mockInvoke.mockResolvedValueOnce([]);

    await useSchedulerStore.getState().listJobs();

    expect(mockInvoke).toHaveBeenCalledWith('scheduler_list_jobs');
  });

  it('maps the native six-field weekly cron schedule without labeling it daily', async () => {
    mockInvoke.mockResolvedValueOnce([
      {
        id: 'weekly-memory',
        name: 'memory_weekly_decay',
        schedule: '0 0 4 * * 1',
        actionType: 'script',
        actionData: {},
        status: 'active',
        createdAt: '2026-07-25T00:00:00.000Z',
        updatedAt: '2026-07-25T00:00:00.000Z',
        lastRun: null,
        nextRun: null,
        runCount: 0,
        failureCount: 0,
        description: null,
      },
    ]);

    await useSchedulerStore.getState().fetchTasks();

    const schedule = useSchedulerStore.getState().tasks[0]?.schedule;
    expect(schedule).toEqual({
      type: 'recurring',
      interval: 'weekly',
      cronExpression: '0 0 4 * * 1',
    });
    expect(schedule && getScheduleSummary(schedule)).toBe('Every week');
  });

  it.each([
    ['0 0 * * * *', 'hourly'],
    ['0 0 3 * * *', 'daily'],
    ['0 0 4 * * 1', 'weekly'],
    ['0 0 4 1 * *', 'monthly'],
    ['0 9 * * *', 'daily'],
    ['15 9 * * 2', 'weekly'],
    ['0 9 1 * *', 'monthly'],
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

  it('addJob returns the job ID from invoke response', async () => {
    mockInvoke.mockResolvedValueOnce('returned-job-id');
    mockInvoke.mockResolvedValueOnce([]);

    const jobId = await useSchedulerStore.getState().addJob('Name', 'cron', 'custom', 'data');
    expect(jobId).toBe('returned-job-id');
  });

  it('removeJob returns false when job not found', async () => {
    mockInvoke.mockResolvedValueOnce(false);

    const result = await useSchedulerStore.getState().removeJob('nonexistent-job');
    expect(result).toBe(false);
  });

  it('addJob sets isLoading=false after success', async () => {
    mockInvoke.mockResolvedValueOnce('job-id');
    mockInvoke.mockResolvedValueOnce([]);

    await useSchedulerStore.getState().addJob('Name', 'cron', 'custom', 'data');
    expect(useSchedulerStore.getState().isLoading).toBe(false);
  });

  it('addJob sets error and isLoading=false on failure', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('Tauri command failed'));

    await expect(
      useSchedulerStore.getState().addJob('Name', 'cron', 'custom', 'data'),
    ).rejects.toThrow();

    const state = useSchedulerStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.error).not.toBeNull();
  });
});
