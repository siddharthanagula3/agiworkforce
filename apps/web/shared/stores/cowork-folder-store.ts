/**
 * Cowork folder store — LOCAL ONLY.
 *
 * Holds a `FileSystemDirectoryHandle` selected via the File System Access API
 * (window.showDirectoryPicker). This handle is NOT JSON-serializable and MUST
 * NOT be persisted with zustand/persist (localStorage/IndexedDB-via-JSON).
 * If reload-survival is ever needed, use idb-keyval with structured-clone
 * storage — out of v1 scope.
 *
 * TRUST BOUNDARY: the handle and folder name MUST NOT be forwarded to any
 * cloud provider, API route, or onSend meta that reaches the server. This
 * store is an exclusively client-side silo. See AGENTS.md Local trust
 * boundary rules.
 */
import { create } from 'zustand';

/** Returns true when the browser supports the File System Access API. */
export function supportsDirectoryPicker(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

// Ambient declaration so TypeScript accepts the non-standard API without
// requiring lib "dom.iterable" or @types/wicg-file-system-access.
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
  /** The selected directory handle (in-memory only; not serializable). */
  handle: FileSystemDirectoryHandle | null;
  /** Display name derived from handle.name. Null when no folder is selected. */
  folderName: string | null;
}

export interface CoworkFolderActions {
  /** Open the OS directory picker and store the result. */
  pickFolder: () => Promise<void>;
  /** Clear the current folder selection. */
  clearFolder: () => void;
}

export type CoworkFolderStore = CoworkFolderState & CoworkFolderActions;

/**
 * No `persist` middleware — FileSystemDirectoryHandle is not JSON-serializable.
 * Intentionally in-memory so the handle never leaves the client silo.
 */
export const useCoworkFolderStore = create<CoworkFolderStore>()((set) => ({
  handle: null,
  folderName: null,

  pickFolder: async () => {
    if (!supportsDirectoryPicker()) return;
    try {
      const handle = await window.showDirectoryPicker!({ mode: 'read' });
      set({ handle, folderName: handle.name });
    } catch {
      // User cancelled — non-fatal; keep current state.
    }
  },

  clearFolder: () => set({ handle: null, folderName: null }),
}));
