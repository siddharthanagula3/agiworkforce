/**
 * Memory Types
 *
 * Types for the AI memory system that persists knowledge, patterns,
 * and context across conversations. Used by the desktop memory store,
 * web memory API, and mobile memory viewer.
 *
 * @module memory
 * @packageDocumentation
 */

export const MEMORY_CATEGORIES = [
  'preference',
  'fact',
  'decision',
  'context',
  'summary',
  'skill',
] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export function isMemoryCategory(value: unknown): value is MemoryCategory {
  return typeof value === 'string' && (MEMORY_CATEGORIES as readonly string[]).includes(value);
}

export type ImportanceScore = number;

/**
 * A single memory entry in the knowledge store.
 *
 * Memories are created from conversations, user corrections, and
 * observed patterns. They can be searched semantically (via embeddings)
 * or by category/tag.
 *
 * @example
 * ```typescript
 * const memory: Memory = {
 *   id: 'mem-abc-123',
 *   content: 'User prefers TypeScript strict mode with no implicit any',
 *   category: 'preference',
 *   importance: 0.7,
 *   tags: ['typescript', 'coding-style', 'preferences'],
 *   source: 'conversation',
 *   conversationId: 'conv-xyz',
 *   createdAt: '2026-03-10T14:00:00Z',
 *   lastAccessedAt: '2026-03-15T10:30:00Z',
 *   accessCount: 5,
 * };
 * ```
 */
export interface Memory {
  id: string;

  content: string;

  category: MemoryCategory;

  importance: ImportanceScore;

  tags?: string[];

  source?: 'conversation' | 'user_input' | 'agent_observation' | 'system';

  conversationId?: string;

  embedding?: number[];

  createdAt: string;

  updatedAt?: string;

  lastAccessedAt?: string;

  accessCount?: number;

  expiresAt?: string | null;

  userId?: string;
}

export interface MemorySearchParams {
  query?: string;

  category?: MemoryCategory;

  tags?: string[];

  minImportance?: ImportanceScore;

  limit?: number;

  offset?: number;
}

export interface MemorySearchResult {
  memory: Memory;

  relevance: number;

  matchType: 'semantic' | 'fts' | 'tag' | 'hybrid';
}
