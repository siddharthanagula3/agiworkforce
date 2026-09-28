import * as vscode from 'vscode';
import { getContextBuilder } from './contextBuilder';
import { CONTEXT_ATTACHMENT_KINDS, type ContextAttachmentKind } from '../protocol/webviewMessages';
import { Config } from '../platform/config';
import { MAX_TOTAL_REFERENCE_CHARS } from '../features/chat-participant/promptReferences';

export interface ContextMenuItemState {
  kind: ContextAttachmentKind;
  available: boolean;
  detail: string;
}

export interface ContextAttachment {
  name: string;
  text: string;
}

const MAX_LISTED_FILES = 60;
const CLEAN_TREE_PREFIX = 'Git: clean working tree';

function selectionRange(editor: vscode.TextEditor): string {
  const from = editor.selection.start.line + 1;
  const to = editor.selection.end.line + 1;
  return from === to ? `${from}` : `${from}-${to}`;
}

function activeSelection(): { name: string; text: string } | undefined {
  const editor = vscode.window.activeTextEditor;
  if (editor === undefined || editor.selection.isEmpty) return undefined;
  const context = getContextBuilder().getActiveFileContext();
  if (context === undefined || context.selectedText.trim() === '') return undefined;
  return {
    name: `${context.relativePath}:${selectionRange(editor)}`,
    text: `Selected from ${context.relativePath} (${context.languageId}), lines ${selectionRange(editor)}:\n${context.selectedText}`,
  };
}

function openFiles(): { name: string; text: string; count: number } {
  const entries = getContextBuilder().getOpenFilesContext();
  const listed = entries.slice(0, MAX_LISTED_FILES);
  const overflow = entries.length - listed.length;
  const lines = listed.map(
    (entry) => `- ${entry.relativePath}${entry.isActive ? ' (active editor)' : ''}`,
  );
  if (overflow > 0) lines.push(`- ... and ${overflow} more`);
  return {
    name: `${entries.length} open editors`,
    text: `Files open in this window:\n${lines.join('\n')}`,
    count: entries.length,
  };
}

function problems(): { name: string; text: string; count: number; file: string } {
  const entries = getContextBuilder().getDiagnosticsContext();
  const file = vscode.window.activeTextEditor?.document.uri;
  const relativePath = file === undefined ? '' : vscode.workspace.asRelativePath(file);
  const lines = entries.map(
    (entry) =>
      `- ${entry.severity} at ${relativePath}:${entry.line}:${entry.column}${entry.source === '' ? '' : ` (${entry.source})`}: ${entry.message}`,
  );
  return {
    name: `${entries.length} problems in ${relativePath}`,
    text: `Errors and warnings reported in ${relativePath}:\n${lines.join('\n')}`,
    count: entries.length,
    file: relativePath,
  };
}

async function gitChanges(): Promise<{ name: string; text: string } | undefined> {
  if (!vscode.workspace.isTrusted) return undefined;
  const context = await getContextBuilder().getGitContext();
  if (context === '' || context.startsWith(CLEAN_TREE_PREFIX)) return undefined;
  return { name: 'Git changes', text: context };
}

function gitDetail(trusted: boolean, changes: { name: string } | undefined): string {
  if (!trusted) return 'Trust this workspace to read git';
  return changes === undefined ? 'No uncommitted changes' : 'Status and diff of the working tree';
}

const HTML_BLOCK_TAGS = /<\/(?:p|div|li|h[1-6]|tr|section|article|header|footer)>|<br\s*\/?>/giu;
const HTML_DROPPED = /<(script|style|noscript|svg)[\s\S]*?<\/\1>/giu;

function pageText(html: string): string {
  return html
    .replace(HTML_DROPPED, ' ')
    .replace(HTML_BLOCK_TAGS, '\n')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/[ \t]+/gu, ' ')
    .replace(/\s*\n\s*/gu, '\n')
    .trim();
}

async function webPage(): Promise<ContextAttachment | undefined> {
  const input = await vscode.window.showInputBox({
    title: 'AGI Workforce, Attach a web page',
    prompt: 'The page is read once now and its text is attached to your next message',
    placeHolder: 'https://',
    ignoreFocusOut: true,
    validateInput: (value) => {
      try {
        const url = new URL(value.trim());
        return url.protocol === 'https:' || url.protocol === 'http:'
          ? null
          : 'Use an http or https link.';
      } catch {
        return 'Paste a full link, starting with https://';
      }
    },
  });
  if (input === undefined || input.trim() === '') return undefined;
  const url = input.trim();
  try {
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) throw new Error(`the page answered HTTP ${response.status}`);
    const type = response.headers.get('content-type') ?? '';
    const body = await response.text();
    const text = type.includes('html') ? pageText(body) : body;
    const clipped =
      text.length > MAX_TOTAL_REFERENCE_CHARS
        ? `${text.slice(0, MAX_TOTAL_REFERENCE_CHARS)}\n... (truncated)`
        : text;
    return { name: new URL(url).host, text: `Content of ${url}:\n${clipped}` };
  } catch (error) {
    void vscode.window.showErrorMessage(
      `AGI Workforce: ${url} could not be read, ${error instanceof Error ? error.message : String(error)}.`,
    );
    return undefined;
  }
}

