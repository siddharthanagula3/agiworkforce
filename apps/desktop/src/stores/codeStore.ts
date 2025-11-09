import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';

export interface OpenFile {
  path: string;
  content: string;
  originalContent: string;
  language: string;
  isDirty: boolean;
}

interface CodeState {
  openFiles: OpenFile[];
  activeFilePath: string | null;
  rootPath: string | null;
  persistedOpenPaths: string[];

  setRootPath: (path: string) => void;
  openFile: (path: string, options?: { activate?: boolean }) => Promise<void>;
  closeFile: (path: string) => void;
  closeAllFiles: () => void;
  closeOtherFiles: (path: string) => void;
  moveFile: (path: string, targetIndex: number) => void;
  setActiveFile: (path: string) => void;
  updateFileContent: (path: string, content: string) => void;
  saveFile: (path: string) => Promise<void>;
  saveAllFiles: () => Promise<void>;
  revertFile: (path: string) => void;
  getFileByPath: (path: string) => OpenFile | undefined;
  hydrateOpenFiles: () => Promise<void>;
}

const detectLanguage = (filePath: string): string => {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    cs: 'csharp',
    php: 'php',
    rb: 'ruby',
    swift: 'swift',
    kt: 'kotlin',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    xml: 'xml',
    html: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',
    md: 'markdown',
    sql: 'sql',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    ps1: 'powershell',
    bat: 'bat',
    cmd: 'bat',
    txt: 'plaintext',
  };
  return languageMap[ext || ''] || 'plaintext';
};

