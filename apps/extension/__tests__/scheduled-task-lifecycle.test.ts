import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertScheduledExecutionSucceeded,
  dispatchScheduledPrompt,
  handleCreateScheduledTask,
  registerTaskAlarm,
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

    const createOne = handleCreateScheduledTask({
      type: 'CREATE_SCHEDULED_TASK',
      task: {
        name: 'One',
        enabled: true,
        scheduleType: 'daily',
        scheduleValue: '1',
        prompt: 'First',
        createdByOrigin: '__extension_page__',
      },
    });
    const createTwo = handleCreateScheduledTask({
      type: 'CREATE_SCHEDULED_TASK',
      task: {
        name: 'Two',
        enabled: true,
        scheduleType: 'daily',
        scheduleValue: '1',
        prompt: 'Second',
        createdByOrigin: '__extension_page__',
      },
    });

    await vi.waitFor(() => expect(pendingWrites.length).toBeGreaterThan(0));
    expect(pendingWrites).toHaveLength(1);
    pendingWrites.shift()!();
    await vi.waitFor(() => expect(pendingWrites).toHaveLength(1));
    pendingWrites.shift()!();
    await Promise.all([createOne, createTwo]);

    expect(storedTasks.map((entry) => entry.name).sort()).toEqual(['One', 'Two']);
  });
});
