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
    schedule: { type: 'recurring', interval: 'daily' },
    status: 'active',
    lastRunAt: null,
    nextRunAt: Date.now() + 1000,
    runCount: 0,
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
    useSchedulerStore.setState({ tasks: [], isLoading: false, error: null });
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
        status: 'active',
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
      status: 'active',
    });

    expect(mockInvoke).toHaveBeenCalledWith('scheduler_add_job', expect.any(Object));
    expect(mockInvoke).toHaveBeenCalledWith('scheduler_list_jobs');
    expect(useSchedulerStore.getState().error).toBeNull();
  });
});
