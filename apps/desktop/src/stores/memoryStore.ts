/**
 * Memory Store
 *
 * Manages persistent memory for AGI Workforce, including preferences,
 * facts, decisions, and context. Uses SQLite via Tauri commands for storage.
 *
 * Zustand v5 patterns:
 * - Middleware composition: devtools(persist(...))
 * - TypeScript: Using create<State>()() pattern for type inference
 * - Persist middleware: Using createJSONStorage, partialize, version
 * - Better devtools integration with store name
 */
import { toast } from 'sonner';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';

import { invoke } from '../lib/tauri-mock';

export type MemoryCategory = 'preference' | 'fact' | 'decision' | 'context';

export interface MemoryEntry {
  id: number;
  category: MemoryCategory;
  topic: string;
  content: string;
  importance: number;
  source?: string;
  created_at: string;
  updated_at: string;
}

// --- Types for decay, compaction, export/import, and dashboard ---

export interface DecayConfig {
  enabled: boolean;
  decay_rate: number;
  decay_period_days: number;
  min_importance: number;
  access_boost: number;
}

export interface DecayResult {
  memories_decayed: number;
  total_decay_applied: number;
}

export interface MemoryStats {
  total_count: number;
  avg_importance: number;
  high_importance_count: number;
  low_importance_count: number;
}

export interface DailyLogEntry {
  id: number;
  log_date: string;
  content: string;
  entry_type: string;
  metadata?: string;
  created_at: string;
}

export interface ImportResult {
  memories_imported: number;
  logs_imported: number;
  skipped: number;
  errors: string[];
}

interface MemoryState {
  memories: MemoryEntry[];
  isLoading: boolean;
  error: string | null;

  // Hydration tracking for persist middleware
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;

  // --- Existing actions ---
  remember: (
    category: MemoryCategory,
    topic: string,
    content: string,
    importance?: number,
  ) => Promise<number>;
  recall: (category: MemoryCategory, topic: string) => Promise<MemoryEntry | null>;
  search: (query: string, limit?: number) => Promise<MemoryEntry[]>;
  forget: (category: MemoryCategory, topic: string) => Promise<boolean>;
  getByCategory: (category: MemoryCategory) => Promise<MemoryEntry[]>;
  getImportant: (minImportance?: number) => Promise<MemoryEntry[]>;
  getSessionContext: () => Promise<string>;
  loadAll: () => Promise<void>;
  clearError: () => void;
  reset: () => void;

  // --- Newly wired actions ---

  // Core memory operations
  storeMemory: (
    category: MemoryCategory,
    topic: string,
    content: string,
    importance?: number,
    source?: string,
  ) => Promise<number>;
  deleteMemory: (memoryId: number) => Promise<boolean>;
  forgetById: (memoryId: number) => Promise<boolean>;
  listCategories: () => Promise<string[]>;
  exportAll: () => Promise<MemoryEntry[]>;

  // Daily log operations
  logContext: (content: string, entryType?: string, metadata?: string) => Promise<number>;
  getDailyLogs: (date: string) => Promise<DailyLogEntry[]>;
  cleanupLogs: (keepDays?: number) => Promise<number>;

  // Decay operations
  runDecay: () => Promise<DecayResult>;
  getDecayConfig: () => Promise<DecayConfig>;
  setDecayConfig: (config: DecayConfig) => Promise<void>;
  boostOnAccess: (memoryId: number) => Promise<number>;
  getStats: () => Promise<MemoryStats>;

  // Export/import operations
  exportJson: (path?: string) => Promise<Record<string, unknown>>;
  exportMarkdown: (path?: string) => Promise<string>;
  importJson: (path: string, strategy?: string) => Promise<ImportResult>;

  // Dashboard operations
  getDashboardStats: () => Promise<Record<string, unknown>>;
  getProjectMemories: (projectName?: string, limit?: number) => Promise<MemoryEntry[]>;
  getUsageTrends: () => Promise<Record<string, unknown>>;
  suggestImportant: () => Promise<MemoryEntry[]>;
}

