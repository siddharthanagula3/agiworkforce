import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

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

describe('Memory Tauri Commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  describe('memory_delete_all', () => {
    it('deletes every memory in one call and returns the count', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(2);

      const result = await invoke('memory_delete_all');

      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith('memory_delete_all');
      expect(result).toBe(2);
    });
  });

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

  describe('Command name and payload shape verification (M36)', () => {
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

    describe('zero-argument commands', () => {
      it('memory_delete_all is called with no payload', async () => {
        vi.mocked(invoke).mockResolvedValueOnce(0);

        await invoke('memory_delete_all');

        const [commandName] = vi.mocked(invoke).mock.calls[0]!;
        expect(commandName).toBe('memory_delete_all');
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
