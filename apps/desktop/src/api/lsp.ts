
import { invoke, isTauri } from '../lib/tauri-mock';

export interface LSPServer {
  language: string;
  command: string;
  args: string[];
  rootUri: string;
  initialized: boolean;
}

export interface LSPPosition {
  line: number;
  character: number;
}

export interface LSPRange {
  start: LSPPosition;
  end: LSPPosition;
}

export interface LSPLocation {
  uri: string;
  range: LSPRange;
}

export interface CompletionItem {
  label: string;
  kind: number;
  detail?: string;
  documentation?: string;
  insertText?: string;
}

export interface HoverResult {
  contents: string;
  range?: LSPRange;
}

export interface LSPDiagnostic {
  range: LSPRange;
  severity: number;
  message: string;
  source?: string;
  code?: string;
}

export interface WorkspaceSymbol {
  name: string;
  kind: number;
  location: LSPLocation;
  containerName?: string;
}

export interface TextEdit {
  range: LSPRange;
  newText: string;
}

export interface CodeAction {
  title: string;
  kind?: string;
  diagnostics?: LSPDiagnostic[];
  edit?: WorkspaceEdit;
}

export interface WorkspaceEdit {
  changes?: Record<string, TextEdit[]>;
}

export async function lspStartServer(language: string, rootPath: string): Promise<LSPServer> {
  try {
    if (!isTauri) throw new Error('LSP requires Tauri runtime');
    return await invoke<LSPServer>('lsp_start_server', { language, rootPath });
  } catch (error) {
    console.error('[lsp] failed to start server', error);
    throw error;
  }
}

export async function lspStopServer(language: string): Promise<void> {
  try {
    if (!isTauri) throw new Error('LSP requires Tauri runtime');
    await invoke<void>('lsp_stop_server', { language });
  } catch (error) {
    console.error('[lsp] failed to stop server', error);
    throw error;
  }
}

export async function lspListServers(): Promise<string[]> {
  try {
    if (!isTauri) throw new Error('LSP requires Tauri runtime');
    return await invoke<string[]>('lsp_list_servers');
  } catch (error) {
    console.error('[lsp] failed to list servers', error);
    throw error;
  }
}

export async function lspDetectLanguage(filePath: string): Promise<string> {
  try {
    if (!isTauri) throw new Error('LSP requires Tauri runtime');
    return await invoke<string>('lsp_detect_language', { filePath });
  } catch (error) {
    console.error('[lsp] failed to detect language', error);
    throw error;
  }
}

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

export async function lspDidClose(language: string, uri: string): Promise<void> {
  try {
    if (!isTauri) throw new Error('LSP requires Tauri runtime');
    await invoke<void>('lsp_did_close', { language, uri });
  } catch (error) {
    console.error('[lsp] failed to notify didClose', error);
    throw error;
  }
}

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

export async function lspFormatting(language: string, uri: string): Promise<TextEdit[]> {
  try {
    if (!isTauri) throw new Error('LSP requires Tauri runtime');
    return await invoke<TextEdit[]>('lsp_formatting', { language, uri });
  } catch (error) {
    console.error('[lsp] failed to format document', error);
    throw error;
  }
}

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

export async function lspGetDiagnostics(language: string, uri: string): Promise<LSPDiagnostic[]> {
  try {
    if (!isTauri) throw new Error('LSP requires Tauri runtime');
    return await invoke<LSPDiagnostic[]>('lsp_get_diagnostics', { language, uri });
  } catch (error) {
    console.error('[lsp] failed to get diagnostics', error);
    throw error;
  }
}

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
