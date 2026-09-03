import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { describeRejection, safeResolveWorkspacePath } from '../../utils/pathSafety';
import { buildInstructionContextSnapshot, type InstructionContextSnapshot } from '../instructions';

const GROUP_INSTRUCTIONS = 'instructions';
const GROUP_PINNED = 'pinned';
const GROUP_AUTO = 'auto';

export type WorkspaceContextFileResult =
  | { ok: true; uri: vscode.Uri }
  | { ok: false; message: string };

export async function validateWorkspaceContextFile(
  uri: vscode.Uri,
): Promise<WorkspaceContextFileResult> {
  if (uri.scheme !== 'file') {
    return { ok: false, message: 'Only local workspace files can be added to context.' };
  }
  const resolved = await safeResolveWorkspacePath(uri.fsPath, { allowAbsolute: true });
  if (!resolved.ok) {
    return {
      ok: false,
      message:
        resolved.reason === 'traversal'
          ? 'Path is not inside any open workspace folder.'
          : describeRejection(resolved.reason),
    };
  }

  try {
    const stat = await vscode.workspace.fs.stat(resolved.uri);
    if ((stat.type & vscode.FileType.File) === 0) {
      return {
        ok: false,
        message: 'Choose a file. Folder context is not supported by the local runtime.',
      };
    }
  } catch {
    return { ok: false, message: 'The selected workspace file could not be read.' };
  }
  return { ok: true, uri: resolved.uri };
}

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
    this.accessibilityInformation = {
      label: `${path.basename(filePath)}, ${isPinned ? 'pinned' : isActive ? 'active' : 'context'} file`,
      role: 'treeitem',
    };
    this.command = {
      command: 'vscode.open',
      title: 'Open',
      arguments: [vscode.Uri.file(filePath)],
    };
  }
}

class ContextGroupItem extends vscode.TreeItem {
  constructor(
    public readonly groupId: typeof GROUP_INSTRUCTIONS | typeof GROUP_PINNED | typeof GROUP_AUTO,
    count: number,
  ) {
    const label =
      groupId === GROUP_INSTRUCTIONS
        ? `Instructions (${count})`
        : groupId === GROUP_PINNED
          ? `Pinned Files (${count})`
          : `Auto-detected (${count})`;
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = `group-${groupId}`;
    this.iconPath = new vscode.ThemeIcon(
      groupId === GROUP_INSTRUCTIONS ? 'book' : groupId === GROUP_PINNED ? 'pin' : 'search',
    );
    this.accessibilityInformation = {
      label,
      role: 'treeitem',
    };
  }
}

class InstructionContextItem extends vscode.TreeItem {
  constructor(
    label: string,
    description: string,
    tooltip: string,
    command: vscode.Command,
    icon: string,
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description;
    this.tooltip = tooltip;
    this.command = command;
    this.contextValue = 'instructionContext';
    this.iconPath = new vscode.ThemeIcon(icon);
    this.accessibilityInformation = {
      label: `${label}, ${description}`,
      role: 'treeitem',
    };
  }
}

type ContextTreeNode = ContextGroupItem | ContextItem | InstructionContextItem;

export class ContextPanelProvider
  implements vscode.TreeDataProvider<ContextTreeNode>, vscode.Disposable
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    ContextTreeNode | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly _pinnedFiles: Set<string> = new Set();
  private _autoFiles: Map<string, { languageId: string; isActive: boolean }> = new Map();
  private _instructionContext: InstructionContextSnapshot | undefined;
  private _disposed = false;

  constructor(private readonly _extensionContext?: vscode.ExtensionContext) {
    this._refreshAutoFiles();
    void this.refreshInstructionContext();
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
    void this.refreshInstructionContext();
  }

  async refreshInstructionContext(): Promise<void> {
    if (this._extensionContext === undefined || this._disposed) return;
    try {
      this._instructionContext = await buildInstructionContextSnapshot(this._extensionContext);
      if (!this._disposed) this._onDidChangeTreeData.fire();
    } catch {
      this._instructionContext = undefined;
      if (!this._disposed) this._onDidChangeTreeData.fire();
    }
  }

  getTreeItem(element: ContextTreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ContextTreeNode): ContextTreeNode[] {
    if (element === undefined) {
      const instructionCount =
        (this._instructionContext?.effectiveScope === 'none' ? 0 : 1) +
        (this._instructionContext?.projectSources.length ?? 0);
      const groups: ContextGroupItem[] = [
        new ContextGroupItem(GROUP_INSTRUCTIONS, instructionCount),
        new ContextGroupItem(GROUP_PINNED, this._pinnedFiles.size),
      ];
      if (this._autoFiles.size > 0)
        groups.push(new ContextGroupItem(GROUP_AUTO, this._autoFiles.size));
      return groups;
    }
    if (element instanceof ContextGroupItem) {
      if (element.groupId === GROUP_INSTRUCTIONS) return this._buildInstructionItems();
      return element.groupId === GROUP_PINNED ? this._buildPinnedItems() : this._buildAutoItems();
    }
    return [];
  }

  dispose(): void {
    this._disposed = true;
    this._onDidChangeTreeData.dispose();
  }

  private _buildInstructionItems(): InstructionContextItem[] {
    const snapshot = this._instructionContext;
    if (snapshot === undefined) {
      return [
        new InstructionContextItem(
          'Custom instructions',
          'Configure',
          'Open Personalization to add host-wide or workspace-specific custom instructions.',
          {
            command: 'agi-workforce.openSettings',
            title: 'Open Personalization',
            arguments: ['personalization'],
          },
          'settings-gear',
        ),
      ];
    }

    const items: InstructionContextItem[] = [];
    if (snapshot.effectiveScope !== 'none') {
      const scopeLabel =
        snapshot.effectiveScope === 'workspace' ? 'Workspace override' : 'Host default';
      items.push(
        new InstructionContextItem(
          'Custom instructions',
          `${scopeLabel} · ${snapshot.effective.length} chars`,
          snapshot.turnPrelude,
          {
            command: 'agi-workforce.openSettings',
            title: 'Edit Custom Instructions',
            arguments: ['personalization'],
          },
          'person',
        ),
      );
    }

    for (const source of snapshot.projectSources) {
      items.push(
        new InstructionContextItem(
          source.fileName,
          source.truncated ? 'Runtime source · preview truncated' : 'Runtime source',
          source.content,
          {
            command: 'vscode.open',
            title: 'Open Project Instructions',
            arguments: [vscode.Uri.file(source.path)],
          },
          'repo',
        ),
      );
    }

    if (items.length === 0) {
      items.push(
        new InstructionContextItem(
          'No active instructions',
          'Configure',
          'No custom or project instruction source is active for this workspace.',
          {
            command: 'agi-workforce.openSettings',
            title: 'Open Personalization',
            arguments: ['personalization'],
          },
          'circle-slash',
        ),
      );
    }
    return items;
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

let _contextPanelInstance: ContextPanelProvider | undefined;

export function setContextPanelInstance(instance: ContextPanelProvider): void {
  _contextPanelInstance = instance;
}

export function getContextPanelProvider(): ContextPanelProvider | undefined {
  return _contextPanelInstance;
}
