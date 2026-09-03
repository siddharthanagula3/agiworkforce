import { create } from 'zustand';

export function supportsDirectoryPicker(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

declare global {
  interface Window {
    showDirectoryPicker?: (opts?: {
      mode?: 'read' | 'readwrite';
      id?: string;
      startIn?: string;
    }) => Promise<FileSystemDirectoryHandle>;
  }
}

export interface CoworkFolderState {
  handle: FileSystemDirectoryHandle | null;
  folderName: string | null;
}

export interface CoworkFolderActions {
  pickFolder: () => Promise<void>;
  clearFolder: () => void;
}

export type CoworkFolderStore = CoworkFolderState & CoworkFolderActions;

export const useCoworkFolderStore = create<CoworkFolderStore>()((set) => ({
  handle: null,
  folderName: null,

  pickFolder: async () => {
    if (!supportsDirectoryPicker()) return;
    try {
      const handle = await window.showDirectoryPicker!({ mode: 'read' });
      set({ handle, folderName: handle.name });
    } catch {
      // noop
    }
  },

  clearFolder: () => set({ handle: null, folderName: null }),
}));
