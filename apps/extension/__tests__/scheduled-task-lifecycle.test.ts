import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertScheduledExecutionSucceeded,
  dispatchScheduledPrompt,
  handleCreateScheduledTask,
  handleDeleteScheduledTask,
  handleListScheduledTasks,
  handleUpdateScheduledTask,
  loadScheduledTasks,
  registerTaskAlarm,
  recordScheduledTaskRun,
  restoreScheduledTaskAlarms,
} from '../src/features/background/tasks';
import type { ScheduledTask } from '../src/types';

const alarms = new Map<string, chrome.alarms.Alarm>();
let storedTasks: ScheduledTask[] = [];

const chromeMock = {
  runtime: { lastError: undefined as chrome.runtime.LastError | undefined },
  storage: {
    local: {
      get: vi.fn(
        (
          _key: string,
          callback?: (result: Record<string, unknown>) => void,
        ): Promise<Record<string, unknown>> | void => {
          const result = { agi_scheduled_tasks: storedTasks };
          if (callback) {
            callback(result);
            return;
          }
          return Promise.resolve(result);
        },
      ),
      set: vi.fn(async () => undefined),
    },
  },
  alarms: {
    get: vi.fn(async (name: string) => alarms.get(name)),
    create: vi.fn(async (name: string, info: chrome.alarms.AlarmCreateInfo) => {
      alarms.set(name, {
        name,
        scheduledTime: Date.now() + (info.delayInMinutes ?? 0) * 60_000,
        periodInMinutes: info.periodInMinutes,
      });
    }),
    clear: vi.fn(async (name: string) => alarms.delete(name)),
  },
};

(globalThis as unknown as { chrome: typeof chromeMock }).chrome = chromeMock;

function task(overrides: Partial<ScheduledTask> = {}): ScheduledTask {
  return {
    id: 'task-1',
    name: 'Daily brief',
    enabled: true,
    scheduleType: 'daily',
    scheduleValue: '1',
    createdAt: Date.now(),
    createdByOrigin: '__extension_page__',
    prompt: 'Summarize this page',
    ...overrides,
  };
}

