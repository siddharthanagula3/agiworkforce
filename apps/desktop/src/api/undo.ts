import { toast } from 'sonner';

import { invoke } from '../lib/tauri-mock';

export interface UndoResult {
  success: boolean;
  change_id: string;
  message: string;
}

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
