/**
 * useMemoryIntegration Hook
 *
 * Provides utilities for integrating memory functionality throughout the app,
 * including saving chat context, loading project memories, and managing
 * memory lifecycle.
 */
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { MemoryCategory, MemoryEntry } from '@/stores/memoryStore';
import { useMemoryStore } from '@/stores/memoryStore';

export interface MemoryIntegrationOptions {
  /** Auto-load memories when hook mounts */
  autoLoad?: boolean;
  /** Minimum importance threshold for auto-recall */
  importanceThreshold?: number;
}

/**
 * Hook for integrating memory functionality into components
 */
export function useMemoryIntegration(options: MemoryIntegrationOptions = {}) {
  const { autoLoad = true, importanceThreshold = 6 } = options;

  const {
    memories,
    isLoading,
    error,
    loadAll,
    remember,
    search,
    forget,
    getImportant,
    getByCategory,
  } = useMemoryStore();

  const [isInitialized, setIsInitialized] = useState(false);

  // Auto-load memories on mount
  useEffect(() => {
    if (autoLoad && !isInitialized) {
      loadAll()
        .catch((err) => {
          console.error('[useMemoryIntegration] Failed to load memories:', err);
        })
        .finally(() => {
          setIsInitialized(true);
        });
    }
  }, [autoLoad, isInitialized, loadAll]);

  /**
   * Save memory from chat interaction
   */
  const saveChatMemory = useCallback(
    async (options: {
      category: MemoryCategory;
      topic: string;
      content: string;
      importance?: number;
      source?: string;
    }) => {
      try {
        const id = await remember(
          options.category,
          options.topic,
          options.content,
          options.importance ?? 5,
        );
        return id;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save memory';
        console.error('[useMemoryIntegration] Failed to save memory:', message);
        toast.error(message);
        throw err;
      }
    },
    [remember],
  );

  /**
   * Save architectural decision
   */
  const saveArchitecturalDecision = useCallback(
    async (topic: string, decision: string, rationale: string) => {
      const content = `Decision: ${decision}\n\nRationale: ${rationale}`;
      return saveChatMemory({
        category: 'decision',
        topic,
        content,
        importance: 8,
        source: 'Architectural Discussion',
      });
    },
    [saveChatMemory],
  );

  /**
   * Save coding preference or style
   */
  const saveCodingPreference = useCallback(
    async (topic: string, preference: string) => {
      return saveChatMemory({
        category: 'preference',
        topic,
        content: preference,
        importance: 7,
        source: 'Coding Standards',
      });
    },
    [saveChatMemory],
  );

  /**
   * Save contextual fact
   */
  const saveContextFact = useCallback(
    async (topic: string, fact: string) => {
      return saveChatMemory({
        category: 'fact',
        topic,
        content: fact,
        importance: 5,
        source: 'Chat Context',
      });
    },
    [saveChatMemory],
  );

  /**
   * Get memories relevant to a topic
   */
  const getRelevantMemories = useCallback(
    async (topic: string) => {
      try {
        return await search(topic, 10);
      } catch (err) {
        console.error('[useMemoryIntegration] Failed to search memories:', err);
        return [];
      }
    },
    [search],
  );

  /**
   * Get important memories for context injection
   */
  const getContextMemories = useCallback(async () => {
    try {
      return await getImportant(importanceThreshold);
    } catch (err) {
      console.error('[useMemoryIntegration] Failed to get important memories:', err);
      return [];
    }
  }, [getImportant, importanceThreshold]);

  /**
   * Delete memory
   */
  const deleteMemory = useCallback(
    async (category: MemoryCategory, topic: string) => {
      try {
        const deleted = await forget(category, topic);
        if (deleted) {
          toast.success('Memory deleted');
        }
        return deleted;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete memory';
        console.error('[useMemoryIntegration] Failed to delete memory:', message);
        toast.error(message);
        throw err;
      }
    },
    [forget],
  );

  /**
   * Format memories for prompt injection
   */
  const formatMemoriesForPrompt = useCallback((mems?: MemoryEntry[]): string => {
    if (!mems || mems.length === 0) {
      return '';
    }

    const grouped = mems.reduce(
      (acc, mem) => {
        if (!acc[mem.category]) {
          acc[mem.category] = [];
        }
        acc[mem.category]!.push(mem);
        return acc;
      },
      {} as Record<string, MemoryEntry[]>,
    );

    const sections = Object.entries(grouped)
      .map(([category, items]) => {
        if (!items) return '';
        const formatted = items.map((item) => `- ${item.topic}: ${item.content}`).join('\n');
        return `${category.charAt(0).toUpperCase() + category.slice(1)}:\n${formatted}`;
      })
      .filter(Boolean);

    return `Remember:\n\n${sections.join('\n\n')}`;
  }, []);

  return {
    // State
    memories,
    isLoading,
    error,
    isInitialized,

    // Actions
    loadAll,
    saveChatMemory,
    saveArchitecturalDecision,
    saveCodingPreference,
    saveContextFact,
    deleteMemory,
    getRelevantMemories,
    getContextMemories,
    getByCategory,
    formatMemoriesForPrompt,
  };
}

/**
 * Hook for managing memory state in components
 */
export function useMemoryState(category: MemoryCategory, topic: string) {
  const { memories } = useMemoryStore();

  const memory = memories.find((m) => m.category === category && m.topic === topic);

  return {
    memory,
    exists: !!memory,
    importance: memory?.importance ?? 0,
    content: memory?.content ?? '',
    createdAt: memory?.created_at,
    updatedAt: memory?.updated_at,
  };
}
