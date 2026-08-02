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

export type AuthorizedScheduledTaskMutation = (task: ScheduledTask) => void | Promise<void>;
export type ScheduledTaskCommitAuthority = (task: ScheduledTask) => boolean;

export { TASK_ALARM_PREFIX };

function validateScheduledTaskPrompt(
  value: unknown,
): { success: true; prompt: string | undefined } | { success: false; error: string } {
  if (value === undefined) return { success: true, prompt: undefined };
  if (typeof value !== 'string') {
    return { success: false, error: 'Scheduled task prompt must be a string.' };
  }
  if (value.length > TASK_PROMPT_MAX_CHARS) {
    return {
      success: false,
      error: `Scheduled task prompt must be at most ${TASK_PROMPT_MAX_CHARS} characters.`,
    };
  }
  const prompt = value.trim();
  if (!prompt) {
    return { success: false, error: 'Scheduled task prompt cannot be empty.' };
  }
  return { success: true, prompt };
}

function isSafeManagedCloudAccountId(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= 200 && !/\p{C}/u.test(value)
  );
}

function canAccessScheduledTask(task: ScheduledTask, managedCloudAccountId?: string): boolean {
  if (!task.prompt && task.managedCloudAccountId === undefined) return true;
  return (
    isSafeManagedCloudAccountId(task.managedCloudAccountId) &&
    task.managedCloudAccountId === managedCloudAccountId
  );
}

function visibleScheduledTasks(
  tasks: ScheduledTask[],
  managedCloudAccountId?: string,
): ScheduledTask[] {
  return tasks.filter((task) => canAccessScheduledTask(task, managedCloudAccountId));
}

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
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(TASKS_STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError) {
        reject(
          new Error(
            `Scheduled task storage could not be read: ${chrome.runtime.lastError.message}`,
          ),
        );
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
  const safePrompt = String(task.prompt).slice(0, TASK_PROMPT_MAX_CHARS).trim();
  if (task.prompt.length > TASK_PROMPT_MAX_CHARS) {
    logger.warn('Scheduled task prompt truncated', {
      taskId: task.id,
      originalLength: task.prompt.length,
      truncatedTo: TASK_PROMPT_MAX_CHARS,
    });
  }
  if (!safePrompt) return undefined;
  return dispatch(safePrompt);
}

export async function unregisterTaskAlarm(taskId: string): Promise<void> {
  await chrome.alarms.clear(`${TASK_ALARM_PREFIX}${taskId}`);
}

export async function handleCreateScheduledTask(
  message: CreateScheduledTaskMessage,
  managedCloudAccountId?: string,
  requiresManagedCloud = Boolean(message.task.prompt),
  isCommitAuthorized?: ScheduledTaskCommitAuthority,
): Promise<ExtensionResponse> {
  return mutateScheduledTasks(async (tasks) => {
    if (tasks.length >= MAX_TASKS) {
      return { success: false, error: `Maximum ${MAX_TASKS} tasks reached` } as ExtensionResponse;
    }
    const safeTask = { ...(message.task as Record<string, unknown>) };
    delete safeTask['managedCloudAccountId'];
    if (Object.prototype.hasOwnProperty.call(safeTask, 'prompt')) {
      const validation = validateScheduledTaskPrompt(safeTask['prompt']);
      if (!validation.success) {
        return { success: false, error: validation.error } as ExtensionResponse;
      }
      safeTask['prompt'] = validation.prompt;
    }
    const requiresManagedBoundary = requiresManagedCloud || Boolean(safeTask['prompt']);
    if (requiresManagedBoundary && !isSafeManagedCloudAccountId(managedCloudAccountId)) {
      return {
        success: false,
        error: 'Sign in to bind this Managed Cloud schedule to your account.',
      } as ExtensionResponse;
    }
    const task: ScheduledTask = {
      ...(safeTask as unknown as CreateScheduledTaskMessage['task']),
      id: generateRecordId('task'),
      createdAt: Date.now(),
      createdByOrigin: ORIGIN_EXTENSION_PAGE,
      ...(requiresManagedBoundary ? { managedCloudAccountId } : {}),
    };
    if (isCommitAuthorized && !isCommitAuthorized(task)) {
      return {
        success: false,
        error: 'The Managed Cloud account changed before this schedule was saved.',
      } as ExtensionResponse;
    }
    tasks.push(task);
    await saveScheduledTasks(tasks);
    await registerTaskAlarm(task);
    return {
      success: true,
      tasks: visibleScheduledTasks(tasks, managedCloudAccountId),
    } as ExtensionResponse;
  });
}

export async function handleListScheduledTasks(
  managedCloudAccountId?: string,
): Promise<ExtensionResponse> {
  const tasks = await loadScheduledTasks();
  return {
    success: true,
    tasks: visibleScheduledTasks(tasks, managedCloudAccountId),
  } as ExtensionResponse;
}