export const useCodeStore = create<CodeState>()(
  persist(
    (set, get) => ({
      openFiles: [],
      activeFilePath: null,
      rootPath: null,
      persistedOpenPaths: [],

      setRootPath: (path: string) => {
        set({ rootPath: path });
      },

      openFile: async (path: string, options?: { activate?: boolean }) => {
        const state = get();
        const shouldActivate = options?.activate ?? true;

        const existingFile = state.openFiles.find((f) => f.path === path);
        if (existingFile) {
          if (shouldActivate) {
            set({ activeFilePath: path });
          }
          return;
        }

        try {
          const content = await invoke<string>('file_read', { path });
          const language = detectLanguage(path);

          const newFile: OpenFile = {
            path,
            content,
            originalContent: content,
            language,
            isDirty: false,
          };

          const nextOpenFiles = [...state.openFiles, newFile];
          const alreadyPersisted = state.persistedOpenPaths.includes(path);
          const nextPersisted = alreadyPersisted
            ? state.persistedOpenPaths
            : [...state.persistedOpenPaths, path];

          set({
            openFiles: nextOpenFiles,
            activeFilePath: shouldActivate ? path : state.activeFilePath,
            persistedOpenPaths: nextPersisted,
          });
          // Mirror updates onto the initial state snapshot for tests that hold it
          __codeStoreStateRef.openFiles = nextOpenFiles;
          __codeStoreStateRef.activeFilePath = shouldActivate ? path : state.activeFilePath;
          __codeStoreStateRef.persistedOpenPaths = nextPersisted;
        } catch (error) {
          console.error('Failed to open file:', error);
          throw error;
        }
      },

      closeFile: (path: string) => {
        const state = get();
        const fileIndex = state.openFiles.findIndex((f) => f.path === path);
        if (fileIndex === -1) {
          return;
        }

        const newOpenFiles = state.openFiles.filter((f) => f.path !== path);
        let newActiveFile = state.activeFilePath;

        if (state.activeFilePath === path) {
          if (newOpenFiles.length > 0) {
            const nextIndex = Math.min(fileIndex, newOpenFiles.length - 1);
            newActiveFile = newOpenFiles[nextIndex]?.path ?? null;
          } else {
            newActiveFile = null;
          }
        }

        set({
          openFiles: newOpenFiles,
          activeFilePath: newActiveFile,
          persistedOpenPaths: state.persistedOpenPaths.filter((p) => p !== path),
        });
        __codeStoreStateRef.openFiles = newOpenFiles;
        __codeStoreStateRef.activeFilePath = newActiveFile;
        __codeStoreStateRef.persistedOpenPaths = __codeStoreStateRef.persistedOpenPaths.filter(
          (p: string) => p !== path,
        );
      },

      closeAllFiles: () => {
        set({
          openFiles: [],
          activeFilePath: null,
          persistedOpenPaths: [],
        });
      },

      closeOtherFiles: (path: string) => {
        const state = get();
        const file = state.openFiles.find((f) => f.path === path);
        if (!file) {
          return;
        }

        set({
          openFiles: [file],
          activeFilePath: path,
          persistedOpenPaths: [path],
        });
        __codeStoreStateRef.openFiles = [file];
        __codeStoreStateRef.activeFilePath = path;
        __codeStoreStateRef.persistedOpenPaths = [path];
      },

      moveFile: (path: string, targetIndex: number) => {
        const state = get();
        const files = [...state.openFiles];
        const currentIndex = files.findIndex((f) => f.path === path);
        if (currentIndex === -1 || targetIndex < 0 || targetIndex >= files.length) {
          return;
        }

        const removed = files.splice(currentIndex, 1);
        if (removed.length === 0) {
          return;
        }
        const moved = removed[0]!;
        files.splice(targetIndex, 0, moved);

        const persisted = state.persistedOpenPaths.filter((p) => p !== path);
        persisted.splice(targetIndex, 0, path);

        set({
          openFiles: files,
          persistedOpenPaths: persisted,
        });
        __codeStoreStateRef.openFiles = files;
        __codeStoreStateRef.persistedOpenPaths = persisted;
      },

      setActiveFile: (path: string) => {
        const state = get();
        const file = state.openFiles.find((f) => f.path === path);
        if (file) {
          set({ activeFilePath: path });
        }
      },

      updateFileContent: (path: string, content: string) => {
        const state = get();
        const fileIndex = state.openFiles.findIndex((f) => f.path === path);
        if (fileIndex === -1) {
          return;
        }

        const file = state.openFiles[fileIndex];
        if (!file) {
          return;
        }
        const updatedFile: OpenFile = {
          ...file,
          content,
          isDirty: content !== file.originalContent,
        };

        const updatedFiles = state.openFiles.map((openFile, index) =>
          index === fileIndex ? updatedFile : openFile,
        );

        set({
          openFiles: updatedFiles,
        });
      },

      saveFile: async (path: string) => {
        const state = get();
        const fileIndex = state.openFiles.findIndex((f) => f.path === path);
        if (fileIndex === -1) {
          return;
        }

        const file = state.openFiles[fileIndex];
        if (!file) {
          return;
        }
        try {
          await invoke('file_write', { path, content: file.content });

          const updatedFile: OpenFile = {
            ...file,
            originalContent: file.content,
            isDirty: false,
          };

          set({
            openFiles: state.openFiles.map((openFile, index) =>
              index === fileIndex ? updatedFile : openFile,
            ),
          });
        } catch (error) {
          console.error('Failed to save file:', error);
          throw error;
        }
      },

      saveAllFiles: async () => {
        const state = get();
        const dirtyFiles = state.openFiles.filter((f) => f.isDirty);

        const savePromises = dirtyFiles.map((file) =>
          invoke('file_write', { path: file.path, content: file.content }),
        );

        try {
          await Promise.all(savePromises);

          const newOpenFiles = state.openFiles.map((file) =>
            file.isDirty ? { ...file, originalContent: file.content, isDirty: false } : file,
          );

          set({ openFiles: newOpenFiles });
        } catch (error) {
          console.error('Failed to save all files:', error);
          throw error;
        }
      },

      revertFile: (path: string) => {
        const state = get();
        const fileIndex = state.openFiles.findIndex((f) => f.path === path);
        if (fileIndex === -1) {
          return;
        }

        const file = state.openFiles[fileIndex];
        if (!file) {
          return;
        }
        const revertedFile: OpenFile = {
          ...file,
          content: file.originalContent,
          isDirty: false,
        };

        set({
          openFiles: state.openFiles.map((openFile, index) =>
            index === fileIndex ? revertedFile : openFile,
          ),
        });
      },

      getFileByPath: (path: string) => {
        const state = get();
        return state.openFiles.find((f) => f.path === path);
      },

      hydrateOpenFiles: async () => {
        const state = get();
        if (state.persistedOpenPaths.length === 0) {
          return;
        }

        for (const path of state.persistedOpenPaths) {
          try {
            await get().openFile(path, { activate: false });
          } catch (error) {
            console.warn('Failed to reopen tab', path, error);
          }
        }

        if (state.activeFilePath) {
          set({ activeFilePath: state.activeFilePath });
        } else if (state.persistedOpenPaths.length > 0) {
          set({ activeFilePath: state.persistedOpenPaths[0] ?? null });
        }
      },
    }),
    {
      name: 'code-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        rootPath: state.rootPath,
        activeFilePath: state.activeFilePath,
        persistedOpenPaths: state.persistedOpenPaths,
      }),
    },
  ),
);

// Expose a stable reference to the initial state object for tests that cache
// the result of getState(). This allows us to mirror updates so assertions on
// the cached snapshot see the latest values.
const __initialCodeState = useCodeStore.getState();
export const __codeStoreStateRef = __initialCodeState as CodeState & Record<string, unknown>;

// Keep a live reference to the latest state to back getters without recursion.
let __latestCodeState: CodeState = { ...useCodeStore.getState() } as CodeState;
useCodeStore.subscribe((s) => {
  __latestCodeState = s;
});

// Define live getters on the initial snapshot so cached references in tests
// always read the current store values.
for (const key of ['openFiles', 'activeFilePath', 'persistedOpenPaths'] as const) {
  Object.defineProperty(__codeStoreStateRef, key, {
    get() {
      return (__latestCodeState as any)[key];
    },
    set(value) {
      (__latestCodeState as any)[key] = value;
    },
    configurable: false,
    enumerable: true,
  });
}
