import { useCallback, useEffect, useRef } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { toast } from 'sonner';
import { invoke, isTauri } from '../lib/tauri-mock';
import { useProjectStore, selectCurrentFolder, formatFolderPath } from '../stores/projectStore';
import {
  selectCloudHandoffFolder,
  revokeCloudHandoffGrant,
  type CloudHandoffFolderGrant,
} from '../features/context-handoff/cloudHandoffGrant';
import { selectPrivacyMode, useAppModeStore } from '../stores/appModeStore';
import { selectHasCloudAccountSession, useAuthStore } from '../stores/auth';

export type FolderSelectionMode = 'local' | 'cloud';

export interface SelectedFolder {
  path: string;
  cloudGrantId: string | null;
}

export interface UseFolderSelectionResult {
  selectFolder: () => Promise<SelectedFolder | null>;
  currentFolderLabel: string | null;
  clearFolder: () => void;
}

export function useFolderSelection(mode: FolderSelectionMode = 'local'): UseFolderSelectionResult {
  const currentFolder = useProjectStore(selectCurrentFolder);
  const setCurrentFolder = useProjectStore((s) => s.setCurrentFolder);
  const pickerGeneration = useRef(0);

  useEffect(() => {
    pickerGeneration.current += 1;
  }, [mode]);
  useEffect(
    () => () => {
      pickerGeneration.current += 1;
    },
    [],
  );

  const selectFolder = useCallback(async (): Promise<SelectedFolder | null> => {
    if (!isTauri) {
      toast.info('Folder selection requires the desktop app');
      return null;
    }

    try {
      const generation = ++pickerGeneration.current;
      const openingAuth = mode === 'cloud' ? useAuthStore.getState() : null;
      const openingCloudOwner =
        openingAuth && selectHasCloudAccountSession(openingAuth)
          ? {
              accountId: openingAuth.user?.id ?? '',
              sessionEpoch: openingAuth.cloudSessionEpoch,
            }
          : null;
      if (mode === 'cloud' && !openingCloudOwner) {
        toast.error('Sign in to AGI Cloud before selecting files to attach.');
        return null;
      }
      const cloudGrant: CloudHandoffFolderGrant | null =
        mode === 'cloud' ? await selectCloudHandoffFolder() : null;
      const selected =
        mode === 'cloud'
          ? cloudGrant?.path
          : await open({
              directory: true,
              multiple: false,
              recursive: true,
              title: 'Select Project Folder',
            });

      const expectedPrivacyMode = mode === 'cloud' ? 'managed' : 'local';
      const liveAuth = mode === 'cloud' ? useAuthStore.getState() : null;
      const cloudOwnerChanged =
        mode === 'cloud' &&
        (openingCloudOwner === null ||
          liveAuth === null ||
          !selectHasCloudAccountSession(liveAuth) ||
          liveAuth.user?.id !== openingCloudOwner.accountId ||
          liveAuth.cloudSessionEpoch !== openingCloudOwner.sessionEpoch);
      if (
        generation !== pickerGeneration.current ||
        selectPrivacyMode(useAppModeStore.getState()) !== expectedPrivacyMode ||
        cloudOwnerChanged
      ) {
        if (cloudGrant) await revokeCloudHandoffGrant(cloudGrant.grantId);
        return null;
      }

      if (selected && typeof selected === 'string') {
        if (mode === 'local') {
          await invoke('project_context_set_folder', { path: selected });
          toast.success(`Project folder set: ${formatFolderPath(selected)}`);
        } else {
          toast.success(
            `Folder: ${formatFolderPath(selected)}, files stay on this device until you approve them.`,
          );
        }
        setCurrentFolder(selected);
        return {
          path: selected,
          cloudGrantId: cloudGrant?.grantId ?? null,
        };
      }
      return null;
    } catch (error) {
      console.error('[useFolderSelection] Failed to select folder:', error);
      return null;
    }
  }, [mode, setCurrentFolder]);

  const clearFolder = useCallback(() => {
    if (mode === 'cloud') {
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
