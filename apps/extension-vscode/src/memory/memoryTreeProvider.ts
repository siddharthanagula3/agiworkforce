
import * as vscode from 'vscode';
import { type MemoryFact, loadFacts, onMemoryDidChange } from './memoryStore';

const MAX_LABEL_CHARS = 60;

export class MemoryFactItem extends vscode.TreeItem {
  constructor(public readonly fact: MemoryFact) {
    const label =
      fact.text.length > MAX_LABEL_CHARS ? `${fact.text.slice(0, MAX_LABEL_CHARS)}…` : fact.text;

    super(label, vscode.TreeItemCollapsibleState.None);

    const createdLabel = `Created: ${new Date(fact.createdAt).toLocaleString()}`;
    const updatedLabel =
      fact.updatedAt !== undefined && fact.updatedAt !== fact.createdAt
        ? `\nUpdated: ${new Date(fact.updatedAt).toLocaleString()}`
        : '';
    const tooltip = new vscode.MarkdownString(
      `**${fact.category ?? 'fact'} memory**\n\n${fact.text}\n\n---\n${createdLabel}${updatedLabel}`,
    );
    tooltip.isTrusted = false;
    this.tooltip = tooltip;

    this.iconPath = new vscode.ThemeIcon('book');
    this.contextValue = 'memoryFact';
    this.accessibilityInformation = { label: fact.text, role: 'treeitem' };
  }
}

export class MemoryTreeProvider implements vscode.TreeDataProvider<MemoryFactItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    MemoryFactItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly _storeChangeDisposable: vscode.Disposable;

  constructor(private readonly workspaceState: vscode.ExtensionContext['workspaceState']) {
    this._storeChangeDisposable = onMemoryDidChange(() => {
      this._onDidChangeTreeData.fire();
    });
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: MemoryFactItem): vscode.TreeItem {
    return element;
  }

  getChildren(_element?: MemoryFactItem): MemoryFactItem[] {
    if (_element !== undefined) return [];
    return loadFacts(this.workspaceState).map((f) => new MemoryFactItem(f));
  }

  dispose(): void {
    this._storeChangeDisposable.dispose();
    this._onDidChangeTreeData.dispose();
  }
}
