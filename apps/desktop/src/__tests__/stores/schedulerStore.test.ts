/**
 * Regression tests for scheduler store Tauri command wiring (audit fix).
 *
 * The audit found that scheduledTaskStore used incorrect command names.
 * These tests verify that schedulerStore (the authoritative implementation)
 * invokes the correct `scheduler_*` command names when performing CRUD
 * operations on scheduled jobs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// The store imports from ../../lib/tauri-mock (not @tauri-apps/api/core directly)
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

// Import after mocking to get the store wired to the mocked invoke
import { useSchedulerStore } from '../../stores/schedulerStore';

describe('schedulerStore — Tauri command wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state
    useSchedulerStore.setState({ jobs: [], isLoading: false, error: null });
  });

  it('addJob invokes scheduler_add_job (not scheduler_create_job or other variants)', async () => {
    mockInvoke.mockResolvedValueOnce('job-123'); // addJob returns a string ID
    mockInvoke.mockResolvedValueOnce([]); // listJobs called after add

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
    mockInvoke.mockResolvedValueOnce([]); // listJobs

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
