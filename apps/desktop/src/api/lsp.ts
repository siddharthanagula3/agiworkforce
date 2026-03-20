/**
 * LSP API
 *
 * TypeScript wrappers for the Language Server Protocol Tauri commands.
 * Provides server lifecycle, document operations, code intelligence
 * (completion, hover, definition, references, rename, formatting),
 * workspace symbols, code actions, and diagnostics.
 */

import { invoke, isTauri } from '../lib/tauri-mock';

// ============================================================================
// Types
// ============================================================================

/** LSP server information */
export interface LSPServer {
  language: string;
  command: string;
  args: string[];
  rootUri: string;
  initialized: boolean;
}

/** Position in a text document */
export interface LSPPosition {
  line: number;
  character: number;
}

/** Range in a text document */
export interface LSPRange {
  start: LSPPosition;
  end: LSPPosition;
}

/** Location in a document (uri + range) */
export interface LSPLocation {
  uri: string;
  range: LSPRange;
}

/** Completion suggestion item */
export interface CompletionItem {
  label: string;
  kind: number;
  detail?: string;
  documentation?: string;
  insertText?: string;
}

/** Hover information */
export interface HoverResult {
  contents: string;
  range?: LSPRange;
}

/** Diagnostic message from the LSP server */
export interface LSPDiagnostic {
  range: LSPRange;
  severity: number;
  message: string;
  source?: string;
  code?: string;
}

/** Symbol in the workspace */
export interface WorkspaceSymbol {
  name: string;
  kind: number;
  location: LSPLocation;
  containerName?: string;
}

/** Text edit operation */
export interface TextEdit {
  range: LSPRange;
  newText: string;
}

/** Code action (quick fix, refactoring, etc.) */
export interface CodeAction {
  title: string;
  kind?: string;
  diagnostics?: LSPDiagnostic[];
  edit?: WorkspaceEdit;
}

/** Workspace edit with changes across files */
export interface WorkspaceEdit {
  changes?: Record<string, TextEdit[]>;
}

// ============================================================================
// Server Lifecycle
// ============================================================================

/** Start an LSP server for a given language and project root */
export async function lspStartServer(language: string, rootPath: string): Promise<LSPServer> {
  try {
    if (!isTauri) throw new Error('LSP requires Tauri runtime');
    return await invoke<LSPServer>('lsp_start_server', { language, rootPath });
  } catch (error) {
    console.error('[lsp] failed to start server', error);
    throw error;
  }
}

/** Stop an LSP server for a given language */
export async function lspStopServer(language: string): Promise<void> {
  try {
    if (!isTauri) throw new Error('LSP requires Tauri runtime');
    await invoke<void>('lsp_stop_server', { language });
  } catch (error) {
    console.error('[lsp] failed to stop server', error);
    throw error;
  }
}

/** List all running LSP server languages */
export async function lspListServers(): Promise<string[]> {
  try {
    if (!isTauri) throw new Error('LSP requires Tauri runtime');
    return await invoke<string[]>('lsp_list_servers');
  } catch (error) {
    console.error('[lsp] failed to list servers', error);
    throw error;
  }
}

/** Detect the language for a given file path */
export async function lspDetectLanguage(filePath: string): Promise<string> {
  try {
    if (!isTauri) throw new Error('LSP requires Tauri runtime');
    return await invoke<string>('lsp_detect_language', { filePath });
  } catch (error) {
    console.error('[lsp] failed to detect language', error);
    throw error;
  }
}

// ============================================================================
// Document Notifications
// ============================================================================

/** Notify the LSP server that a document was opened */
export async function lspDidOpen(
  language: string,
  uri: string,
  languageId: string,
  content: string,
): Promise<void> {
  try {
    if (!isTauri) throw new Error('LSP requires Tauri runtime');
    await invoke<void>('lsp_did_open', { language, uri, languageId, content });
  } catch (error) {
    console.error('[lsp] failed to notify didOpen', error);
    throw error;
  }
}

/** Notify the LSP server that a document was changed */
export async function lspDidChange(
  language: string,
  uri: string,
  version: number,
  content: string,
): Promise<void> {
  try {
    if (!isTauri) throw new Error('LSP requires Tauri runtime');
    await invoke<void>('lsp_did_change', { language, uri, version, content });
  } catch (error) {
    console.error('[lsp] failed to notify didChange', error);
    throw error;
  }
}

/** Notify the LSP server that a document was closed */
export async function lspDidClose(language: string, uri: string): Promise<void> {
  try {
    if (!isTauri) throw new Error('LSP requires Tauri runtime');
    await invoke<void>('lsp_did_close', { language, uri });
  } catch (error) {
    console.error('[lsp] failed to notify didClose', error);
    throw error;
  }
}

