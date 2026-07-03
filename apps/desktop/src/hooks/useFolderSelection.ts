/**
 * useFolderSelection — desktop-only glue between the shared composer's
 * "Select folder" action (packages/unified-chat's `AttachmentMenu`, rendered
 * inside `ChatInput`/`ChatInterface`) and the native folder-picker flow.
 *
 * Mirrors `features/chat/FolderSelector.tsx`'s scoping flow (native Tauri
 * dialog -> `project_context_set_folder` backend command -> `projectStore`)
 * but exposes it as a single callback + label pair the shared package can
 * call through props, since the shared package cannot import Tauri-only APIs
 * or desktop-local stores directly (it is shared with web/mobile).
 */
import { useCallback } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { toast } from 'sonner';
import { invoke, isTauri } from '../lib/tauri-mock';
import { useProjectStore, selectCurrentFolder, formatFolderPath } from '../stores/projectStore';

export interface UseFolderSelectionResult {
  /** Opens the native folder dialog and scopes the session to the result. */
  selectFolder: () => Promise<void>;
  /** Formatted display label for the currently scoped folder, or null. */
  currentFolderLabel: string | null;
}

export function useFolderSelection(): UseFolderSelectionResult {
  const currentFolder = useProjectStore(selectCurrentFolder);
  const setCurrentFolder = useProjectStore((s) => s.setCurrentFolder);

  const selectFolder = useCallback(async () => {
    if (!isTauri) {
      toast.info('Folder selection requires the desktop app');
      return;
    }

    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Project Folder',
      });

      if (selected && typeof selected === 'string') {
        await invoke('project_context_set_folder', { path: selected });
        setCurrentFolder(selected);
        toast.success(`Project folder set: ${formatFolderPath(selected)}`);
      }
    } catch (error) {
      // User cancelled the dialog, or the backend rejected the path — both
      // are non-fatal; log for diagnostics and let the user retry.
      console.error('[useFolderSelection] Failed to select folder:', error);
    }
  }, [setCurrentFolder]);

  return {
    selectFolder,
    currentFolderLabel: currentFolder ? formatFolderPath(currentFolder) : null,
  };
}
