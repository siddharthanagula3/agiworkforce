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

// ============================================================================
// Memory Category
// ============================================================================

/**
 * Category of a memory entry.
 *
 * Memories are categorized for efficient retrieval and filtering.
 *
 * - `fact` -- A discrete piece of factual knowledge.
 * - `preference` -- A user preference or setting.
 * - `pattern` -- A recurring behavioral or code pattern.
 * - `procedure` -- A step-by-step process or workflow.
 * - `context` -- Conversation or project context.
 * - `correction` -- A correction or clarification from the user.
 * - `skill` -- A learned capability or technique.
 */
export type MemoryCategory =
  | 'fact'
  | 'preference'
  | 'pattern'
  | 'procedure'
  | 'context'
  | 'correction'
  | 'skill';

// ============================================================================
// Importance Score
// ============================================================================

/**
 * Importance score for a memory entry.
 *
 * Range: 0.0 (trivial) to 1.0 (critical).
 * Used to prioritize which memories are included in context windows.
 *
 * Guideline thresholds:
 * - 0.0 - 0.2: Low importance (auto-expire candidates)
 * - 0.2 - 0.5: Medium importance (include when relevant)
 * - 0.5 - 0.8: High importance (prioritize for inclusion)
 * - 0.8 - 1.0: Critical (always include when topic matches)
 */
export type ImportanceScore = number;

// ============================================================================
// Memory
// ============================================================================

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
  /** Unique memory identifier. */
  id: string;

  /** The memory content (plain text or markdown). */
  content: string;

  /** Memory category for filtering and organization. */
  category: MemoryCategory;

  /** Importance score (0.0 to 1.0). */
  importance: ImportanceScore;

  /** Tags for topic-based retrieval. */
  tags?: string[];

  /** How this memory was created. */
  source?: 'conversation' | 'user_input' | 'agent_observation' | 'system';

  /** Conversation that produced this memory (if applicable). */
  conversationId?: string;

  /** Embedding vector for semantic search (not always populated in transport). */
  embedding?: number[];

  /** ISO 8601 timestamp when the memory was created. */
  createdAt: string;

  /** ISO 8601 timestamp when the memory was last updated. */
  updatedAt?: string;

  /** ISO 8601 timestamp when the memory was last accessed for retrieval. */
  lastAccessedAt?: string;

  /** Number of times this memory has been retrieved. */
  accessCount?: number;

  /** ISO 8601 timestamp when the memory expires (null = never). */
  expiresAt?: string | null;

  /** User who owns this memory. */
  userId?: string;
}

// ============================================================================
// Memory Search
// ============================================================================

/**
 * Parameters for searching the memory store.
 */
export interface MemorySearchParams {
  /** Free-text search query (used for semantic and FTS search). */
  query?: string;

  /** Filter by category. */
  category?: MemoryCategory;

  /** Filter by tags (AND logic -- all tags must match). */
  tags?: string[];

  /** Minimum importance score to include. */
  minImportance?: ImportanceScore;

  /** Maximum number of results to return. */
  limit?: number;

  /** Offset for pagination. */
  offset?: number;
}

/**
 * A memory search result with relevance scoring.
 */
export interface MemorySearchResult {
  /** The matched memory entry. */
  memory: Memory;

  /** Relevance score (0.0 to 1.0) for the search query. */
  relevance: number;

  /** Which search method matched (semantic, full-text, or tag). */
  matchType: 'semantic' | 'fts' | 'tag' | 'hybrid';
}
