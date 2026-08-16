
import { invoke } from '../lib/tauri-mock';

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

export async function saveProjectContext(request: SaveProjectContextRequest): Promise<number> {
  try {
    return await invoke<number>('save_project_context', { request });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[projectMemory-api] saveProjectContext failed:', msg);
    throw error;
  }
}

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

export async function saveCodingStyle(request: SaveCodingStyleRequest): Promise<number> {
  try {
    return await invoke<number>('save_coding_style', { request });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[projectMemory-api] saveCodingStyle failed:', msg);
    throw error;
  }
}

export async function getCodingStyles(projectFolder: string): Promise<CodingStyle[]> {
  try {
    return await invoke<CodingStyle[]>('get_coding_styles', { projectFolder });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[projectMemory-api] getCodingStyles failed:', msg);
    throw error;
  }
}

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

export async function deleteProjectMemory(memoryId: number): Promise<boolean> {
  try {
    return await invoke<boolean>('delete_project_memory', { memoryId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[projectMemory-api] deleteProjectMemory failed:', msg);
    throw error;
  }
}

export async function clearProjectMemories(projectFolder: string): Promise<number> {
  try {
    return await invoke<number>('clear_project_memories', { projectFolder });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[projectMemory-api] clearProjectMemories failed:', msg);
    throw error;
  }
}

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
