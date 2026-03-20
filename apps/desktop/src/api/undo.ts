/**
 * Undo API
 *
 * Provides interfaces for managing undo operations.
 * Two subsystems:
 *   1. File/system change undo (UndoManager)
 *   2. Form submission undo (FormUndoManager)
 *
 * Rust commands (undo.rs):
 *   undo_get_summary, undo_get_changes, undo_change, undo_last, undo_task, undo_can_undo,
 *   coding_checkpoint_create, coding_checkpoint_list, coding_checkpoint_rewind,
 *   form_undo_record, form_undo_attempt, form_undo_can_undo, form_undo_list,
 *   form_undo_list_undoable, form_undo_get, form_undo_clear, form_undo_clear_old,
 *   form_undo_stats
 */
import { toast } from 'sonner';

import { invoke } from '../lib/tauri-mock';

// ============================================================================
// Interfaces — File/System Undo
// ============================================================================

export interface UndoableChange {
  id: string;
  change_type: string;
  path: string;
  description: string;
  timestamp: string;
  revertible: boolean;
  task_id: string | null;
}

export interface UndoSummary {
  total_changes: number;
  revertible_changes: number;
  recent_changes: UndoableChange[];
}

export interface UndoResult {
  success: boolean;
  change_id: string;
  message: string;
}

// ============================================================================
// Interfaces — Named File Checkpoints
// ============================================================================

export interface NamedFileCheckpoint {
  id: string;
  name: string;
  paths: string[];
  created_at: string;
}

// ============================================================================
// Interfaces — Form Undo
// ============================================================================

export interface FormSubmission {
  id: string;
  url: string;
  form_selector: string;
  field_values: Record<string, string>;
  can_undo: boolean;
  task_id: string | null;
  method: string | null;
  action_url: string | null;
  timestamp: string;
}

export interface FormUndoResult {
  success: boolean;
  submission_id: string;
  message: string;
  url: string | null;
  fields: Record<string, string> | null;
}

export interface FormUndoStats {
  totalSubmissions: number;
  undoableSubmissions: number;
}

// ============================================================================
// File/System Undo Commands
// ============================================================================

/** Get summary of undo-able changes, optionally filtered by task */
export const undoGetSummary = async (taskId?: string): Promise<UndoSummary> => {
  try {
    return await invoke<UndoSummary>('undo_get_summary', {
      taskId: taskId ?? null,
    });
  } catch (error) {
    console.error('Failed to get undo summary:', error);
    toast.error('Failed to get undo summary');
    throw error;
  }
};

/** Get list of recent undo-able changes */
export const undoGetChanges = async (
  taskId?: string,
  limit?: number,
): Promise<UndoableChange[]> => {
  try {
    return await invoke<UndoableChange[]>('undo_get_changes', {
      taskId: taskId ?? null,
      limit: limit ?? null,
    });
  } catch (error) {
    console.error('Failed to get undo changes:', error);
    toast.error('Failed to get undo changes');
    throw error;
  }
};

/** Undo a specific change by its ID */
export const undoChange = async (changeId: string): Promise<UndoResult> => {
  try {
    return await invoke<UndoResult>('undo_change', { changeId });
  } catch (error) {
    console.error('Failed to undo change:', error);
    toast.error('Failed to undo change');
    throw error;
  }
};

/** Undo the most recent change, optionally scoped to a task */
export const undoLast = async (taskId?: string): Promise<UndoResult> => {
  try {
    return await invoke<UndoResult>('undo_last', {
      taskId: taskId ?? null,
    });
  } catch (error) {
    console.error('Failed to undo last change:', error);
    toast.error('Failed to undo last change');
    throw error;
  }
};

/** Undo all changes for a specific task */
export const undoTask = async (taskId: string): Promise<UndoResult[]> => {
  try {
    return await invoke<UndoResult[]>('undo_task', { taskId });
  } catch (error) {
    console.error('Failed to undo task:', error);
    throw error;
  }
};

/** Check if there are any changes that can be undone */
export const undoCanUndo = async (taskId?: string): Promise<boolean> => {
  try {
    return await invoke<boolean>('undo_can_undo', {
      taskId: taskId ?? null,
    });
  } catch (error) {
    console.error('Failed to check undo availability:', error);
    throw error;
  }
};

// ============================================================================
// Named File Checkpoint Commands
// ============================================================================

