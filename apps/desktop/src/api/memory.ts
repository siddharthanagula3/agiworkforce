import { MEMORY_CATEGORIES, isMemoryCategory, type MemoryCategory } from '@agiworkforce/types';

import { invoke } from '../lib/tauri-mock';

export { MEMORY_CATEGORIES, isMemoryCategory };
export type { MemoryCategory };

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

export interface DailyLogEntry {
  id: number;
  log_date: string;
  content: string;
  entry_type: string;
  metadata?: string;
  created_at: string;
}

export interface ImportResult {
  memories_imported: number;
  memories_skipped: number;
  memories_replaced: number;
  logs_imported: number;
  errors: string[];
}

export interface MemoryExport {
  version: string;
  exported_at: string;
  memory_count: number;
  log_count: number;
  memories: MemoryEntry[];
  daily_logs: DailyLogEntry[];
}

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

export async function deleteMemory(memoryId: number): Promise<boolean> {
  try {
    return await invoke<boolean>('memory_delete', { memoryId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] deleteMemory failed:', msg);
    throw error;
  }
}

export async function deleteAllMemories(): Promise<number | null> {
  try {
    return await invoke<number | null>('memory_delete_all');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] deleteAllMemories failed:', msg);
    throw error;
  }
}

export async function listAll(): Promise<MemoryEntry[]> {
  try {
    return await invoke<MemoryEntry[]>('memory_list_all');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] listAll failed:', msg);
    throw error;
  }
}

export async function exportBackup(): Promise<MemoryExport> {
  try {
    return await invoke<MemoryExport>('memory_export_json');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] exportBackup failed:', msg);
    throw error;
  }
}

export async function exportToMarkdown(): Promise<string> {
  try {
    return await invoke<string>('memory_export_markdown');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] exportToMarkdown failed:', msg);
    throw error;
  }
}

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

export async function configureMemoryInjection(
  enabled: boolean,
  maxMemories: number,
  minImportance: number,
  allowToolAssistedGeneration: boolean,
): Promise<void> {
  try {
    return await invoke<void>('chat_configure_memory_injection', {
      enabled,
      maxMemories,
      minImportance,
      allowToolAssistedGeneration,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[memory-api] configureMemoryInjection failed:', msg);
    throw error;
  }
}
