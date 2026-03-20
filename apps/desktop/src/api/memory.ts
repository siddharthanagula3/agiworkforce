/**
 * Memory System API Client
 *
 * TypeScript wrappers for all 39 Rust memory commands.
 * invoke() params: camelCase. Command names: snake_case.
 * All functions have try/catch error handling.
 */

import { invoke } from '../lib/tauri-mock';

// ============================================================================
// TYPE DEFINITIONS — match Rust structs in sys/commands/memory.rs
// ============================================================================

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
  last_accessed?: string;
}

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

export interface DecayCandidate {
  id: number;
  topic: string;
  category: string;
  importance: number;
  last_accessed?: string;
  days_since_access: number;
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

export interface CompactionConfig {
  enabled: boolean;
  days_before_compaction: number;
  summary_prompt?: string;
  delete_after_compaction: boolean;
}

export interface CompactionCandidate {
  log_date: string;
  entry_count: number;
  days_old: number;
  is_compacted: boolean;
}

export interface MemoryCompactionResult {
  logs_processed: number;
  dates_compacted: number;
  memories_created: number;
  facts_extracted: number;
  decisions_extracted: number;
  preferences_extracted: number;
}

export interface ExtractedMemory {
  category: string;
  topic: string;
  content: string;
  importance: number;
  source: string;
}

export interface ImportResult {
  memories_imported: number;
  logs_imported: number;
  skipped: number;
  errors: string[];
}

export interface MemoryExport {
  version: string;
  exported_at: string;
  memories: MemoryEntry[];
  daily_logs: DailyLogEntry[];
}

// Chat integration types (used by chat_* commands)
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
// CORE MEMORY COMMANDS (memory_*)
// ============================================================================

/**
 * Store or update a memory (memory_remember).
 * If a memory with the same category+topic already exists, it will be updated.
 */
export async function remember(
  category: string,
  topic: string,
  content: string,
  importance?: number,
  source?: string,
): Promise<number> {
  try {
    return await invoke<number>('memory_remember', {
      category,
      topic,
      content,
      importance,
      source,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] remember failed:', msg);
    throw error;
  }
}

/**
 * Recall a specific memory by category and topic (memory_recall).
 */
export async function recall(category: string, topic: string): Promise<MemoryEntry | null> {
  try {
    return await invoke<MemoryEntry | null>('memory_recall', {
      category,
      topic,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] recall failed:', msg);
    throw error;
  }
}

/**
 * Search memories by query text (memory_search).
 */
export async function search(query: string, limit: number = 20): Promise<MemoryEntry[]> {
  try {
    return await invoke<MemoryEntry[]>('memory_search', { query, limit });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] search failed:', msg);
    throw error;
  }
}

/**
 * Get all memories in a category (memory_get_by_category).
 */
export async function getByCategory(category: string, limit?: number): Promise<MemoryEntry[]> {
  try {
    return await invoke<MemoryEntry[]>('memory_get_by_category', {
      category,
      limit,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] getByCategory failed:', msg);
    throw error;
  }
}

/**
 * Get high-importance memories for session initialization (memory_get_important).
 */
export async function getImportant(minImportance: number = 7): Promise<MemoryEntry[]> {
  try {
    return await invoke<MemoryEntry[]>('memory_get_important', {
      minImportance,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] getImportant failed:', msg);
    throw error;
  }
}

/**
 * Delete a memory by ID (memory_forget).
 */
export async function forget(memoryId: number): Promise<boolean> {
  try {
    return await invoke<boolean>('memory_forget', { memoryId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] forget failed:', msg);
    throw error;
  }
}

/**
 * Delete a memory by category and topic (memory_forget_topic).
 */
export async function forgetTopic(category: string, topic: string): Promise<boolean> {
  try {
    return await invoke<boolean>('memory_forget_topic', { category, topic });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] forgetTopic failed:', msg);
    throw error;
  }
}

/**
 * Store or update a memory — alias for remember (memory_store).
 */
export async function storeMemory(
  category: string,
  topic: string,
  content: string,
  importance?: number,
  source?: string,
): Promise<number> {
  try {
    return await invoke<number>('memory_store', {
      category,
      topic,
      content,
      importance,
      source,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] storeMemory failed:', msg);
    throw error;
  }
}

/**
 * Delete a memory by ID — alias for forget (memory_delete).
 */
export async function deleteMemory(memoryId: number): Promise<boolean> {
  try {
    return await invoke<boolean>('memory_delete', { memoryId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] deleteMemory failed:', msg);
    throw error;
  }
}

/**
 * List all memories (memory_list_all).
 */
export async function listAll(): Promise<MemoryEntry[]> {
  try {
    return await invoke<MemoryEntry[]>('memory_list_all');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] listAll failed:', msg);
    throw error;
  }
}

/**
 * Export all memories for backup (memory_export_all).
 */
export async function exportAll(): Promise<MemoryEntry[]> {
  try {
    return await invoke<MemoryEntry[]>('memory_export_all');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] exportAll failed:', msg);
    throw error;
  }
}

/**
 * List all memory categories (memory_list_categories).
 */
export async function listCategories(): Promise<string[]> {
  try {
    return await invoke<string[]>('memory_list_categories');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] listCategories failed:', msg);
    throw error;
  }
}

// ============================================================================
// DAILY LOG COMMANDS
// ============================================================================

/**
 * Log an entry to today's daily log (memory_log_context).
 */
export async function logContext(
  content: string,
  entryType?: string,
  metadata?: string,
): Promise<number> {
  try {
    return await invoke<number>('memory_log_context', {
      content,
      entryType,
      metadata,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] logContext failed:', msg);
    throw error;
  }
}

/**
 * Get daily logs for a specific date in YYYY-MM-DD format (memory_get_daily_logs).
 */
export async function getDailyLogs(date: string): Promise<DailyLogEntry[]> {
  try {
    return await invoke<DailyLogEntry[]>('memory_get_daily_logs', { date });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] getDailyLogs failed:', msg);
    throw error;
  }
}

/**
 * Get session context — recent logs + important memories (memory_get_session_context).
 */
export async function getSessionContext(): Promise<string> {
  try {
    return await invoke<string>('memory_get_session_context');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] getSessionContext failed:', msg);
    throw error;
  }
}

/**
 * Cleanup old daily logs, keeping last N days (memory_cleanup_logs).
 * Returns the number of log entries removed.
 */
export async function cleanupLogs(keepDays?: number): Promise<number> {
  try {
    return await invoke<number>('memory_cleanup_logs', { keepDays });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] cleanupLogs failed:', msg);
    throw error;
  }
}

// ============================================================================
// MEMORY IMPORTANCE DECAY COMMANDS
// ============================================================================

/**
 * Run memory importance decay (memory_run_decay).
 */
export async function runDecay(): Promise<DecayResult> {
  try {
    return await invoke<DecayResult>('memory_run_decay');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] runDecay failed:', msg);
    throw error;
  }
}

