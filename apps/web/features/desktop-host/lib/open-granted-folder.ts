'use client';

import { create } from 'zustand';
import { DesktopRuntimeError, type WorkspaceRoot } from '@agiworkforce/local-runtime-contract';
import { pickWorkspaceRoot } from './runtime-client';

interface OpenedFolderState {
  folder: WorkspaceRoot | null;
  error: string | null;
  reset: () => void;
}

export const useOpenedFolderStore = create<OpenedFolderState>()((set) => ({
  folder: null,
  error: null,
  reset: () => set({ folder: null, error: null }),
}));

/**
 * File > Open Folder. The shell already owns the directory dialog and the
 * grant; this is what the public window runs when that menu item is chosen.
 * Cancelling the dialog leaves the window as it was.
 */
export async function openGrantedFolder(): Promise<WorkspaceRoot | null> {
  try {
    const root = await pickWorkspaceRoot('folder');
    useOpenedFolderStore.setState({ folder: root, error: null });
    return root;
  } catch (error) {
    if (error instanceof DesktopRuntimeError && error.code === 'cancelled') return null;
    const message = error instanceof Error ? error.message : 'That folder was not approved.';
    useOpenedFolderStore.setState({ error: message });
    return null;
  }
}
