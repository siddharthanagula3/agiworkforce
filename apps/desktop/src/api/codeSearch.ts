/**
 * Code Search API
 *
 * TypeScript API wrappers for code search, glob, and formatting Tauri commands.
 * Provides regex content search (grep), file pattern search (glob),
 * auto-formatting, and formatter detection.
 */

import { invoke, isTauri } from '../lib/tauri-mock';

// ============================================================================
// Types
// ============================================================================

/**
 * A single grep match result
 */
export interface GrepMatch {
  path: string;
  lineNumber: number;
  line: string;
  column: number;
  context?: string[];
}

/**
 * Response from grep_search
 */
export interface GrepSearchResult {
  matches: GrepMatch[];
  totalFilesSearched: number;
  truncated: boolean;
}

/**
 * Output mode for grep search
 */
export type GrepOutputMode = 'content' | 'files_with_matches' | 'count';

/**
 * Options for grep search
 */
export interface GrepSearchOptions {
  /** Regex pattern to search for */
  pattern: string;
  /** Optional root directory (defaults to project root) */
  root?: string;
  /** Optional glob to restrict file types (e.g. "*.ts") */
  includePattern?: string;
  /** Case-insensitive search */
  caseInsensitive?: boolean;
  /** Output mode: content, files_with_matches, or count */
  outputMode?: GrepOutputMode;
  /** Number of context lines around each match */
  contextLines?: number;
}

/**
 * A single glob match result
 */
export interface GlobMatch {
  path: string;
  relativePath: string;
  isFile: boolean;
  sizeBytes: number;
  modifiedSecs: number;
}

/**
 * Response from glob_search
 */
export interface GlobSearchResult {
  matches: GlobMatch[];
  truncated: boolean;
}

/**
 * Formatter detection info
 */
export interface FormatterInfo {
  language: string;
  formatter: string;
  command: string[];
  available: boolean;
}

/**
 * Result from formatting a file
 */
export interface FormatResult {
  formatted: boolean;
  formatter: string;
  changed: boolean;
  error: string | null;
}

// ============================================================================
// Grep Search
// ============================================================================

/**
 * Search file contents using a regular expression.
 * Skips excluded dirs, binary files, and files > 10 MB.
 * Returns up to 500 matches.
 *
 * @param options - Search options including pattern, root, filters
 * @returns Search results with matches and metadata
 */
export async function grepSearch(options: GrepSearchOptions): Promise<GrepSearchResult> {
  if (!isTauri) {
    return { matches: [], totalFilesSearched: 0, truncated: false };
  }

  try {
    const result = await invoke<GrepSearchResult>('grep_search', {
      pattern: options.pattern,
      root: options.root ?? null,
      includePattern: options.includePattern ?? null,
      caseInsensitive: options.caseInsensitive ?? null,
      outputMode: options.outputMode ?? null,
      contextLines: options.contextLines ?? null,
    });
    return result;
  } catch (error) {
    console.error('[CodeSearch] grep_search failed:', error);
    return { matches: [], totalFilesSearched: 0, truncated: false };
  }
}

// ============================================================================
// Glob Search
// ============================================================================

/**
 * Find files matching a glob pattern.
 * Skips excluded dirs. Results sorted by modification time (newest first).
 *
 * @param pattern - Glob pattern (e.g. "**\/*.ts", "src/**\/*.rs")
 * @param root - Optional root directory
 * @param limit - Max results (default 200, max 1000)
 * @returns Matching files with metadata
 */
export async function globSearch(
  pattern: string,
  root?: string,
  limit?: number,
): Promise<GlobSearchResult> {
  if (!isTauri) {
    return { matches: [], truncated: false };
  }

  try {
    const result = await invoke<GlobSearchResult>('glob_search', {
      pattern,
      root: root ?? null,
      limit: limit ?? null,
    });
    return result;
  } catch (error) {
    console.error('[CodeSearch] glob_search failed:', error);
    return { matches: [], truncated: false };
  }
}

// ============================================================================
// File Formatting
// ============================================================================

/**
 * Run the appropriate code formatter for a file.
 * Detects the formatter from the file extension and project configuration.
 *
 * @param path - Absolute path to the file to format
 * @param projectRoot - Optional project root for detecting local formatters
 * @returns Result indicating whether the file was formatted and changed
 */
export async function formatFile(path: string, projectRoot?: string): Promise<FormatResult> {
  if (!isTauri) {
    return { formatted: false, formatter: 'none', changed: false, error: null };
  }

  try {
    const result = await invoke<FormatResult>('format_file', {
      path,
      projectRoot: projectRoot ?? null,
    });
    return result;
  } catch (error) {
    return {
      formatted: false,
      formatter: 'unknown',
      changed: false,
      error: String(error),
    };
  }
}

/**
 * Detect which formatter would be used for a given file.
 *
 * @param path - Path to the file (or a path with the desired extension)
 * @param projectRoot - Optional project root for detecting local formatters
 * @returns Formatter info including whether the binary is available
 */
export async function detectFormatter(path: string, projectRoot?: string): Promise<FormatterInfo> {
  if (!isTauri) {
    return { language: 'unknown', formatter: 'none', command: [], available: false };
  }

  try {
    const result = await invoke<FormatterInfo>('format_detect', {
      path,
      projectRoot: projectRoot ?? null,
    });
    return result;
  } catch {
    return { language: 'unknown', formatter: 'none', command: [], available: false };
  }
}