const storageFallback: Storage = {
  get length() {
    return 0;
  },
  clear: () => undefined,
  getItem: () => null,
  key: () => null,
  removeItem: () => undefined,
  setItem: () => undefined,
};

// Version for storage migration
// Version 2: AUDIT-006-024 - Added memory caps and size limits
const MEMORY_STORE_VERSION = 2;

// AUDIT-006-024: Memory limits to prevent unbounded localStorage growth
const MEMORY_LIMITS = {
  maxEntries: 100,
  maxTotalSizeBytes: 1024 * 1024, // 1MB
} as const;

/**
 * Calculate the approximate size of a memory entry in bytes.
 */
function estimateMemoryEntrySize(entry: MemoryEntry): number {
  return JSON.stringify(entry).length * 2; // UTF-16 encoding
}

/**
 * Prune memories to fit within limits.
 * Removes oldest entries first (by created_at timestamp).
 */
function pruneMemories(memories: MemoryEntry[]): MemoryEntry[] {
  // Sort by created_at (oldest first) for consistent pruning
  const sorted = [...memories].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  // First pass: enforce max entries limit (keep newest)
  const pruned =
    sorted.length > MEMORY_LIMITS.maxEntries ? sorted.slice(-MEMORY_LIMITS.maxEntries) : sorted;

  // Second pass: enforce total size limit (remove oldest until under limit)
  let totalSize = pruned.reduce((acc, entry) => acc + estimateMemoryEntrySize(entry), 0);
  while (totalSize > MEMORY_LIMITS.maxTotalSizeBytes && pruned.length > 0) {
    const removed = pruned.shift();
    if (removed) {
      totalSize -= estimateMemoryEntrySize(removed);
    }
  }

  return pruned;
}

