/**
 * Workspace API
 *
 * TypeScript API wrappers for workspace indexing and symbol search Tauri commands.
 * Provides functionality for indexing project files, searching symbols,
 * finding definitions/references, and retrieving workspace statistics.
 */

import { invoke, isTauri } from '../lib/tauri-mock';

// ============================================================================
// Types
// ============================================================================

/**
 * Kind of symbol (function, class, interface, etc.)
 */
export type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'struct'
  | 'enum'
  | 'variable'
  | 'constant'
  | 'method'
  | 'property'
  | 'module'
  | 'namespace';

/**
 * A symbol found in the workspace index
 */
export interface WorkspaceSymbol {
  name: string;
  kind: SymbolKind;
  file_path: string;
  line: number;
  column: number;
  scope: string | null;
  signature: string | null;
  documentation: string | null;
}

/**
 * An indexed file in the workspace
 */
export interface IndexedFile {
  path: string;
  language: string;
  size: number;
  lines: number;
  symbols: WorkspaceSymbol[];
  imports: string[];
  exports: string[];
}

/**
 * A node in the dependency graph
 */
export interface DependencyNode {
  id: string;
  file_path: string;
  module_name: string;
}

/**
 * An edge in the dependency graph
 */
export interface DependencyEdge {
  from: string;
  to: string;
  edge_type: 'import' | 'export' | 'extends' | 'implements' | 'uses';
}

/**
 * Dependency graph of the workspace
 */
export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
}

/**
 * Full workspace index result
 */
export interface WorkspaceIndex {
  root_path: string;
  files: IndexedFile[];
  symbols: WorkspaceSymbol[];
  dependencies: DependencyGraph;
  last_updated: number;
}

/**
 * Query parameters for workspace symbol search
 */
export interface WorkspaceSearchQuery {
  query: string;
  kind?: SymbolKind;
  filePattern?: string;
  limit?: number;
}

/**
 * A workspace search result with relevance score
 */
export interface WorkspaceSearchResult {
  symbol: WorkspaceSymbol;
  score: number;
  context: string;
}

/**
 * Workspace statistics
 */
export interface WorkspaceStats {
  total_files: number;
  total_symbols: number;
  total_lines: number;
  languages: Record<string, number>;
  symbol_kinds: Record<string, number>;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Index a workspace directory for symbol search.
 * Walks the directory tree, extracts symbols from supported languages,
 * and builds a dependency graph. Skips node_modules, target, dist, etc.
 *
 * @param workspacePath - Absolute path to the workspace root
 * @returns The complete workspace index
 */
export async function indexWorkspaceSymbols(workspacePath: string): Promise<WorkspaceIndex | null> {
  if (!isTauri) {
    return null;
  }

  try {
    return await invoke<WorkspaceIndex>('workspace_index', { workspacePath });
  } catch (error) {
    console.error('[workspace] indexWorkspaceSymbols failed:', error);
    return null;
  }
}

/**
 * Search for symbols in the indexed workspace.
 *
 * @param query - Search query with optional kind and file pattern filters
 * @returns Array of matching symbols sorted by relevance score
 */
export async function searchSymbols(query: WorkspaceSearchQuery): Promise<WorkspaceSearchResult[]> {
  if (!isTauri) {
    return [];
  }

  try {
    const result = await invoke<WorkspaceSearchResult[]>('workspace_search_symbols', { query });
    return result;
  } catch (error) {
    console.warn('[workspace] searchSymbols failed:', error);
    return [];
  }
}

/**
 * Find the definition of a symbol by name.
 *
 * @param symbolName - Name of the symbol to find
 * @returns The symbol definition, or null if not found
 */
export async function findDefinition(symbolName: string): Promise<WorkspaceSymbol | null> {
  if (!isTauri) {
    return null;
  }

  try {
    const result = await invoke<WorkspaceSymbol | null>('workspace_find_definition', {
      symbolName,
    });
    return result;
  } catch (error) {
    console.warn('[workspace] findDefinition failed:', error);
    return null;
  }
}

/**
 * Find all references to a symbol by name.
 *
 * @param symbolName - Name of the symbol to find references for
 * @returns Array of symbols that reference the given name
 */
export async function findReferences(symbolName: string): Promise<WorkspaceSymbol[]> {
  if (!isTauri) {
    return [];
  }

  try {
    const result = await invoke<WorkspaceSymbol[]>('workspace_find_references', { symbolName });
    return result;
  } catch (error) {
    console.warn('[workspace] findReferences failed:', error);
    return [];
  }
}

/**
 * Get the dependency graph of the indexed workspace.
 *
 * @returns The workspace dependency graph with nodes and edges
 */
export async function getDependencies(): Promise<DependencyGraph> {
  if (!isTauri) {
    return { nodes: [], edges: [] };
  }

  try {
    const result = await invoke<DependencyGraph>('workspace_get_dependencies');
    return result;
  } catch (error) {
    console.warn('[workspace] getDependencies failed:', error);
    return { nodes: [], edges: [] };
  }
}

/**
 * Get all symbols in a specific file.
 *
 * @param filePath - Absolute path to the file
 * @returns Array of symbols found in that file
 */
export async function getFileSymbols(filePath: string): Promise<WorkspaceSymbol[]> {
  if (!isTauri) {
    return [];
  }

  try {
    const result = await invoke<WorkspaceSymbol[]>('workspace_get_file_symbols', { filePath });
    return result;
  } catch (error) {
    console.warn('[workspace] getFileSymbols failed:', error);
    return [];
  }
}

/**
 * Get workspace statistics (file counts, symbol counts, language breakdown).
 *
 * @returns Workspace statistics summary
 */
export async function getWorkspaceStats(): Promise<WorkspaceStats | null> {
  if (!isTauri) {
    return null;
  }

  try {
    const result = await invoke<WorkspaceStats>('workspace_get_stats');
    return result;
  } catch (error) {
    console.warn('[workspace] getWorkspaceStats failed:', error);
    return null;
  }
}
