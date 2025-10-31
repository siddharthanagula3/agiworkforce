import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';

export interface OpenFile {
  path: string;
  content: string;
  originalContent: string;
  language: string;
  isDirty: boolean;
}

interface CodeState {
  // Tab management
  openFiles: OpenFile[];
  activeFilePath: string | null;
  rootPath: string | null;

  // Actions
  setRootPath: (path: string) => void;
  openFile: (path: string) => Promise<void>;
  closeFile: (path: string) => void;
  closeAllFiles: () => void;
  setActiveFile: (path: string) => void;
  updateFileContent: (path: string, content: string) => void;
  saveFile: (path: string) => Promise<void>;
  saveAllFiles: () => Promise<void>;
  revertFile: (path: string) => void;
  getFileByPath: (path: string) => OpenFile | undefined;
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

      setRootPath: (path: string) => {
        set({ rootPath: path });
      },

      openFile: async (path: string) => {
        const state = get();

        // Check if file is already open
        const existingFile = state.openFiles.find((f) => f.path === path);
        if (existingFile) {
          set({ activeFilePath: path });
          return;
        }

        try {
          // Read file content from backend
          const content = await invoke<string>('file_read', { path });
          const language = detectLanguage(path);

          const newFile: OpenFile = {
            path,
            content,
            originalContent: content,
            language,
            isDirty: false,
          };

          set({
            openFiles: [...state.openFiles, newFile],
            activeFilePath: path,
          });
        } catch (error) {
          console.error('Failed to open file:', error);
          throw error;
        }
      },

      closeFile: (path: string) => {
        const state = get();
        const fileIndex = state.openFiles.findIndex((f) => f.path === path);

        if (fileIndex === -1) return;

        const newOpenFiles = state.openFiles.filter((f) => f.path !== path);
        let newActiveFile = state.activeFilePath;

        // If closing the active file, switch to another tab
        if (state.activeFilePath === path) {
          if (newOpenFiles.length > 0) {
            // Try to activate the next tab, or the previous one if it was the last tab
            newActiveFile = fileIndex < newOpenFiles.length
              ? newOpenFiles[fileIndex].path
              : newOpenFiles[newOpenFiles.length - 1].path;
          } else {
            newActiveFile = null;
          }
        }

        set({
          openFiles: newOpenFiles,
          activeFilePath: newActiveFile,
        });
      },

      closeAllFiles: () => {
        set({
          openFiles: [],
          activeFilePath: null,
        });
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

        if (fileIndex === -1) return;

        const file = state.openFiles[fileIndex];
        const updatedFile: OpenFile = {
          ...file,
          content,
          isDirty: content !== file.originalContent,
        };

        const newOpenFiles = [...state.openFiles];
        newOpenFiles[fileIndex] = updatedFile;

        set({ openFiles: newOpenFiles });
      },

      saveFile: async (path: string) => {
        const state = get();
        const fileIndex = state.openFiles.findIndex((f) => f.path === path);

        if (fileIndex === -1) return;

        const file = state.openFiles[fileIndex];

        try {
          await invoke('file_write', { path, content: file.content });

          const updatedFile: OpenFile = {
            ...file,
            originalContent: file.content,
            isDirty: false,
          };

          const newOpenFiles = [...state.openFiles];
          newOpenFiles[fileIndex] = updatedFile;

          set({ openFiles: newOpenFiles });
        } catch (error) {
          console.error('Failed to save file:', error);
          throw error;
        }
      },

      saveAllFiles: async () => {
        const state = get();
        const dirtyFiles = state.openFiles.filter((f) => f.isDirty);

        const savePromises = dirtyFiles.map((file) =>
          invoke('file_write', { path: file.path, content: file.content })
        );

        try {
          await Promise.all(savePromises);

          const newOpenFiles = state.openFiles.map((file) =>
            file.isDirty
              ? { ...file, originalContent: file.content, isDirty: false }
              : file
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

        if (fileIndex === -1) return;

        const file = state.openFiles[fileIndex];
        const revertedFile: OpenFile = {
          ...file,
          content: file.originalContent,
          isDirty: false,
        };

        const newOpenFiles = [...state.openFiles];
        newOpenFiles[fileIndex] = revertedFile;

        set({ openFiles: newOpenFiles });
      },

      getFileByPath: (path: string) => {
        const state = get();
        return state.openFiles.find((f) => f.path === path);
      },
    }),
    {
      name: 'code-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Only persist rootPath and openFiles paths (not content)
        rootPath: state.rootPath,
        activeFilePath: state.activeFilePath,
      }),
    }
  )
);