export const useMemoryStore = create<MemoryState>()(
  devtools(
    persist(
      (set, get) => ({
        memories: [],
        isLoading: false,
        error: null,
        _hasHydrated: false,

        setHasHydrated: (state: boolean) => {
          set({ _hasHydrated: state }, undefined, 'memory/setHasHydrated');
        },

        remember: async (
          category: MemoryCategory,
          topic: string,
          content: string,
          importance: number = 5,
        ) => {
          set({ isLoading: true, error: null }, undefined, 'memory/remember/start');

          try {
            const id = await invoke<number>('memory_remember', {
              category,
              topic,
              content,
              importance,
            });

            // Refresh memories list after adding
            await get().loadAll();

            set({ isLoading: false }, undefined, 'memory/remember/success');
            return id;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('[memoryStore] failed to remember:', message);
            set({ error: message, isLoading: false }, undefined, 'memory/remember/error');
            toast.error(`Failed to save memory: ${message}`);
            throw error;
          }
        },

        recall: async (category: MemoryCategory, topic: string) => {
          set({ isLoading: true, error: null }, undefined, 'memory/recall/start');

          try {
            const entry = await invoke<MemoryEntry | null>('memory_recall', {
              category,
              topic,
            });

            set({ isLoading: false }, undefined, 'memory/recall/success');
            return entry;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('[memoryStore] failed to recall:', message);
            set({ error: message, isLoading: false }, undefined, 'memory/recall/error');
            throw error;
          }
        },

        search: async (query: string, limit: number = 10) => {
          set({ isLoading: true, error: null }, undefined, 'memory/search/start');

          try {
            const results = await invoke<MemoryEntry[]>('memory_search', {
              query,
              limit,
            });

            set({ isLoading: false }, undefined, 'memory/search/success');
            return results;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('[memoryStore] failed to search:', message);
            set({ error: message, isLoading: false }, undefined, 'memory/search/error');
            throw error;
          }
        },

        forget: async (category: MemoryCategory, topic: string) => {
          set({ isLoading: true, error: null }, undefined, 'memory/forget/start');

          try {
            const deleted = await invoke<boolean>('memory_forget_topic', {
              category,
              topic,
            });

            if (deleted) {
              // Refresh memories list after deleting
              await get().loadAll();
              toast.success('Memory forgotten');
            }

            set({ isLoading: false }, undefined, 'memory/forget/success');
            return deleted;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('[memoryStore] failed to forget:', message);
            set({ error: message, isLoading: false }, undefined, 'memory/forget/error');
            toast.error(`Failed to forget memory: ${message}`);
            throw error;
          }
        },

        getByCategory: async (category: MemoryCategory) => {
          set({ isLoading: true, error: null }, undefined, 'memory/getByCategory/start');

          try {
            const entries = await invoke<MemoryEntry[]>('memory_get_by_category', {
              category,
            });

            set({ isLoading: false }, undefined, 'memory/getByCategory/success');
            return entries;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('[memoryStore] failed to get by category:', message);
            set({ error: message, isLoading: false }, undefined, 'memory/getByCategory/error');
            throw error;
          }
        },

        getImportant: async (minImportance: number = 7) => {
          set({ isLoading: true, error: null }, undefined, 'memory/getImportant/start');

          try {
            const entries = await invoke<MemoryEntry[]>('memory_get_important', {
              minImportance,
            });

            set({ isLoading: false }, undefined, 'memory/getImportant/success');
            return entries;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('[memoryStore] failed to get important memories:', message);
            set({ error: message, isLoading: false }, undefined, 'memory/getImportant/error');
            throw error;
          }
        },

        getSessionContext: async () => {
          set({ isLoading: true, error: null }, undefined, 'memory/getSessionContext/start');

          try {
            const context = await invoke<string>('memory_get_session_context');

            set({ isLoading: false }, undefined, 'memory/getSessionContext/success');
            return context;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('[memoryStore] failed to get session context:', message);
            set({ error: message, isLoading: false }, undefined, 'memory/getSessionContext/error');
            throw error;
          }
        },

        loadAll: async () => {
          set({ isLoading: true, error: null }, undefined, 'memory/loadAll/start');

          try {
            const memories = await invoke<MemoryEntry[]>('memory_list_all');

            // AUDIT-006-024: Apply memory limits to prevent unbounded growth
            const prunedMemories = pruneMemories(memories);
            if (prunedMemories.length < memories.length) {
              console.debug(
                `[memoryStore] Pruned ${memories.length - prunedMemories.length} memories to fit within limits`,
              );
            }

            set(
              { memories: prunedMemories, isLoading: false },
              undefined,
              'memory/loadAll/success',
            );
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('[memoryStore] failed to load all memories:', message);
            set({ error: message, isLoading: false }, undefined, 'memory/loadAll/error');
          }
        },

        // ---------------------------------------------------------------
        // Newly wired actions
        // ---------------------------------------------------------------

        storeMemory: async (
          category: MemoryCategory,
          topic: string,
          content: string,
          importance?: number,
          source?: string,
        ) => {
          set({ isLoading: true, error: null }, undefined, 'memory/store/start');
          try {
            const id = await invoke<number>('memory_store', {
              category,
              topic,
              content,
              importance,
              source,
            });
            await get().loadAll();
            set({ isLoading: false }, undefined, 'memory/store/success');
            return id;
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[memoryStore] failed to store:', msg);
            set({ error: msg, isLoading: false }, undefined, 'memory/store/error');
            throw error;
          }
        },

        deleteMemory: async (memoryId: number) => {
          set({ isLoading: true, error: null }, undefined, 'memory/delete/start');
          try {
            const deleted = await invoke<boolean>('memory_delete', { memoryId });
            if (deleted) {
              await get().loadAll();
              toast.success('Memory deleted');
            }
            set({ isLoading: false }, undefined, 'memory/delete/success');
            return deleted;
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[memoryStore] failed to delete:', msg);
            set({ error: msg, isLoading: false }, undefined, 'memory/delete/error');
            toast.error(`Failed to delete memory: ${msg}`);
            throw error;
          }
        },

        forgetById: async (memoryId: number) => {
          set({ isLoading: true, error: null }, undefined, 'memory/forgetById/start');
          try {
            const deleted = await invoke<boolean>('memory_forget', { memoryId });
            if (deleted) {
              await get().loadAll();
              toast.success('Memory forgotten');
            }
            set({ isLoading: false }, undefined, 'memory/forgetById/success');
            return deleted;
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[memoryStore] failed to forget by id:', msg);
            set({ error: msg, isLoading: false }, undefined, 'memory/forgetById/error');
            throw error;
          }
        },

        listCategories: async () => {
          try {
            return await invoke<string[]>('memory_list_categories');
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[memoryStore] failed to list categories:', msg);
            throw error;
          }
        },

        exportAll: async () => {
          set({ isLoading: true, error: null }, undefined, 'memory/exportAll/start');
          try {
            const entries = await invoke<MemoryEntry[]>('memory_export_all');
            set({ isLoading: false }, undefined, 'memory/exportAll/success');
            return entries;
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[memoryStore] failed to export all:', msg);
            set({ error: msg, isLoading: false }, undefined, 'memory/exportAll/error');
            throw error;
          }
        },

        // Daily log operations

        logContext: async (content: string, entryType?: string, metadata?: string) => {
          set({ isLoading: true, error: null }, undefined, 'memory/logContext/start');
          try {
            const id = await invoke<number>('memory_log_context', {
              content,
              entryType,
              metadata,
            });
            set({ isLoading: false }, undefined, 'memory/logContext/success');
            return id;
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[memoryStore] failed to log context:', msg);
            set({ error: msg, isLoading: false }, undefined, 'memory/logContext/error');
            throw error;
          }
        },

        getDailyLogs: async (date: string) => {
          set({ isLoading: true, error: null }, undefined, 'memory/getDailyLogs/start');
          try {
            const logs = await invoke<DailyLogEntry[]>('memory_get_daily_logs', { date });
            set({ isLoading: false }, undefined, 'memory/getDailyLogs/success');
            return logs;
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[memoryStore] failed to get daily logs:', msg);
            set({ error: msg, isLoading: false }, undefined, 'memory/getDailyLogs/error');
            throw error;
          }
        },

        cleanupLogs: async (keepDays?: number) => {
          set({ isLoading: true, error: null }, undefined, 'memory/cleanupLogs/start');
          try {
            const removed = await invoke<number>('memory_cleanup_logs', { keepDays });
            set({ isLoading: false }, undefined, 'memory/cleanupLogs/success');
            toast.success(`Cleaned up ${removed} old log entries`);
            return removed;
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[memoryStore] failed to cleanup logs:', msg);
            set({ error: msg, isLoading: false }, undefined, 'memory/cleanupLogs/error');
            throw error;
          }
        },

        // Decay operations

        runDecay: async () => {
          set({ isLoading: true, error: null }, undefined, 'memory/runDecay/start');
          try {
            const result = await invoke<DecayResult>('memory_run_decay');
            await get().loadAll();
            set({ isLoading: false }, undefined, 'memory/runDecay/success');
            return result;
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[memoryStore] failed to run decay:', msg);
            set({ error: msg, isLoading: false }, undefined, 'memory/runDecay/error');
            throw error;
          }
        },

        getDecayConfig: async () => {
          try {
            return await invoke<DecayConfig>('memory_get_decay_config');
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[memoryStore] failed to get decay config:', msg);
            throw error;
          }
        },

        setDecayConfig: async (config: DecayConfig) => {
          set({ isLoading: true, error: null }, undefined, 'memory/setDecayConfig/start');
          try {
            await invoke<void>('memory_set_decay_config', {
              enabled: config.enabled,
              decayRate: config.decay_rate,
              decayPeriodDays: config.decay_period_days,
              minImportance: config.min_importance,
              accessBoost: config.access_boost,
            });
            set({ isLoading: false }, undefined, 'memory/setDecayConfig/success');
            toast.success('Decay config updated');
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[memoryStore] failed to set decay config:', msg);
            set({ error: msg, isLoading: false }, undefined, 'memory/setDecayConfig/error');
            throw error;
          }
        },

        boostOnAccess: async (memoryId: number) => {
          try {
            return await invoke<number>('memory_boost_on_access', { memoryId });
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[memoryStore] failed to boost on access:', msg);
            throw error;
          }
        },

        getStats: async () => {
          set({ isLoading: true, error: null }, undefined, 'memory/getStats/start');
          try {
            const stats = await invoke<MemoryStats>('memory_get_stats');
            set({ isLoading: false }, undefined, 'memory/getStats/success');
            return stats;
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[memoryStore] failed to get stats:', msg);
            set({ error: msg, isLoading: false }, undefined, 'memory/getStats/error');
            throw error;
          }
        },

        // Export/import operations

        exportJson: async (path?: string) => {
          set({ isLoading: true, error: null }, undefined, 'memory/exportJson/start');
          try {
            const result = await invoke<Record<string, unknown>>('memory_export_json', { path });
            set({ isLoading: false }, undefined, 'memory/exportJson/success');
            toast.success('Memories exported to JSON');
            return result;
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[memoryStore] failed to export JSON:', msg);
            set({ error: msg, isLoading: false }, undefined, 'memory/exportJson/error');
            toast.error(`Failed to export: ${msg}`);
            throw error;
          }
        },

        exportMarkdown: async (path?: string) => {
          set({ isLoading: true, error: null }, undefined, 'memory/exportMarkdown/start');
          try {
            const result = await invoke<string>('memory_export_markdown', { path });
            set({ isLoading: false }, undefined, 'memory/exportMarkdown/success');
            toast.success('Memories exported to Markdown');
            return result;
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[memoryStore] failed to export Markdown:', msg);
            set({ error: msg, isLoading: false }, undefined, 'memory/exportMarkdown/error');
            toast.error(`Failed to export: ${msg}`);
            throw error;
          }
        },

        importJson: async (path: string, strategy?: string) => {
          set({ isLoading: true, error: null }, undefined, 'memory/importJson/start');
          try {
            const result = await invoke<ImportResult>('memory_import_json', { path, strategy });
            await get().loadAll();
            set({ isLoading: false }, undefined, 'memory/importJson/success');
            toast.success(
              `Imported ${result.memories_imported} memories and ${result.logs_imported} logs`,
            );
            return result;
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[memoryStore] failed to import JSON:', msg);
            set({ error: msg, isLoading: false }, undefined, 'memory/importJson/error');
            toast.error(`Failed to import: ${msg}`);
            throw error;
          }
        },

        // Dashboard operations

        getDashboardStats: async () => {
          set({ isLoading: true, error: null }, undefined, 'memory/getDashboardStats/start');
          try {
            const stats = await invoke<Record<string, unknown>>('memory_get_dashboard_stats');
            set({ isLoading: false }, undefined, 'memory/getDashboardStats/success');
            return stats;
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[memoryStore] failed to get dashboard stats:', msg);
            set({ error: msg, isLoading: false }, undefined, 'memory/getDashboardStats/error');
            throw error;
          }
        },

        getProjectMemories: async (projectName?: string, limit?: number) => {
          set({ isLoading: true, error: null }, undefined, 'memory/getProjectMemories/start');
          try {
            const entries = await invoke<MemoryEntry[]>('memory_get_project_memories', {
              projectName,
              limit,
            });
            set({ isLoading: false }, undefined, 'memory/getProjectMemories/success');
            return entries;
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[memoryStore] failed to get project memories:', msg);
            set({ error: msg, isLoading: false }, undefined, 'memory/getProjectMemories/error');
            throw error;
          }
        },

        getUsageTrends: async () => {
          set({ isLoading: true, error: null }, undefined, 'memory/getUsageTrends/start');
          try {
            const trends = await invoke<Record<string, unknown>>('memory_get_usage_trends');
            set({ isLoading: false }, undefined, 'memory/getUsageTrends/success');
            return trends;
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[memoryStore] failed to get usage trends:', msg);
            set({ error: msg, isLoading: false }, undefined, 'memory/getUsageTrends/error');
            throw error;
          }
        },

        suggestImportant: async () => {
          set({ isLoading: true, error: null }, undefined, 'memory/suggestImportant/start');
          try {
            const entries = await invoke<MemoryEntry[]>('memory_suggest_important');
            set({ isLoading: false }, undefined, 'memory/suggestImportant/success');
            return entries;
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[memoryStore] failed to suggest important:', msg);
            set({ error: msg, isLoading: false }, undefined, 'memory/suggestImportant/error');
            throw error;
          }
        },

        clearError: () => {
          set({ error: null }, undefined, 'memory/clearError');
        },

        reset: () => {
          set(
            {
              memories: [],
              isLoading: false,
              error: null,
            },
            undefined,
            'memory/reset',
          );
        },
      }),
      {
        name: 'agiworkforce-memory',
        version: MEMORY_STORE_VERSION,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        // Only persist the memories array for offline access / quick hydration
        partialize: (state) => ({
          memories: state.memories,
        }),
        // AUDIT-006-024: Migration logic for existing users
        migrate: (persistedState, version) => {
          const state = persistedState as { memories?: MemoryEntry[] };

          if (version < 2) {
            // Version 2: Apply memory limits to existing data
            if (state.memories && Array.isArray(state.memories)) {
              const originalCount = state.memories.length;
              state.memories = pruneMemories(state.memories);
              if (state.memories.length < originalCount) {
                console.debug(
                  `[MemoryStore] Migration v2: Pruned ${originalCount - state.memories.length} memories to fit within new limits`,
                );
              }
            }
          }

          return state as MemoryState;
        },
        // Called when rehydration finishes (with or without errors)
        onRehydrateStorage: () => (state) => {
          if (state) {
            state.setHasHydrated(true);
            console.debug('[MemoryStore] Rehydration complete');
          }
        },
      },
    ),
    { name: 'MemoryStore', enabled: import.meta.env.DEV },
  ),
);

