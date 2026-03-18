/**
 * Code Editing API
 *
 * TypeScript API wrappers for code editing Tauri commands.
 * Provides functionality for applying, rejecting, and reverting code changes
 * made by the AGI system.
 */

import { invoke, isTauri } from '../lib/tauri-mock';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of a revert operation
 */
export interface RevertResult {
  success: boolean;
  reverted_files: string[];
  failed_files: FailedRevert[];
}

/**
 * Details about a failed revert
 */
export interface FailedRevert {
  path: string;
  reason: string;
}

/**
 * Pending code edit from the AGI system
 */
export interface PendingEdit {
  id: string;
  file_path: string;
  original_content: string;
  new_content: string;
  description: string;
  created_at: number;
}

/**
 * File diff information
 */
export interface FileDiff {
  file_path: string;
  before: string;
  after: string;
  additions: number;
  deletions: number;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Revert changes to specified files.
 * Uses the AGI's edit history to restore original content.
 * Falls back to git checkout if no edit history exists.
 *
 * @param filePaths - Array of file paths to revert
 * @returns Result indicating which files were reverted successfully
 */
export async function revertChanges(filePaths: string[]): Promise<RevertResult> {
  if (!isTauri) {
    console.info('[codeEditing] revertChanges (mock)', filePaths);
    return {
      success: true,
      reverted_files: filePaths,
      failed_files: [],
    };
  }

  try {
    const result = await invoke<RevertResult>('revert_changes', {
      file_paths: filePaths,
    });
    return result;
  } catch (error) {
    console.error('[codeEditing] Failed to revert changes:', error);
    return {
      success: false,
      reverted_files: [],
      failed_files: filePaths.map((path) => ({
        path,
        reason: String(error),
      })),
    };
  }
}

/**
 * Apply pending code changes.
 *
 * @param filePaths - Array of file paths to apply changes to
 * @returns Result of the apply operation
 */
export async function applyChanges(
  filePaths: string[],
): Promise<{ success: boolean; applied: string[]; failed: string[] }> {
  if (!isTauri) {
    console.info('[codeEditing] applyChanges (mock)', filePaths);
    return { success: true, applied: filePaths, failed: [] };
  }

  try {
    const result = await invoke<{ success: boolean; applied: string[]; failed: string[] }>(
      'apply_changes',
      { file_paths: filePaths },
    );
    return result;
  } catch (error) {
    console.error('[codeEditing] Failed to apply changes:', error);
    return { success: false, applied: [], failed: filePaths };
  }
}

/**
 * Get diff between original and modified content for a file.
 *
 * @param filePath - Path to the file
 * @returns Diff information
 */
export async function getFileDiff(filePath: string): Promise<FileDiff | null> {
  if (!isTauri) {
    console.info('[codeEditing] getFileDiff (mock)', filePath);
    return null;
  }

  try {
    const result = await invoke<FileDiff>('get_file_diff', { filePath });
    return result;
  } catch (error) {
    console.error('[codeEditing] Failed to get file diff:', error);
    return null;
  }
}

/**
 * List all pending edits that haven't been applied yet.
 *
 * @returns Array of pending edits
 */
export async function listPendingEdits(): Promise<PendingEdit[]> {
  if (!isTauri) {
    console.info('[codeEditing] listPendingEdits (mock)');
    return [];
  }

  try {
    const result = await invoke<PendingEdit[]>('code_list_pending_edits');
    return result;
  } catch (error) {
    console.error('[codeEditing] Failed to list pending edits:', error);
    return [];
  }
}

/**
 * Apply a specific pending edit.
 *
 * @param editId - ID of the edit to apply
 * @returns Whether the edit was applied successfully
 */
export async function applyEdit(editId: string): Promise<boolean> {
  if (!isTauri) {
    console.info('[codeEditing] applyEdit (mock)', editId);
    return true;
  }

  try {
    await invoke('code_apply_edit', { editId });
    return true;
  } catch (error) {
    console.error('[codeEditing] Failed to apply edit:', error);
    return false;
  }
}

/**
 * Reject a specific pending edit.
 *
 * @param editId - ID of the edit to reject
 * @returns Whether the edit was rejected successfully
 */
export async function rejectEdit(editId: string): Promise<boolean> {
  if (!isTauri) {
    console.info('[codeEditing] rejectEdit (mock)', editId);
    return true;
  }

  try {
    await invoke('code_reject_edit', { editId });
    return true;
  } catch (error) {
    console.error('[codeEditing] Failed to reject edit:', error);
    return false;
  }
}
