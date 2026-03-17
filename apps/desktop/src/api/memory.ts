/**
 * Memory System API Client
 *
 * Provides TypeScript interfaces and functions for interacting with the
 * long-term memory system integrated with chat and project workflows.
 */

import { invoke } from '../lib/tauri-mock';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface MemoryEntry {
  id: number;
  category: 'preference' | 'fact' | 'decision' | 'context';
  topic: string;
  content: string;
  importance: number;
  source?: string;
  created_at: string;
  updated_at: string;
  last_accessed?: string;
}

export interface MemorySummary {
  decisions: number;
  preferences: number;
  facts: number;
  context_entries: number;
  total_importance_weight: number;
}

export interface MemoryInjectionResult {
  memories_loaded: number;
  context: string;
  has_relevant_memories: boolean;
  summary: MemorySummary;
}

export interface LoadProjectMemoriesResponse {
  injection_result: MemoryInjectionResult;
  system_prompt_enhancement: string;
  message: string;
}

export interface SaveDecisionResponse {
  memory_id: number;
  topic: string;
  importance: number;
  message: string;
}

export interface MemoryStats {
  total_count: number;
  avg_importance: number;
  high_importance_count: number;
  low_importance_count: number;
}

export interface MemoryDashboard {
  stats: MemoryStats;
  compaction: {
    total_logs: number;
    compacted_logs: number;
    uncompacted_logs: number;
    unique_dates: number;
    compaction_rate: number;
  };
  trending_count: number;
  timestamp: string;
}

export interface DecisionDetectionResult {
  is_decision: boolean;
  topic?: string;
  content: string;
  importance: number;
}

// ============================================================================
// CHAT MEMORY INTEGRATION API
// ============================================================================

/**
 * Load project memories and prepare context for chat
 */
export async function loadProjectMemories(): Promise<LoadProjectMemoriesResponse> {
  return invoke<LoadProjectMemoriesResponse>('chat_load_project_memories');
}

/**
 * Detect if a message contains a decision and auto-save it
 */
export async function detectAndSaveDecision(message: string): Promise<SaveDecisionResponse | null> {
  return invoke<SaveDecisionResponse | null>('chat_detect_and_save_decision', { message });
}

/**
 * Manually save a decision to memory
 */
export async function saveDecision(message: string): Promise<SaveDecisionResponse> {
  return invoke<SaveDecisionResponse>('chat_save_decision', { message });
}

/**
 * Configure memory injection behavior
 */
export async function configureMemoryInjection(
  enabled: boolean,
  maxMemories: number,
  minImportance: number,
): Promise<void> {
  return invoke<void>('chat_configure_memory_injection', {
    enabled,
    maxMemories,
    minImportance,
  });
}

/**
 * Get memory dashboard statistics
 */
export async function getMemoryDashboard(): Promise<MemoryDashboard> {
  return invoke<MemoryDashboard>('chat_get_memory_dashboard');
}

/**
 * Get critical memories suggested for review
 */
export async function suggestMemoriesForReview(): Promise<{
  critical_memories: MemoryEntry[];
  high_importance: MemoryEntry[];
}> {
  return invoke<{
    critical_memories: MemoryEntry[];
    high_importance: MemoryEntry[];
  }>('chat_suggest_memories_for_review');
}

/**
 * Prefetch all memories for new chat session
 */
export async function prefetchSessionMemories(): Promise<string> {
  return invoke<string>('chat_prefetch_session_memories');
}

/**
 * Log a milestone to memory
 */
export async function logMilestone(
  description: string,
  metadata?: Record<string, unknown>,
): Promise<number> {
  return invoke<number>('chat_log_milestone', {
    description,
    metadata: metadata ? JSON.stringify(metadata) : null,
  });
}

/**
 * Log an action to memory
 */
export async function logAction(
  action: string,
  metadata?: Record<string, unknown>,
): Promise<number> {
  return invoke<number>('chat_log_action', {
    action,
    metadata: metadata ? JSON.stringify(metadata) : null,
  });
}

/**
 * Recall a specific memory by category and topic
 */
export async function recallMemory(
  category: string,
  topic: string,
  boostImportance: boolean = false,
): Promise<MemoryEntry | null> {
  return invoke<MemoryEntry | null>('chat_recall_memory', {
    category,
    topic,
    boostImportance,
  });
}

/**
 * Search memories by query
 */
export async function searchMemories(query: string, limit: number = 10): Promise<MemoryEntry[]> {
  return invoke<MemoryEntry[]>('chat_search_memories', { query, limit });
}

// ============================================================================
// MEMORY DASHBOARD API
// ============================================================================

/**
 * Get dashboard statistics
 */
export async function getDashboardStats(): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>('memory_get_dashboard_stats');
}

/**
 * Get project-specific memories
 */
export async function getProjectMemories(
  projectName?: string,
  limit: number = 10,
): Promise<MemoryEntry[]> {
  return invoke<MemoryEntry[]>('memory_get_project_memories', {
    projectName,
    limit,
  });
}

