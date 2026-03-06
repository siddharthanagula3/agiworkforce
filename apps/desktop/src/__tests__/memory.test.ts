/**
 * Memory Tauri Commands Integration Tests
 *
 * Tests for the memory management Tauri commands that expose the MemoryManager
 * to the frontend, allowing the AGI to persist and recall information across sessions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

// Mock Tauri invoke before importing the store
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock sonner toast to prevent side effects
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Types matching the Rust backend structures
type MemoryCategory = 'preference' | 'fact' | 'decision' | 'context';

interface MemoryEntry {
  id: number;
  category: MemoryCategory;
  topic: string;
  content: string;
  importance: number;
  source?: string;
  created_at: string;
  updated_at: string;
}

interface DailyLogEntry {
  id: number;
  date: string;
  content: string;
  entry_type: string;
  metadata?: string;
  created_at: string;
}

describe('Memory Tauri Commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // memory_remember - Store a preference
  // ==========================================================================
  describe('memory_remember', () => {
    it('should store a preference with default importance', async () => {
      const mockId = 1;
      vi.mocked(invoke).mockResolvedValueOnce(mockId);

      const result = await invoke('memory_remember', {
        category: 'preference',
        topic: 'theme',
        content: 'dark mode',
        importance: 5,
      });

      expect(invoke).toHaveBeenCalledWith('memory_remember', {
        category: 'preference',
        topic: 'theme',
        content: 'dark mode',
        importance: 5,
      });
      expect(result).toBe(mockId);
    });

    it('should store a fact with high importance', async () => {
      const mockId = 2;
      vi.mocked(invoke).mockResolvedValueOnce(mockId);

      const result = await invoke('memory_remember', {
        category: 'fact',
        topic: 'user_name',
        content: 'John Doe',
        importance: 10,
        source: 'user_input',
      });

      expect(invoke).toHaveBeenCalledWith('memory_remember', {
        category: 'fact',
        topic: 'user_name',
        content: 'John Doe',
        importance: 10,
        source: 'user_input',
      });
      expect(result).toBe(mockId);
    });

    it('should update existing memory with same category and topic', async () => {
      // First call creates the memory
      vi.mocked(invoke).mockResolvedValueOnce(1);
      await invoke('memory_remember', {
        category: 'preference',
        topic: 'language',
        content: 'English',
        importance: 5,
      });

      // Second call updates the same memory
      vi.mocked(invoke).mockResolvedValueOnce(1);
      const result = await invoke('memory_remember', {
        category: 'preference',
        topic: 'language',
        content: 'Spanish',
        importance: 5,
      });

      expect(result).toBe(1);
      expect(invoke).toHaveBeenCalledTimes(2);
    });

    it('should handle errors when storing memory', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(
        invoke('memory_remember', {
          category: 'preference',
          topic: 'test',
          content: 'value',
          importance: 5,
        }),
      ).rejects.toThrow('Database connection failed');
    });

    it('should reject invalid category', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(
        new Error(
          'Invalid memory category: invalid. Valid options: preference, fact, decision, context',
        ),
      );

      await expect(
        invoke('memory_remember', {
          category: 'invalid',
          topic: 'test',
          content: 'value',
          importance: 5,
        }),
      ).rejects.toThrow('Invalid memory category');
    });
  });

  // ==========================================================================
  // memory_recall - Retrieve stored memory
  // ==========================================================================
  describe('memory_recall', () => {
    it('should retrieve stored memory by category and topic', async () => {
      const mockEntry: MemoryEntry = {
        id: 1,
        category: 'preference',
        topic: 'theme',
        content: 'dark mode',
        importance: 5,
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T10:00:00Z',
      };

      vi.mocked(invoke).mockResolvedValueOnce(mockEntry);

      const result = await invoke('memory_recall', {
        category: 'preference',
        topic: 'theme',
      });

      expect(invoke).toHaveBeenCalledWith('memory_recall', {
        category: 'preference',
        topic: 'theme',
      });
      expect(result).toEqual(mockEntry);
    });

    it('should return null for non-existent memory', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(null);

      const result = await invoke('memory_recall', {
        category: 'preference',
        topic: 'non_existent',
      });

      expect(result).toBeNull();
    });

    it('should recall a fact memory', async () => {
      const mockEntry: MemoryEntry = {
        id: 5,
        category: 'fact',
        topic: 'company_name',
        content: 'Acme Corp',
        importance: 8,
        source: 'onboarding',
        created_at: '2024-01-10T09:00:00Z',
        updated_at: '2024-01-10T09:00:00Z',
      };

      vi.mocked(invoke).mockResolvedValueOnce(mockEntry);

      const result = await invoke('memory_recall', {
        category: 'fact',
        topic: 'company_name',
      });

      expect(result).toEqual(mockEntry);
      expect((result as MemoryEntry).source).toBe('onboarding');
    });
  });

  // ==========================================================================
  // memory_search - Search memories by keyword
  // ==========================================================================
  describe('memory_search', () => {
    it('should search memories by query text', async () => {
      const mockResults: MemoryEntry[] = [
        {
          id: 1,
          category: 'fact',
          topic: 'email',
          content: 'user@example.com',
          importance: 7,
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z',
        },
        {
          id: 2,
          category: 'preference',
          topic: 'email_notifications',
          content: 'enabled',
          importance: 5,
          created_at: '2024-01-14T09:00:00Z',
          updated_at: '2024-01-14T09:00:00Z',
        },
      ];

      vi.mocked(invoke).mockResolvedValueOnce(mockResults);

      const result = await invoke('memory_search', {
        query: 'email',
        limit: 10,
      });

      expect(invoke).toHaveBeenCalledWith('memory_search', {
        query: 'email',
        limit: 10,
      });
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no matches found', async () => {
      vi.mocked(invoke).mockResolvedValueOnce([]);

      const result = await invoke('memory_search', {
        query: 'nonexistent_query_xyz123',
        limit: 20,
      });

      expect(result).toEqual([]);
    });

    it('should respect the limit parameter', async () => {
      const mockResults: MemoryEntry[] = [
        {
          id: 1,
          category: 'fact',
          topic: 'topic1',
          content: 'content1',
          importance: 5,
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z',
        },
      ];

      vi.mocked(invoke).mockResolvedValueOnce(mockResults);

      await invoke('memory_search', {
        query: 'test',
        limit: 1,
      });

      expect(invoke).toHaveBeenCalledWith('memory_search', {
        query: 'test',
        limit: 1,
      });
    });

    it('should use default limit when not specified', async () => {
      vi.mocked(invoke).mockResolvedValueOnce([]);

      await invoke('memory_search', {
        query: 'test',
      });

      expect(invoke).toHaveBeenCalledWith('memory_search', {
        query: 'test',
      });
    });
  });

  // ==========================================================================
  // memory_get_by_category - Get all preferences
  // ==========================================================================
  describe('memory_get_by_category', () => {
    it('should get all preferences', async () => {
      const mockPreferences: MemoryEntry[] = [
        {
          id: 1,
          category: 'preference',
          topic: 'theme',
          content: 'dark',
          importance: 5,
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z',
        },
        {
          id: 2,
          category: 'preference',
          topic: 'language',
          content: 'en',
          importance: 5,
          created_at: '2024-01-14T09:00:00Z',
          updated_at: '2024-01-14T09:00:00Z',
        },
        {
          id: 3,
          category: 'preference',
          topic: 'notifications',
          content: 'enabled',
          importance: 6,
          created_at: '2024-01-13T08:00:00Z',
          updated_at: '2024-01-13T08:00:00Z',
        },
      ];

      vi.mocked(invoke).mockResolvedValueOnce(mockPreferences);

      const result = await invoke('memory_get_by_category', {
        category: 'preference',
      });

      expect(invoke).toHaveBeenCalledWith('memory_get_by_category', {
        category: 'preference',
      });
      expect(result).toHaveLength(3);
      (result as MemoryEntry[]).forEach((entry) => {
        expect(entry.category).toBe('preference');
      });
    });

    it('should get all facts', async () => {
      const mockFacts: MemoryEntry[] = [
        {
          id: 10,
          category: 'fact',
          topic: 'user_email',
          content: 'test@example.com',
          importance: 8,
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z',
        },
      ];

      vi.mocked(invoke).mockResolvedValueOnce(mockFacts);

      const result = await invoke('memory_get_by_category', {
        category: 'fact',
      });

      expect(result).toHaveLength(1);
      expect((result as MemoryEntry[])[0]?.category).toBe('fact');
    });

    it('should get all decisions', async () => {
      const mockDecisions: MemoryEntry[] = [
        {
          id: 20,
          category: 'decision',
          topic: 'automation_enabled',
          content: 'User enabled full automation on 2024-01-15',
          importance: 9,
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z',
        },
      ];

      vi.mocked(invoke).mockResolvedValueOnce(mockDecisions);

      const result = await invoke('memory_get_by_category', {
        category: 'decision',
      });

      expect((result as MemoryEntry[])[0]?.category).toBe('decision');
    });

    it('should return empty array for category with no entries', async () => {
      vi.mocked(invoke).mockResolvedValueOnce([]);

      const result = await invoke('memory_get_by_category', {
        category: 'context',
      });

      expect(result).toEqual([]);
    });

    it('should respect optional limit parameter', async () => {
      vi.mocked(invoke).mockResolvedValueOnce([]);

      await invoke('memory_get_by_category', {
        category: 'preference',
        limit: 5,
      });

      expect(invoke).toHaveBeenCalledWith('memory_get_by_category', {
        category: 'preference',
        limit: 5,
      });
    });
  });

  // ==========================================================================
  // memory_forget - Delete a memory
  // ==========================================================================
  describe('memory_forget', () => {
    it('should delete a memory by ID', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(true);

      const result = await invoke('memory_forget', {
        memory_id: 1,
      });

      expect(invoke).toHaveBeenCalledWith('memory_forget', {
        memory_id: 1,
      });
      expect(result).toBe(true);
    });

    it('should return false when memory does not exist', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(false);

      const result = await invoke('memory_forget', {
        memory_id: 9999,
      });

      expect(result).toBe(false);
    });

    it('should handle database errors during deletion', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('Database constraint violation'));

      await expect(
        invoke('memory_forget', {
          memory_id: 1,
        }),
      ).rejects.toThrow('Database constraint violation');
    });
  });

  // ==========================================================================
  // memory_forget_topic - Delete by category and topic
  // ==========================================================================
  describe('memory_forget_topic', () => {
    it('should delete a memory by category and topic', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(true);

      const result = await invoke('memory_forget_topic', {
        category: 'preference',
        topic: 'theme',
      });

      expect(invoke).toHaveBeenCalledWith('memory_forget_topic', {
        category: 'preference',
        topic: 'theme',
      });
      expect(result).toBe(true);
    });

    it('should return false when topic does not exist', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(false);

      const result = await invoke('memory_forget_topic', {
        category: 'fact',
        topic: 'nonexistent',
      });

      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // memory_log_context - Add daily log entry
  // ==========================================================================
  describe('memory_log_context', () => {
    it('should log a context entry with default type', async () => {
      const mockLogId = 100;
      vi.mocked(invoke).mockResolvedValueOnce(mockLogId);

      const result = await invoke('memory_log_context', {
        content: 'User started a new project',
      });

      expect(invoke).toHaveBeenCalledWith('memory_log_context', {
        content: 'User started a new project',
      });
      expect(result).toBe(mockLogId);
    });

    it('should log an action entry', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(101);

      const result = await invoke('memory_log_context', {
        content: 'Executed backup workflow',
        entry_type: 'action',
      });

      expect(invoke).toHaveBeenCalledWith('memory_log_context', {
        content: 'Executed backup workflow',
        entry_type: 'action',
      });
      expect(result).toBe(101);
    });

    it('should log a note entry', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(102);

      const result = await invoke('memory_log_context', {
        content: 'User mentioned they work in finance',
        entry_type: 'note',
      });

      expect(result).toBe(102);
    });

    it('should log a milestone entry with metadata', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(103);

      const result = await invoke('memory_log_context', {
        content: 'Project completed successfully',
        entry_type: 'milestone',
        metadata: JSON.stringify({ project_id: 'proj-123', duration_hours: 5 }),
      });

      expect(invoke).toHaveBeenCalledWith('memory_log_context', {
        content: 'Project completed successfully',
        entry_type: 'milestone',
        metadata: JSON.stringify({ project_id: 'proj-123', duration_hours: 5 }),
      });
      expect(result).toBe(103);
    });

    it('should handle errors during logging', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('Disk full'));

      await expect(
        invoke('memory_log_context', {
          content: 'Test log entry',
        }),
      ).rejects.toThrow('Disk full');
    });
  });

  // ==========================================================================
  // memory_get_daily_logs - Get logs for a specific date
  // ==========================================================================
  describe('memory_get_daily_logs', () => {
    it('should get daily logs for a specific date', async () => {
      const mockLogs: DailyLogEntry[] = [
        {
          id: 1,
          date: '2024-01-15',
          content: 'Started morning briefing',
          entry_type: 'context',
          created_at: '2024-01-15T09:00:00Z',
        },
        {
          id: 2,
          date: '2024-01-15',
          content: 'Completed email review',
          entry_type: 'action',
          created_at: '2024-01-15T10:30:00Z',
        },
      ];

      vi.mocked(invoke).mockResolvedValueOnce(mockLogs);

      const result = await invoke('memory_get_daily_logs', {
        date: '2024-01-15',
      });

      expect(invoke).toHaveBeenCalledWith('memory_get_daily_logs', {
        date: '2024-01-15',
      });
      expect(result).toHaveLength(2);
    });

    it('should return empty array for date with no logs', async () => {
      vi.mocked(invoke).mockResolvedValueOnce([]);

      const result = await invoke('memory_get_daily_logs', {
        date: '2020-01-01',
      });

      expect(result).toEqual([]);
    });
  });

  // ==========================================================================
  // memory_get_session_context - Get combined context
  // ==========================================================================
  describe('memory_get_session_context', () => {
    it('should get session context for AGI initialization', async () => {
      const mockContext = `## User Preferences
- Theme: dark mode
- Language: English

## Recent Context
- Started project planning
- Reviewed quarterly goals

## Important Facts
- User works at Acme Corp
- Timezone: America/Los_Angeles`;

      vi.mocked(invoke).mockResolvedValueOnce(mockContext);

      const result = await invoke('memory_get_session_context');

      expect(invoke).toHaveBeenCalledWith('memory_get_session_context');
      expect(typeof result).toBe('string');
      expect((result as string).length).toBeGreaterThan(0);
    });

    it('should return empty string when no context available', async () => {
      vi.mocked(invoke).mockResolvedValueOnce('');

      const result = await invoke('memory_get_session_context');

      expect(result).toBe('');
    });

    it('should handle errors during context retrieval', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('Failed to compile session context'));

      await expect(invoke('memory_get_session_context')).rejects.toThrow(
        'Failed to compile session context',
      );
    });
  });

  // ==========================================================================
  // memory_get_important - Get high-importance memories
  // ==========================================================================
  describe('memory_get_important', () => {
    it('should get high-importance memories with default threshold', async () => {
      const mockImportant: MemoryEntry[] = [
        {
          id: 1,
          category: 'fact',
          topic: 'critical_info',
          content: 'Very important data',
          importance: 10,
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z',
        },
        {
          id: 2,
          category: 'decision',
          topic: 'major_choice',
          content: 'Key decision made',
          importance: 9,
          created_at: '2024-01-14T09:00:00Z',
          updated_at: '2024-01-14T09:00:00Z',
        },
      ];

      vi.mocked(invoke).mockResolvedValueOnce(mockImportant);

      const result = await invoke('memory_get_important', {
        min_importance: 7,
      });

      expect(invoke).toHaveBeenCalledWith('memory_get_important', {
        min_importance: 7,
      });
      expect(result).toHaveLength(2);
      (result as MemoryEntry[]).forEach((entry) => {
        expect(entry.importance).toBeGreaterThanOrEqual(7);
      });
    });

    it('should get memories with custom importance threshold', async () => {
      vi.mocked(invoke).mockResolvedValueOnce([]);

      await invoke('memory_get_important', {
        min_importance: 9,
      });

      expect(invoke).toHaveBeenCalledWith('memory_get_important', {
        min_importance: 9,
      });
    });
  });

  // ==========================================================================
  // memory_export_all - Export all memories for backup
  // ==========================================================================
  describe('memory_export_all', () => {
    it('should export all memories', async () => {
      const mockExport: MemoryEntry[] = [
        {
          id: 1,
          category: 'preference',
          topic: 'theme',
          content: 'dark',
          importance: 5,
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z',
        },
        {
          id: 2,
          category: 'fact',
          topic: 'email',
          content: 'user@example.com',
          importance: 8,
          created_at: '2024-01-14T09:00:00Z',
          updated_at: '2024-01-14T09:00:00Z',
        },
      ];

      vi.mocked(invoke).mockResolvedValueOnce(mockExport);

      const result = await invoke('memory_export_all');

      expect(invoke).toHaveBeenCalledWith('memory_export_all');
      expect(result).toHaveLength(2);
    });
  });

  // ==========================================================================
  // memory_cleanup_logs - Cleanup old daily logs
  // ==========================================================================
  describe('memory_cleanup_logs', () => {
    it('should cleanup old logs with default retention', async () => {
      const deletedCount = 15;
      vi.mocked(invoke).mockResolvedValueOnce(deletedCount);

      const result = await invoke('memory_cleanup_logs', {
        keep_days: 30,
      });

      expect(invoke).toHaveBeenCalledWith('memory_cleanup_logs', {
        keep_days: 30,
      });
      expect(result).toBe(15);
    });

    it('should cleanup with custom retention period', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(50);

      const result = await invoke('memory_cleanup_logs', {
        keep_days: 7,
      });

      expect(result).toBe(50);
    });

    it('should return 0 when no logs to cleanup', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(0);

      const result = await invoke('memory_cleanup_logs', {
        keep_days: 30,
      });

      expect(result).toBe(0);
    });
  });

  // ==========================================================================
  // memory_list_all - List all memories (used by memoryStore.loadAll)
  // ==========================================================================
  describe('memory_list_all', () => {
    it('should list all memories', async () => {
      const mockMemories: MemoryEntry[] = [
        {
          id: 1,
          category: 'preference',
          topic: 'theme',
          content: 'dark',
          importance: 5,
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z',
        },
        {
          id: 2,
          category: 'fact',
          topic: 'name',
          content: 'John',
          importance: 7,
          created_at: '2024-01-14T09:00:00Z',
          updated_at: '2024-01-14T09:00:00Z',
        },
        {
          id: 3,
          category: 'decision',
          topic: 'project_approach',
          content: 'agile methodology',
          importance: 8,
          created_at: '2024-01-13T08:00:00Z',
          updated_at: '2024-01-13T08:00:00Z',
        },
      ];

      vi.mocked(invoke).mockResolvedValueOnce(mockMemories);

      const result = await invoke('memory_list_all');

      expect(invoke).toHaveBeenCalledWith('memory_list_all');
      expect(result).toHaveLength(3);
    });

    it('should return empty array when no memories exist', async () => {
      vi.mocked(invoke).mockResolvedValueOnce([]);

      const result = await invoke('memory_list_all');

      expect(result).toEqual([]);
    });
  });

  // M36 — Tauri command name and payload shape verification
  describe('Command name and payload shape verification (M36)', () => {
    describe('memory_remember command signature', () => {
      it('sends exactly the expected keys: category, topic, content, importance', async () => {
        vi.mocked(invoke).mockResolvedValueOnce(1);

        await invoke('memory_remember', {
          category: 'preference',
          topic: 'theme',
          content: 'dark',
          importance: 5,
        });

        const [commandName, payload] = vi.mocked(invoke).mock.calls[0]!;
        expect(commandName).toBe('memory_remember');
        expect(payload).toHaveProperty('category');
        expect(payload).toHaveProperty('topic');
        expect(payload).toHaveProperty('content');
        expect(payload).toHaveProperty('importance');
      });

      it('source is optional and accepted when provided', async () => {
        vi.mocked(invoke).mockResolvedValueOnce(2);

        await invoke('memory_remember', {
          category: 'fact',
          topic: 'email',
          content: 'user@example.com',
          importance: 8,
          source: 'user_input',
        });

        const [, payload] = vi.mocked(invoke).mock.calls[0]!;
        expect((payload as Record<string, unknown>)['source']).toBe('user_input');
      });

      it('importance must be a number', async () => {
        vi.mocked(invoke).mockResolvedValueOnce(3);

        await invoke('memory_remember', {
          category: 'preference',
          topic: 'lang',
          content: 'en',
          importance: 7,
        });

        const [, payload] = vi.mocked(invoke).mock.calls[0]!;
        expect(typeof (payload as Record<string, unknown>)['importance']).toBe('number');
      });
    });

    describe('memory_recall command signature', () => {
      it('sends exactly the expected keys: category and topic', async () => {
        vi.mocked(invoke).mockResolvedValueOnce(null);

        await invoke('memory_recall', { category: 'preference', topic: 'theme' });

        const [commandName, payload] = vi.mocked(invoke).mock.calls[0]!;
        expect(commandName).toBe('memory_recall');
        expect(Object.keys(payload as object).sort()).toEqual(['category', 'topic'].sort());
      });
    });

    describe('memory_search command signature', () => {
      it('sends query as a string and limit as a number', async () => {
        vi.mocked(invoke).mockResolvedValueOnce([]);

        await invoke('memory_search', { query: 'theme', limit: 10 });

        const [commandName, payload] = vi.mocked(invoke).mock.calls[0]!;
        expect(commandName).toBe('memory_search');
        expect(typeof (payload as Record<string, unknown>)['query']).toBe('string');
        expect(typeof (payload as Record<string, unknown>)['limit']).toBe('number');
      });
    });

    describe('memory_forget command signature', () => {
      it('sends memory_id as a number', async () => {
        vi.mocked(invoke).mockResolvedValueOnce(true);

        await invoke('memory_forget', { memoryId: 42 });

        const [commandName, payload] = vi.mocked(invoke).mock.calls[0]!;
        expect(commandName).toBe('memory_forget');
        expect(typeof (payload as Record<string, unknown>)['memoryId']).toBe('number');
      });
    });

    describe('memory_forget_topic command signature', () => {
      it('sends category and topic as strings', async () => {
        vi.mocked(invoke).mockResolvedValueOnce(true);

        await invoke('memory_forget_topic', { category: 'fact', topic: 'name' });

        const [commandName, payload] = vi.mocked(invoke).mock.calls[0]!;
        expect(commandName).toBe('memory_forget_topic');
        expect(typeof (payload as Record<string, unknown>)['category']).toBe('string');
        expect(typeof (payload as Record<string, unknown>)['topic']).toBe('string');
      });
    });

    describe('memory_get_by_category command signature', () => {
      it('sends category as a string', async () => {
        vi.mocked(invoke).mockResolvedValueOnce([]);

        await invoke('memory_get_by_category', { category: 'preference' });

        const [commandName, payload] = vi.mocked(invoke).mock.calls[0]!;
        expect(commandName).toBe('memory_get_by_category');
        expect(typeof (payload as Record<string, unknown>)['category']).toBe('string');
      });
    });

    describe('memory_log_context command signature', () => {
      it('sends content as a string', async () => {
        vi.mocked(invoke).mockResolvedValueOnce(100);

        await invoke('memory_log_context', { content: 'User opened settings' });

        const [commandName, payload] = vi.mocked(invoke).mock.calls[0]!;
        expect(commandName).toBe('memory_log_context');
        expect(typeof (payload as Record<string, unknown>)['content']).toBe('string');
      });

      it('entry_type is optional but must be string when provided', async () => {
        vi.mocked(invoke).mockResolvedValueOnce(101);

        await invoke('memory_log_context', {
          content: 'Milestone reached',
          entryType: 'milestone',
        });

        const [, payload] = vi.mocked(invoke).mock.calls[0]!;
        expect(typeof (payload as Record<string, unknown>)['entryType']).toBe('string');
      });
    });

    describe('memory_get_important command signature', () => {
      it('sends min_importance as a number', async () => {
        vi.mocked(invoke).mockResolvedValueOnce([]);

        await invoke('memory_get_important', { minImportance: 7 });

        const [commandName, payload] = vi.mocked(invoke).mock.calls[0]!;
        expect(commandName).toBe('memory_get_important');
        expect(typeof (payload as Record<string, unknown>)['minImportance']).toBe('number');
      });
    });

    describe('memory_cleanup_logs command signature', () => {
      it('sends keep_days as a number', async () => {
        vi.mocked(invoke).mockResolvedValueOnce(0);

        await invoke('memory_cleanup_logs', { keepDays: 30 });

        const [commandName, payload] = vi.mocked(invoke).mock.calls[0]!;
        expect(commandName).toBe('memory_cleanup_logs');
        expect(typeof (payload as Record<string, unknown>)['keepDays']).toBe('number');
      });
    });

    describe('zero-argument commands', () => {
      it('memory_export_all is called with no payload', async () => {
        vi.mocked(invoke).mockResolvedValueOnce([]);

        await invoke('memory_export_all');

        const [commandName] = vi.mocked(invoke).mock.calls[0]!;
        expect(commandName).toBe('memory_export_all');
        // No second argument (or undefined)
        expect(vi.mocked(invoke).mock.calls[0]!.length).toBe(1);
      });

      it('memory_get_session_context is called with no payload', async () => {
        vi.mocked(invoke).mockResolvedValueOnce('');

        await invoke('memory_get_session_context');

        const [commandName] = vi.mocked(invoke).mock.calls[0]!;
        expect(commandName).toBe('memory_get_session_context');
        expect(vi.mocked(invoke).mock.calls[0]!.length).toBe(1);
      });

      it('memory_list_all is called with no payload', async () => {
        vi.mocked(invoke).mockResolvedValueOnce([]);

        await invoke('memory_list_all');

        const [commandName] = vi.mocked(invoke).mock.calls[0]!;
        expect(commandName).toBe('memory_list_all');
        expect(vi.mocked(invoke).mock.calls[0]!.length).toBe(1);
      });
    });
  });
});
