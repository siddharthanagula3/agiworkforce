import type {
  ScheduledTask,
  ExtensionResponse,
  CreateScheduledTaskMessage,
  UpdateScheduledTaskMessage,
  DeleteScheduledTaskMessage,
} from '../types';
import { logger } from '../utils';

const TASKS_STORAGE_KEY = 'agi_scheduled_tasks';
const MAX_TASKS = 50;
const TASK_ALARM_PREFIX = 'agi_task_';

export { TASK_ALARM_PREFIX };

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
  await chrome.alarms.create(alarmName, {
    periodInMinutes: getAlarmPeriod(task),
    delayInMinutes: getAlarmPeriod(task),
  });
}

export async function unregisterTaskAlarm(taskId: string): Promise<void> {
  await chrome.alarms.clear(`${TASK_ALARM_PREFIX}${taskId}`);
}

export async function handleCreateScheduledTask(
  message: CreateScheduledTaskMessage,
): Promise<ExtensionResponse> {
  const tasks = await loadScheduledTasks();
  if (tasks.length >= MAX_TASKS) {
    return { success: false, error: `Maximum ${MAX_TASKS} tasks reached` } as ExtensionResponse;
  }
  const task: ScheduledTask = {
    ...message.task,
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };
  tasks.push(task);
  await saveScheduledTasks(tasks);
  await registerTaskAlarm(task);
  return { success: true, tasks } as ExtensionResponse;
}

export async function handleListScheduledTasks(): Promise<ExtensionResponse> {
  const tasks = await loadScheduledTasks();
  return { success: true, tasks } as ExtensionResponse;
}

export async function handleUpdateScheduledTask(
  message: UpdateScheduledTaskMessage,
): Promise<ExtensionResponse> {
  const tasks = await loadScheduledTasks();
  const idx = tasks.findIndex((t) => t.id === message.taskId);
  if (idx === -1) {
    return { success: false, error: 'Task not found' } as ExtensionResponse;
  }
  const updated = { ...tasks[idx]!, ...message.updates };
  tasks[idx] = updated;
  await saveScheduledTasks(tasks);
  await unregisterTaskAlarm(message.taskId);
  await registerTaskAlarm(updated);
  return { success: true, tasks } as ExtensionResponse;
}

export async function handleDeleteScheduledTask(
  message: DeleteScheduledTaskMessage,
): Promise<ExtensionResponse> {
  let tasks = await loadScheduledTasks();
  tasks = tasks.filter((t) => t.id !== message.taskId);
  await saveScheduledTasks(tasks);
  await unregisterTaskAlarm(message.taskId);
  return { success: true, tasks } as ExtensionResponse;
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
