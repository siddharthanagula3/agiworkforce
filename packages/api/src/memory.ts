/**
 * Memory API — typed wrappers for memory_*, project memory, and related Tauri commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface MemoryEntry {
  id: number;
  category: string;
  topic: string;
  content: string;
  importance: number;
  source?: string;
  createdAt: string;
  updatedAt: string;
  accessCount: number;
}

export interface DailyLogEntry {
  id: number;
  content: string;
  entryType: string;
  metadata?: string;
  createdAt: string;
}

export interface DecayResult {
  decayedCount: number;
  removedCount: number;
}

export interface DecayConfig {
  enabled: boolean;
  decayRate: number;
  decayPeriodDays: number;
  minImportance: number;
  accessBoost: number;
}

export interface DecayCandidate {
  id: number;
  topic: string;
  importance: number;
  lastAccessed: string;
}

export interface MemoryStats {
  totalCount: number;
  byCategory: Record<string, number>;
  avgImportance: number;
}

export interface CompactionConfig {
  [key: string]: unknown;
}

export interface CompactionCandidate {
  [key: string]: unknown;
}

export interface MemoryCompactionResult {
  [key: string]: unknown;
}

export interface ExtractedMemory {
  category: string;
  topic: string;
  content: string;
  importance: number;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export interface ProjectContext {
  [key: string]: unknown;
}

export interface CodingStyle {
  [key: string]: unknown;
}

export interface ArchitecturalDecision {
  [key: string]: unknown;
}

export interface ProjectMemory {
  [key: string]: unknown;
}

// ---- Core Memory ----

export async function memoryRemember(
  category: string,
  topic: string,
  content: string,
  importance?: number,
  source?: string,
): Promise<number> {
  return command<number>('memory_remember', { category, topic, content, importance, source });
}

export async function memoryRecall(category: string, topic: string): Promise<MemoryEntry | null> {
  return command<MemoryEntry | null>('memory_recall', { category, topic });
}

export async function memorySearch(query: string, limit?: number): Promise<MemoryEntry[]> {
  return command<MemoryEntry[]>('memory_search', { query, limit });
}

export async function memoryGetByCategory(
  category: string,
  limit?: number,
): Promise<MemoryEntry[]> {
  return command<MemoryEntry[]>('memory_get_by_category', { category, limit });
}

export async function memoryGetImportant(minImportance?: number): Promise<MemoryEntry[]> {
  return command<MemoryEntry[]>('memory_get_important', { minImportance });
}

export async function memoryForget(memoryId: number): Promise<boolean> {
  return command<boolean>('memory_forget', { memoryId });
}

export async function memoryForgetTopic(category: string, topic: string): Promise<boolean> {
  return command<boolean>('memory_forget_topic', { category, topic });
}

export async function memoryLogContext(
  content: string,
  entryType?: string,
  metadata?: string,
): Promise<number> {
  return command<number>('memory_log_context', { content, entryType, metadata });
}

export async function memoryGetDailyLogs(date: string): Promise<DailyLogEntry[]> {
  return command<DailyLogEntry[]>('memory_get_daily_logs', { date });
}

export async function memoryGetSessionContext(): Promise<string> {
  return command<string>('memory_get_session_context');
}

export async function memoryListCategories(): Promise<string[]> {
  return command<string[]>('memory_list_categories');
}

export async function memoryExportAll(): Promise<MemoryEntry[]> {
  return command<MemoryEntry[]>('memory_export_all');
}

export async function memoryListAll(): Promise<MemoryEntry[]> {
  return command<MemoryEntry[]>('memory_list_all');
}

export async function memoryStore(
  category: string,
  topic: string,
  content: string,
  importance?: number,
  source?: string,
): Promise<number> {
  return command<number>('memory_store', { category, topic, content, importance, source });
}

export async function memoryDelete(memoryId: number): Promise<boolean> {
  return command<boolean>('memory_delete', { memoryId });
}

// ---- Decay System ----

export async function memoryCleanupLogs(keepDays?: number): Promise<number> {
  return command<number>('memory_cleanup_logs', { keepDays });
}

export async function memoryRunDecay(): Promise<DecayResult> {
  return command<DecayResult>('memory_run_decay');
}

export async function memoryGetDecayConfig(): Promise<DecayConfig> {
  return command<DecayConfig>('memory_get_decay_config');
}

export async function memorySetDecayConfig(
  enabled: boolean,
  decayRate: number,
  decayPeriodDays: number,
  minImportance: number,
  accessBoost: number,
): Promise<void> {
  return command<void>('memory_set_decay_config', {
    enabled,
    decayRate,
    decayPeriodDays,
    minImportance,
    accessBoost,
  });
}

export async function memoryGetDecayCandidates(): Promise<DecayCandidate[]> {
  return command<DecayCandidate[]>('memory_get_decay_candidates');
}

export async function memoryBoostOnAccess(memoryId: number): Promise<number> {
  return command<number>('memory_boost_on_access', { memoryId });
}

export async function memoryRecallWithBoost(
  category: string,
  topic: string,
): Promise<MemoryEntry | null> {
  return command<MemoryEntry | null>('memory_recall_with_boost', { category, topic });
}

export async function memoryDecaySingle(memoryId: number, decayAmount: number): Promise<number> {
  return command<number>('memory_decay_single', { memoryId, decayAmount });
}

export async function memoryGetStats(): Promise<MemoryStats> {
  return command<MemoryStats>('memory_get_stats');
}

// ---- Compaction ----

export async function memoryGetCompactionCandidates(
  config?: CompactionConfig,
): Promise<CompactionCandidate[]> {
  return command<CompactionCandidate[]>('memory_get_compaction_candidates', { config });
}

export async function memoryGetLogsInRange(
  startDate?: string,
  endDate?: string,
): Promise<DailyLogEntry[]> {
  return command<DailyLogEntry[]>('memory_get_logs_in_range', { startDate, endDate });
}

export async function memoryCompactOldLogs(
  startDate?: string,
  endDate?: string,
): Promise<MemoryCompactionResult> {
  return command<MemoryCompactionResult>('memory_compact_old_logs', { startDate, endDate });
}

export async function memoryPromoteExtracted(memories: ExtractedMemory[]): Promise<number> {
  return command<number>('memory_promote_extracted', { memories });
}

export async function memoryArchiveCompactedLogs(
  dates: string[],
  deleteCompacted: boolean,
): Promise<number> {
  return command<number>('memory_archive_compacted_logs', { dates, deleteCompacted });
}

export async function memoryGetExtractionPrompt(
  startDate?: string,
  endDate?: string,
  config?: CompactionConfig,
): Promise<string> {
  return command<string>('memory_get_extraction_prompt', { startDate, endDate, config });
}

export async function memoryGetCompactionStats(): Promise<unknown> {
  return command<unknown>('memory_get_compaction_stats');
}

// ---- Import / Export ----

export async function memoryExportJson(path?: string): Promise<unknown> {
  return command<unknown>('memory_export_json', { path });
}

export async function memoryExportMarkdown(path?: string): Promise<string> {
  return command<string>('memory_export_markdown', { path });
}

export async function memoryImportJson(path: string, strategy?: string): Promise<ImportResult> {
  return command<ImportResult>('memory_import_json', { path, strategy });
}

export async function memoryImportJsonString(
  json: string,
  strategy?: string,
): Promise<ImportResult> {
  return command<ImportResult>('memory_import_json_string', { json, strategy });
}

// ---- Dashboard ----

export async function memoryGetDashboardStats(): Promise<unknown> {
  return command<unknown>('memory_get_dashboard_stats');
}

export async function memoryGetProjectMemories(
  projectName?: string,
  limit?: number,
): Promise<MemoryEntry[]> {
  return command<MemoryEntry[]>('memory_get_project_memories', { projectName, limit });
}

export async function memoryGetUsageTrends(): Promise<unknown> {
  return command<unknown>('memory_get_usage_trends');
}

export async function memorySuggestImportant(): Promise<MemoryEntry[]> {
  return command<MemoryEntry[]>('memory_suggest_important');
}

// ---- Project Memory ----

export async function saveProjectContext(request: unknown): Promise<number> {
  return command<number>('save_project_context', { request });
}

export async function getProjectContext(projectFolder: string): Promise<ProjectContext | null> {
  return command<ProjectContext | null>('get_project_context', { projectFolder });
}

export async function saveCodingStyle(request: unknown): Promise<number> {
  return command<number>('save_coding_style', { request });
}

export async function getCodingStyles(projectFolder: string): Promise<CodingStyle[]> {
  return command<CodingStyle[]>('get_coding_styles', { projectFolder });
}

export async function saveArchitecturalDecision(request: unknown): Promise<number> {
  return command<number>('save_architectural_decision', { request });
}

export async function getArchitecturalDecisions(
  projectFolder: string,
  status?: string,
): Promise<ArchitecturalDecision[]> {
  return command<ArchitecturalDecision[]>('get_architectural_decisions', {
    projectFolder,
    status,
  });
}

export async function getProjectMemories(projectFolder: string): Promise<ProjectMemory[]> {
  return command<ProjectMemory[]>('get_project_memories', { projectFolder });
}

export async function searchProjectMemories(request: unknown): Promise<ProjectMemory[]> {
  return command<ProjectMemory[]>('search_project_memories', { request });
}

export async function updateMemoryImportance(memoryId: number, importance: number): Promise<void> {
  return command<void>('update_memory_importance', { memoryId, importance });
}

export async function deleteProjectMemory(memoryId: number): Promise<boolean> {
  return command<boolean>('delete_project_memory', { memoryId });
}

export async function clearProjectMemories(projectFolder: string): Promise<number> {
  return command<number>('clear_project_memories', { projectFolder });
}

export async function getProjectMemoryStats(projectFolder: string): Promise<unknown> {
  return command<unknown>('get_project_memory_stats', { projectFolder });
}

export async function autoSaveDecision(
  projectFolder: string,
  decision: string,
  rationale: string,
): Promise<number> {
  return command<number>('auto_save_decision', { projectFolder, decision, rationale });
}
