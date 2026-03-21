/**
 * Task Persistence API
 *
 * TypeScript wrappers for the persistent task manager and cross-app
 * coordination state exposed by sys/commands/task_persistence.rs.
 *
 * Task commands:
 *   task_create           - create a new persistent task
 *   task_get_status       - get full task state by ID
 *   task_update_progress  - update progress and current step
 *   task_pause            - pause a running task
 *   task_resume           - resume a paused task
 *   task_cancel           - cancel a task
 *   task_list             - list all tasks
 *   task_list_by_status   - list tasks filtered by status
 *   task_complete         - mark a task as completed with optional result
 *   task_save_context     - save key/value context on a task
 *   task_get_resumable    - get tasks eligible for auto-resume
 *
 * Coordination commands:
 *   coord_update_app_state      - update tracked application state
 *   coord_request_approval      - queue an approval request
 *   coord_get_pending_approvals - list pending approval requests
 */

import { invoke } from '../lib/tauri-mock';

// ---------------------------------------------------------------------------
// Types (mirror Rust structs -- field names are camelCase for IPC)
// ---------------------------------------------------------------------------

export type TaskStatus = 'Pending' | 'Running' | 'Paused' | 'Completed' | 'Failed' | 'Cancelled';
export type TaskPriority = 'Critical' | 'High' | 'Normal' | 'Low';

export interface TaskStep {
  name: string;
  status: TaskStatus;
  tool: string;
  params: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

export interface PersistedTask {
  id: string;
  name: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  progress: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  steps: TaskStep[];
  currentStep: number;
  context: Record<string, unknown>;
  requiresApproval: boolean;
  autoResume: boolean;
}

export interface AppState {
  appName: string;
  status: string;
  lastAction: string;
  timestamp: number;
}

export interface ApprovalRequest {
  id: string;
  taskId: string;
  action: string;
  description: string;
  autoApproveSafe: boolean;
}

// ---------------------------------------------------------------------------
// Task Management
// ---------------------------------------------------------------------------

/** Create a new persistent task and return its ID. */
export async function taskCreate(
  name: string,
  description: string,
  steps: TaskStep[],
  autoResume: boolean,
): Promise<string> {
  try {
    return await invoke<string>('task_create', { name, description, steps, autoResume });
  } catch (error) {
    throw new Error(`Failed to create task: ${error}`);
  }
}

/** Get the full state of a task by ID. */
export async function taskGetStatus(taskId: string): Promise<PersistedTask> {
  try {
    return await invoke<PersistedTask>('task_get_status', { taskId });
  } catch (error) {
    throw new Error(`Failed to get task status: ${error}`);
  }
}

/** Update a task's progress percentage and current step index. */
export async function taskUpdateProgress(
  taskId: string,
  progress: number,
  currentStep: number,
): Promise<void> {
  try {
    await invoke('task_update_progress', { taskId, progress, currentStep });
  } catch (error) {
    throw new Error(`Failed to update task progress: ${error}`);
  }
}

/** Pause a running task. */
export async function taskPause(taskId: string): Promise<void> {
  try {
    await invoke('task_pause', { taskId });
  } catch (error) {
    throw new Error(`Failed to pause task: ${error}`);
  }
}

/** Resume a paused task. */
export async function taskResume(taskId: string): Promise<void> {
  try {
    await invoke('task_resume', { taskId });
  } catch (error) {
    throw new Error(`Failed to resume task: ${error}`);
  }
}

/** Cancel a task. */
export async function taskCancel(taskId: string): Promise<void> {
  try {
    await invoke('task_cancel', { taskId });
  } catch (error) {
    throw new Error(`Failed to cancel task: ${error}`);
  }
}

/** List all persistent tasks. */
export async function taskList(): Promise<PersistedTask[]> {
  try {
    return await invoke<PersistedTask[]>('task_list');
  } catch (error) {
    throw new Error(`Failed to list tasks: ${error}`);
  }
}

/**
 * List tasks filtered by status.
 * Valid values: "pending", "running", "paused", "completed", "failed", "cancelled".
 */
export async function taskListByStatus(status: string): Promise<PersistedTask[]> {
  try {
    return await invoke<PersistedTask[]>('task_list_by_status', { status });
  } catch (error) {
    throw new Error(`Failed to list tasks by status: ${error}`);
  }
}

/** Mark a task as completed, optionally attaching a result payload. */
export async function taskComplete(taskId: string, result?: unknown): Promise<void> {
  try {
    await invoke('task_complete', { taskId, result: result ?? null });
  } catch (error) {
    throw new Error(`Failed to complete task: ${error}`);
  }
}

/** Save arbitrary key/value context data on a task. */
export async function taskSaveContext(
  taskId: string,
  context: Record<string, unknown>,
): Promise<void> {
  try {
    await invoke('task_save_context', { taskId, context });
  } catch (error) {
    throw new Error(`Failed to save task context: ${error}`);
  }
}

/** Get all tasks that are eligible for auto-resume (paused or running with autoResume flag). */
export async function taskGetResumable(): Promise<PersistedTask[]> {
  try {
    return await invoke<PersistedTask[]>('task_get_resumable');
  } catch (error) {
    throw new Error(`Failed to get resumable tasks: ${error}`);
  }
}

// ---------------------------------------------------------------------------
// Cross-App Coordination
// ---------------------------------------------------------------------------

/** Update the tracked state of an external application. */
export async function coordUpdateAppState(
  appName: string,
  status: string,
  action: string,
): Promise<void> {
  try {
    await invoke('coord_update_app_state', { appName, status, action });
  } catch (error) {
    throw new Error(`Failed to update app state: ${error}`);
  }
}

/**
 * Queue an approval request for a task action.
 * Returns the approval request ID.
 */
export async function coordRequestApproval(
  taskId: string,
  action: string,
  description: string,
  autoApproveSafe: boolean,
): Promise<string> {
  try {
    return await invoke<string>('coord_request_approval', {
      taskId,
      action,
      description,
      autoApproveSafe,
    });
  } catch (error) {
    throw new Error(`Failed to request approval: ${error}`);
  }
}

/** Get all pending approval requests. */
export async function coordGetPendingApprovals(): Promise<ApprovalRequest[]> {
  try {
    return await invoke<ApprovalRequest[]>('coord_get_pending_approvals');
  } catch (error) {
    throw new Error(`Failed to get pending approvals: ${error}`);
  }
}
