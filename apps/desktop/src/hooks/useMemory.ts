/**
 * useMemory Hook
 *
 * Provides a unified interface for memory and knowledge base operations
 * with built-in caching, error handling, and loading states.
 *
 * Features:
 * - Store, recall, search, and delete memories
 * - Knowledge base add and query operations
 * - Category listing and statistics
 * - Automatic error handling with user-friendly messages
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { invoke } from '../lib/tauri-mock';
import type { MemoryCategory, MemoryEntry } from '../stores/memoryStore';
import { useMemoryStore } from '../stores/memoryStore';

// ============================================================================
// Types
// ============================================================================

export interface MemoryStats {
  total_count: number;
  by_category: Record<MemoryCategory, number>;
  avg_importance: number;
  oldest_memory: string | null;
  newest_memory: string | null;
  total_size_bytes: number;
}

export interface KnowledgeEntry {
  id: string;
  content: string;
  source: string;
  metadata?: Record<string, unknown>;
  embedding_id?: string;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeQueryResult {
  entries: KnowledgeEntry[];
  query: string;
  relevance_scores: number[];
}

export interface MemoryStoreRequest {
  category: MemoryCategory;
  topic: string;
  content: string;
  importance?: number;
  source?: string;
}

export interface MemoryRecallRequest {
  query: string;
  category?: MemoryCategory;
  limit?: number;
}

export interface UseMemoryOptions {
  /** Auto-load memories on mount (default: true) */
  autoLoad?: boolean;
  /** Load statistics on mount (default: false) */
  loadStats?: boolean;
  /** Load categories on mount (default: false) */
  loadCategories?: boolean;
}

export interface UseMemoryReturn {
  // Data
  memories: MemoryEntry[];
  categories: string[];
  stats: MemoryStats | null;

  // Loading states
  isLoading: boolean;
  isStoring: boolean;
  isSearching: boolean;
  isDeleting: boolean;

  // Error state
  error: string | null;

  // Memory operations
  store: (request: MemoryStoreRequest) => Promise<number>;
  recall: (request: MemoryRecallRequest) => Promise<MemoryEntry[]>;
  search: (query: string, limit?: number) => Promise<MemoryEntry[]>;
  deleteMemory: (id: number) => Promise<boolean>;
  deleteByTopic: (category: MemoryCategory, topic: string) => Promise<boolean>;

  // Category operations
  listCategories: () => Promise<string[]>;
  getByCategory: (category: MemoryCategory) => Promise<MemoryEntry[]>;

  // Stats operations
  getStats: () => Promise<MemoryStats>;
  refreshStats: () => Promise<void>;

  // Knowledge base operations
  addKnowledge: (
    content: string,
    source: string,
    metadata?: Record<string, unknown>,
  ) => Promise<string>;
  queryKnowledge: (query: string, limit?: number) => Promise<KnowledgeQueryResult>;

  // Utility
  refresh: () => Promise<void>;
  clearError: () => void;
}

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Translates backend errors to user-friendly messages
 */
function translateError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  // Handle common error patterns
  if (message.includes('SQLITE_CONSTRAINT')) {
    return 'A memory with this topic already exists. Try updating it instead.';
  }
  if (message.includes('SQLITE_FULL') || message.includes('database is full')) {
    return 'Memory storage is full. Please delete some old memories to make room.';
  }
  if (message.includes('not found')) {
    return 'The requested memory could not be found.';
  }
  if (message.includes('network') || message.includes('connection')) {
    return 'Unable to connect. Please check your internet connection.';
  }
  if (message.includes('permission') || message.includes('access denied')) {
    return 'Permission denied. Please check your settings.';
  }

  // Return the original message if no translation is available
  return message;
}

// ============================================================================
// Hook implementation
// ============================================================================