/**
 * Get the current decay configuration (memory_get_decay_config).
 */
export async function getDecayConfig(): Promise<DecayConfig> {
  try {
    return await invoke<DecayConfig>('memory_get_decay_config');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] getDecayConfig failed:', msg);
    throw error;
  }
}

/**
 * Set the decay configuration (memory_set_decay_config).
 */
export async function setDecayConfig(
  enabled: boolean,
  decayRate: number,
  decayPeriodDays: number,
  minImportance: number,
  accessBoost: number,
): Promise<void> {
  try {
    return await invoke<void>('memory_set_decay_config', {
      enabled,
      decayRate,
      decayPeriodDays,
      minImportance,
      accessBoost,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] setDecayConfig failed:', msg);
    throw error;
  }
}

/**
 * Get memories that are candidates for decay (memory_get_decay_candidates).
 */
export async function getDecayCandidates(): Promise<DecayCandidate[]> {
  try {
    return await invoke<DecayCandidate[]>('memory_get_decay_candidates');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] getDecayCandidates failed:', msg);
    throw error;
  }
}

/**
 * Boost the importance of a memory on access (memory_boost_on_access).
 * Returns the new importance value.
 */
export async function boostOnAccess(memoryId: number): Promise<number> {
  try {
    return await invoke<number>('memory_boost_on_access', { memoryId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] boostOnAccess failed:', msg);
    throw error;
  }
}

/**
 * Recall a memory with importance boost (memory_recall_with_boost).
 */
export async function recallWithBoost(
  category: string,
  topic: string,
): Promise<MemoryEntry | null> {
  try {
    return await invoke<MemoryEntry | null>('memory_recall_with_boost', { category, topic });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] recallWithBoost failed:', msg);
    throw error;
  }
}

