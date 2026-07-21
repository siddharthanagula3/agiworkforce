import type {
  ScheduledTask,
  ExtensionResponse,
  CreateScheduledTaskMessage,
  UpdateScheduledTaskMessage,
  DeleteScheduledTaskMessage,
} from '../../types';
import { logger } from '../../utils';
import {
  ORIGIN_EXTENSION_PAGE,
  generateRecordId,
  validateShortcutActions,
} from '../../background/policy';

const TASKS_STORAGE_KEY = 'agi_scheduled_tasks';
const MAX_TASKS = 50;
const TASK_ALARM_PREFIX = 'agi_task_';
export const TASK_PROMPT_MAX_CHARS = 10_000;
let taskMutationQueue: Promise<void> = Promise.resolve();

export { TASK_ALARM_PREFIX };

function scheduledExecutionError(result: Record<string, unknown>): string {
  const candidate =
    typeof result['error'] === 'string'
      ? result['error']
      : typeof result['message'] === 'string'
        ? result['message']
        : undefined;
  return candidate?.trim().slice(0, 200) || 'Scheduled work failed.';
}

/** Fail closed unless a scheduled shortcut or Managed Cloud turn explicitly succeeded. */
export function assertScheduledExecutionSucceeded(result: unknown): void {
  if (!result || typeof result !== 'object') {
    throw new Error('Scheduled work did not return a terminal result.');
  }
  const record = result as Record<string, unknown>;
  const successFlag = record['success'];
  const status = record['status'];
  if (successFlag === undefined && status === undefined) {
    throw new Error('Scheduled work did not return a terminal result.');
  }
  const contradictory = successFlag === false || (status !== undefined && status !== 'success');
  const succeeded = successFlag === true || status === 'success';
  if (!succeeded || contradictory) {
    throw new Error(scheduledExecutionError(record));
  }
}

export async function loadScheduledTasks(): Promise<ScheduledTask[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(TASKS_STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError) {
        resolve([]);
        return;
      }
      resolve((result[TASKS_STORAGE_KEY] as ScheduledTask[] | undefined) ?? []);
    });
  });
}

export async function saveScheduledTasks(tasks: ScheduledTask[]): Promise<void> {
  await chrome.storage.local.set({ [TASKS_STORAGE_KEY]: tasks });
}

function mutateScheduledTasks<T>(operation: (tasks: ScheduledTask[]) => Promise<T>): Promise<T> {
  const result = taskMutationQueue.then(async () => operation(await loadScheduledTasks()));
  taskMutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export function getAlarmPeriod(task: ScheduledTask): number {
  switch (task.scheduleType) {
    case 'hourly':
      return 60;
    case 'daily':
      return 60 * 24;
    case 'weekly':
      return 60 * 24 * 7;
    case 'monthly':
      return 60 * 24 * 30;
    default: {
      const _exhaustive: never = task.scheduleType;
      logger.warn('Unknown schedule type, defaulting to daily', { scheduleType: _exhaustive });
      return 60 * 24;
    }
  }
}

export async function registerTaskAlarm(task: ScheduledTask): Promise<void> {
  if (!task.enabled) return;
  const alarmName = `${TASK_ALARM_PREFIX}${task.id}`;
  const existing = await chrome.alarms.get(alarmName);
  if (existing) return;
  await chrome.alarms.create(alarmName, {
    periodInMinutes: getAlarmPeriod(task),
    delayInMinutes: getAlarmPeriod(task),
  });
}

/**
 * Dispatch a stored prompt and resolve only after its chat execution has
 * reached a terminal state. Notifications and lastRun updates stay with the
 * background action that owns those product transitions.
 */
export async function dispatchScheduledPrompt<T>(
  task: ScheduledTask,
  dispatch: (prompt: string) => Promise<T>,
): Promise<T | undefined> {
  if (!task.prompt) return undefined;
  const safePrompt = String(task.prompt).slice(0, TASK_PROMPT_MAX_CHARS);
  if (safePrompt.length < task.prompt.length) {
    logger.warn('Scheduled task prompt truncated', {
      taskId: task.id,
      originalLength: task.prompt.length,
      truncatedTo: TASK_PROMPT_MAX_CHARS,
    });
  }
  return dispatch(safePrompt);
}

export async function unregisterTaskAlarm(taskId: string): Promise<void> {
  await chrome.alarms.clear(`${TASK_ALARM_PREFIX}${taskId}`);
}

export async function handleCreateScheduledTask(
  message: CreateScheduledTaskMessage,
): Promise<ExtensionResponse> {
  return mutateScheduledTasks(async (tasks) => {
    if (tasks.length >= MAX_TASKS) {
      return { success: false, error: `Maximum ${MAX_TASKS} tasks reached` } as ExtensionResponse;
    }
    const task: ScheduledTask = {
      ...message.task,
      id: generateRecordId('task'),
      createdAt: Date.now(),
      createdByOrigin: ORIGIN_EXTENSION_PAGE,
    };
    tasks.push(task);
    await saveScheduledTasks(tasks);
    await registerTaskAlarm(task);
    return { success: true, tasks } as ExtensionResponse;
  });
}

export async function handleListScheduledTasks(): Promise<ExtensionResponse> {
  const tasks = await loadScheduledTasks();
  return { success: true, tasks } as ExtensionResponse;
}

export async function handleUpdateScheduledTask(
  message: UpdateScheduledTaskMessage,
): Promise<ExtensionResponse> {
  return mutateScheduledTasks(async (tasks) => {
    const idx = tasks.findIndex((t) => t.id === message.taskId);
    if (idx === -1) {
      return { success: false, error: 'Task not found' } as ExtensionResponse;
    }
    const safeUpdates: Record<string, unknown> = {
      ...(message.updates as Record<string, unknown>),
    };
    if (
      'actions' in safeUpdates &&
      !validateShortcutActions(
        safeUpdates['actions'] as Parameters<typeof validateShortcutActions>[0],
      )
    ) {
      return { success: false, error: 'Invalid task actions' } as ExtensionResponse;
    }
    delete safeUpdates['id'];
    delete safeUpdates['createdByOrigin'];
    const updated = { ...tasks[idx]!, ...safeUpdates } as (typeof tasks)[number];
    tasks[idx] = updated;
    await saveScheduledTasks(tasks);
    await unregisterTaskAlarm(message.taskId);
    await registerTaskAlarm(updated);
    return { success: true, tasks } as ExtensionResponse;
  });
}

export async function handleDeleteScheduledTask(
  message: DeleteScheduledTaskMessage,
): Promise<ExtensionResponse> {
  return mutateScheduledTasks(async (tasks) => {
    const updated = tasks.filter((t) => t.id !== message.taskId);
    await saveScheduledTasks(updated);
    await unregisterTaskAlarm(message.taskId);
    return { success: true, tasks: updated } as ExtensionResponse;
  });
}

export async function recordScheduledTaskRun(taskId: string, ranAt = Date.now()): Promise<void> {
  await mutateScheduledTasks(async (tasks) => {
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task) return;
    task.lastRun = ranAt;
    await saveScheduledTasks(tasks);
  });
}

/** Re-register all task alarms on service worker startup (MV3 restarts kill alarms). */
export async function restoreScheduledTaskAlarms(): Promise<void> {
  const tasks = await loadScheduledTasks();
  for (const task of tasks) {
    if (task.enabled) {
      await registerTaskAlarm(task);
    }
  }
  if (tasks.length > 0) {
    logger.info(`Restored ${tasks.length} scheduled task alarm(s)`);
  }
}