/** Create a named checkpoint by snapshotting file contents. Returns checkpoint ID. */
export const codingCheckpointCreate = async (name: string, paths: string[]): Promise<string> => {
  try {
    return await invoke<string>('coding_checkpoint_create', { name, paths });
  } catch (error) {
    console.error('Failed to create coding checkpoint:', error);
    throw error;
  }
};

/** List all named file checkpoints in chronological order */
export const codingCheckpointList = async (): Promise<NamedFileCheckpoint[]> => {
  try {
    return await invoke<NamedFileCheckpoint[]>('coding_checkpoint_list');
  } catch (error) {
    console.error('Failed to list coding checkpoints:', error);
    throw error;
  }
};

/** Rewind files to a named checkpoint. Returns restored file paths. */
export const codingCheckpointRewind = async (id: string): Promise<string[]> => {
  try {
    return await invoke<string[]>('coding_checkpoint_rewind', { id });
  } catch (error) {
    console.error('Failed to rewind to checkpoint:', error);
    throw error;
  }
};

// ============================================================================
// Form Undo Commands
// ============================================================================

/** Record a form submission for potential undo */
export const formUndoRecord = async (params: {
  url: string;
  formSelector: string;
  fieldValues: Record<string, string>;
  canUndo?: boolean;
  taskId?: string;
  method?: string;
  actionUrl?: string;
}): Promise<FormSubmission> => {
  try {
    return await invoke<FormSubmission>('form_undo_record', {
      url: params.url,
      formSelector: params.formSelector,
      fieldValues: params.fieldValues,
      canUndo: params.canUndo ?? null,
      taskId: params.taskId ?? null,
      method: params.method ?? null,
      actionUrl: params.actionUrl ?? null,
    });
  } catch (error) {
    console.error('Failed to record form submission:', error);
    throw error;
  }
};

/** Attempt to undo a form submission. Returns instructions for the caller. */
export const formUndoAttempt = async (submissionId: string): Promise<FormUndoResult> => {
  try {
    return await invoke<FormUndoResult>('form_undo_attempt', { submissionId });
  } catch (error) {
    console.error('Failed to attempt form undo:', error);
    throw error;
  }
};

/** Check if a specific form submission can be undone */
export const formUndoCanUndo = async (submissionId: string): Promise<boolean> => {
  try {
    return await invoke<boolean>('form_undo_can_undo', { submissionId });
  } catch (error) {
    console.error('Failed to check form undo availability:', error);
    throw error;
  }
};

/** List recent form submissions, optionally filtered by task */
export const formUndoList = async (limit?: number, taskId?: string): Promise<FormSubmission[]> => {
  try {
    return await invoke<FormSubmission[]>('form_undo_list', {
      limit: limit ?? null,
      taskId: taskId ?? null,
    });
  } catch (error) {
    console.error('Failed to list form submissions:', error);
    throw error;
  }
};

/** Get only the form submissions that can be undone */
export const formUndoListUndoable = async (): Promise<FormSubmission[]> => {
  try {
    return await invoke<FormSubmission[]>('form_undo_list_undoable');
  } catch (error) {
    console.error('Failed to list undoable form submissions:', error);
    throw error;
  }
};

/** Get a specific form submission by ID */
export const formUndoGet = async (submissionId: string): Promise<FormSubmission | null> => {
  try {
    return await invoke<FormSubmission | null>('form_undo_get', { submissionId });
  } catch (error) {
    console.error('Failed to get form submission:', error);
    throw error;
  }
};

/** Clear all form submission history */
export const formUndoClear = async (): Promise<void> => {
  try {
    await invoke<void>('form_undo_clear');
  } catch (error) {
    console.error('Failed to clear form history:', error);
    throw error;
  }
};

/** Clear old form submissions (older than specified hours) */
export const formUndoClearOld = async (maxAgeHours: number): Promise<void> => {
  try {
    await invoke<void>('form_undo_clear_old', { maxAgeHours });
  } catch (error) {
    console.error('Failed to clear old form submissions:', error);
    throw error;
  }
};

/** Get form undo statistics */
export const formUndoStats = async (): Promise<FormUndoStats> => {
  try {
    return await invoke<FormUndoStats>('form_undo_stats');
  } catch (error) {
    console.error('Failed to get form undo stats:', error);
    throw error;
  }
};