export async function handleUpdateScheduledTask(
  message: UpdateScheduledTaskMessage,
  managedCloudAccountId?: string,
  requiresManagedCloud?: boolean,
  beforeAuthorizedCommit?: AuthorizedScheduledTaskMutation,
  afterAuthorizedCommit?: AuthorizedScheduledTaskMutation,
  isCommitAuthorized?: ScheduledTaskCommitAuthority,
): Promise<ExtensionResponse> {
  return mutateScheduledTasks(async (tasks) => {
    const idx = tasks.findIndex((t) => t.id === message.taskId);
    if (idx === -1) {
      return { success: false, error: 'Task not found' } as ExtensionResponse;
    }
    if (!canAccessScheduledTask(tasks[idx]!, managedCloudAccountId)) {
      return { success: false, error: 'Task not found for this account' } as ExtensionResponse;
    }
    const safeUpdates: Record<string, unknown> = {
      ...(message.updates as Record<string, unknown>),
    };
    if (Object.prototype.hasOwnProperty.call(safeUpdates, 'prompt')) {
      const validation = validateScheduledTaskPrompt(safeUpdates['prompt']);
      if (!validation.success) {
        return { success: false, error: validation.error } as ExtensionResponse;
      }
      safeUpdates['prompt'] = validation.prompt;
    }
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
    delete safeUpdates['managedCloudAccountId'];
    const updated = { ...tasks[idx]!, ...safeUpdates } as (typeof tasks)[number];
    if (requiresManagedCloud === true || updated.prompt) {
      if (!isSafeManagedCloudAccountId(managedCloudAccountId)) {
        return {
          success: false,
          error: 'Sign in to authorize changes to this Managed Cloud schedule.',
        } as ExtensionResponse;
      }
      updated.managedCloudAccountId = managedCloudAccountId;
    } else if (requiresManagedCloud === false && !updated.prompt) {
      delete updated.managedCloudAccountId;
    }
    if (isCommitAuthorized && !isCommitAuthorized(tasks[idx]!)) {
      return {
        success: false,
        error: 'The Managed Cloud account changed before this schedule was saved.',
      } as ExtensionResponse;
    }
    await beforeAuthorizedCommit?.(tasks[idx]!);
    if (isCommitAuthorized && !isCommitAuthorized(tasks[idx]!)) {
      return {
        success: false,
        error: 'The Managed Cloud account changed before this schedule was saved.',
      } as ExtensionResponse;
    }
    tasks[idx] = updated;
    await saveScheduledTasks(tasks);
    await unregisterTaskAlarm(message.taskId);
    await registerTaskAlarm(updated);
    await afterAuthorizedCommit?.(updated);
    return {
      success: true,
      tasks: visibleScheduledTasks(tasks, managedCloudAccountId),
    } as ExtensionResponse;
  });
}

export async function handleDeleteScheduledTask(
  message: DeleteScheduledTaskMessage,
  managedCloudAccountId?: string,
  beforeAuthorizedCommit?: AuthorizedScheduledTaskMutation,
  isCommitAuthorized?: ScheduledTaskCommitAuthority,
): Promise<ExtensionResponse> {
  return mutateScheduledTasks(async (tasks) => {
    const target = tasks.find((task) => task.id === message.taskId);
    if (!target || !canAccessScheduledTask(target, managedCloudAccountId)) {
      return { success: false, error: 'Task not found for this account' } as ExtensionResponse;
    }
    if (isCommitAuthorized && !isCommitAuthorized(target)) {
      return {
        success: false,
        error: 'The Managed Cloud account changed before this schedule was deleted.',
      } as ExtensionResponse;
    }
    await beforeAuthorizedCommit?.(target);
    if (isCommitAuthorized && !isCommitAuthorized(target)) {
      return {
        success: false,
        error: 'The Managed Cloud account changed before this schedule was deleted.',
      } as ExtensionResponse;
    }
    const updated = tasks.filter((t) => t.id !== message.taskId);
    await saveScheduledTasks(updated);
    await unregisterTaskAlarm(message.taskId);
    return {
      success: true,
      tasks: visibleScheduledTasks(updated, managedCloudAccountId),
    } as ExtensionResponse;
  });
}

export async function recordScheduledTaskRun(
  taskId: string,
  ranAt = Date.now(),
  isCommitAuthorized?: ScheduledTaskCommitAuthority,
): Promise<boolean> {
  return mutateScheduledTasks(async (tasks) => {
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task || (isCommitAuthorized && !isCommitAuthorized(task))) return false;
    task.lastRun = ranAt;
    await saveScheduledTasks(tasks);
    return true;
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