export function useMemory(options: UseMemoryOptions = {}): UseMemoryReturn {
  const { autoLoad = true, loadStats = false, loadCategories = false } = options;

  // Local state
  const [categories, setCategories] = useState<string[]>([]);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [isStoring, setIsStoring] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use the memory store for shared state
  const memoryStore = useMemoryStore();
  const { memories, isLoading, loadAll } = memoryStore;

  // ============================================================================
  // Memory operations
  // ============================================================================

  /**
   * Store a new memory
   */
  const store = useCallback(
    async (request: MemoryStoreRequest): Promise<number> => {
      setIsStoring(true);
      setError(null);

      try {
        const id = await invoke<number>('memory_store', {
          category: request.category,
          topic: request.topic,
          content: request.content,
          importance: request.importance ?? 5,
          source: request.source,
        });

        // Refresh the memory list
        await loadAll();

        toast.success('Memory saved successfully');
        return id;
      } catch (err) {
        const message = translateError(err);
        setError(message);
        toast.error(`Failed to save memory: ${message}`);
        throw new Error(message);
      } finally {
        setIsStoring(false);
      }
    },
    [loadAll],
  );

  /**
   * Recall memories by query with optional filtering
   */
  const recall = useCallback(async (request: MemoryRecallRequest): Promise<MemoryEntry[]> => {
    setIsSearching(true);
    setError(null);

    try {
      const results = await invoke<MemoryEntry[]>('memory_recall', {
        query: request.query,
        category: request.category,
        limit: request.limit ?? 10,
      });

      return results;
    } catch (err) {
      const message = translateError(err);
      setError(message);
      throw new Error(message);
    } finally {
      setIsSearching(false);
    }
  }, []);

  /**
   * Search memories by text query
   */
  const search = useCallback(async (query: string, limit: number = 10): Promise<MemoryEntry[]> => {
    setIsSearching(true);
    setError(null);

    try {
      const results = await invoke<MemoryEntry[]>('memory_search', {
        query,
        limit,
      });

      return results;
    } catch (err) {
      const message = translateError(err);
      setError(message);
      throw new Error(message);
    } finally {
      setIsSearching(false);
    }
  }, []);

  /**
   * Delete a memory by ID
   */
  const deleteMemory = useCallback(
    async (id: number): Promise<boolean> => {
      setIsDeleting(true);
      setError(null);

      try {
        const deleted = await invoke<boolean>('memory_delete', { id });

        if (deleted) {
          // Refresh the memory list
          await loadAll();
          toast.success('Memory deleted');
        }

        return deleted;
      } catch (err) {
        const message = translateError(err);
        setError(message);
        toast.error(`Failed to delete memory: ${message}`);
        throw new Error(message);
      } finally {
        setIsDeleting(false);
      }
    },
    [loadAll],
  );

  /**
   * Delete a memory by category and topic
   */
  const deleteByTopic = useCallback(
    async (category: MemoryCategory, topic: string): Promise<boolean> => {
      setIsDeleting(true);
      setError(null);

      try {
        // AUDIT-MEMORY-073 fix: Use memory_forget_topic which accepts category and topic
        const deleted = await invoke<boolean>('memory_forget_topic', {
          category,
          topic,
        });

        if (deleted) {
          // Refresh the memory list
          await loadAll();
          toast.success('Memory forgotten');
        }

        return deleted;
      } catch (err) {
        const message = translateError(err);
        setError(message);
        toast.error(`Failed to forget memory: ${message}`);
        throw new Error(message);
      } finally {
        setIsDeleting(false);
      }
    },
    [loadAll],
  );

  // ============================================================================
  // Category operations
  // ============================================================================

  /**
   * List all memory categories
   */
  const listCategories = useCallback(async (): Promise<string[]> => {
    try {
      const result = await invoke<string[]>('memory_list_categories');
      setCategories(result);
      return result;
    } catch (err) {
      const message = translateError(err);
      setError(message);
      throw new Error(message);
    }
  }, []);

  /**
   * Get memories by category
   */
  const getByCategory = useCallback(async (category: MemoryCategory): Promise<MemoryEntry[]> => {
    try {
      const results = await invoke<MemoryEntry[]>('memory_get_by_category', {
        category,
      });
      return results;
    } catch (err) {
      const message = translateError(err);
      setError(message);
      throw new Error(message);
    }
  }, []);

  // ============================================================================
  // Stats operations
  // ============================================================================

  /**
   * Get memory statistics
   */
  const getStats = useCallback(async (): Promise<MemoryStats> => {
    try {
      const result = await invoke<MemoryStats>('memory_get_stats');
      setStats(result);
      return result;
    } catch (err) {
      const message = translateError(err);
      setError(message);
      throw new Error(message);
    }
  }, []);

  /**
   * Refresh statistics
   */
  const refreshStats = useCallback(async (): Promise<void> => {
    await getStats();
  }, [getStats]);

  // ============================================================================
  // Knowledge base operations
  // ============================================================================

  /**
   * Add content to the knowledge base
   */
  const addKnowledge = useCallback(
    async (
      content: string,
      source: string,
      metadata?: Record<string, unknown>,
    ): Promise<string> => {
      setIsStoring(true);
      setError(null);

      try {
        const id = await invoke<string>('knowledge_add', {
          content,
          source,
          metadata: metadata ?? {},
        });

        toast.success('Knowledge added successfully');
        return id;
      } catch (err) {
        const message = translateError(err);
        setError(message);
        toast.error(`Failed to add knowledge: ${message}`);
        throw new Error(message);
      } finally {
        setIsStoring(false);
      }
    },
    [],
  );

  /**
   * Query the knowledge base
   */
  const queryKnowledge = useCallback(
    async (query: string, limit: number = 5): Promise<KnowledgeQueryResult> => {
      setIsSearching(true);
      setError(null);

      try {
        const result = await invoke<KnowledgeQueryResult>('knowledge_query', {
          query,
          limit,
        });

        return result;
      } catch (err) {
        const message = translateError(err);
        setError(message);
        throw new Error(message);
      } finally {
        setIsSearching(false);
      }
    },
    [],
  );

  // ============================================================================
  // Utility functions
  // ============================================================================

  /**
   * Refresh all memory data
   */
  const refresh = useCallback(async (): Promise<void> => {
    await loadAll();
    if (loadStats) {
      await getStats();
    }
    if (loadCategories) {
      await listCategories();
    }
  }, [loadAll, loadStats, loadCategories, getStats, listCategories]);

  /**
   * Clear the error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // ============================================================================
  // Effects
  // ============================================================================

  // Auto-load on mount
  useEffect(() => {
    if (autoLoad) {
      try {
        loadAll();
      } catch (err) {
        console.error('Error auto-loading memories:', err);
      }
    }
  }, [autoLoad, loadAll]);

  // Load stats on mount if requested
  useEffect(() => {
    if (loadStats) {
      try {
        getStats();
      } catch (err) {
        console.error('Error loading stats:', err);
      }
    }
  }, [loadStats, getStats]);

  // Load categories on mount if requested
  useEffect(() => {
    if (loadCategories) {
      try {
        listCategories();
      } catch (err) {
        console.error('Error loading categories:', err);
      }
    }
  }, [loadCategories, listCategories]);

  // ============================================================================
  // Return value
  // ============================================================================

  return useMemo(
    () => ({
      // Data
      memories,
      categories,
      stats,

      // Loading states
      isLoading,
      isStoring,
      isSearching,
      isDeleting,

      // Error state
      error,

      // Memory operations
      store,
      recall,
      search,
      deleteMemory,
      deleteByTopic,

      // Category operations
      listCategories,
      getByCategory,

      // Stats operations
      getStats,
      refreshStats,

      // Knowledge base operations
      addKnowledge,
      queryKnowledge,

      // Utility
      refresh,
      clearError,
    }),
    [
      memories,
      categories,
      stats,
      isLoading,
      isStoring,
      isSearching,
      isDeleting,
      error,
      store,
      recall,
      search,
      deleteMemory,
      deleteByTopic,
      listCategories,
      getByCategory,
      getStats,
      refreshStats,
      addKnowledge,
      queryKnowledge,
      refresh,
      clearError,
    ],
  );
}

/**
 * Hook for memory statistics only
 * Lightweight version for dashboards and summaries
 */
export function useMemoryStats() {
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await invoke<MemoryStats>('memory_get_stats');
      setStats(result);
    } catch (err) {
      const message = translateError(err);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    stats,
    isLoading,
    error,
    refresh: fetchStats,
  };
}

