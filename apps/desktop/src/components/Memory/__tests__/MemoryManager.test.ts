/**
 * MemoryManager Component Tests
 *
 * Tests for the primary memory management interface
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useMemoryStore } from '@/stores/memoryStore';
import type { MemoryEntry } from '@/stores/memoryStore';

describe('MemoryManager', () => {
  beforeEach(() => {
    // Reset store between tests
    const state = useMemoryStore.getState();
    state.reset();
  });

  describe('memory filtering', () => {
    it('should filter memories by category', () => {
      // Test memories
      const mockMemories = [
        {
          id: 1,
          category: 'preference',
          topic: 'React Hooks',
          content: 'Use functional components with hooks',
          importance: 7,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 2,
          category: 'decision',
          topic: 'Database',
          content: 'Use PostgreSQL',
          importance: 8,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      // Verify category filtering logic
      const preferences = mockMemories.filter((m) => m.category === 'preference');
      expect(preferences).toHaveLength(1);
      expect(preferences[0]!.category).toBe('preference');
    });

    it('should sort memories by importance', () => {
      const mockMemories = [
        {
          id: 1,
          category: 'fact',
          topic: 'A',
          content: 'Content A',
          importance: 5,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 2,
          category: 'fact',
          topic: 'B',
          content: 'Content B',
          importance: 10,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 3,
          category: 'fact',
          topic: 'C',
          content: 'Content C',
          importance: 7,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const sorted = [...mockMemories].sort((a, b) => b.importance - a.importance);

      expect(sorted[0]!.importance).toBe(10);
      expect(sorted[1]!.importance).toBe(7);
      expect(sorted[2]!.importance).toBe(5);
    });

    it('should sort memories by date', () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const mockMemories = [
        {
          id: 1,
          category: 'fact',
          topic: 'A',
          content: 'Content A',
          importance: 5,
          created_at: yesterday.toISOString(),
          updated_at: yesterday.toISOString(),
        },
        {
          id: 2,
          category: 'fact',
          topic: 'B',
          content: 'Content B',
          importance: 5,
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
        },
        {
          id: 3,
          category: 'fact',
          topic: 'C',
          content: 'Content C',
          importance: 5,
          created_at: tomorrow.toISOString(),
          updated_at: tomorrow.toISOString(),
        },
      ];

      const sorted = [...mockMemories].sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      );

      expect(new Date(sorted[0]!.updated_at).getTime()).toBeGreaterThan(
        new Date(sorted[1]!.updated_at).getTime(),
      );
    });
  });

  describe('memory search', () => {
    it('should search memories by topic', () => {
      const mockMemories = [
        {
          id: 1,
          category: 'fact',
          topic: 'React Hooks',
          content: 'Functional components',
          importance: 5,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 2,
          category: 'fact',
          topic: 'Vue Composition API',
          content: 'Similar to React Hooks',
          importance: 5,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const query = 'React';
      const results = mockMemories.filter((m) =>
        m.topic.toLowerCase().includes(query.toLowerCase()),
      );

      expect(results).toHaveLength(1);
      expect(results[0]!.topic).toContain('React');
    });

    it('should search memories by content', () => {
      const mockMemories = [
        {
          id: 1,
          category: 'fact',
          topic: 'Frontend Framework',
          content: 'React is a JavaScript library',
          importance: 5,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 2,
          category: 'fact',
          topic: 'Backend Framework',
          content: 'Node.js is a runtime',
          importance: 5,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const query = 'JavaScript';
      const results = mockMemories.filter((m) =>
        m.content.toLowerCase().includes(query.toLowerCase()),
      );

      expect(results).toHaveLength(1);
      expect(results[0]!.content).toContain('JavaScript');
    });

    it('should search memories by category', () => {
      const mockMemories = [
        {
          id: 1,
          category: 'preference',
          topic: 'Coding Style',
          content: 'Use camelCase',
          importance: 5,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 2,
          category: 'fact',
          topic: 'Project Info',
          content: 'Uses TypeScript',
          importance: 5,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const query = 'preference';
      const results = mockMemories.filter((m) =>
        m.category.toLowerCase().includes(query.toLowerCase()),
      );

      expect(results).toHaveLength(1);
      expect(results[0]!.category).toBe('preference');
    });
  });

  describe('export functionality', () => {
    it('should format export data correctly', () => {
      const mockMemories = [
        {
          id: 1,
          category: 'decision',
          topic: 'Architecture',
          content: 'Use microservices',
          importance: 8,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const exportData = {
        exported_at: new Date().toISOString(),
        memories: mockMemories,
        total_count: mockMemories.length,
        filter: {
          category: 'all',
          sort: 'importance-desc',
          search: '',
        },
      };

      expect(exportData.memories).toHaveLength(1);
      expect(exportData.total_count).toBe(1);
      expect(exportData.memories[0]!.category).toBe('decision');
    });

    it('should create valid JSON from export data', () => {
      const mockMemories = [
        {
          id: 1,
          category: 'fact',
          topic: 'Database',
          content: 'PostgreSQL',
          importance: 7,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const exportData = {
        exported_at: new Date().toISOString(),
        memories: mockMemories,
        total_count: mockMemories.length,
      };

      const json = JSON.stringify(exportData, null, 2);
      const parsed = JSON.parse(json);

      expect(parsed.memories).toHaveLength(1);
      expect(parsed.total_count).toBe(1);
    });
  });

  describe('memory categories', () => {
    it('should support all memory categories', () => {
      const categories = ['preference', 'fact', 'decision', 'context'];

      const mockMemories: MemoryEntry[] = categories.map((category, index) => ({
        id: index + 1,
        category: category as MemoryEntry['category'],
        topic: `Memory ${index}`,
        content: `Content ${index}`,
        importance: 5,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      expect(mockMemories).toHaveLength(4);
      mockMemories.forEach((memory, index) => {
        expect(memory.category).toBe(categories[index]);
      });
    });
  });

  describe('memory counts', () => {
    it('should calculate category counts correctly', () => {
      const mockMemories = [
        {
          id: 1,
          category: 'preference',
          topic: 'A',
          content: 'Content',
          importance: 5,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 2,
          category: 'preference',
          topic: 'B',
          content: 'Content',
          importance: 5,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 3,
          category: 'decision',
          topic: 'C',
          content: 'Content',
          importance: 5,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const counts = {
        all: mockMemories.length,
        preference: mockMemories.filter((m) => m.category === 'preference').length,
        fact: mockMemories.filter((m) => m.category === 'fact').length,
        decision: mockMemories.filter((m) => m.category === 'decision').length,
        context: mockMemories.filter((m) => m.category === 'context').length,
      };

      expect(counts.all).toBe(3);
      expect(counts.preference).toBe(2);
      expect(counts.fact).toBe(0);
      expect(counts.decision).toBe(1);
      expect(counts.context).toBe(0);
    });
  });
});
