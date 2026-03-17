/**
 * Code Analysis Store
 *
 * Wires Rust/Tauri code-analysis commands to the React frontend:
 *
 * Workspace indexing & symbol search:
 *   workspace_index, workspace_search_symbols, workspace_find_definition,
 *   workspace_find_references, workspace_get_dependencies,
 *   workspace_get_file_symbols, workspace_get_stats
 *
 * Debugging / error analysis:
 *   debug_parse_error, debug_suggest_fixes, debug_analyze_stack_trace
 *
 * Formatter detection:
 *   format_detect
 *
 * Test runner detection:
 *   test_detect_runner
 *
 * LSP server listing:
 *   lsp_list_servers
 */
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '../lib/tauri-mock';

// ─────────────────────────────────────────────
// Types (mirroring Rust serde output)
// ─────────────────────────────────────────────

// Workspace index types

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

export interface WorkspaceSymbol {
  name: string;
  kind: SymbolKind;
  filePath: string;
  line: number;
  column: number;
  scope: string | null;
  signature: string | null;
  documentation: string | null;
}

export interface IndexedFile {
  path: string;
  language: string;
  size: number;
  lines: number;
  symbols: WorkspaceSymbol[];
  imports: string[];
  exports: string[];
}

export interface DependencyNode {
  id: string;
  filePath: string;
  moduleName: string;
}

export interface DependencyEdge {
  from: string;
  to: string;
  edgeType: 'import' | 'export' | 'extends' | 'implements' | 'uses';
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
}

export interface WorkspaceIndex {
  rootPath: string;
  files: IndexedFile[];
  symbols: WorkspaceSymbol[];
  dependencies: DependencyGraph;
  lastUpdated: number;
}

export interface SymbolSearchQuery {
  query: string;
  kind?: SymbolKind;
  filePattern?: string;
  limit?: number;
}

export interface SymbolSearchResult {
  symbol: WorkspaceSymbol;
  score: number;
  context: string;
}

export interface WorkspaceStats {
  totalFiles: number;
  totalSymbols: number;
  totalLines: number;
  languages: Record<string, number>;
  symbolKinds: Record<string, number>;
}

// Debugging types

export type ErrorSeverity = 'Critical' | 'High' | 'Medium' | 'Low';

export interface StackFrame {
  function: string;
  file: string;
  line: number;
  column: number | null;
}

export interface ParsedError {
  errorType: string;
  message: string;
  filePath: string | null;
  line: number | null;
  column: number | null;
  stackTrace: StackFrame[];
  severity: ErrorSeverity;
}

export interface DebugSuggestion {
  title: string;
  description: string;
  fixCode: string | null;
  confidence: number;
  steps: string[];
}

export interface StackTraceAnalysis {
  rootCauseFrame: number;
  explanation: string;
  errorPath: string;
  recommendations: string[];
}

// Formatter detection types

export interface FormatterInfo {
  language: string;
  formatter: string;
  command: string[];
  available: boolean;
}

// LSP server info (from lsp_list_servers)

export interface LSPServerInfo {
  language: string;
  command: string;
  args: string[];
  rootUri: string;
  initialized: boolean;
}

// ─────────────────────────────────────────────
// Store state & actions
// ─────────────────────────────────────────────

interface CodeAnalysisState {
  // Workspace index state
  workspaceIndex: WorkspaceIndex | null;
  isIndexing: boolean;
  indexError: string | null;

  // Search results
  searchResults: SymbolSearchResult[];
  isSearching: boolean;

  // Workspace stats
  stats: WorkspaceStats | null;

  // Dependency graph
  dependencies: DependencyGraph | null;

  // Debugging state
  parsedError: ParsedError | null;
  debugSuggestions: DebugSuggestion[];
  stackTraceAnalysis: StackTraceAnalysis | null;
  isAnalyzing: boolean;
  analysisError: string | null;

  // Detected test runner
  detectedTestRunner: string | null;

  // Detected formatter
  detectedFormatter: FormatterInfo | null;

  // LSP servers
  lspServers: LSPServerInfo[];

  // ── Workspace actions ──

  /** Index an entire workspace. Populates symbols, files, dependencies. */
  indexWorkspace: (workspacePath: string) => Promise<WorkspaceIndex>;