export async function resolveContextMenuState(): Promise<ContextMenuItemState[]> {
  const selection = activeSelection();
  const editors = openFiles();
  const reported = problems();
  const trusted = vscode.workspace.isTrusted;
  const changes = await gitChanges();

  const details: Record<ContextAttachmentKind, ContextMenuItemState> = {
    selection: {
      kind: 'selection',
      available: selection !== undefined,
      detail: selection === undefined ? 'Select code in an editor first' : selection.name,
    },
    'open-files': {
      kind: 'open-files',
      available: editors.count > 0,
      detail: editors.count === 0 ? 'No editors are open' : editors.name,
    },
    problems: {
      kind: 'problems',
      available: reported.count > 0,
      detail:
        reported.count === 0
          ? reported.file === ''
            ? 'Open a file to read its problems'
            : `No errors or warnings in ${reported.file}`
          : reported.name,
    },
    'git-diff': {
      kind: 'git-diff',
      available: trusted && changes !== undefined,
      detail: gitDetail(trusted, changes),
    },
    url: {
      kind: 'url',
      available: true,
      detail: 'Read a page by its link and attach its text',
    },
  };

  return CONTEXT_ATTACHMENT_KINDS.map((kind) => details[kind]);
}

export async function buildContextAttachment(
  kind: ContextAttachmentKind,
): Promise<ContextAttachment | undefined> {
  switch (kind) {
    case 'selection':
      return activeSelection();
    case 'open-files': {
      const editors = openFiles();
      return editors.count === 0 ? undefined : { name: editors.name, text: editors.text };
    }
    case 'problems': {
      const reported = problems();
      return reported.count === 0 ? undefined : { name: reported.name, text: reported.text };
    }
    case 'git-diff':
      return gitChanges();
    case 'url':
      return webPage();
  }
}

export type EditorContextChipKind = 'active-file' | 'selection' | 'problems';

export interface EditorContextChip {
  id: string;
  kind: EditorContextChipKind;
  label: string;
}

export interface EditorContextSnapshot {
  chips: EditorContextChip[];
  contextFiles: string[];
  texts: string[];
}

const EMPTY_EDITOR_CONTEXT: EditorContextSnapshot = { chips: [], contextFiles: [], texts: [] };

export function editorContextChipId(kind: EditorContextChipKind, relativePath: string): string {
  return `${kind}:${relativePath}`;
}

function basename(relativePath: string): string {
  const separator = Math.max(relativePath.lastIndexOf('/'), relativePath.lastIndexOf('\\'));
  return separator === -1 ? relativePath : relativePath.slice(separator + 1);
}

function unsavedBuffer(relativePath: string, languageId: string): string | undefined {
  const document = vscode.window.activeTextEditor?.document;
  if (document === undefined || (!document.isDirty && !document.isUntitled)) return undefined;
  const text = document.getText();
  const clipped =
    text.length > MAX_TOTAL_REFERENCE_CHARS
      ? `${text.slice(0, MAX_TOTAL_REFERENCE_CHARS)}\n... (truncated)`
      : text;
  const state = document.isUntitled ? 'Unsaved new file' : 'Unsaved edits in';
  return `${state} ${relativePath} (${languageId}), as it is in the editor now:\n${clipped}`;
}

export function resolveEditorContext(dismissed: ReadonlySet<string>): EditorContextSnapshot {
  if (!Config.editorContextAutoAttach()) return EMPTY_EDITOR_CONTEXT;
  const context = getContextBuilder().getActiveFileContext();
  if (context === undefined) return EMPTY_EDITOR_CONTEXT;

  const snapshot: EditorContextSnapshot = { chips: [], contextFiles: [], texts: [] };
  const fileId = editorContextChipId('active-file', context.relativePath);
  if (!dismissed.has(fileId)) {
    snapshot.chips.push({
      id: fileId,
      kind: 'active-file',
      label: basename(context.relativePath),
    });
    const buffer = unsavedBuffer(context.relativePath, context.languageId);
    if (buffer === undefined) snapshot.contextFiles.push(context.filePath);
    else snapshot.texts.push(buffer);
  }

  const selection = activeSelection();
  const selectionId = editorContextChipId('selection', context.relativePath);
  if (selection !== undefined && !dismissed.has(selectionId)) {
    snapshot.chips.push({
      id: selectionId,
      kind: 'selection',
      label: `${basename(selection.name)} selection`,
    });
    snapshot.texts.push(selection.text);
  }

  const reported = problems();
  const problemsId = editorContextChipId('problems', context.relativePath);
  if (reported.count > 0 && !dismissed.has(problemsId)) {
    snapshot.chips.push({
      id: problemsId,
      kind: 'problems',
      label: `${reported.count} problem${reported.count === 1 ? '' : 's'}`,
    });
    snapshot.texts.push(reported.text);
  }

  return snapshot;
}
