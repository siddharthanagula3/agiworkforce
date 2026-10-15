import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInvoke = vi.fn();

vi.mock('../../lib/tauri-mock', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  listen: vi.fn().mockResolvedValue(() => {}),
  isTauri: true,
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

import { useSchedulerStore, type ScheduledTask } from '../../stores/schedulerStore';

const TASKS_FALLBACK_STORAGE_KEY = 'agiworkforce-scheduled-tasks-fallback';

function makeTask(overrides: Partial<ScheduledTask> = {}): ScheduledTask {
  return {
    id: 'task-1',
    name: 'Original Name',
    description: '',
    prompt: 'Do the thing',
    actionType: 'agiTask',
    schedule: { type: 'recurring', interval: 'daily' },
    status: 'active',
    lastRunAt: null,
    nextRunAt: Date.now() + 1000,
    runCount: 0,
    failureCount: 0,
    lastProblem: null,
    lastRunWasDueAt: null,
    lastOutput: null,
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('schedulerStore task actions, native (Tauri) failure honesty', () => {
  let setItemSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    setItemSpy = vi.spyOn(window.localStorage, 'setItem');
    useSchedulerStore.setState({ tasks: [], runningTaskIds: [], isLoading: false, error: null });
    setItemSpy.mockClear();
  });

  it('createTask rejects, sets an error, and does not add a local task or write the fallback key', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('disk full'));

    await expect(
      useSchedulerStore.getState().createTask({
        name: 'New Task',
        description: '',
        prompt: 'hello',
        schedule: { type: 'recurring', interval: 'daily' },
      }),
    ).rejects.toThrow();

    const state = useSchedulerStore.getState();
    expect(state.tasks).toEqual([]);
    expect(state.error).toBeTruthy();
    expect(setItemSpy).not.toHaveBeenCalledWith(TASKS_FALLBACK_STORAGE_KEY, expect.anything());
  });

  it('updateTask rejects and leaves the existing task exactly as it was', async () => {
    const original = makeTask();
    useSchedulerStore.setState({ tasks: [original] });
    setItemSpy.mockClear();

    mockInvoke.mockRejectedValueOnce(new Error('job not found'));

    await expect(
      useSchedulerStore.getState().updateTask('task-1', { name: 'Changed Name' }),
    ).rejects.toThrow();

    const state = useSchedulerStore.getState();
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]).toEqual(original);
    expect(state.error).toBeTruthy();
    expect(setItemSpy).not.toHaveBeenCalledWith(TASKS_FALLBACK_STORAGE_KEY, expect.anything());
  });

  it('a refused edit says why, in the words the scheduler gave, and saves nothing', async () => {
    const { toast } = await import('sonner');
    const original = makeTask();
    useSchedulerStore.setState({ tasks: [original] });
    const reason = "'soon' is not a schedule this app can read";
    mockInvoke.mockRejectedValueOnce({ type: 'Generic', details: reason });

    await expect(
      useSchedulerStore.getState().updateTask('task-1', {
        schedule: { type: 'recurring', interval: 'custom', cronExpression: 'soon' },
      }),
    ).rejects.toEqual({ type: 'Generic', details: reason });

    expect(useSchedulerStore.getState().error).toBe(reason);
    expect(toast.error).toHaveBeenCalledWith(`Failed to update task: ${reason}`);
    expect(toast.success).not.toHaveBeenCalled();
    expect(useSchedulerStore.getState().tasks[0]).toEqual(original);
  });

  it('turning a stopped task back on asks the scheduler and takes its answer', async () => {
    const stopped = makeTask({
      status: 'failed',
      failureCount: 3,
      lastProblem: { kind: 'failed', reason: 'no connection' },
    });
    useSchedulerStore.setState({ tasks: [stopped] });
    mockInvoke.mockResolvedValueOnce(true);
    mockInvoke.mockResolvedValueOnce([
      {
        id: 'task-1',
        name: 'Original Name',
        schedule: '0 9 * * *',
        plan: { type: 'recurring', interval: 'daily', timeOfDay: '09:00' },
        actionType: 'agiTask',
        actionData: { prompt: 'Do the thing' },
        status: 'active',
        createdAt: '2026-07-25T00:00:00.000Z',
        updatedAt: '2026-07-25T00:00:00.000Z',
        runCount: 3,
        failureCount: 0,
        lastProblem: null,
        description: null,
      },
    ]);

    await useSchedulerStore.getState().toggleTask('task-1');

    expect(mockInvoke).toHaveBeenCalledWith('scheduler_toggle_job', { id: 'task-1' });
    const task = useSchedulerStore.getState().tasks[0];
    expect(task?.status).toBe('active');
    expect(task?.failureCount).toBe(0);
    expect(task?.lastProblem).toBeNull();
  });

  it('follows a run from its start to its end, and stops it through the scheduler', async () => {
    const { listen } = await import('../../lib/tauri-mock');
    const handlers = new Map<string, (event: { payload: unknown }) => void>();
    vi.mocked(listen).mockImplementation(async (event, handler) => {
      handlers.set(event as string, handler as (event: { payload: unknown }) => void);
      return () => undefined;
    });
    useSchedulerStore.setState({ tasks: [makeTask()], runningTaskIds: [] });

    await useSchedulerStore.getState().initEventListeners();
    handlers.get('scheduler:run_started')?.({ payload: { jobId: 'task-1' } });
    handlers.get('scheduler:run_started')?.({ payload: { jobId: 'task-1' } });
    expect(useSchedulerStore.getState().runningTaskIds).toEqual(['task-1']);

    mockInvoke.mockResolvedValueOnce(true);
    await useSchedulerStore.getState().stopRun('task-1');
    expect(mockInvoke).toHaveBeenCalledWith('scheduler_stop_run', { id: 'task-1' });
    expect(useSchedulerStore.getState().runningTaskIds).toEqual(['task-1']);

    handlers.get('scheduler:job_executed')?.({
      payload: {
        id: 'task-1',
        name: 'Original Name',
        schedule: '0 9 * * *',
        actionType: 'agiTask',
        actionData: { prompt: 'Do the thing' },
        status: 'active',
        createdAt: '2026-07-25T00:00:00.000Z',
        updatedAt: '2026-07-25T00:00:00.000Z',
        runCount: 0,
        failureCount: 0,
        lastProblem: { kind: 'skipped', reason: 'It was stopped before it finished.' },
        lastRunWasDue: null,
        description: null,
      },
    });
    const state = useSchedulerStore.getState();
    expect(state.runningTaskIds).toEqual([]);
    expect(state.tasks[0]?.lastProblem?.reason).toBe('It was stopped before it finished.');
    useSchedulerStore.getState().cleanupEventListeners();
  });

  it('reads which tasks are running when it loads the list', async () => {
    mockInvoke.mockResolvedValueOnce([]);
    mockInvoke.mockResolvedValueOnce(['task-9']);

    await useSchedulerStore.getState().fetchTasks();

    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'scheduler_running_jobs');
    expect(useSchedulerStore.getState().runningTaskIds).toEqual(['task-9']);
  });

  it('deleteTask rejects and does not remove the task', async () => {
    const original = makeTask();
    useSchedulerStore.setState({ tasks: [original] });
    setItemSpy.mockClear();

    mockInvoke.mockRejectedValueOnce(new Error('permission denied'));

    await expect(useSchedulerStore.getState().deleteTask('task-1')).rejects.toThrow();

    const state = useSchedulerStore.getState();
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]).toEqual(original);
    expect(setItemSpy).not.toHaveBeenCalledWith(TASKS_FALLBACK_STORAGE_KEY, expect.anything());
  });

  it('toggleTask rejects and does not flip the task status', async () => {
    const original = makeTask({ status: 'active' });
    useSchedulerStore.setState({ tasks: [original] });
    setItemSpy.mockClear();

    mockInvoke.mockRejectedValueOnce(new Error('write lock failed'));

    await expect(useSchedulerStore.getState().toggleTask('task-1')).rejects.toThrow();

    const state = useSchedulerStore.getState();
    expect(state.tasks[0]?.status).toBe('active');
    expect(setItemSpy).not.toHaveBeenCalledWith(TASKS_FALLBACK_STORAGE_KEY, expect.anything());
  });

  it('runNow rejects and does not record a run', async () => {
    const original = makeTask({ runCount: 2, lastRunAt: null });
    useSchedulerStore.setState({ tasks: [original] });
    setItemSpy.mockClear();

    mockInvoke.mockRejectedValueOnce(new Error('tool guard rejected command'));

    await expect(useSchedulerStore.getState().runNow('task-1')).rejects.toThrow();

    const state = useSchedulerStore.getState();
    expect(state.tasks[0]?.runCount).toBe(2);
    expect(state.tasks[0]?.lastRunAt).toBeNull();
    expect(setItemSpy).not.toHaveBeenCalledWith(TASKS_FALLBACK_STORAGE_KEY, expect.anything());
  });

  it('on success, createTask refreshes from the backend instead of trusting a local guess', async () => {
    mockInvoke.mockResolvedValueOnce('backend-job-id');
    mockInvoke.mockResolvedValueOnce([]);

    await useSchedulerStore.getState().createTask({
      name: 'New Task',
      description: '',
      prompt: 'hello',
      schedule: { type: 'recurring', interval: 'daily' },
    });

    expect(mockInvoke).toHaveBeenCalledWith('scheduler_add_job', expect.any(Object));
    expect(mockInvoke).toHaveBeenCalledWith('scheduler_list_jobs');
    expect(useSchedulerStore.getState().error).toBeNull();
  });
});
