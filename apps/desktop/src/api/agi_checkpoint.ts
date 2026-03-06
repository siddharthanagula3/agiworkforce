/**
 * AGI Task Checkpoint API
 *
 * Provides TypeScript bindings for checkpoint management, enabling session
 * persistence and resumption of long-running AGI tasks.
 */

import { invoke } from '../lib/tauri-mock';

/// Unique identifier for a checkpoint
export type CheckpointId = string;

/// Unique identifier for a task
export type TaskId = string;

/// Reason for creating a checkpoint
export enum CheckpointReason {
  Interval = 'interval',
  UserPaused = 'user_paused',
  TimeoutApproaching = 'timeout_approaching',
  ExplicitSave = 'explicit_save',
  ErrorRecovery = 'error_recovery',
  TaskComplete = 'task_complete',
}

/// Metadata about execution progress
export interface CheckpointMetadata {
  total_steps: number;
  progress_percent: number;
  elapsed_time_ms: number;
  estimated_remaining_ms?: number;
  tool_calls_executed: number;
  failure_count: number;
  last_error?: string;
  progress_summary: string;
}

/// A single checkpoint context entry
export interface CheckpointContextEntry {
  timestamp_ms: number;
  entry_type: string;
  description: string;
  data?: Record<string, unknown>;
}

/// Constraint definition for task goals
export interface GoalConstraint {
  type: string;
  value: string | number | boolean;
  description?: string;
}

/// Tool call result entry
export interface ToolResultEntry {
  tool_name: string;
  arguments: Record<string, unknown>;
  result: unknown;
  timestamp_ms: number;
  success: boolean;
  error?: string;
}

/// Complete checkpoint snapshot
export interface Checkpoint {
  id: CheckpointId;
  task_id: TaskId;
  goal: {
    id: string;
    description: string;
    priority: string;
    deadline?: number;
    constraints: GoalConstraint[];
    success_criteria: string[];
  };
  current_step: number;
  completed_steps: number[];
  current_state: Record<string, unknown>;
  tool_results: ToolResultEntry[];
  available_resources: {
    cpu_usage_percent: number;
    memory_usage_mb: number;
    network_usage_mbps: number;
    storage_usage_mb: number;
    available_tools: string[];
  };
  created_at_ms: number;
  reason: CheckpointReason;
  metadata: CheckpointMetadata;
  is_latest: boolean;
  parent_checkpoint_id?: CheckpointId;
  context_memory: CheckpointContextEntry[];
}

/// Summary of a checkpoint (lightweight)
export interface CheckpointSummary {
  id: CheckpointId;
  task_id: TaskId;
  created_at_ms: number;
  reason: CheckpointReason;
  current_step: number;
  total_steps: number;
  progress_percent: number;
  is_latest: boolean;
  estimated_remaining_ms?: number;
}

/// List of checkpoints
export interface CheckpointListResponse {
  task_id: TaskId;
  checkpoints: CheckpointSummary[];
}

/// Generic response wrapper
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/// Request to save a checkpoint
export interface SaveCheckpointRequest {
  task_id: TaskId;
  goal_id: string;
  goal_description: string;
  current_step: number;
  completed_steps: number[];
  total_steps: number;
  elapsed_time_ms: number;
  tool_calls_executed: number;
  failure_count: number;
  last_error?: string;
  state_json?: string;
  reason: string;
}

/// Saves a checkpoint for a task
export async function saveCheckpoint(request: SaveCheckpointRequest): Promise<Checkpoint> {
  const response = await invoke<ApiResponse<Checkpoint>>('agi_checkpoint_save', { request });

  if (!response.success) {
    throw new Error(response.error || 'Failed to save checkpoint');
  }

  return response.data!;
}

