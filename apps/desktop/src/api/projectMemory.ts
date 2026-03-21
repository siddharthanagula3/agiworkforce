/**
 * Project Memory API Client
 *
 * TypeScript wrappers for the 13 Rust project_memory commands.
 * Covers project context, coding styles, architectural decisions,
 * and project-scoped memory search.
 *
 * Command names: snake_case. Invoke params: camelCase.
 * All functions have try/catch error handling.
 */

import { invoke } from '../lib/tauri-mock';

// ============================================================================
// TYPE DEFINITIONS — match Rust structs in sys/commands/project_memory.rs
// ============================================================================

export interface ProjectContext {
  id: number;
  project_folder: string;
  tech_stack: string[];
  main_language?: string;
  conventions?: string;
  frameworks: string[];
  importance: number;
  created_at: string;
  updated_at: string;
  last_accessed?: string;
}

export interface CodingStyle {
  id: number;
  project_folder: string;
  style_key: string;
  style_value: string;
  category: string;
  importance: number;
  created_at: string;
  updated_at: string;
}

export interface ArchitecturalDecision {
  id: number;
  project_folder: string;
  decision: string;
  rationale: string;
  status: string;
  importance: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectMemory {
  id: number;
  project_folder: string;
  memory_type: string;
  content: string;
  importance: number;
  created_at: string;
  updated_at: string;
  last_accessed?: string;
}

export interface SaveProjectContextRequest {
  projectFolder: string;
  techStack: string[];
  mainLanguage?: string;
  conventions?: string;
  frameworks: string[];
  importance?: number;
}

export interface SaveCodingStyleRequest {
  projectFolder: string;
  styleKey: string;
  styleValue: string;
  category: string;
  importance?: number;
}

export interface SaveArchitecturalDecisionRequest {
  projectFolder: string;
  decision: string;
  rationale: string;
  status?: string;
  importance?: number;
}

export interface SearchProjectMemoriesRequest {
  projectFolder: string;
  query: string;
  limit?: number;
}

// ============================================================================
// PROJECT CONTEXT
// ============================================================================

/**
 * Save or update project context for a folder (save_project_context).
 * Returns the memory ID.
 */
export async function saveProjectContext(request: SaveProjectContextRequest): Promise<number> {
  try {
    return await invoke<number>('save_project_context', { request });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[projectMemory-api] saveProjectContext failed:', msg);
    throw error;
  }
}

/**
 * Get project context for a folder (get_project_context).
 * Returns null if no context has been saved for this folder.
 */
export async function getProjectContext(projectFolder: string): Promise<ProjectContext | null> {
  try {
    return await invoke<ProjectContext | null>('get_project_context', {
      projectFolder,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[projectMemory-api] getProjectContext failed:', msg);
    throw error;
  }
}

// ============================================================================
// CODING STYLES
// ============================================================================

/**
 * Save or update a coding style rule for a project (save_coding_style).
 * Returns the memory ID.
 */
export async function saveCodingStyle(request: SaveCodingStyleRequest): Promise<number> {
  try {
    return await invoke<number>('save_coding_style', { request });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[projectMemory-api] saveCodingStyle failed:', msg);
    throw error;
  }
}

/**
 * Get all coding styles for a project (get_coding_styles).
 */
export async function getCodingStyles(projectFolder: string): Promise<CodingStyle[]> {
  try {
    return await invoke<CodingStyle[]>('get_coding_styles', { projectFolder });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[projectMemory-api] getCodingStyles failed:', msg);
    throw error;
  }
}

// ============================================================================
// ARCHITECTURAL DECISIONS
// ============================================================================

/**
 * Save an architectural decision for a project (save_architectural_decision).
 * Returns the memory ID.
 */
export async function saveArchitecturalDecision(
  request: SaveArchitecturalDecisionRequest,
): Promise<number> {
  try {
    return await invoke<number>('save_architectural_decision', { request });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[projectMemory-api] saveArchitecturalDecision failed:', msg);
    throw error;
  }
}

/**
 * Get architectural decisions for a project (get_architectural_decisions).
 * Optionally filter by status: "proposed", "accepted", or "deprecated".
 */
export async function getArchitecturalDecisions(
  projectFolder: string,
  status?: string,
): Promise<ArchitecturalDecision[]> {
  try {
    return await invoke<ArchitecturalDecision[]>('get_architectural_decisions', {
      projectFolder,
      status,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[projectMemory-api] getArchitecturalDecisions failed:', msg);
    throw error;
  }
}

/**
 * Auto-save a decision from AGI execution (auto_save_decision).
 * Marks the decision as accepted with high importance (8).
 * Returns the memory ID.
 */
export async function autoSaveDecision(
  projectFolder: string,
  decision: string,
  rationale: string,
): Promise<number> {
  try {
    return await invoke<number>('auto_save_decision', {
      projectFolder,
      decision,
      rationale,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[projectMemory-api] autoSaveDecision failed:', msg);
    throw error;
  }
}

// ============================================================================
// PROJECT MEMORY MANAGEMENT
// ============================================================================

/**
 * Get all memories for a project (get_project_memories).
 */
export async function getProjectMemories(projectFolder: string): Promise<ProjectMemory[]> {
  try {
    return await invoke<ProjectMemory[]>('get_project_memories', {
      projectFolder,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[projectMemory-api] getProjectMemories failed:', msg);
    throw error;
  }
}

/**
 * Search project memories by content query (search_project_memories).
 */
export async function searchProjectMemories(
  request: SearchProjectMemoriesRequest,
): Promise<ProjectMemory[]> {
  try {
    return await invoke<ProjectMemory[]>('search_project_memories', { request });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[projectMemory-api] searchProjectMemories failed:', msg);
    throw error;
  }
}

/**
 * Update the importance score of a project memory (update_memory_importance).
 */
export async function updateMemoryImportance(memoryId: number, importance: number): Promise<void> {
  try {
    return await invoke<void>('update_memory_importance', {
      memoryId,
      importance,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[projectMemory-api] updateMemoryImportance failed:', msg);
    throw error;
  }
}

/**
 * Delete a project memory by ID (delete_project_memory).
 * Returns true if the memory was deleted.
 */
export async function deleteProjectMemory(memoryId: number): Promise<boolean> {
  try {
    return await invoke<boolean>('delete_project_memory', { memoryId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[projectMemory-api] deleteProjectMemory failed:', msg);
    throw error;
  }
}

/**
 * Clear all memories for a project (clear_project_memories).
 * Returns the number of memories removed.
 */
export async function clearProjectMemories(projectFolder: string): Promise<number> {
  try {
    return await invoke<number>('clear_project_memories', { projectFolder });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[projectMemory-api] clearProjectMemories failed:', msg);
    throw error;
  }
}

/**
 * Get statistics about project memories (get_project_memory_stats).
 */
export async function getProjectMemoryStats(
  projectFolder: string,
): Promise<Record<string, unknown>> {
  try {
    return await invoke<Record<string, unknown>>('get_project_memory_stats', {
      projectFolder,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[projectMemory-api] getProjectMemoryStats failed:', msg);
    throw error;
  }
}