/**
 * Wait for memory store to finish hydrating from localStorage.
 * Use this before accessing memories that depend on persisted values.
 */
export function waitForMemoryHydration(): Promise<void> {
  return new Promise((resolve) => {
    const state = useMemoryStore.getState();
    if (state._hasHydrated) {
      resolve();
      return;
    }
    const unsub = useMemoryStore.subscribe((s) => {
      if (s._hasHydrated) {
        unsub();
        resolve();
      }
    });
  });
}

// Selectors
export const selectMemories = (state: MemoryState) => state.memories;
export const selectMemoryLoading = (state: MemoryState) => state.isLoading;
export const selectMemoryError = (state: MemoryState) => state.error;
export const selectMemoryHasHydrated = (state: MemoryState) => state._hasHydrated;

// Derived selectors
export const selectMemoriesByCategory = (category: MemoryCategory) => (state: MemoryState) =>
  state.memories.filter((m) => m.category === category);

export const selectImportantMemories =
  (minImportance: number = 7) =>
  (state: MemoryState) =>
    state.memories.filter((m) => m.importance >= minImportance);

export const selectPreferences = (state: MemoryState) =>
  state.memories.filter((m) => m.category === 'preference');

export const selectFacts = (state: MemoryState) =>
  state.memories.filter((m) => m.category === 'fact');