/// Gets the latest checkpoint for a task
export async function getLatestCheckpoint(taskId: TaskId): Promise<Checkpoint | null> {
  const response = await invoke<ApiResponse<Checkpoint | null>>('agi_checkpoint_get_latest', {
    taskId,
  });

  if (!response.success) {
    throw new Error(response.error || 'Failed to get latest checkpoint');
  }

  return response.data ?? null;
}

/// Gets a specific checkpoint by ID
export async function getCheckpoint(checkpointId: CheckpointId): Promise<Checkpoint | null> {
  const response = await invoke<ApiResponse<Checkpoint | null>>('agi_checkpoint_get', {
    checkpointId,
  });

  if (!response.success) {
    throw new Error(response.error || 'Failed to get checkpoint');
  }

  return response.data ?? null;
}

/// Lists all checkpoints for a task
export async function listCheckpoints(
  taskId: TaskId,
  limit?: number,
): Promise<CheckpointListResponse> {
  const response = await invoke<ApiResponse<CheckpointListResponse>>('agi_checkpoint_list', {
    request: {
      taskId,
      limit,
    },
  });

  if (!response.success) {
    throw new Error(response.error || 'Failed to list checkpoints');
  }

  return response.data!;
}

/// Deletes a checkpoint
export async function deleteCheckpoint(checkpointId: CheckpointId): Promise<void> {
  const response = await invoke<ApiResponse<void>>('agi_checkpoint_delete', {
    checkpointId,
  });

  if (!response.success) {
    throw new Error(response.error || 'Failed to delete checkpoint');
  }
}

/// Gets restore history for a task
export async function getRestoreHistory(taskId: TaskId): Promise<string[]> {
  const response = await invoke<ApiResponse<string[]>>('agi_checkpoint_restore_history', {
    taskId,
  });

  if (!response.success) {
    throw new Error(response.error || 'Failed to get restore history');
  }

  return response.data ?? [];
}

/// Records a checkpoint restore event
export async function recordRestore(
  checkpointId: CheckpointId,
  taskId: TaskId,
  resumedSteps: number,
  error?: string,
): Promise<void> {
  const response = await invoke<ApiResponse<void>>('agi_checkpoint_record_restore', {
    checkpointId,
    taskId,
    resumedSteps,
    error,
  });

  if (!response.success) {
    throw new Error(response.error || 'Failed to record restore event');
  }
}

/// Cleans up old checkpoints
export async function cleanupCheckpoints(taskId: TaskId, keepCount?: number): Promise<number> {
  const response = await invoke<ApiResponse<number>>('agi_checkpoint_cleanup', {
    taskId,
    keepCount,
  });

  if (!response.success) {
    throw new Error(response.error || 'Failed to cleanup checkpoints');
  }

  return response.data ?? 0;
}

/// Initializes the checkpoint system
export async function initializeCheckpoints(): Promise<void> {
  const response = await invoke<ApiResponse<void>>('agi_checkpoint_init', {});

  if (!response.success) {
    throw new Error(response.error || 'Failed to initialize checkpoint system');
  }
}

/// Hook for using checkpoint API with React
export function useCheckpoints() {
  const saveCheckpointAsync = async (request: SaveCheckpointRequest): Promise<Checkpoint> => {
    return saveCheckpoint(request);
  };

  const getLatestAsync = async (taskId: TaskId): Promise<Checkpoint | null> => {
    return getLatestCheckpoint(taskId);
  };

  const listAsync = async (taskId: TaskId): Promise<CheckpointListResponse> => {
    return listCheckpoints(taskId);
  };

  const deleteAsync = async (checkpointId: CheckpointId): Promise<void> => {
    return deleteCheckpoint(checkpointId);
  };

  return {
    saveCheckpoint: saveCheckpointAsync,
    getLatestCheckpoint: getLatestAsync,
    getCheckpoint,
    listCheckpoints: listAsync,
    deleteCheckpoint: deleteAsync,
    getRestoreHistory,
    recordRestore,
    cleanupCheckpoints,
    initializeCheckpoints,
  };
}
