/**
 * useFolderSelection — desktop-only glue between the shared composer's
 * "Select folder" action (packages/ui/unified-chat's `AttachmentMenu`, rendered
 * inside `ChatInput`/`ChatInterface`) and the native folder-picker flow.
 *
 * Mirrors `features/chat/FolderSelector.tsx`'s scoping flow (native Tauri
 * dialog -> `project_context_set_folder` backend command -> `projectStore`)
 * but exposes it as a single callback + label pair the shared package can
 * call through props, since the shared package cannot import Tauri-only APIs
 * or desktop-local stores directly (it is shared with web/mobile).
 *
 * ## Why this hook is mode-aware
 *
 * `project_context_set_folder` is NOT a display setting — it is a persistent
 * capability grant. It pushes the path into `settings.allowed_directories` and
 * WRITES settings.json (AUDIT-CONFIG-051 in
 * `src-tauri/src/sys/commands/project_context.rs` exists precisely because the
 * memory-only version was considered a bug), reloads MCP config to
 * project-local scope so config files inside the chosen folder start supplying
 * MCP servers, and repoints the MCP filesystem server root at it.
 *
 * That is correct for Local mode, where the folder IS the working scope and
 * every tool runs on-device. It would be wrong for Managed Cloud: selecting a
 * folder there would silently widen filesystem permissions from the one mode
 * that is not supposed to touch local capability, persist that widening to
 * disk, and leave it in place after switching back to Local — a permission
 * escalation with no consent step.
 *
 * So in `'cloud'` mode this hook picks a folder as a DISPLAY LABEL and SCAN
 * ROOT only, and performs no `invoke` at all. Files leave the device solely
 * through the composer's attachment upload, after the explicit
 * context-selection / secret-scan / preview / consent ceremony.
 */
import { useCallback } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { toast } from 'sonner';
import { invoke, isTauri } from '../lib/tauri-mock';
import { useProjectStore, selectCurrentFolder, formatFolderPath } from '../stores/projectStore';

/**
 * `'local'` grants the folder as a working scope (persistent capability).
 * `'cloud'` treats it as a display label and scan root only.
 */
export type FolderSelectionMode = 'local' | 'cloud';

export interface UseFolderSelectionResult {
  /**
   * Opens the native folder dialog. In local mode this also scopes the session
   * to the result. Resolves to the picked absolute path, or null when the user
   * cancelled or the app is not running under Tauri — callers chain the cloud
   * attachment sheet off this without re-reading the store.
   */
  selectFolder: () => Promise<string | null>;
  /** Formatted display label for the currently scoped folder, or null. */
  currentFolderLabel: string | null;
  /** Clears the folder. In local mode this also resets the backend scope. */
  clearFolder: () => void;
}

export function useFolderSelection(mode: FolderSelectionMode = 'local'): UseFolderSelectionResult {
  const currentFolder = useProjectStore(selectCurrentFolder);
  const setCurrentFolder = useProjectStore((s) => s.setCurrentFolder);

  const selectFolder = useCallback(async (): Promise<string | null> => {
    if (!isTauri) {
      toast.info('Folder selection requires the desktop app');
      return null;
    }

    try {
      const selected = await open({
        directory: true,
        multiple: false,
        // Cloud reads the tree to build an attachment candidate list.
        recursive: mode === 'cloud',
        title: mode === 'cloud' ? 'Select a folder to attach from' : 'Select Project Folder',
      });

      if (selected && typeof selected === 'string') {
        if (mode === 'local') {
          // Local only: grants the folder as a working scope. See the module
          // docstring for why this must never run in cloud mode.
          await invoke('project_context_set_folder', { path: selected });
          toast.success(`Project folder set: ${formatFolderPath(selected)}`);
        } else {
          toast.success(
            `Folder: ${formatFolderPath(selected)} — files stay on this device until you approve them.`,
          );
        }
        setCurrentFolder(selected);
        return selected;
      }
      return null;
    } catch (error) {
      // User cancelled the dialog, or the backend rejected the path — both
      // are non-fatal; log for diagnostics and let the user retry.
      console.error('[useFolderSelection] Failed to select folder:', error);
      return null;
    }
  }, [mode, setCurrentFolder]);

  const clearFolder = useCallback(() => {
    if (mode === 'cloud') {
      // Nothing was granted, so nothing needs revoking.
      setCurrentFolder(null);
      return;
    }
    void invoke('project_context_set_folder', { path: null })
      .catch((error) => {
        console.error('[useFolderSelection] Failed to clear folder context:', error);
      })
      .finally(() => {
        setCurrentFolder(null);
      });
  }, [mode, setCurrentFolder]);

  return {
    selectFolder,
    currentFolderLabel: currentFolder ? formatFolderPath(currentFolder) : null,
    clearFolder,
  };
}