/**
 * Manually decay a single memory's importance (memory_decay_single).
 * Returns the new importance value.
 */
export async function decaySingle(memoryId: number, decayAmount: number): Promise<number> {
  try {
    return await invoke<number>('memory_decay_single', { memoryId, decayAmount });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] decaySingle failed:', msg);
    throw error;
  }
}

/**
 * Get statistics about memory importance distribution (memory_get_stats).
 */
export async function getStats(): Promise<MemoryStats> {
  try {
    return await invoke<MemoryStats>('memory_get_stats');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] getStats failed:', msg);
    throw error;
  }
}

// ============================================================================
// MEMORY COMPACTION COMMANDS
// ============================================================================

/**
 * Get daily logs that are candidates for compaction (memory_get_compaction_candidates).
 */
export async function getCompactionCandidates(
  config?: CompactionConfig,
): Promise<CompactionCandidate[]> {
  try {
    return await invoke<CompactionCandidate[]>('memory_get_compaction_candidates', {
      config: config ?? null,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] getCompactionCandidates failed:', msg);
    throw error;
  }
}

/**
 * Get logs in a date range for compaction preview (memory_get_logs_in_range).
 */
export async function getLogsInRange(
  startDate?: string,
  endDate?: string,
): Promise<DailyLogEntry[]> {
  try {
    return await invoke<DailyLogEntry[]>('memory_get_logs_in_range', {
      startDate,
      endDate,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] getLogsInRange failed:', msg);
    throw error;
  }
}

/**
 * Compact old daily logs into long-term memories (memory_compact_old_logs).
 */
export async function compactOldLogs(
  startDate?: string,
  endDate?: string,
): Promise<MemoryCompactionResult> {
  try {
    return await invoke<MemoryCompactionResult>('memory_compact_old_logs', {
      startDate,
      endDate,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] compactOldLogs failed:', msg);
    throw error;
  }
}

/**
 * Promote extracted memories to long-term storage (memory_promote_extracted).
 * Returns the number of memories promoted.
 */
export async function promoteExtracted(memories: ExtractedMemory[]): Promise<number> {
  try {
    return await invoke<number>('memory_promote_extracted', { memories });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] promoteExtracted failed:', msg);
    throw error;
  }
}

/**
 * Archive compacted daily logs (memory_archive_compacted_logs).
 * Returns the number of log entries archived.
 */
export async function archiveCompactedLogs(
  dates: string[],
  deleteCompacted: boolean = false,
): Promise<number> {
  try {
    return await invoke<number>('memory_archive_compacted_logs', {
      dates,
      deleteCompacted,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] archiveCompactedLogs failed:', msg);
    throw error;
  }
}

/**
 * Get the extraction prompt for LLM-based memory extraction (memory_get_extraction_prompt).
 */
export async function getExtractionPrompt(
  startDate?: string,
  endDate?: string,
  config?: CompactionConfig,
): Promise<string> {
  try {
    return await invoke<string>('memory_get_extraction_prompt', {
      startDate,
      endDate,
      config: config ?? null,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] getExtractionPrompt failed:', msg);
    throw error;
  }
}

/**
 * Get compaction statistics (memory_get_compaction_stats).
 */
export async function getCompactionStats(): Promise<Record<string, unknown>> {
  try {
    return await invoke<Record<string, unknown>>('memory_get_compaction_stats');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] getCompactionStats failed:', msg);
    throw error;
  }
}

// ============================================================================
// MEMORY EXPORT COMMANDS
// ============================================================================

/**
 * Export all memories and logs to JSON (memory_export_json).
 * If a path is provided, exports to that file and returns metadata.
 * If no path, returns the full JSON export data.
 */
export async function exportToJson(path?: string): Promise<Record<string, unknown>> {
  try {
    return await invoke<Record<string, unknown>>('memory_export_json', { path });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] exportToJson failed:', msg);
    throw error;
  }
}

/**
 * Export all memories to Markdown format (memory_export_markdown).
 * If a path is provided, exports to that file and returns metadata as JSON string.
 * If no path, returns the Markdown string.
 */
export async function exportToMarkdown(path?: string): Promise<string> {
  try {
    return await invoke<string>('memory_export_markdown', { path });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] exportToMarkdown failed:', msg);
    throw error;
  }
}

// ============================================================================
// MEMORY IMPORT COMMANDS
// ============================================================================

/**
 * Import memories from a JSON backup file (memory_import_json).
 * Strategy: "skip" (default), "replace", or "merge".
 */
export async function importFromJson(
  path: string,
  strategy: string = 'skip',
): Promise<ImportResult> {
  try {
    return await invoke<ImportResult>('memory_import_json', {
      path,
      strategy,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] importFromJson failed:', msg);
    throw error;
  }
}

/**
 * Import memories from a JSON string (memory_import_json_string).
 * Useful for programmatic imports without a file.
 */
export async function importFromJsonString(
  json: string,
  strategy: string = 'skip',
): Promise<ImportResult> {
  try {
    return await invoke<ImportResult>('memory_import_json_string', { json, strategy });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] importFromJsonString failed:', msg);
    throw error;
  }
}

// ============================================================================
// MEMORY DASHBOARD COMMANDS
// ============================================================================

/**
 * Get memory dashboard statistics (memory_get_dashboard_stats).
 * Returns combined memory stats and compaction stats.
 */
export async function getDashboardStats(): Promise<Record<string, unknown>> {
  try {
    return await invoke<Record<string, unknown>>('memory_get_dashboard_stats');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] getDashboardStats failed:', msg);
    throw error;
  }
}