// ============================================================================
// Code Intelligence
// ============================================================================

/** Get completion items at a position */
export async function lspCompletion(
  language: string,
  uri: string,
  line: number,
  character: number,
): Promise<CompletionItem[]> {
  try {
    if (!isTauri) throw new Error('LSP requires Tauri runtime');
    return await invoke<CompletionItem[]>('lsp_completion', {
      language,
      uri,
      line,
      character,
    });
  } catch (error) {
    console.error('[lsp] failed to get completions', error);
    throw error;
  }
}

/** Get hover information at a position */
export async function lspHover(
  language: string,
  uri: string,
  line: number,
  character: number,
): Promise<HoverResult | null> {
  try {
    if (!isTauri) throw new Error('LSP requires Tauri runtime');
    return await invoke<HoverResult | null>('lsp_hover', {
      language,
      uri,
      line,
      character,
    });
  } catch (error) {
    console.error('[lsp] failed to get hover', error);
    throw error;
  }
}

/** Go to definition at a position */
export async function lspDefinition(
  language: string,
  uri: string,
  line: number,
  character: number,
): Promise<LSPLocation[]> {
  try {
    if (!isTauri) throw new Error('LSP requires Tauri runtime');
    return await invoke<LSPLocation[]>('lsp_definition', {
      language,
      uri,
      line,
      character,
    });
  } catch (error) {
    console.error('[lsp] failed to get definition', error);
    throw error;
  }
}

/** Find all references at a position */
export async function lspReferences(
  language: string,
  uri: string,
  line: number,
  character: number,
): Promise<LSPLocation[]> {
  try {
    if (!isTauri) throw new Error('LSP requires Tauri runtime');
    return await invoke<LSPLocation[]>('lsp_references', {
      language,
      uri,
      line,
      character,
    });
  } catch (error) {
    console.error('[lsp] failed to find references', error);
    throw error;
  }
}

/** Rename symbol at a position */
export async function lspRename(
  language: string,
  uri: string,
  line: number,
  character: number,
  newName: string,
): Promise<WorkspaceEdit | null> {
  try {
    if (!isTauri) throw new Error('LSP requires Tauri runtime');
    return await invoke<WorkspaceEdit | null>('lsp_rename', {
      language,
      uri,
      line,
      character,
      newName,
    });
  } catch (error) {
    console.error('[lsp] failed to rename', error);
    throw error;
  }
}

/** Format a document */
export async function lspFormatting(language: string, uri: string): Promise<TextEdit[]> {
  try {
    if (!isTauri) throw new Error('LSP requires Tauri runtime');
    return await invoke<TextEdit[]>('lsp_formatting', { language, uri });
  } catch (error) {
    console.error('[lsp] failed to format document', error);
    throw error;
  }
}

/** Search for workspace symbols */
export async function lspWorkspaceSymbol(
  language: string,
  query: string,
): Promise<WorkspaceSymbol[]> {
  try {
    if (!isTauri) throw new Error('LSP requires Tauri runtime');
    return await invoke<WorkspaceSymbol[]>('lsp_workspace_symbol', { language, query });
  } catch (error) {
    console.error('[lsp] failed to search workspace symbols', error);
    throw error;
  }
}

/** Get code actions for a range and set of diagnostics */
export async function lspCodeAction(
  language: string,
  uri: string,
  range: LSPRange,
  diagnostics: LSPDiagnostic[],
): Promise<CodeAction[]> {
  try {
    if (!isTauri) throw new Error('LSP requires Tauri runtime');
    return await invoke<CodeAction[]>('lsp_code_action', {
      language,
      uri,
      range,
      diagnostics,
    });
  } catch (error) {
    console.error('[lsp] failed to get code actions', error);
    throw error;
  }
}

// ============================================================================
// Diagnostics
// ============================================================================

/** Get diagnostics for a specific file URI */
export async function lspGetDiagnostics(language: string, uri: string): Promise<LSPDiagnostic[]> {
  try {
    if (!isTauri) throw new Error('LSP requires Tauri runtime');
    return await invoke<LSPDiagnostic[]>('lsp_get_diagnostics', { language, uri });
  } catch (error) {
    console.error('[lsp] failed to get diagnostics', error);
    throw error;
  }
}

/** Get all diagnostics across all open files */
export async function lspGetAllDiagnostics(
  language: string,
): Promise<Record<string, LSPDiagnostic[]>> {
  try {
    if (!isTauri) throw new Error('LSP requires Tauri runtime');
    return await invoke<Record<string, LSPDiagnostic[]>>('lsp_get_all_diagnostics', {
      language,
    });
  } catch (error) {
    console.error('[lsp] failed to get all diagnostics', error);
    throw error;
  }
}
