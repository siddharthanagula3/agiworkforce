/**
 * What `@` offers in the composer: the workspace's files, and the symbols the
 * language servers already know about in them.
 *
 * A symbol resolves to the file and the lines it occupies, so it travels as an
 * ordinary workspace reference and the turn carries the declaration rather
 * than the whole file. Editors without a workspace symbol provider, which
 * includes several VS Code forks, answer with files alone instead of failing.
 */

import * as vscode from 'vscode';
import { type WorkspaceFileReference } from '../features/chat-participant/promptReferences';

export interface MentionTarget extends WorkspaceFileReference {
  label: string;
}

const FILE_RESULT_LIMIT = 15;
const SYMBOL_RESULT_LIMIT = 8;

function lineLabel(range: WorkspaceFileReference['range']): string {
  if (range === undefined) return '';
  if (range.startLine === range.endLine) return ` · line ${range.startLine + 1}`;
  const lastLine = range.endCharacter === 0 ? range.endLine : range.endLine + 1;
  return ` · lines ${range.startLine + 1}-${lastLine}`;
}

function selectionIn(uri: vscode.Uri): WorkspaceFileReference['range'] {
  const editor = vscode.window.activeTextEditor;
  if (editor === undefined) return undefined;
  if (editor.document.uri.toString() !== uri.toString()) return undefined;
  if (editor.selection.isEmpty) return undefined;
  return {
    startLine: editor.selection.start.line,
    startCharacter: editor.selection.start.character,
    endLine: editor.selection.end.line,
    endCharacter: editor.selection.end.character,
  };
}

async function fileMatches(query: string): Promise<MentionTarget[]> {
  const files = await vscode.workspace.findFiles(
    `**/*${query}*`,
    '**/node_modules/**',
    FILE_RESULT_LIMIT,
  );
  return files.map((uri) => {
    const path = vscode.workspace.asRelativePath(uri);
    const range = selectionIn(uri);
    return { path, label: `${path}${lineLabel(range)}`, ...(range === undefined ? {} : { range }) };
  });
}

function symbolKindLabel(kind: unknown): string {
  const names = vscode.SymbolKind as unknown as Record<number, string> | undefined;
  const name = typeof kind === 'number' && names !== undefined ? names[kind] : undefined;
  return typeof name === 'string' ? name.toLowerCase() : 'symbol';
}

async function symbolMatches(query: string): Promise<MentionTarget[]> {
  let symbols: vscode.SymbolInformation[] | undefined;
  try {
    symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
      'vscode.executeWorkspaceSymbolProvider',
      query,
    );
  } catch {
    return [];
  }
  if (!Array.isArray(symbols)) return [];

  const targets: MentionTarget[] = [];
  for (const symbol of symbols) {
    const location = symbol.location as vscode.Location | undefined;
    if (location?.uri === undefined || location.range === undefined) continue;
    const path = vscode.workspace.asRelativePath(location.uri);
    const range = {
      startLine: location.range.start.line,
      startCharacter: location.range.start.character,
      endLine: location.range.end.line,
      endCharacter: location.range.end.character,
    };
    targets.push({
      path,
      range,
      label: `${symbol.name} · ${symbolKindLabel(symbol.kind)} · ${path}${lineLabel(range)}`,
    });
    if (targets.length === SYMBOL_RESULT_LIMIT) break;
  }
  return targets;
}

export async function searchMentionTargets(query: string): Promise<MentionTarget[]> {
  const [symbols, files] = await Promise.all([
    symbolMatches(query).catch(() => [] as MentionTarget[]),
    fileMatches(query).catch(() => [] as MentionTarget[]),
  ]);
  const seen = new Set<string>();
  const targets: MentionTarget[] = [];
  for (const target of [...symbols, ...files]) {
    const key = `${target.path}#${target.range?.startLine ?? ''}:${target.range?.endLine ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push(target);
  }
  return targets;
}
