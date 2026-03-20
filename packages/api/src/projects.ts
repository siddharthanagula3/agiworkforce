/**
 * Projects API — typed wrappers for project_* and project_context_* Tauri commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface Project {
  id: string;
  name: string;
  description?: string;
  path?: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}
export interface ProjectUpdate {
  name?: string;
  description?: string;
  [key: string]: unknown;
}
export interface ProjectSettings {
  [key: string]: unknown;
}
export interface ProjectContextInfo {
  path?: string;
  name?: string;
  [key: string]: unknown;
}
export interface ProjectFileInfo {
  path: string;
  name: string;
  isDir: boolean;
  size: number;
}
export interface ProjectInstructionFile {
  path: string;
  content: string;
}

// ---- Project CRUD ----

export async function projectCreate(project: Project): Promise<Project> {
  return command<Project>('project_create', { project });
}
export async function projectList(): Promise<Project[]> {
  return command<Project[]>('project_list');
}
export async function projectGet(id: string): Promise<Project | null> {
  return command<Project | null>('project_get', { id });
}
export async function projectUpdate(id: string, updates: ProjectUpdate): Promise<void> {
  return command<void>('project_update', { id, updates });
}
export async function projectDelete(id: string): Promise<void> {
  return command<void>('project_delete', { id });
}
export async function projectGetSettings(projectId: string): Promise<ProjectSettings> {
  return command<ProjectSettings>('project_get_settings', { projectId });
}
export async function projectUpdateSettings(
  projectId: string,
  settings: ProjectSettings,
): Promise<void> {
  return command<void>('project_update_settings', { projectId, settings });
}

// ---- Project Context ----

export async function projectContextSetFolder(path?: string): Promise<ProjectContextInfo> {
  return command<ProjectContextInfo>('project_context_set_folder', { path });
}
export async function projectContextGetFolder(): Promise<ProjectContextInfo> {
  return command<ProjectContextInfo>('project_context_get_folder');
}
export async function projectContextValidatePath(path: string): Promise<boolean> {
  return command<boolean>('project_context_validate_path', { path });
}
export async function projectContextListFiles(
  maxDepth?: number,
  includeHidden?: boolean,
): Promise<ProjectFileInfo[]> {
  return command<ProjectFileInfo[]>('project_context_list_files', { maxDepth, includeHidden });
}
export async function projectContextGetSummary(): Promise<string> {
  return command<string>('project_context_get_summary');
}
export async function projectLoadInstructions(): Promise<ProjectInstructionFile[]> {
  return command<ProjectInstructionFile[]>('project_load_instructions');
}
export async function projectHasInstructions(): Promise<boolean> {
  return command<boolean>('project_has_instructions');
}
