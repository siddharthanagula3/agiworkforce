import { toast } from 'sonner';

import { invoke } from '../lib/tauri-mock';

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

export interface NamedFileCheckpoint {
  id: string;
  name: string;
  paths: string[];
  created_at: string;
}

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

export const undoGetSummary = async (taskId?: string): Promise<UndoSummary> => {
  try {
    return await invoke<UndoSummary>('undo_get_summary', {
      task_id: taskId ?? null,
    });
  } catch (error) {
    console.error('Failed to get undo summary:', error);
    toast.error('Failed to get undo summary');
    throw error;
  }
};

export const undoGetChanges = async (
  taskId?: string,
  limit?: number,
): Promise<UndoableChange[]> => {
  try {
    return await invoke<UndoableChange[]>('undo_get_changes', {
      task_id: taskId ?? null,
      limit: limit ?? null,
    });
  } catch (error) {
    console.error('Failed to get undo changes:', error);
    toast.error('Failed to get undo changes');
    throw error;
  }
};

export const undoChange = async (changeId: string): Promise<UndoResult> => {
  try {
    return await invoke<UndoResult>('undo_change', { change_id: changeId });
  } catch (error) {
    console.error('Failed to undo change:', error);
    toast.error('Failed to undo change');
    throw error;
  }
};

export const undoLast = async (taskId?: string): Promise<UndoResult> => {
  try {
    return await invoke<UndoResult>('undo_last', {
      task_id: taskId ?? null,
    });
  } catch (error) {
    console.error('Failed to undo last change:', error);
    toast.error('Failed to undo last change');
    throw error;
  }
};

export const undoTask = async (taskId: string): Promise<UndoResult[]> => {
  try {
    return await invoke<UndoResult[]>('undo_task', { task_id: taskId });
  } catch (error) {
    console.error('Failed to undo task:', error);
    toast.error('Failed to undo task');
    throw error;
  }
};

export const undoCanUndo = async (taskId?: string): Promise<boolean> => {
  try {
    return await invoke<boolean>('undo_can_undo', {
      task_id: taskId ?? null,
    });
  } catch (error) {
    console.error('Failed to check undo availability:', error);
    throw error;
  }
};

export const codingCheckpointCreate = async (name: string, paths: string[]): Promise<string> => {
  try {
    return await invoke<string>('coding_checkpoint_create', { name, paths });
  } catch (error) {
    console.error('Failed to create coding checkpoint:', error);
    throw error;
  }
};

export const codingCheckpointList = async (): Promise<NamedFileCheckpoint[]> => {
  try {
    return await invoke<NamedFileCheckpoint[]>('coding_checkpoint_list');
  } catch (error) {
    console.error('Failed to list coding checkpoints:', error);
    throw error;
  }
};

export const codingCheckpointRewind = async (id: string): Promise<string[]> => {
  try {
    return await invoke<string[]>('coding_checkpoint_rewind', { id });
  } catch (error) {
    console.error('Failed to rewind to checkpoint:', error);
    throw error;
  }
};

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
      form_selector: params.formSelector,
      field_values: params.fieldValues,
      can_undo: params.canUndo ?? null,
      task_id: params.taskId ?? null,
      method: params.method ?? null,
      action_url: params.actionUrl ?? null,
    });
  } catch (error) {
    console.error('Failed to record form submission:', error);
    throw error;
  }
};

export const formUndoAttempt = async (submissionId: string): Promise<FormUndoResult> => {
  try {
    return await invoke<FormUndoResult>('form_undo_attempt', { submission_id: submissionId });
  } catch (error) {
    console.error('Failed to attempt form undo:', error);
    throw error;
  }
};

export const formUndoCanUndo = async (submissionId: string): Promise<boolean> => {
  try {
    return await invoke<boolean>('form_undo_can_undo', { submission_id: submissionId });
  } catch (error) {
    console.error('Failed to check form undo availability:', error);
    throw error;
  }
};

export const formUndoList = async (limit?: number, taskId?: string): Promise<FormSubmission[]> => {
  try {
    return await invoke<FormSubmission[]>('form_undo_list', {
      limit: limit ?? null,
      task_id: taskId ?? null,
    });
  } catch (error) {
    console.error('Failed to list form submissions:', error);
    throw error;
  }
};

export const formUndoListUndoable = async (): Promise<FormSubmission[]> => {
  try {
    return await invoke<FormSubmission[]>('form_undo_list_undoable');
  } catch (error) {
    console.error('Failed to list undoable form submissions:', error);
    throw error;
  }
};

export const formUndoGet = async (submissionId: string): Promise<FormSubmission | null> => {
  try {
    return await invoke<FormSubmission | null>('form_undo_get', { submission_id: submissionId });
  } catch (error) {
    console.error('Failed to get form submission:', error);
    throw error;
  }
};

export const formUndoClear = async (): Promise<void> => {
  try {
    await invoke<void>('form_undo_clear');
  } catch (error) {
    console.error('Failed to clear form history:', error);
    throw error;
  }
};

export const formUndoClearOld = async (maxAgeHours: number): Promise<void> => {
  try {
    await invoke<void>('form_undo_clear_old', { max_age_hours: maxAgeHours });
  } catch (error) {
    console.error('Failed to clear old form submissions:', error);
    throw error;
  }
};

export const formUndoStats = async (): Promise<FormUndoStats> => {
  try {
    return await invoke<FormUndoStats>('form_undo_stats');
  } catch (error) {
    console.error('Failed to get form undo stats:', error);
    throw error;
  }
};