/**
 * Get memory usage trends
 */
export async function getUsageTrends(): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>('memory_get_usage_trends');
}

/**
 * Get important memories for review
 */
export async function suggestImportantMemories(): Promise<MemoryEntry[]> {
  return invoke<MemoryEntry[]>('memory_suggest_important');
}

// ============================================================================
// CORE MEMORY API (existing)
// ============================================================================

/**
 * Store or update a memory
 */
export async function remember(
  category: string,
  topic: string,
  content: string,
  importance?: number,
  source?: string,
): Promise<number> {
  return invoke<number>('memory_remember', {
    category,
    topic,
    content,
    importance,
    source,
  });
}

/**
 * Recall a memory by category and topic
 */
export async function recall(category: string, topic: string): Promise<MemoryEntry | null> {
  return invoke<MemoryEntry | null>('memory_recall', {
    category,
    topic,
  });
}

/**
 * Search memories
 */
export async function search(query: string, limit: number = 20): Promise<MemoryEntry[]> {
  return invoke<MemoryEntry[]>('memory_search', { query, limit });
}

/**
 * Get memories by category
 */
export async function getByCategory(category: string, limit?: number): Promise<MemoryEntry[]> {
  return invoke<MemoryEntry[]>('memory_get_by_category', {
    category,
    limit,
  });
}

/**
 * Get high-importance memories
 */
export async function getImportant(minImportance: number = 7): Promise<MemoryEntry[]> {
  return invoke<MemoryEntry[]>('memory_get_important', {
    minImportance,
  });
}

/**
 * Delete a memory by ID
 */
export async function forget(memoryId: number): Promise<boolean> {
  return invoke<boolean>('memory_forget', { memoryId });
}

/**
 * Delete a memory by category and topic
 */
export async function forgetTopic(category: string, topic: string): Promise<boolean> {
  return invoke<boolean>('memory_forget_topic', { category, topic });
}

/**
 * Log a context entry
 */
export async function logContext(
  content: string,
  entryType: string = 'context',
  metadata?: string,
): Promise<number> {
  return invoke<number>('memory_log_context', {
    content,
    entryType,
    metadata,
  });
}

/**
 * Get session context (recent logs + important memories)
 */
export async function getSessionContext(): Promise<string> {
  return invoke<string>('memory_get_session_context');
}

/**
 * Export all memories
 */
export async function exportAll(): Promise<MemoryEntry[]> {
  return invoke<MemoryEntry[]>('memory_export_all');
}

// ============================================================================
// MEMORY IMPORTANCE DECAY API
// ============================================================================

/**
 * Run memory importance decay
 */
export async function runDecay(): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>('memory_run_decay');
}

/**
 * Get decay configuration
 */
export async function getDecayConfig(): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>('memory_get_decay_config');
}

/**
 * Set decay configuration
 */
export async function setDecayConfig(
  enabled: boolean,
  decayRate: number,
  decayPeriodDays: number,
  minImportance: number,
  accessBoost: number,
): Promise<void> {
  return invoke<void>('memory_set_decay_config', {
    enabled,
    decayRate,
    decayPeriodDays,
    minImportance,
    accessBoost,
  });
}

/**
 * Boost memory importance on access
 */
export async function boostOnAccess(memoryId: number): Promise<number> {
  return invoke<number>('memory_boost_on_access', { memoryId });
}

// ============================================================================
// MEMORY EXPORT/IMPORT API
// ============================================================================

/**
 * Export memories to JSON file
 */
export async function exportToJson(path?: string): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>('memory_export_json', { path });
}

/**
 * Export memories to Markdown
 */
export async function exportToMarkdown(path?: string): Promise<string> {
  return invoke<string>('memory_export_markdown', { path });
}

/**
 * Import memories from JSON file
 */
export async function importFromJson(
  path: string,
  strategy: string = 'skip',
): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>('memory_import_json', {
    path,
    strategy,
  });
}

// ============================================================================
// MEMORY COMPACTION API (newly wired)
// ============================================================================

/** Configuration for memory compaction */
export interface CompactionConfig {
  minAge?: number;
  maxLogsPerDate?: number;
  includeArchived?: boolean;
}

/** A candidate log entry for compaction */
export interface CompactionCandidate {
  date: string;
  logCount: number;
  totalSize: number;
}

/** Result of a memory compaction operation */
export interface MemoryCompactionResult {
  compactedDates: number;
  extractedMemories: number;
  archivedLogs: number;
}

/** A memory extracted during compaction */
export interface ExtractedMemory {
  category: string;
  topic: string;
  content: string;
  importance: number;
  source: string;
}

/** A daily log entry */
export interface DailyLogEntry {
  date: string;
  content: string;
  entryType: string;
}

/** Result of importing memories */
export interface ImportResult {
  imported: number;
  skipped: number;
  errors: number;
}

/**
 * Get logs that are candidates for compaction.
 */