/**
 * Get project-specific memories for injection into LLM context (memory_get_project_memories).
 */
export async function getProjectMemories(
  projectName?: string,
  limit: number = 10,
): Promise<MemoryEntry[]> {
  try {
    return await invoke<MemoryEntry[]>('memory_get_project_memories', {
      projectName,
      limit,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] getProjectMemories failed:', msg);
    throw error;
  }
}

/**
 * Get memory usage trends (memory_get_usage_trends).
 */
export async function getUsageTrends(): Promise<Record<string, unknown>> {
  try {
    return await invoke<Record<string, unknown>>('memory_get_usage_trends');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] getUsageTrends failed:', msg);
    throw error;
  }
}

/**
 * Suggest important memories for user review (memory_suggest_important).
 * Returns critical memories (importance >= 9).
 */
export async function suggestImportantMemories(): Promise<MemoryEntry[]> {
  try {
    return await invoke<MemoryEntry[]>('memory_suggest_important');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] suggestImportantMemories failed:', msg);
    throw error;
  }
}

// ============================================================================
// CHAT MEMORY INTEGRATION API (chat_* commands)
// ============================================================================

/**
 * Load project memories and prepare context for chat (chat_load_project_memories).
 */
export async function loadProjectMemories(): Promise<LoadProjectMemoriesResponse> {
  try {
    return await invoke<LoadProjectMemoriesResponse>('chat_load_project_memories');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] loadProjectMemories failed:', msg);
    throw error;
  }
}

/**
 * Detect if a message contains a decision and auto-save it (chat_detect_and_save_decision).
 */
export async function detectAndSaveDecision(
  message: string,
): Promise<SaveDecisionResponse | null> {
  try {
    return await invoke<SaveDecisionResponse | null>('chat_detect_and_save_decision', { message });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] detectAndSaveDecision failed:', msg);
    throw error;
  }
}

