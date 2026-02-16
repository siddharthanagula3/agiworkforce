/**
 * Undo API - TypeScript interface to Rust undo commands
 *
 * Provides user-friendly methods for reversing AGI actions through
 * natural language or direct API calls.
 */

import { isTauri } from '../lib/tauri-mock';

// Dynamic import of invoke to handle web development mode
const getInvoke = async () => {
  if (!isTauri) {
    throw new Error('Undo features require the desktop app');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke;
};

/** Result of a single undo operation */
export interface UndoResult {
  success: boolean;
  change_id: string;
  change_type: string;
  path: string | null;
  message: string;
}

/** Summary of all undoable changes */
export interface UndoSummary {
  total_changes: number;
  revertible_changes: number;
  changes_by_type: Record<string, number>;
  recent_changes: UndoableChange[];
}

/** A change that can be undone */
export interface UndoableChange {
  id: string;
  change_type: string;
  path: string | null;
  timestamp: string;
  task_id: string;
  description: string;
}

export const undoApi = {
  /**
   * Get a summary of all undoable changes
   * @param taskId Optional - filter by specific task
   */
  getSummary: async (taskId?: string): Promise<UndoSummary> => {
    const invoke = await getInvoke();
    return invoke('undo_get_summary', { taskId: taskId ?? null });
  },

  /**
   * Get list of recent undoable changes
   * @param taskId Optional - filter by specific task
   * @param limit Optional - max number of changes to return (default 20)
   */
  getChanges: async (taskId?: string, limit?: number): Promise<UndoableChange[]> => {
    const invoke = await getInvoke();
    return invoke('undo_get_changes', {
      taskId: taskId ?? null,
      limit: limit ?? null,
    });
  },

  /**
   * Undo a specific change by ID
   * @param changeId The unique ID of the change to undo
   */
  undoChange: async (changeId: string): Promise<UndoResult> => {
    const invoke = await getInvoke();
    return invoke('undo_change', { changeId });
  },

  /**
   * Undo the most recent change
   * @param taskId Optional - only undo within a specific task
   */
  undoLast: async (taskId?: string): Promise<UndoResult> => {
    const invoke = await getInvoke();
    return invoke('undo_last', { taskId: taskId ?? null });
  },

  /**
   * Undo all changes for a specific task
   * @param taskId The task ID to undo all changes for
   */
  undoTask: async (taskId: string): Promise<UndoResult[]> => {
    const invoke = await getInvoke();
    return invoke('undo_task', { taskId });
  },

  /**
   * Check if there are any changes that can be undone
   * @param taskId Optional - check within specific task
   */
  canUndo: async (taskId?: string): Promise<boolean> => {
    const invoke = await getInvoke();
    return invoke('undo_can_undo', { taskId: taskId ?? null });
  },
};
