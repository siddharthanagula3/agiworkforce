/**
 * Workspace API — typed wrappers for workspace indexing and symbol search commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface WorkspaceIndex {
  files: number;
  symbols: number;
  duration: number;
}
export interface SearchQuery {
  query: string;
  filePattern?: string;
  symbolKind?: string;
  limit?: number;
}
export interface SearchResultItem {
  filePath: string;
  symbolName: string;
  kind: string;
  line: number;
  column: number;
}
export interface Symbol {
  name: string;
  kind: string;
  filePath: string;
  line: number;
  column: number;
}
export interface DependencyGraph {
  nodes: { id: string; label: string }[];
  edges: { from: string; to: string }[];
}
export interface WorkspaceStats {
  totalFiles: number;
  totalSymbols: number;
  languages: Record<string, number>;
  lastIndexed?: string;
}

// ---- Commands ----

export async function workspaceIndex(workspacePath: string): Promise<WorkspaceIndex> {
  return command<WorkspaceIndex>('workspace_index', { workspacePath });
}
export async function workspaceSearchSymbols(query: SearchQuery): Promise<SearchResultItem[]> {
  return command<SearchResultItem[]>('workspace_search_symbols', { query });
}
export async function workspaceFindDefinition(symbolName: string): Promise<Symbol | null> {
  return command<Symbol | null>('workspace_find_definition', { symbolName });
}
export async function workspaceFindReferences(symbolName: string): Promise<Symbol[]> {
  return command<Symbol[]>('workspace_find_references', { symbolName });
}
export async function workspaceGetDependencies(): Promise<DependencyGraph> {
  return command<DependencyGraph>('workspace_get_dependencies');
}
export async function workspaceGetFileSymbols(filePath: string): Promise<Symbol[]> {
  return command<Symbol[]>('workspace_get_file_symbols', { filePath });
}
export async function workspaceGetStats(): Promise<WorkspaceStats> {
  return command<WorkspaceStats>('workspace_get_stats');
}
