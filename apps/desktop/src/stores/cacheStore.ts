import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import { storageFallback } from '../lib/storageFallback';
import {
  codebaseCacheGetStats,
  codebaseCacheClearProject,
  codebaseCacheClearFile,
  codebaseCacheClearAll,
  codebaseCacheClearExpired,
  codebaseCacheGetFileTree,
  codebaseCacheSetFileTree,
  codebaseCacheGetSymbols,
  codebaseCacheSetSymbols,
  codebaseCacheGetDependencies,
  codebaseCacheSetDependencies,
  codebaseCacheCalculateHash,
} from '../api/cache';
import type { FileTree, SymbolTable, DependencyGraph, CodebaseCacheStats } from '../api/cache';

// Re-export types from the API layer for backward compatibility
export type {
  FileTreeEntry,
  FileTree,
  SymbolKind,
  SymbolInfo,
  ImportInfo,
  ExportInfo,
  SymbolTable,
  NodeType,
  EdgeType,
  DependencyNode,
  DependencyEdge,
  DependencyGraph,
  CodebaseCacheStats,
} from '../api/cache';

// --- Store interface ---

interface CacheStoreState {
  codebaseStats: CodebaseCacheStats | null;
  isLoading: boolean;
  error: string | null;

  // Codebase cache stats
  getCodebaseCacheStats: () => Promise<CodebaseCacheStats>;

  // Cache clearing
  clearProjectCache: (projectPath: string) => Promise<number>;
  clearFileCache: (filePath: string) => Promise<number>;
  clearAllCodebaseCache: () => Promise<number>;
  clearExpiredCodebaseCache: () => Promise<number>;

  // File tree cache
  getFileTree: (projectPath: string) => Promise<FileTree | null>;
  setFileTree: (projectPath: string, fileTree: FileTree) => Promise<void>;

  // Symbol cache
  getSymbols: (filePath: string, fileHash?: string) => Promise<SymbolTable | null>;
  setSymbols: (filePath: string, symbols: SymbolTable, fileHash?: string) => Promise<void>;

  // Dependency cache
  getDependencies: (projectPath: string) => Promise<DependencyGraph | null>;
  setDependencies: (projectPath: string, dependencies: DependencyGraph) => Promise<void>;

  // Utility
  calculateFileHash: (content: number[]) => Promise<string>;

  clearError: () => void;
}

export const useCacheStore = create<CacheStoreState>()(
  devtools(
    persist(
      (set) => ({
        codebaseStats: null,
        isLoading: false,
        error: null,

        getCodebaseCacheStats: async () => {
          set({ isLoading: true, error: null });
          try {
            const stats = await codebaseCacheGetStats();
            set({ codebaseStats: stats, isLoading: false });
            return stats;
          } catch (error) {
            set({ isLoading: false, error: String(error) });
            throw error;
          }
        },

        clearProjectCache: async (projectPath: string) => {
          set({ isLoading: true, error: null });
          try {
            const deleted = await codebaseCacheClearProject(projectPath);
            set({ isLoading: false });
            return deleted;
          } catch (error) {
            set({ isLoading: false, error: String(error) });
            throw error;
          }
        },

        clearFileCache: async (filePath: string) => {
          set({ isLoading: true, error: null });
          try {
            const deleted = await codebaseCacheClearFile(filePath);
            set({ isLoading: false });
            return deleted;
          } catch (error) {
            set({ isLoading: false, error: String(error) });
            throw error;
          }
        },

        clearAllCodebaseCache: async () => {
          set({ isLoading: true, error: null });
          try {
            const deleted = await codebaseCacheClearAll();
            set({ codebaseStats: null, isLoading: false });
            return deleted;
          } catch (error) {
            set({ isLoading: false, error: String(error) });
            throw error;
          }
        },

        clearExpiredCodebaseCache: async () => {
          set({ isLoading: true, error: null });
          try {
            const deleted = await codebaseCacheClearExpired();
            set({ isLoading: false });
            return deleted;
          } catch (error) {
            set({ isLoading: false, error: String(error) });
            throw error;
          }
        },

        getFileTree: async (projectPath: string) => {
          try {
            return await codebaseCacheGetFileTree(projectPath);
          } catch (error) {
            console.warn('[CacheStore] Failed to get file tree:', error);
            return null;
          }
        },

        setFileTree: async (projectPath: string, fileTree: FileTree) => {
          try {
            await codebaseCacheSetFileTree(projectPath, fileTree);
          } catch (error) {
            console.warn('[CacheStore] Failed to set file tree:', error);
            throw error;
          }
        },

        getSymbols: async (filePath: string, fileHash?: string) => {
          try {
            return await codebaseCacheGetSymbols(filePath, fileHash);
          } catch (error) {
            console.warn('[CacheStore] Failed to get symbols:', error);
            return null;
          }
        },

        setSymbols: async (filePath: string, symbols: SymbolTable, fileHash?: string) => {
          try {
            await codebaseCacheSetSymbols(filePath, symbols, fileHash);
          } catch (error) {
            console.warn('[CacheStore] Failed to set symbols:', error);
            throw error;
          }
        },

        getDependencies: async (projectPath: string) => {
          try {
            return await codebaseCacheGetDependencies(projectPath);
          } catch (error) {
            console.warn('[CacheStore] Failed to get dependencies:', error);
            return null;
          }
        },

        setDependencies: async (projectPath: string, dependencies: DependencyGraph) => {
          try {
            await codebaseCacheSetDependencies(projectPath, dependencies);
          } catch (error) {
            console.warn('[CacheStore] Failed to set dependencies:', error);
            throw error;
          }
        },

        calculateFileHash: async (content: number[]) => {
          try {
            return await codebaseCacheCalculateHash(content);
          } catch (error) {
            throw error;
          }
        },

        clearError: () => {
          set({ error: null });
        },
      }),
      {
        name: 'agiworkforce-cache',
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        partialize: (state) => ({
          codebaseStats: state.codebaseStats,
        }),
      },
    ),
    { name: 'CacheStore', enabled: import.meta.env.DEV },
  ),
);