  /** Search symbols in the indexed workspace. */
  searchSymbols: (query: SymbolSearchQuery) => Promise<SymbolSearchResult[]>;

  /** Find the definition of a symbol by name. */
  findDefinition: (symbolName: string) => Promise<WorkspaceSymbol | null>;

  /** Find all references to a symbol by name. */
  findReferences: (symbolName: string) => Promise<WorkspaceSymbol[]>;

  /** Get the full dependency graph of the indexed workspace. */
  getDependencies: () => Promise<DependencyGraph>;

  /** Get all symbols in a specific file. */
  getFileSymbols: (filePath: string) => Promise<WorkspaceSymbol[]>;

  /** Get workspace-level statistics. */
  getStats: () => Promise<WorkspaceStats>;

  // ── Debugging actions ──

  /** Parse an error message into structured form. */
  parseError: (errorText: string) => Promise<ParsedError>;

  /** Get AI-powered fix suggestions for a parsed error. */
  suggestFixes: (error: ParsedError, sourceCode?: string) => Promise<DebugSuggestion[]>;

  /** Analyze a stack trace to identify root cause. */
  analyzeStackTrace: (stackTrace: StackFrame[]) => Promise<StackTraceAnalysis>;

  // ── Formatter & test runner detection ──

  /** Detect which formatter would be used for a file. */
  detectFormatter: (path: string, projectRoot?: string) => Promise<FormatterInfo>;

  /** Detect which test runner would be used for a project. */
  detectTestRunner: (projectRoot?: string) => Promise<string>;

  // ── LSP ──

  /** List all active LSP servers. */
  listLspServers: () => Promise<LSPServerInfo[]>;

  // ── Utilities ──

  /** Clear all analysis state. */
  clearAnalysis: () => void;

  /** Clear workspace index. */
  clearIndex: () => void;
}

