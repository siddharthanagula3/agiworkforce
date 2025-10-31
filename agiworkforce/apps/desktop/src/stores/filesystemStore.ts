import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface FileMetadata {
  size: number;
  is_file: boolean;
  is_dir: boolean;
  created: number;
  modified: number;
  readonly: boolean;
}

export interface DirEntry {
  name: string;
  path: string;
  is_file: boolean;
  is_dir: boolean;
  size: number;
  modified: number;
}

interface FilesystemState {
  // Current state
  currentPath: string;
  entries: DirEntry[];
  selectedPath: string | null;
  fileContent: string;
  loading: boolean;
  error: string | null;

  // Navigation history
  history: string[];
  historyIndex: number;

  // Actions - Navigation
  setCurrentPath: (path: string) => void;
  navigateTo: (path: string) => Promise<void>;
  goBack: () => Promise<void>;
  goForward: () => Promise<void>;
  goUp: () => Promise<void>;

  // Actions - File Operations
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
  renameFile: (oldPath: string, newPath: string) => Promise<void>;
  copyFile: (src: string, dest: string) => Promise<void>;
  moveFile: (src: string, dest: string) => Promise<void>;
  fileExists: (path: string) => Promise<boolean>;
  getMetadata: (path: string) => Promise<FileMetadata>;

  // Actions - Directory Operations
  listDirectory: (path: string) => Promise<DirEntry[]>;
  createDirectory: (path: string) => Promise<void>;
  deleteDirectory: (path: string, recursive: boolean) => Promise<void>;
  searchFiles: (path: string, pattern: string) => Promise<string[]>;

  // Actions - UI State
  selectPath: (path: string | null) => void;
  setFileContent: (content: string) => void;
  clearError: () => void;
}

export const useFilesystemStore = create<FilesystemState>((set, get) => ({
  // Initial state
  currentPath: '',
  entries: [],
  selectedPath: null,
  fileContent: '',
  loading: false,
  error: null,
  history: [],
  historyIndex: -1,

  // Navigation
  setCurrentPath: (path: string) => {
    set({ currentPath: path });
  },

  navigateTo: async (path: string) => {
    set({ loading: true, error: null });
    try {
      const entries = await invoke<DirEntry[]>('dir_list', { path });

      // Update history
      const { history, historyIndex } = get();
      const newHistory = [...history.slice(0, historyIndex + 1), path];

      set({
        currentPath: path,
        entries,
        loading: false,
        history: newHistory,
        historyIndex: newHistory.length - 1,
      });
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  goBack: async () => {
    const { history, historyIndex } = get();
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      const path = history[newIndex];

      set({ loading: true, error: null });
      try {
        const entries = await invoke<DirEntry[]>('dir_list', { path });
        set({
          currentPath: path,
          entries,
          loading: false,
          historyIndex: newIndex,
        });
      } catch (error) {
        set({ loading: false, error: String(error) });
      }
    }
  },

  goForward: async () => {
    const { history, historyIndex } = get();
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      const path = history[newIndex];

      set({ loading: true, error: null });
      try {
        const entries = await invoke<DirEntry[]>('dir_list', { path });
        set({
          currentPath: path,
          entries,
          loading: false,
          historyIndex: newIndex,
        });
      } catch (error) {
        set({ loading: false, error: String(error) });
      }
    }
  },

  goUp: async () => {
    const { currentPath } = get();
    if (!currentPath) return;

    // Get parent directory
    const parts = currentPath.split(/[/\\]/);
    if (parts.length <= 1) return;

    const parentPath = parts.slice(0, -1).join('\\') || 'C:\\';
    await get().navigateTo(parentPath);
  },

  // File Operations
  readFile: async (path: string) => {
    set({ loading: true, error: null });
    try {
      const content = await invoke<string>('file_read', { path });
      set({ fileContent: content, selectedPath: path, loading: false });
      return content;
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  writeFile: async (path: string, content: string) => {
    set({ loading: true, error: null });
    try {
      await invoke('file_write', { path, content });
      set({ loading: false });
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  deleteFile: async (path: string) => {
    set({ loading: true, error: null });
    try {
      await invoke('file_delete', { path });

      // Refresh current directory
      const { currentPath } = get();
      if (currentPath) {
        const entries = await invoke<DirEntry[]>('dir_list', { path: currentPath });
        set({ entries, loading: false });
      } else {
        set({ loading: false });
      }
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  renameFile: async (oldPath: string, newPath: string) => {
    set({ loading: true, error: null });
    try {
      await invoke('file_rename', { oldPath, newPath });

      // Refresh current directory
      const { currentPath } = get();
      if (currentPath) {
        const entries = await invoke<DirEntry[]>('dir_list', { path: currentPath });
        set({ entries, loading: false });
      } else {
        set({ loading: false });
      }
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  copyFile: async (src: string, dest: string) => {
    set({ loading: true, error: null });
    try {
      await invoke('file_copy', { src, dest });
      set({ loading: false });
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  moveFile: async (src: string, dest: string) => {
    set({ loading: true, error: null });
    try {
      await invoke('file_move', { src, dest });

      // Refresh current directory
      const { currentPath } = get();
      if (currentPath) {
        const entries = await invoke<DirEntry[]>('dir_list', { path: currentPath });
        set({ entries, loading: false });
      } else {
        set({ loading: false });
      }
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  fileExists: async (path: string) => {
    try {
      const exists = await invoke<boolean>('file_exists', { path });
      return exists;
    } catch (error) {
      throw error;
    }
  },

  getMetadata: async (path: string) => {
    try {
      const metadata = await invoke<FileMetadata>('file_metadata', { path });
      return metadata;
    } catch (error) {
      throw error;
    }
  },

  // Directory Operations
  listDirectory: async (path: string) => {
    set({ loading: true, error: null });
    try {
      const entries = await invoke<DirEntry[]>('dir_list', { path });
      set({ entries, currentPath: path, loading: false });
      return entries;
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  createDirectory: async (path: string) => {
    set({ loading: true, error: null });
    try {
      await invoke('dir_create', { path });

      // Refresh current directory
      const { currentPath } = get();
      if (currentPath) {
        const entries = await invoke<DirEntry[]>('dir_list', { path: currentPath });
        set({ entries, loading: false });
      } else {
        set({ loading: false });
      }
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  deleteDirectory: async (path: string, recursive: boolean) => {
    set({ loading: true, error: null });
    try {
      await invoke('dir_delete', { path, recursive });

      // Refresh current directory
      const { currentPath } = get();
      if (currentPath) {
        const entries = await invoke<DirEntry[]>('dir_list', { path: currentPath });
        set({ entries, loading: false });
      } else {
        set({ loading: false });
      }
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  searchFiles: async (path: string, pattern: string) => {
    set({ loading: true, error: null });
    try {
      const results = await invoke<string[]>('dir_traverse', {
        path,
        globPattern: pattern,
      });
      set({ loading: false });
      return results;
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  // UI State
  selectPath: (path: string | null) => {
    set({ selectedPath: path });
  },

  setFileContent: (content: string) => {
    set({ fileContent: content });
  },

  clearError: () => {
    set({ error: null });
  },
}));