/**
 * Hook for knowledge base operations only
 */
export function useKnowledgeBase() {
  const [isAdding, setIsAdding] = useState(false);
  const [isQuerying, setIsQuerying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastQueryResult, setLastQueryResult] = useState<KnowledgeQueryResult | null>(null);

  const add = useCallback(
    async (
      content: string,
      source: string,
      metadata?: Record<string, unknown>,
    ): Promise<string> => {
      setIsAdding(true);
      setError(null);

      try {
        const id = await invoke<string>('knowledge_add', {
          content,
          source,
          metadata: metadata ?? {},
        });

        toast.success('Knowledge added successfully');
        return id;
      } catch (err) {
        const message = translateError(err);
        setError(message);
        toast.error(`Failed to add knowledge: ${message}`);
        throw new Error(message);
      } finally {
        setIsAdding(false);
      }
    },
    [],
  );

  const query = useCallback(
    async (queryText: string, limit: number = 5): Promise<KnowledgeQueryResult> => {
      setIsQuerying(true);
      setError(null);

      try {
        const result = await invoke<KnowledgeQueryResult>('knowledge_query', {
          query: queryText,
          limit,
        });

        setLastQueryResult(result);
        return result;
      } catch (err) {
        const message = translateError(err);
        setError(message);
        throw new Error(message);
      } finally {
        setIsQuerying(false);
      }
    },
    [],
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    add,
    query,
    lastQueryResult,
    isAdding,
    isQuerying,
    error,
    clearError,
  };
}