describe('scheduled task lifecycle', () => {
  beforeEach(() => {
    alarms.clear();
    storedTasks = [];
    vi.clearAllMocks();
    chromeMock.runtime.lastError = undefined;
    chromeMock.storage.local.set.mockImplementation(async (items: Record<string, unknown>) => {
      if (Array.isArray(items['agi_scheduled_tasks'])) {
        storedTasks = items['agi_scheduled_tasks'] as ScheduledTask[];
      }
    });
  });

  it('treats a task storage read failure as unknown state, never an empty authoritative list', async () => {
    storedTasks = [task({ managedCloudAccountId: 'account-a' })];
    chromeMock.runtime.lastError = { message: 'storage unavailable' };

    await expect(loadScheduledTasks()).rejects.toThrow('storage unavailable');

    expect(storedTasks).toHaveLength(1);
  });

  it('preserves an existing alarm during service-worker restoration', async () => {
    const existing = task();
    alarms.set('agi_task_task-1', {
      name: 'agi_task_task-1',
      scheduledTime: Date.now() + 5_000,
      periodInMinutes: 1_440,
    });
    storedTasks = [existing];

    await restoreScheduledTaskAlarms();

    expect(chromeMock.alarms.create).not.toHaveBeenCalled();
  });

  it('creates an alarm when no durable Chrome alarm exists', async () => {
    await registerTaskAlarm(task());

    expect(chromeMock.alarms.create).toHaveBeenCalledTimes(1);
    expect(chromeMock.alarms.create).toHaveBeenCalledWith('agi_task_task-1', {
      periodInMinutes: 1_440,
      delayInMinutes: 1_440,
    });
  });

  it('does not report scheduled prompt completion before chat execution settles', async () => {
    let resolveChat!: () => void;
    const chatFinished = new Promise<void>((resolve) => {
      resolveChat = resolve;
    });
    const dispatch = vi.fn(() => chatFinished);
    let completed = false;

    const execution = dispatchScheduledPrompt(task(), dispatch).then(() => {
      completed = true;
    });
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledWith('Summarize this page'));
    expect(completed).toBe(false);

    resolveChat();
    await execution;
    expect(completed).toBe(true);
  });

  it('bounds corrupted stored prompts before dispatch', async () => {
    const dispatch = vi.fn(async () => undefined);
    await dispatchScheduledPrompt(task({ prompt: 'x'.repeat(20_000) }), dispatch);

    expect(dispatch.mock.calls[0]?.[0]).toHaveLength(10_000);
  });

  it('normalizes prompt identity and refuses whitespace-only paid work', async () => {
    const dispatch = vi.fn(async () => undefined);

    await dispatchScheduledPrompt(task({ prompt: '  Summarize this page  ' }), dispatch);
    await dispatchScheduledPrompt(task({ prompt: '   ' }), dispatch);

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith('Summarize this page');
  });

  it('accepts only explicit terminal success from scheduled work', () => {
    expect(() => assertScheduledExecutionSucceeded({ success: true })).not.toThrow();
    expect(() => assertScheduledExecutionSucceeded({ status: 'success' })).not.toThrow();

    expect(() =>
      assertScheduledExecutionSucceeded({ success: false, error: 'tab closed' }),
    ).toThrow('tab closed');
    expect(() =>
      assertScheduledExecutionSucceeded({ status: 'error', message: 'authentication required' }),
    ).toThrow('authentication required');
    expect(() => assertScheduledExecutionSucceeded(undefined)).toThrow(
      'did not return a terminal result',
    );
    expect(() => assertScheduledExecutionSucceeded({})).toThrow('did not return a terminal result');
    expect(() =>
      assertScheduledExecutionSucceeded({ success: true, status: 'error', message: 'conflict' }),
    ).toThrow('conflict');
    expect(() =>
      assertScheduledExecutionSucceeded({ success: false, status: 'success' }),
    ).toThrow();
  });

  it('propagates scheduled prompt failures instead of resolving as completed', async () => {
    await expect(
      dispatchScheduledPrompt(task(), async () => {
        throw new Error('Managed Cloud unavailable');
      }),
    ).rejects.toThrow('Managed Cloud unavailable');
  });

  it('fails closed when a prompt schedule is created without account authorization', async () => {
    const response = await handleCreateScheduledTask({
      type: 'CREATE_SCHEDULED_TASK',
      task: {
        name: 'Unbound',
        enabled: true,
        scheduleType: 'daily',
        scheduleValue: '1',
        prompt: 'Charge whichever account is current',
        createdByOrigin: '__extension_page__',
      },
    });

    expect(response).toMatchObject({ success: false, error: expect.stringContaining('Sign in') });
    expect(storedTasks).toEqual([]);
    expect(chromeMock.alarms.create).not.toHaveBeenCalled();
  });

  it('rejects whitespace-only and oversized prompts before persisting or creating alarms', async () => {
    const baseTask = {
      name: 'Invalid prompt',
      enabled: true,
      scheduleType: 'daily' as const,
      scheduleValue: '1',
      createdByOrigin: '__extension_page__',
    };

    const whitespace = await handleCreateScheduledTask(
      {
        type: 'CREATE_SCHEDULED_TASK',
        task: { ...baseTask, prompt: '   ' },
      },
      'account-a',
      false,
    );
    const oversized = await handleCreateScheduledTask(
      {
        type: 'CREATE_SCHEDULED_TASK',
        task: { ...baseTask, prompt: 'x'.repeat(10_001) },
      },
      'account-a',
      true,
    );

    expect(whitespace).toMatchObject({ success: false, error: expect.stringContaining('empty') });
    expect(oversized).toMatchObject({
      success: false,
      error: expect.stringContaining('at most'),
    });
    expect(storedTasks).toEqual([]);
    expect(chromeMock.storage.local.set).not.toHaveBeenCalled();
    expect(chromeMock.alarms.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid prompt update without changing storage or alarm state', async () => {
    storedTasks = [task({ managedCloudAccountId: 'account-a' })];

    const response = await handleUpdateScheduledTask(
      {
        type: 'UPDATE_SCHEDULED_TASK',
        taskId: 'task-1',
        updates: { prompt: '   ' },
      },
      'account-a',
      true,
    );

    expect(response).toMatchObject({ success: false, error: expect.stringContaining('empty') });
    expect(storedTasks[0]?.prompt).toBe('Summarize this page');
    expect(chromeMock.storage.local.set).not.toHaveBeenCalled();
    expect(chromeMock.alarms.clear).not.toHaveBeenCalled();
    expect(chromeMock.alarms.create).not.toHaveBeenCalled();
  });

  it('normalizes a valid prompt before binding and persistence', async () => {
    const response = await handleCreateScheduledTask(
      {
        type: 'CREATE_SCHEDULED_TASK',
        task: {
          name: 'Normalized',
          enabled: true,
          scheduleType: 'daily',
          scheduleValue: '1',
          prompt: '  Run for account A  ',
          createdByOrigin: '__extension_page__',
        },
      },
      'account-a',
      false,
    );

    expect(response.success).toBe(true);
    expect(storedTasks[0]).toMatchObject({
      prompt: 'Run for account A',
      managedCloudAccountId: 'account-a',
    });
  });

  it('binds a prompt schedule to the explicitly authorizing account', async () => {
    const response = await handleCreateScheduledTask(
      {
        type: 'CREATE_SCHEDULED_TASK',
        task: {
          name: 'Bound',
          enabled: true,
          scheduleType: 'daily',
          scheduleValue: '1',
          prompt: 'Run for account A',
          createdByOrigin: '__extension_page__',
        },
      },
      'account-a',
    );

    expect(response.success).toBe(true);
    expect(storedTasks[0]?.managedCloudAccountId).toBe('account-a');
  });

  it('refuses a managed create when its exact owner retires before the serialized commit', async () => {
    const response = await handleCreateScheduledTask(
      {
        type: 'CREATE_SCHEDULED_TASK',
        task: {
          name: 'Stale A task',
          enabled: true,
          scheduleType: 'daily',
          scheduleValue: '1',
          prompt: 'Must not bind to B',
          createdByOrigin: '__extension_page__',
        },
      },
      'account-a',
      true,
      () => false,
    );

    expect(response).toMatchObject({ success: false, error: expect.stringContaining('changed') });
    expect(storedTasks).toEqual([]);
    expect(chromeMock.alarms.create).not.toHaveBeenCalled();
  });

  it('binds a prompt-only shortcut schedule to the authorizing account', async () => {
    const response = await handleCreateScheduledTask(
      {
        type: 'CREATE_SCHEDULED_TASK',
        task: {
          name: 'Shortcut prompt',
          enabled: true,
          scheduleType: 'daily',
          scheduleValue: '1',
          shortcutId: 'shortcut-prompt-1',
          createdByOrigin: '__extension_page__',
        },
      },
      'account-a',
      true,
    );

    expect(response.success).toBe(true);
    expect(storedTasks[0]).toMatchObject({
      shortcutId: 'shortcut-prompt-1',
      managedCloudAccountId: 'account-a',
    });
  });

  it('requires fresh account authorization when a task prompt changes', async () => {
    storedTasks = [task({ managedCloudAccountId: 'account-a' })];

    const rejected = await handleUpdateScheduledTask({
      type: 'UPDATE_SCHEDULED_TASK',
      taskId: 'task-1',
      updates: { prompt: 'A materially different paid request' },
    });
    expect(rejected).toMatchObject({
      success: false,
      error: expect.stringContaining('not found'),
    });
    expect(storedTasks[0]?.prompt).toBe('Summarize this page');

    const accepted = await handleUpdateScheduledTask(
      {
        type: 'UPDATE_SCHEDULED_TASK',
        taskId: 'task-1',
        updates: { prompt: 'A materially different paid request' },
      },
      'account-a',
    );
    expect(accepted.success).toBe(true);
    expect(storedTasks[0]).toMatchObject({
      prompt: 'A materially different paid request',
      managedCloudAccountId: 'account-a',
    });
  });

  it("does not reveal or mutate another account's prompt schedules", async () => {
    storedTasks = [
      task({ id: 'task-a', managedCloudAccountId: 'account-a' }),
      task({ id: 'local-task', prompt: undefined, shortcutId: 'shortcut-1' }),
    ];

    const signedOut = await handleListScheduledTasks();
    const accountB = await handleListScheduledTasks('account-b');
    const accountA = await handleListScheduledTasks('account-a');
    expect(signedOut.tasks?.map((entry) => entry.id)).toEqual(['local-task']);
    expect(accountB.tasks?.map((entry) => entry.id)).toEqual(['local-task']);
    expect(accountA.tasks?.map((entry) => entry.id).sort()).toEqual(['local-task', 'task-a']);

    const update = await handleUpdateScheduledTask(
      { type: 'UPDATE_SCHEDULED_TASK', taskId: 'task-a', updates: { enabled: false } },
      'account-b',
    );
    const deletion = await handleDeleteScheduledTask(
      { type: 'DELETE_SCHEDULED_TASK', taskId: 'task-a' },
      'account-b',
    );
    expect(update).toMatchObject({ success: false, error: expect.stringContaining('not found') });
    expect(deletion).toMatchObject({
      success: false,
      error: expect.stringContaining('not found'),
    });
    expect(storedTasks.find((entry) => entry.id === 'task-a')).toMatchObject({ enabled: true });
  });

  it('invalidates execution only after mutation authority is proven and before storage commits', async () => {
    storedTasks = [task({ managedCloudAccountId: 'account-a' })];
    const events: string[] = [];
    const invalidate = vi.fn(() => {
      events.push('invalidate');
      expect(storedTasks[0]?.enabled).toBe(true);
    });
    chromeMock.storage.local.set.mockImplementation(async (items: Record<string, unknown>) => {
      events.push('save');
      storedTasks = items['agi_scheduled_tasks'] as ScheduledTask[];
    });

    const rejected = await handleDeleteScheduledTask(
      { type: 'DELETE_SCHEDULED_TASK', taskId: 'task-1' },
      'account-b',
      invalidate,
    );
    expect(rejected.success).toBe(false);
    expect(invalidate).not.toHaveBeenCalled();

    const accepted = await handleDeleteScheduledTask(
      { type: 'DELETE_SCHEDULED_TASK', taskId: 'task-1' },
      'account-a',
      invalidate,
    );
    expect(accepted.success).toBe(true);
    expect(events).toEqual(['invalidate', 'save']);
  });

  it('does not invalidate or mutate when exact owner authority expires at commit', async () => {
    storedTasks = [task({ managedCloudAccountId: 'account-a' })];
    const invalidate = vi.fn();

    const response = await handleUpdateScheduledTask(
      { type: 'UPDATE_SCHEDULED_TASK', taskId: 'task-1', updates: { enabled: false } },
      'account-a',
      undefined,
      invalidate,
      undefined,
      () => false,
    );

    expect(response).toMatchObject({ success: false, error: expect.stringContaining('changed') });
    expect(invalidate).not.toHaveBeenCalled();
    expect(storedTasks[0]?.enabled).toBe(true);
  });

  it.each(['update', 'delete'] as const)(
    'rechecks exact owner after an awaited %s pre-commit hook',
    async (operation) => {
      storedTasks = [task({ managedCloudAccountId: 'account-a' })];
      let authorized = true;
      let release!: () => void;
      const beforeCommit = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      );

      const pending =
        operation === 'update'
          ? handleUpdateScheduledTask(
              { type: 'UPDATE_SCHEDULED_TASK', taskId: 'task-1', updates: { enabled: false } },
              'account-a',
              undefined,
              beforeCommit,
              undefined,
              () => authorized,
            )
          : handleDeleteScheduledTask(
              { type: 'DELETE_SCHEDULED_TASK', taskId: 'task-1' },
              'account-a',
              beforeCommit,
              () => authorized,
            );
      await vi.waitFor(() => expect(beforeCommit).toHaveBeenCalledOnce());
      authorized = false;
      release();

      await expect(pending).resolves.toMatchObject({
        success: false,
        error: expect.stringContaining('changed'),
      });
      expect(storedTasks).toHaveLength(1);
      expect(storedTasks[0]?.enabled).toBe(true);
      expect(chromeMock.storage.local.set).not.toHaveBeenCalled();
    },
  );

  it('does not stamp lastRun after the execution loses commit authority', async () => {
    storedTasks = [task({ lastRun: undefined })];

    await expect(recordScheduledTaskRun('task-1', 2_000, () => false)).resolves.toBe(false);
    expect(storedTasks[0]?.lastRun).toBeUndefined();
    expect(chromeMock.storage.local.set).not.toHaveBeenCalled();
  });

  it('serializes concurrent task creation so neither task is overwritten', async () => {
    const pendingWrites: Array<() => void> = [];
    chromeMock.storage.local.set.mockImplementation(
      (items: Record<string, unknown>) =>
        new Promise<void>((resolve) => {
          pendingWrites.push(() => {
            storedTasks = items['agi_scheduled_tasks'] as ScheduledTask[];
            resolve();
          });
        }),
    );

    const createOne = handleCreateScheduledTask(
      {
        type: 'CREATE_SCHEDULED_TASK',
        task: {
          name: 'One',
          enabled: true,
          scheduleType: 'daily',
          scheduleValue: '1',
          prompt: 'First',
          createdByOrigin: '__extension_page__',
        },
      },
      'account-a',
    );
    const createTwo = handleCreateScheduledTask(
      {
        type: 'CREATE_SCHEDULED_TASK',
        task: {
          name: 'Two',
          enabled: true,
          scheduleType: 'daily',
          scheduleValue: '1',
          prompt: 'Second',
          createdByOrigin: '__extension_page__',
        },
      },
      'account-a',
    );

    await vi.waitFor(() => expect(pendingWrites.length).toBeGreaterThan(0));
    expect(pendingWrites).toHaveLength(1);
    pendingWrites.shift()!();
    await vi.waitFor(() => expect(pendingWrites).toHaveLength(1));
    pendingWrites.shift()!();
    await Promise.all([createOne, createTwo]);

    expect(storedTasks.map((entry) => entry.name).sort()).toEqual(['One', 'Two']);
  });
});
