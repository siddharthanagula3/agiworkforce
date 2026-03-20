/**
 * LSP API — typed wrappers for lsp_* Tauri commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface LSPServer {
  language: string;
  status: string;
  pid?: number;
}
export interface CompletionItem {
  label: string;
  kind?: number;
  detail?: string;
  insertText?: string;
}
export interface Hover {
  contents: string;
  range?: Range;
}
export interface Location {
  uri: string;
  range: Range;
}
export interface Range {
  start: Position;
  end: Position;
}
export interface Position {
  line: number;
  character: number;
}
export interface WorkspaceEdit {
  changes: Record<string, TextEdit[]>;
}
export interface TextEdit {
  range: Range;
  newText: string;
}
export interface WorkspaceSymbol {
  name: string;
  kind: number;
  location: Location;
}
export interface CodeAction {
  title: string;
  kind?: string;
  edit?: WorkspaceEdit;
}
export interface Diagnostic {
  range: Range;
  message: string;
  severity?: number;
  source?: string;
}

// ---- Commands ----

export async function lspStartServer(language: string, rootPath: string): Promise<LSPServer> {
  return command<LSPServer>('lsp_start_server', { language, rootPath });
}
export async function lspStopServer(language: string): Promise<void> {
  return command<void>('lsp_stop_server', { language });
}
export async function lspDidOpen(
  language: string,
  uri: string,
  languageId: string,
  content: string,
): Promise<void> {
  return command<void>('lsp_did_open', { language, uri, languageId, content });
}
export async function lspCompletion(
  language: string,
  uri: string,
  line: number,
  character: number,
): Promise<CompletionItem[]> {
  return command<CompletionItem[]>('lsp_completion', { language, uri, line, character });
}
export async function lspHover(
  language: string,
  uri: string,
  line: number,
  character: number,
): Promise<Hover | null> {
  return command<Hover | null>('lsp_hover', { language, uri, line, character });
}
export async function lspDefinition(
  language: string,
  uri: string,
  line: number,
  character: number,
): Promise<Location[]> {
  return command<Location[]>('lsp_definition', { language, uri, line, character });
}
export async function lspReferences(
  language: string,
  uri: string,
  line: number,
  character: number,
): Promise<Location[]> {
  return command<Location[]>('lsp_references', { language, uri, line, character });
}
export async function lspDidChange(
  language: string,
  uri: string,
  version: number,
  content: string,
): Promise<void> {
  return command<void>('lsp_did_change', { language, uri, version, content });
}
export async function lspDidClose(language: string, uri: string): Promise<void> {
  return command<void>('lsp_did_close', { language, uri });
}
export async function lspRename(
  language: string,
  uri: string,
  line: number,
  character: number,
  newName: string,
): Promise<WorkspaceEdit | null> {
  return command<WorkspaceEdit | null>('lsp_rename', { language, uri, line, character, newName });
}
export async function lspFormatting(language: string, uri: string): Promise<TextEdit[]> {
  return command<TextEdit[]>('lsp_formatting', { language, uri });
}
export async function lspWorkspaceSymbol(
  language: string,
  query: string,
): Promise<WorkspaceSymbol[]> {
  return command<WorkspaceSymbol[]>('lsp_workspace_symbol', { language, query });
}
export async function lspCodeAction(
  language: string,
  uri: string,
  range: Range,
  diagnostics: Diagnostic[],
): Promise<CodeAction[]> {
  return command<CodeAction[]>('lsp_code_action', { language, uri, range, diagnostics });
}
export async function lspGetDiagnostics(language: string, uri: string): Promise<Diagnostic[]> {
  return command<Diagnostic[]>('lsp_get_diagnostics', { language, uri });
}
export async function lspGetAllDiagnostics(
  language: string,
): Promise<Record<string, Diagnostic[]>> {
  return command<Record<string, Diagnostic[]>>('lsp_get_all_diagnostics', { language });
}
export async function lspListServers(): Promise<string[]> {
  return command<string[]>('lsp_list_servers');
}
export async function lspDetectLanguage(filePath: string): Promise<string> {
  return command<string>('lsp_detect_language', { filePath });
}
