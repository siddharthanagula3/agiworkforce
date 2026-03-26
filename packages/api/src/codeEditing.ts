/**
 * Code Editing & Search API — typed wrappers for code_*, composer_*, grep_*, glob_*, format_* commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface CodeEdit {
  id: string;
  filePath: string;
  original: string;
  modified: string;
  instruction: string;
  status: string;
}
export interface ComposerSession {
  id: string;
  prompt: string;
  files: string[];
  edits: CodeEdit[];
  status: string;
}
export interface FileDiff {
  hunks: { oldStart: number; newStart: number; lines: string[] }[];
}
export interface FileChange {
  path: string;
  content: string;
  [key: string]: unknown;
}
export interface ApplyResult {
  applied: number;
  failed: number;
  errors: string[];
}
export interface RevertResult {
  reverted: number;
  errors: string[];
}
export interface GrepSearchResult {
  matches: { file: string; line: number; content: string }[];
  totalMatches: number;
}
export interface GlobSearchResult {
  files: string[];
  totalFiles: number;
}
export interface FormatResult {
  formatted: boolean;
  output?: string;
}
export interface FormatterInfo {
  formatter: string;
  available: boolean;
}

// ---- Code Editing ----

export async function codeGenerateEdit(
  filePath: string,
  selection: string,
  instruction: string,
): Promise<CodeEdit> {
  return command<CodeEdit>('code_generate_edit', { filePath, selection, instruction });
}
export async function codeApplyEdit(editId: string): Promise<void> {
  return command<void>('code_apply_edit', { editId });
}
export async function codeRejectEdit(editId: string): Promise<void> {
  return command<void>('code_reject_edit', { editId });
}
export async function composerStartSession(
  prompt: string,
  contextFiles: string[],
): Promise<ComposerSession> {
  return command<ComposerSession>('composer_start_session', { prompt, contextFiles });
}
export async function composerApplySession(sessionId: string): Promise<void> {
  return command<void>('composer_apply_session', { sessionId });
}
export async function composerGetSession(sessionId: string): Promise<ComposerSession> {
  return command<ComposerSession>('composer_get_session', { sessionId });
}
export async function codeListPendingEdits(): Promise<CodeEdit[]> {
  return command<CodeEdit[]>('code_list_pending_edits');
}
export async function getFileDiff(
  filePath: string,
  original: string,
  modified: string,
): Promise<FileDiff> {
  return command<FileDiff>('get_file_diff', { filePath, original, modified });
}
export async function applyChanges(changes: FileChange[]): Promise<ApplyResult> {
  return command<ApplyResult>('apply_changes', { changes });
}
export async function revertChanges(filePaths: string[]): Promise<RevertResult> {
  return command<RevertResult>('revert_changes', { filePaths });
}

// ---- Code Search ----

export async function grepSearch(
  pattern: string,
  root?: string,
  includePattern?: string,
  caseInsensitive?: boolean,
  outputMode?: string,
  contextLines?: number,
): Promise<GrepSearchResult> {
  return command<GrepSearchResult>('grep_search', {
    pattern,
    root,
    includePattern,
    caseInsensitive,
    outputMode,
    contextLines,
  });
}
export async function globSearch(
  pattern: string,
  root?: string,
  limit?: number,
): Promise<GlobSearchResult> {
  return command<GlobSearchResult>('glob_search', { pattern, root, limit });
}
export async function formatFile(path: string, projectRoot?: string): Promise<FormatResult> {
  return command<FormatResult>('format_file', { path, projectRoot });
}
export async function formatDetect(path: string, projectRoot?: string): Promise<FormatterInfo> {
  return command<FormatterInfo>('format_detect', { path, projectRoot });
}

// ---- Coding Checkpoints (Undo/Rewind) ----

export interface CodingCheckpoint {
  id: string;
  toolName: string;
  filePath?: string;
  createdAtMs: number;
  description?: string;
}

export async function codingCheckpointList(): Promise<CodingCheckpoint[]> {
  return command<CodingCheckpoint[]>('coding_checkpoint_list');
}

export async function codingCheckpointRewind(id: string): Promise<string[]> {
  return command<string[]>('coding_checkpoint_rewind', { id });
}
