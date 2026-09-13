import * as vscode from 'vscode';
import { getContextBuilder } from './contextBuilder';
import { CONTEXT_ATTACHMENT_KINDS, type ContextAttachmentKind } from '../protocol/webviewMessages';

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
  }
}
