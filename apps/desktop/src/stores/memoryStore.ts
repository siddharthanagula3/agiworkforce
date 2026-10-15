import { toast } from 'sonner';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import { MEMORY_CATEGORIES, isMemoryCategory, type MemoryCategory } from '@agiworkforce/types';

import * as memoryApi from '../api/memory';
import type { ImportResult, MemoryEntry, MemoryExport } from '../api/memory';

export { MEMORY_CATEGORIES, isMemoryCategory };
export type { ImportResult, MemoryCategory, MemoryEntry, MemoryExport };

interface MemoryState {
  memories: MemoryEntry[];
  isLoading: boolean;
  error: string | null;

  loadAll: () => Promise<void>;
  storeMemory: (
    category: MemoryCategory,
    topic: string,
    content: string,
    importance?: number,
    source?: string,
  ) => Promise<number>;
  deleteMemory: (memoryId: number) => Promise<boolean>;
  deleteAll: () => Promise<number | null>;
  exportBackup: () => Promise<MemoryExport>;
  exportMarkdown: () => Promise<string>;
  importBackup: (json: string) => Promise<ImportResult>;
  clearError: () => void;
  reset: () => void;
}

const LEGACY_PLAINTEXT_MEMORY_CACHE = 'agiworkforce-memory';

function discardLegacyPlaintextMemoryCache(): void {
  try {
    globalThis.localStorage?.removeItem(LEGACY_PLAINTEXT_MEMORY_CACHE);
  } catch (error) {
    console.warn('[memoryStore] Could not clear the old browser copy of memories:', error);
  }
}

discardLegacyPlaintextMemoryCache();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const useMemoryStore = create<MemoryState>()(
  devtools(
    (set, get) => ({
      memories: [],
      isLoading: false,
      error: null,

      loadAll: async () => {
        set({ isLoading: true, error: null }, undefined, 'memory/loadAll/start');
        try {
          const memories = await memoryApi.listAll();
          set({ memories, isLoading: false }, undefined, 'memory/loadAll/success');
        } catch (error) {
          const message = errorMessage(error);
          console.error('[memoryStore] failed to load all memories:', message);
          set({ error: message, isLoading: false }, undefined, 'memory/loadAll/error');
        }
      },

      storeMemory: async (category, topic, content, importance, source) => {
        set({ isLoading: true, error: null }, undefined, 'memory/store/start');
        try {
          const id = await memoryApi.storeMemory(category, topic, content, importance, source);
          await get().loadAll();
          set({ isLoading: false }, undefined, 'memory/store/success');
          return id;
        } catch (error) {
          const message = errorMessage(error);
          console.error('[memoryStore] failed to store:', message);
          set({ error: message, isLoading: false }, undefined, 'memory/store/error');
          throw error;
        }
      },

      deleteMemory: async (memoryId) => {
        set({ isLoading: true, error: null }, undefined, 'memory/delete/start');
        try {
          const deleted = await memoryApi.deleteMemory(memoryId);
          if (deleted) {
            await get().loadAll();
            toast.success('Memory deleted');
          }
          set({ isLoading: false }, undefined, 'memory/delete/success');
          return deleted;
        } catch (error) {
          const message = errorMessage(error);
          console.error('[memoryStore] failed to delete:', message);
          set({ error: message, isLoading: false }, undefined, 'memory/delete/error');
          toast.error(`Failed to delete memory: ${message}`);
          throw error;
        }
      },

      deleteAll: async () => {
        set({ isLoading: true, error: null }, undefined, 'memory/deleteAll/start');
        try {
          const deleted = await memoryApi.deleteAllMemories();
          await get().loadAll();
          set({ isLoading: false }, undefined, 'memory/deleteAll/success');
          return deleted;
        } catch (error) {
          const message = errorMessage(error);
          console.error('[memoryStore] failed to delete all memories:', message);
          set({ error: message, isLoading: false }, undefined, 'memory/deleteAll/error');
          await get().loadAll();
          throw error;
        }
      },

      exportBackup: async () => memoryApi.exportBackup(),

      exportMarkdown: async () => memoryApi.exportToMarkdown(),

      importBackup: async (json) => {
        set({ isLoading: true, error: null }, undefined, 'memory/import/start');
        try {
          const result = await memoryApi.importFromJsonString(json);
          await get().loadAll();
          set({ isLoading: false }, undefined, 'memory/import/success');
          return result;
        } catch (error) {
          const message = errorMessage(error);
          console.error('[memoryStore] failed to import memories:', message);
          set({ error: message, isLoading: false }, undefined, 'memory/import/error');
          throw error;
        }
      },

      clearError: () => {
        set({ error: null }, undefined, 'memory/clearError');
      },

      reset: () => {
        set({ memories: [], isLoading: false, error: null }, undefined, 'memory/reset');
      },
    }),
    { name: 'MemoryStore', enabled: import.meta.env.DEV },
  ),
);