export const selectDecisions = (state: MemoryState) =>
  state.memories.filter((m) => m.category === 'decision');

export const selectContextMemories = (state: MemoryState) =>
  state.memories.filter((m) => m.category === 'context');

// ---------------------------------------------------------------------------
// User-facing memory injection (ChatGPT-style "Memory" feature)
// ---------------------------------------------------------------------------

/** Rough token estimate: ~4 chars per token */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Build a formatted memory context string for system prompt injection.
 * Only includes high-importance memories (importance >= 6) that fit within the token budget.
 *
 * @param memories - Full memory list from store
 * @param maxTokens - Token budget for the injected context block
 * @returns Formatted string ready to prepend to the system prompt, or '' if nothing to inject
 */
export function buildMemoryContext(memories: MemoryEntry[], maxTokens: number = 500): string {
  const eligible = [...memories]
    .filter((m) => m.importance >= 5)
    .sort((a, b) => b.importance - a.importance);

  if (eligible.length === 0) return '';

  const header = '[User Memory — from previous conversations]';
  const lines: string[] = [header];
  let budget = maxTokens - estimateTokens(header + '\n');

  for (const memory of eligible) {
    const line = `- [${memory.category}] ${memory.topic}: ${memory.content}`;
    const cost = estimateTokens(line + '\n');
    if (budget - cost < 0) break;
    lines.push(line);
    budget -= cost;
  }

  if (lines.length <= 1) return '';
  return lines.join('\n');
}
