// TODO(task-1.3): migrate to packages/runtime/state (see AppStateStore.ts domain mapping)
import { create } from 'zustand';
import {
  fileRead,
  fileReadBinary,
  fileReadRange,
  fileReadText,
  fsReadFileContent,
  fileWrite,
  fileWriteText,
  fileWriteBinary,
  fileDelete,
  fileRename,
  fileCopy,
  fileMove,
  fileExists,
  fileMetadata,
  fileGetMetadata,
  fileOpenWithDefaultApp,
  undoFileOperation,
  dirList,
  dirCreate,
  dirDelete,
  dirTraverse,
  fsGetWorkspaceFiles,
  type FileMetadata,
  type DirEntry,
  type FileReadRangeResult,
  type FileContextContent,
  type WorkspaceFile,
} from '../api/fileOps';

export type { FileMetadata, DirEntry, FileReadRangeResult, FileContextContent, WorkspaceFile };

interface FilesystemState {
  currentPath: string | undefined;
  entries: DirEntry[];
  selectedPath: string | null;
  fileContent: string;
  loading: boolean;
  error: string | null;

  history: string[];
  historyIndex: number;

  setCurrentPath: (path: string) => void;
  navigateTo: (path: string) => Promise<void>;
  goBack: () => Promise<void>;
  goForward: () => Promise<void>;
  goUp: () => Promise<void>;

  readFile: (path: string) => Promise<string>;
  readFileBinary: (filePath: string) => Promise<string>;
  readFileRange: (path: string, offset?: number, limit?: number) => Promise<FileReadRangeResult>;
  readFileText: (filePath: string) => Promise<string>;
  readFileContent: (filePath: string) => Promise<FileContextContent>;
  writeFile: (path: string, content: string) => Promise<void>;
  writeFileText: (filePath: string, content: string) => Promise<void>;
  writeFileBinary: (filePath: string, base64Content: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
  renameFile: (oldPath: string, newPath: string) => Promise<void>;
  copyFile: (src: string, dest: string) => Promise<void>;
  moveFile: (src: string, dest: string) => Promise<void>;
  fileExists: (path: string) => Promise<boolean>;
  getMetadata: (path: string) => Promise<FileMetadata>;
  getFileMetadata: (filePath: string) => Promise<FileMetadata>;
  openWithDefaultApp: (path: string) => Promise<void>;
  undoFileOperation: (operation: string, path: string, content?: string) => Promise<void>;

  listDirectory: (path: string) => Promise<DirEntry[]>;
  createDirectory: (path: string) => Promise<void>;
  deleteDirectory: (path: string, recursive: boolean) => Promise<void>;
  searchFiles: (path: string, pattern: string) => Promise<string[]>;
  getWorkspaceFiles: (workspacePath: string) => Promise<WorkspaceFile[]>;

  selectPath: (path: string | null) => void;
  setFileContent: (content: string) => void;
  clearError: () => void;
}

export const useFilesystemStore = create<FilesystemState>((set, get) => ({
  currentPath: undefined,
  entries: [],
  selectedPath: null,
  fileContent: '',
  loading: false,
  error: null,
  history: [],
  historyIndex: -1,

  setCurrentPath: (path: string) => {
    set({ currentPath: path });
  },

  navigateTo: async (path: string) => {
    set({ loading: true, error: null });
    try {
      const entries = await dirList(path);

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
      if (!path) {
        return;
      }

      set({ loading: true, error: null });
      try {
        const entries = await dirList(path);
        set({
          currentPath: path as string,
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
      if (!path) {
        return;
      }

      set({ loading: true, error: null });
      try {
        const entries = await dirList(path);
        set({
          currentPath: path as string,
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

    const parts = currentPath.split(/[/\\]/);
    if (parts.length <= 1) return;

    const parentPath = parts.slice(0, -1).join('\\') || 'C:\\';
    await get().navigateTo(parentPath);
  },

  readFile: async (path: string) => {
    set({ loading: true, error: null });
    try {
      const content = await fileRead(path);
      set({ fileContent: content, selectedPath: path, loading: false });
      return content;
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  readFileBinary: async (filePath: string) => {
    set({ loading: true, error: null });
    try {
      const base64 = await fileReadBinary(filePath);
      set({ loading: false });
      return base64;
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  readFileRange: async (path: string, offset?: number, limit?: number) => {
    set({ loading: true, error: null });
    try {
      const result = await fileReadRange(path, offset, limit);
      set({ loading: false });
      return result;
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  readFileText: async (filePath: string) => {
    set({ loading: true, error: null });
    try {
      const content = await fileReadText(filePath);
      set({ loading: false });
      return content;
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  readFileContent: async (filePath: string) => {
    set({ loading: true, error: null });
    try {
      const result = await fsReadFileContent(filePath);
      set({ loading: false });
      return result;
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  writeFile: async (path: string, content: string) => {
    set({ loading: true, error: null });
    try {
      await fileWrite(path, content);
      set({ loading: false });
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  writeFileText: async (filePath: string, content: string) => {
    set({ loading: true, error: null });
    try {
      await fileWriteText(filePath, content);
      set({ loading: false });
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  writeFileBinary: async (filePath: string, base64Content: string) => {
    set({ loading: true, error: null });
    try {
      await fileWriteBinary(filePath, base64Content);
      set({ loading: false });
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  deleteFile: async (path: string) => {
    set({ loading: true, error: null });
    try {
      await fileDelete(path);

      const { currentPath } = get();
      if (currentPath) {
        const entries = await dirList(currentPath);
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
      await fileRename(oldPath, newPath);

      const { currentPath } = get();
      if (currentPath) {
        const entries = await dirList(currentPath);
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
      await fileCopy(src, dest);
      set({ loading: false });
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  moveFile: async (src: string, dest: string) => {
    set({ loading: true, error: null });
    try {
      await fileMove(src, dest);

      const { currentPath } = get();
      if (currentPath) {
        const entries = await dirList(currentPath);
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
      const exists = await fileExists(path);
      return exists;
    } catch (error) {
      throw error;
    }
  },

  getMetadata: async (path: string) => {
    try {
      const metadata = await fileMetadata(path);
      return metadata;
    } catch (error) {
      throw error;
    }
  },

  getFileMetadata: async (filePath: string) => {
    try {
      const metadata = await fileGetMetadata(filePath);
      return metadata;
    } catch (error) {
      throw error;
    }
  },

  openWithDefaultApp: async (path: string) => {
    set({ loading: true, error: null });
    try {
      await fileOpenWithDefaultApp(path);
      set({ loading: false });
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  undoFileOperation: async (operation: string, path: string, content?: string) => {
    set({ loading: true, error: null });
    try {
      await undoFileOperation(operation, path, content);
      set({ loading: false });
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  listDirectory: async (path: string) => {
    set({ loading: true, error: null });
    try {
      const entries = await dirList(path);
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
      await dirCreate(path);

      const { currentPath } = get();
      if (currentPath) {
        const entries = await dirList(currentPath);
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
      await dirDelete(path, recursive);

      const { currentPath } = get();
      if (currentPath) {
        const entries = await dirList(currentPath);
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
      const results = await dirTraverse(path, pattern);
      set({ loading: false });
      return results;
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  getWorkspaceFiles: async (workspacePath: string) => {
    set({ loading: true, error: null });
    try {
      const files = await fsGetWorkspaceFiles(workspacePath);
      set({ loading: false });
      return files;
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

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
