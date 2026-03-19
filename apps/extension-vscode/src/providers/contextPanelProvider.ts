/**
 * contextPanelProvider.ts — TreeDataProvider for the AI Context panel
 *
 * Shows pinned files + auto-detected open tabs as context for AI requests.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const GROUP_PINNED = 'pinned';
const GROUP_AUTO = 'auto';

export class ContextItem extends vscode.TreeItem {
  constructor(
    public readonly filePath: string,
    public readonly isPinned: boolean,
    fileSize: number,
    languageId: string,
    isActive: boolean = false,
  ) {
    super(path.basename(filePath), vscode.TreeItemCollapsibleState.None);

    const sizeLabel = formatFileSize(fileSize);
    this.description = `${languageId}, ${sizeLabel}`;
    this.tooltip = `${vscode.workspace.asRelativePath(filePath)} (${languageId}, ${sizeLabel})`;
    this.contextValue = isPinned ? 'pinnedFile' : 'autoFile';
    this.iconPath = new vscode.ThemeIcon(isPinned ? 'pinned' : isActive ? 'circle-filled' : 'file');
    this.command = {
      command: 'vscode.open',
      title: 'Open',
      arguments: [vscode.Uri.file(filePath)],
    };
  }
}

class ContextGroupItem extends vscode.TreeItem {
  constructor(
    public readonly groupId: typeof GROUP_PINNED | typeof GROUP_AUTO,
    count: number,
  ) {
    const label = groupId === GROUP_PINNED ? `Pinned Files (${count})` : `Auto-detected (${count})`;
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = `group-${groupId}`;
    this.iconPath = new vscode.ThemeIcon(groupId === GROUP_PINNED ? 'pin' : 'search');
  }
}

type ContextTreeNode = ContextGroupItem | ContextItem;

export class ContextPanelProvider
  implements vscode.TreeDataProvider<ContextTreeNode>, vscode.Disposable
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    ContextTreeNode | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly _pinnedFiles: Set<string> = new Set();
  private _autoFiles: Map<string, { languageId: string; isActive: boolean }> = new Map();

  constructor() {
    this._refreshAutoFiles();
  }

  addFile(uri: vscode.Uri): void {
    if (this._pinnedFiles.has(uri.fsPath)) return;
    this._pinnedFiles.add(uri.fsPath);
    this._onDidChangeTreeData.fire();
  }

  removeFile(uri: vscode.Uri): void {
    if (this._pinnedFiles.delete(uri.fsPath)) {
      this._onDidChangeTreeData.fire();
    }
  }

  clearAll(): void {
    this._pinnedFiles.clear();
    this._onDidChangeTreeData.fire();
  }

  getContextFiles(): string[] {
    const result: string[] = [...this._pinnedFiles];
    for (const p of this._autoFiles.keys()) {
      if (!this._pinnedFiles.has(p)) result.push(p);
    }
    return result;
  }

  refreshAutoContext(): void {
    this._refreshAutoFiles();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ContextTreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ContextTreeNode): ContextTreeNode[] {
    if (element === undefined) {
      const groups: ContextGroupItem[] = [
        new ContextGroupItem(GROUP_PINNED, this._pinnedFiles.size),
      ];
      if (this._autoFiles.size > 0)
        groups.push(new ContextGroupItem(GROUP_AUTO, this._autoFiles.size));
      return groups;
    }
    if (element instanceof ContextGroupItem) {
      return element.groupId === GROUP_PINNED ? this._buildPinnedItems() : this._buildAutoItems();
    }
    return [];
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }

  private _buildPinnedItems(): ContextItem[] {
    return [...this._pinnedFiles].map((fp) => {
      const { size, languageId } = this._getFileMeta(fp);
      return new ContextItem(fp, true, size, languageId, false);
    });
  }

  private _buildAutoItems(): ContextItem[] {
    const items: ContextItem[] = [];
    for (const [fp, meta] of this._autoFiles) {
      if (this._pinnedFiles.has(fp)) continue;
      const { size, languageId } = this._getFileMeta(fp, meta.languageId);
      items.push(new ContextItem(fp, false, size, languageId, meta.isActive));
    }
    return items;
  }

  private _refreshAutoFiles(): void {
    const next = new Map<string, { languageId: string; isActive: boolean }>();
    const activeUri = vscode.window.activeTextEditor?.document.uri.toString();
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (!(tab.input instanceof vscode.TabInputText)) continue;
        const uri = tab.input.uri;
        if (uri.scheme !== 'file') continue;
        next.set(uri.fsPath, {
          languageId: inferLang(uri),
          isActive: uri.toString() === activeUri,
        });
      }
    }
    this._autoFiles = next;
  }

  private _getFileMeta(filePath: string, hint?: string): { size: number; languageId: string } {
    let size = 0;
    try {
      size = fs.statSync(filePath).size;
    } catch {
      /* virtual fs */
    }
    return { size, languageId: hint ?? inferLang(vscode.Uri.file(filePath)) };
  }
}

const LANG_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescriptreact',
  js: 'javascript',
  jsx: 'javascriptreact',
  py: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  cs: 'csharp',
  cpp: 'cpp',
  c: 'c',
  h: 'c',
  rb: 'ruby',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  md: 'markdown',
  html: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  sql: 'sql',
  sh: 'shellscript',
  bash: 'shellscript',
  toml: 'toml',
};

function inferLang(uri: vscode.Uri): string {
  const ext = uri.fsPath.split('.').pop()?.toLowerCase() ?? '';
  return LANG_MAP[ext] ?? (ext !== '' ? ext : 'plaintext');
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0B';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