export async function getCompactionCandidates(
  config?: CompactionConfig,
): Promise<CompactionCandidate[]> {
  return invoke<CompactionCandidate[]>('memory_get_compaction_candidates', {
    config: config ?? null,
  });
}

/**
 * Get compaction statistics (total logs, compacted, uncompacted, etc.)
 */
export async function getCompactionStats(): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>('memory_get_compaction_stats');
}

/**
 * Compact old daily logs into summarized entries.
 */
export async function compactOldLogs(
  startDate?: string,
  endDate?: string,
): Promise<MemoryCompactionResult> {
  return invoke<MemoryCompactionResult>('memory_compact_old_logs', {
    startDate,
    endDate,
  });
}

/**
 * Get daily logs within a date range.
 */
export async function getLogsInRange(
  startDate?: string,
  endDate?: string,
): Promise<DailyLogEntry[]> {
  return invoke<DailyLogEntry[]>('memory_get_logs_in_range', {
    startDate,
    endDate,
  });
}

/**
 * Promote extracted memories from compaction to long-term storage.
 */
export async function promoteExtracted(memories: ExtractedMemory[]): Promise<number> {
  return invoke<number>('memory_promote_extracted', { memories });
}

/**
 * Archive compacted logs by date, optionally deleting originals.
 */
export async function archiveCompactedLogs(
  dates: string[],
  deleteCompacted: boolean = false,
): Promise<number> {
  return invoke<number>('memory_archive_compacted_logs', {
    dates,
    deleteCompacted,
  });
}

/**
 * Get a prompt template for LLM-based memory extraction from logs.
 */
export async function getExtractionPrompt(
  startDate?: string,
  endDate?: string,
  config?: CompactionConfig,
): Promise<string> {
  return invoke<string>('memory_get_extraction_prompt', {
    startDate,
    endDate,
    config: config ?? null,
  });
}

// ============================================================================
// MEMORY DECAY API (additional commands)
// ============================================================================

/** A candidate memory for importance decay */
export interface DecayCandidate {
  id: number;
  topic: string;
  category: string;
  currentImportance: number;
  suggestedDecay: number;
  daysSinceAccess: number;
}

/**
 * Get memories that are candidates for importance decay.
 */
export async function getDecayCandidates(): Promise<DecayCandidate[]> {
  return invoke<DecayCandidate[]>('memory_get_decay_candidates');
}

/**
 * Decay a single memory's importance by a specified amount.
 * Returns the new importance value.
 */
export async function decaySingle(memoryId: number, decayAmount: number): Promise<number> {
  return invoke<number>('memory_decay_single', { memoryId, decayAmount });
}

/**
 * Recall a memory by category and topic, boosting its importance on access.
 */
export async function recallWithBoost(
  category: string,
  topic: string,
): Promise<MemoryEntry | null> {
  return invoke<MemoryEntry | null>('memory_recall_with_boost', { category, topic });
}

/**
 * Import memories from a JSON string (for programmatic import without file).
 */
export async function importFromJsonString(
  json: string,
  strategy: string = 'skip',
): Promise<ImportResult> {
  return invoke<ImportResult>('memory_import_json_string', { json, strategy });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get importance label for display
 */
export function getImportanceLabel(importance: number): string {
  if (importance >= 9) return 'Critical';
  if (importance >= 7) return 'High';
  if (importance >= 5) return 'Medium';
  return 'Low';
}

/**
 * Get importance indicator emoji
 */
export function getImportanceIndicator(importance: number): string {
  if (importance >= 9) return '🔴';
  if (importance >= 7) return '🟡';
  if (importance >= 5) return '🟢';
  return '⚪';
}

/**
 * Format memory entry for display
 */
export function formatMemory(memory: MemoryEntry): string {
  const indicator = getImportanceIndicator(memory.importance);
  const label = getImportanceLabel(memory.importance);
  return `${indicator} **${memory.topic}** (${label}): ${memory.content}`;
}

/**
 * Format memories collection for display
 */
export function formatMemories(memories: MemoryEntry[]): string {
  const byCategory: Record<string, MemoryEntry[]> = {};

  for (const memory of memories) {
    if (!byCategory[memory.category]) {
      byCategory[memory.category] = [];
    }
    byCategory[memory.category]!.push(memory);
  }

  let output = '';
  for (const [category, mems] of Object.entries(byCategory)) {
    output += `## ${category.charAt(0).toUpperCase() + category.slice(1)}\n\n`;
    for (const memory of mems) {
      output += `${formatMemory(memory)}\n`;
    }
    output += '\n';
  }

  return output;
}

/**
 * Check if memory needs review (high importance, not recently accessed)
 */
export function needsReview(memory: MemoryEntry): boolean {
  if (memory.importance < 7) return false;

  if (!memory.last_accessed) {
    // No access recorded, check creation date
    const created = new Date(memory.created_at);
    const days = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
    return days > 30;
  }

  const lastAccess = new Date(memory.last_accessed);
  const days = (Date.now() - lastAccess.getTime()) / (1000 * 60 * 60 * 24);
  return days > 14;
}