export const useCodeAnalysisStore = create<CodeAnalysisState>()(
  devtools(
    immer((set, _get) => ({
      // Initial state
      workspaceIndex: null,
      isIndexing: false,
      indexError: null,
      searchResults: [],
      isSearching: false,
      stats: null,
      dependencies: null,
      parsedError: null,
      debugSuggestions: [],
      stackTraceAnalysis: null,
      isAnalyzing: false,
      analysisError: null,
      detectedTestRunner: null,
      detectedFormatter: null,
      lspServers: [],

      // ── Workspace actions ──────────────────────────────

      indexWorkspace: async (workspacePath: string) => {
        set(
          (draft) => {
            draft.isIndexing = true;
            draft.indexError = null;
          },
          undefined,
          'codeAnalysis/indexWorkspace/start',
        );

        try {
          const index = await invoke<WorkspaceIndex>('workspace_index', {
            workspacePath,
          });

          set(
            (draft) => {
              draft.workspaceIndex = index;
              draft.isIndexing = false;
            },
            undefined,
            'codeAnalysis/indexWorkspace/success',
          );

          return index;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          set(
            (draft) => {
              draft.isIndexing = false;
              draft.indexError = message;
            },
            undefined,
            'codeAnalysis/indexWorkspace/error',
          );
          throw error;
        }
      },

      searchSymbols: async (query: SymbolSearchQuery) => {
        set(
          (draft) => {
            draft.isSearching = true;
          },
          undefined,
          'codeAnalysis/searchSymbols/start',
        );

        try {
          const results = await invoke<SymbolSearchResult[]>('workspace_search_symbols', {
            query,
          });

          set(
            (draft) => {
              draft.searchResults = results;
              draft.isSearching = false;
            },
            undefined,
            'codeAnalysis/searchSymbols/success',
          );

          return results;
        } catch (error) {
          set(
            (draft) => {
              draft.isSearching = false;
            },
            undefined,
            'codeAnalysis/searchSymbols/error',
          );
          console.error('[CodeAnalysis] Failed to search symbols:', error);
          return [];
        }
      },

      findDefinition: async (symbolName: string) => {
        try {
          const symbol = await invoke<WorkspaceSymbol | null>('workspace_find_definition', {
            symbolName,
          });
          return symbol;
        } catch (error) {
          console.error('[CodeAnalysis] Failed to find definition:', error);
          return null;
        }
      },

      findReferences: async (symbolName: string) => {
        try {
          const refs = await invoke<WorkspaceSymbol[]>('workspace_find_references', {
            symbolName,
          });
          return refs;
        } catch (error) {
          console.error('[CodeAnalysis] Failed to find references:', error);
          return [];
        }
      },

      getDependencies: async () => {
        try {
          const deps = await invoke<DependencyGraph>('workspace_get_dependencies');

          set(
            (draft) => {
              draft.dependencies = deps;
            },
            undefined,
            'codeAnalysis/getDependencies',
          );

          return deps;
        } catch (error) {
          console.error('[CodeAnalysis] Failed to get dependencies:', error);
          return { nodes: [], edges: [] };
        }
      },

      getFileSymbols: async (filePath: string) => {
        try {
          const symbols = await invoke<WorkspaceSymbol[]>('workspace_get_file_symbols', {
            filePath,
          });
          return symbols;
        } catch (error) {
          console.error('[CodeAnalysis] Failed to get file symbols:', error);
          return [];
        }
      },

      getStats: async () => {
        try {
          const stats = await invoke<WorkspaceStats>('workspace_get_stats');

          set(
            (draft) => {
              draft.stats = stats;
            },
            undefined,
            'codeAnalysis/getStats',
          );

          return stats;
        } catch (error) {
          console.error('[CodeAnalysis] Failed to get workspace stats:', error);
          return {
            totalFiles: 0,
            totalSymbols: 0,
            totalLines: 0,
            languages: {},
            symbolKinds: {},
          };
        }
      },

      // ── Debugging actions ──────────────────────────────

      parseError: async (errorText: string) => {
        set(
          (draft) => {
            draft.isAnalyzing = true;
            draft.analysisError = null;
          },
          undefined,
          'codeAnalysis/parseError/start',
        );

        try {
          const parsed = await invoke<ParsedError>('debug_parse_error', {
            errorText,
          });

          set(
            (draft) => {
              draft.parsedError = parsed;
              draft.isAnalyzing = false;
            },
            undefined,
            'codeAnalysis/parseError/success',
          );

          return parsed;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          set(
            (draft) => {
              draft.isAnalyzing = false;
              draft.analysisError = message;
            },
            undefined,
            'codeAnalysis/parseError/error',
          );
          throw error;
        }
      },

      suggestFixes: async (parsedError: ParsedError, sourceCode?: string) => {
        set(
          (draft) => {
            draft.isAnalyzing = true;
            draft.analysisError = null;
          },
          undefined,
          'codeAnalysis/suggestFixes/start',
        );

        try {
          const suggestions = await invoke<DebugSuggestion[]>('debug_suggest_fixes', {
            error: parsedError,
            sourceCode: sourceCode ?? null,
          });

          set(
            (draft) => {
              draft.debugSuggestions = suggestions;
              draft.isAnalyzing = false;
            },
            undefined,
            'codeAnalysis/suggestFixes/success',
          );

          return suggestions;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          set(
            (draft) => {
              draft.isAnalyzing = false;
              draft.analysisError = message;
            },
            undefined,
            'codeAnalysis/suggestFixes/error',
          );
          console.error('[CodeAnalysis] Failed to suggest fixes:', error);
          return [];
        }
      },

      analyzeStackTrace: async (stackTrace: StackFrame[]) => {
        set(
          (draft) => {
            draft.isAnalyzing = true;
            draft.analysisError = null;
          },
          undefined,
          'codeAnalysis/analyzeStackTrace/start',
        );

        try {
          const analysis = await invoke<StackTraceAnalysis>('debug_analyze_stack_trace', {
            stackTrace,
          });

          set(
            (draft) => {
              draft.stackTraceAnalysis = analysis;
              draft.isAnalyzing = false;
            },
            undefined,
            'codeAnalysis/analyzeStackTrace/success',
          );

          return analysis;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          set(
            (draft) => {
              draft.isAnalyzing = false;
              draft.analysisError = message;
            },
            undefined,
            'codeAnalysis/analyzeStackTrace/error',
          );
          throw error;
        }
      },

      // ── Formatter & test runner detection ──────────────

      detectFormatter: async (path: string, projectRoot?: string) => {
        try {
          const info = await invoke<FormatterInfo>('format_detect', {
            path,
            projectRoot: projectRoot ?? null,
          });

          set(
            (draft) => {
              draft.detectedFormatter = info;
            },
            undefined,
            'codeAnalysis/detectFormatter',
          );

          return info;
        } catch (error) {
          console.error('[CodeAnalysis] Failed to detect formatter:', error);
          return { language: '', formatter: 'none', command: [], available: false };
        }
      },

      detectTestRunner: async (projectRoot?: string) => {
        try {
          const runner = await invoke<string>('test_detect_runner', {
            projectRoot: projectRoot ?? null,
          });

          set(
            (draft) => {
              draft.detectedTestRunner = runner;
            },
            undefined,
            'codeAnalysis/detectTestRunner',
          );

          return runner;
        } catch (error) {
          console.error('[CodeAnalysis] Failed to detect test runner:', error);
          return 'auto';
        }
      },

      // ── LSP ────────────────────────────────────────────

      listLspServers: async () => {
        try {
          const servers = await invoke<LSPServerInfo[]>('lsp_list_servers');

          set(
            (draft) => {
              draft.lspServers = servers;
            },
            undefined,
            'codeAnalysis/listLspServers',
          );

          return servers;
        } catch (error) {
          console.error('[CodeAnalysis] Failed to list LSP servers:', error);
          return [];
        }
      },

      // ── Utilities ──────────────────────────────────────

      clearAnalysis: () => {
        set(
          (draft) => {
            draft.parsedError = null;
            draft.debugSuggestions = [];
            draft.stackTraceAnalysis = null;
            draft.analysisError = null;
          },
          undefined,
          'codeAnalysis/clearAnalysis',
        );
      },

      clearIndex: () => {
        set(
          (draft) => {
            draft.workspaceIndex = null;
            draft.searchResults = [];
            draft.stats = null;
            draft.dependencies = null;
            draft.indexError = null;
          },
          undefined,
          'codeAnalysis/clearIndex',
        );
      },
    })),
    { name: 'CodeAnalysisStore', enabled: import.meta.env.DEV },
  ),
);