/**
 * Manually save a decision to memory (chat_save_decision).
 */
export async function saveDecision(message: string): Promise<SaveDecisionResponse> {
  try {
    return await invoke<SaveDecisionResponse>('chat_save_decision', { message });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] saveDecision failed:', msg);
    throw error;
  }
}

/**
 * Configure memory injection behavior (chat_configure_memory_injection).
 */
export async function configureMemoryInjection(
  enabled: boolean,
  maxMemories: number,
  minImportance: number,
): Promise<void> {
  try {
    return await invoke<void>('chat_configure_memory_injection', {
      enabled,
      maxMemories,
      minImportance,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] configureMemoryInjection failed:', msg);
    throw error;
  }
}

/**
 * Get memory dashboard via chat integration (chat_get_memory_dashboard).
 */
export async function getMemoryDashboard(): Promise<MemoryDashboard> {
  try {
    return await invoke<MemoryDashboard>('chat_get_memory_dashboard');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] getMemoryDashboard failed:', msg);
    throw error;
  }
}

/**
 * Get critical memories suggested for review (chat_suggest_memories_for_review).
 */
export async function suggestMemoriesForReview(): Promise<{
  critical_memories: MemoryEntry[];
  high_importance: MemoryEntry[];
}> {
  try {
    return await invoke<{
      critical_memories: MemoryEntry[];
      high_importance: MemoryEntry[];
    }>('chat_suggest_memories_for_review');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] suggestMemoriesForReview failed:', msg);
    throw error;
  }
}

/**
 * Prefetch all memories for new chat session (chat_prefetch_session_memories).
 */
export async function prefetchSessionMemories(): Promise<string> {
  try {
    return await invoke<string>('chat_prefetch_session_memories');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] prefetchSessionMemories failed:', msg);
    throw error;
  }
}

/**
 * Log a milestone to memory (chat_log_milestone).
 */
export async function logMilestone(
  description: string,
  metadata?: Record<string, unknown>,
): Promise<number> {
  try {
    return await invoke<number>('chat_log_milestone', {
      description,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] logMilestone failed:', msg);
    throw error;
  }
}

/**
 * Log an action to memory (chat_log_action).
 */
export async function logAction(
  action: string,
  metadata?: Record<string, unknown>,
): Promise<number> {
  try {
    return await invoke<number>('chat_log_action', {
      action,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] logAction failed:', msg);
    throw error;
  }
}

/**
 * Recall a specific memory via chat integration (chat_recall_memory).
 */
export async function recallMemory(
  category: string,
  topic: string,
  boostImportance: boolean = false,
): Promise<MemoryEntry | null> {
  try {
    return await invoke<MemoryEntry | null>('chat_recall_memory', {
      category,
      topic,
      boostImportance,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] recallMemory failed:', msg);
    throw error;
  }
}

/**
 * Search memories via chat integration (chat_search_memories).
 */
export async function searchMemories(query: string, limit: number = 10): Promise<MemoryEntry[]> {
  try {
    return await invoke<MemoryEntry[]>('chat_search_memories', { query, limit });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] searchMemories failed:', msg);
    throw error;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get importance label for display.
 */
export function getImportanceLabel(importance: number): string {
  if (importance >= 9) return 'Critical';
  if (importance >= 7) return 'High';
  if (importance >= 5) return 'Medium';
  return 'Low';
}

/**
 * Format memory entry for display.
 */
export function formatMemory(memory: MemoryEntry): string {
  const label = getImportanceLabel(memory.importance);
  return `**${memory.topic}** (${label}): ${memory.content}`;
}

/**
 * Format memories collection organized by category.
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
 * Check if memory needs review (high importance, not recently accessed).
 */
export function needsReview(memory: MemoryEntry): boolean {
  if (memory.importance < 7) return false;

  if (!memory.last_accessed) {
    const created = new Date(memory.created_at);
    const days = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
    return days > 30;
  }

  const lastAccess = new Date(memory.last_accessed);
  const days = (Date.now() - lastAccess.getTime()) / (1000 * 60 * 60 * 24);
  return days > 14;
}
