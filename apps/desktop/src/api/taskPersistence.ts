
import { invoke } from '../lib/tauri-mock';

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

export async function taskGetStatus(taskId: string): Promise<PersistedTask> {
  try {
    return await invoke<PersistedTask>('task_get_status', { taskId });
  } catch (error) {
    throw new Error(`Failed to get task status: ${error}`);
  }
}

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

export async function taskPause(taskId: string): Promise<void> {
  try {
    await invoke('task_pause', { taskId });
  } catch (error) {
    throw new Error(`Failed to pause task: ${error}`);
  }
}

export async function taskResume(taskId: string): Promise<void> {
  try {
    await invoke('task_resume', { taskId });
  } catch (error) {
    throw new Error(`Failed to resume task: ${error}`);
  }
}

export async function taskCancel(taskId: string): Promise<void> {
  try {
    await invoke('task_cancel', { taskId });
  } catch (error) {
    throw new Error(`Failed to cancel task: ${error}`);
  }
}

export async function taskList(): Promise<PersistedTask[]> {
  try {
    return await invoke<PersistedTask[]>('task_list');
  } catch (error) {
    throw new Error(`Failed to list tasks: ${error}`);
  }
}

export async function taskListByStatus(status: string): Promise<PersistedTask[]> {
  try {
    return await invoke<PersistedTask[]>('task_list_by_status', { status });
  } catch (error) {
    throw new Error(`Failed to list tasks by status: ${error}`);
  }
}

export async function taskComplete(taskId: string, result?: unknown): Promise<void> {
  try {
    await invoke('task_complete', { taskId, result: result ?? null });
  } catch (error) {
    throw new Error(`Failed to complete task: ${error}`);
  }
}

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

export async function taskGetResumable(): Promise<PersistedTask[]> {
  try {
    return await invoke<PersistedTask[]>('task_get_resumable');
  } catch (error) {
    throw new Error(`Failed to get resumable tasks: ${error}`);
  }
}

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

export async function coordGetPendingApprovals(): Promise<ApprovalRequest[]> {
  try {
    return await invoke<ApprovalRequest[]>('coord_get_pending_approvals');
  } catch (error) {
    throw new Error(`Failed to get pending approvals: ${error}`);
  }
}