// ─────────────────────────────────────────────
// Selectors
// ─────────────────────────────────────────────

export const selectWorkspaceIndex = (state: CodeAnalysisState) => state.workspaceIndex;
export const selectIsIndexing = (state: CodeAnalysisState) => state.isIndexing;
export const selectIndexError = (state: CodeAnalysisState) => state.indexError;
export const selectSearchResults = (state: CodeAnalysisState) => state.searchResults;
export const selectIsSearching = (state: CodeAnalysisState) => state.isSearching;
export const selectWorkspaceStats = (state: CodeAnalysisState) => state.stats;
export const selectDependencyGraph = (state: CodeAnalysisState) => state.dependencies;
export const selectParsedError = (state: CodeAnalysisState) => state.parsedError;
export const selectDebugSuggestions = (state: CodeAnalysisState) => state.debugSuggestions;
export const selectStackTraceAnalysis = (state: CodeAnalysisState) => state.stackTraceAnalysis;
export const selectIsAnalyzing = (state: CodeAnalysisState) => state.isAnalyzing;
export const selectAnalysisError = (state: CodeAnalysisState) => state.analysisError;
export const selectDetectedTestRunner = (state: CodeAnalysisState) => state.detectedTestRunner;
export const selectDetectedFormatter = (state: CodeAnalysisState) => state.detectedFormatter;
export const selectLspServers = (state: CodeAnalysisState) => state.lspServers;

// Derived selectors
export const selectIndexedFileCount = (state: CodeAnalysisState) =>
  state.workspaceIndex?.files.length ?? 0;
export const selectIndexedSymbolCount = (state: CodeAnalysisState) =>
  state.workspaceIndex?.symbols.length ?? 0;
export const selectHasIndex = (state: CodeAnalysisState) => state.workspaceIndex !== null;
export const selectLanguageBreakdown = (state: CodeAnalysisState) => state.stats?.languages ?? {};
