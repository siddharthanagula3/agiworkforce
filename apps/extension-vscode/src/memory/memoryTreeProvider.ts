
import * as vscode from 'vscode';
import { type MemoryFact, loadFacts, onMemoryDidChange } from './memoryStore';
import { Config } from '../platform/config';

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

export class MemoryDisabledItem extends vscode.TreeItem {
  constructor() {
    super('Memory is off', vscode.TreeItemCollapsibleState.None);
    this.description = 'Saved facts are not sent with your turns';
    this.tooltip = 'Turn memory on to include these facts with chat turns.';
    this.iconPath = new vscode.ThemeIcon('circle-slash');
    this.contextValue = 'memoryDisabled';
    this.command = {
      command: 'agi-workforce.memory.toggle',
      title: 'Turn memory on',
    };
  }
}

export class MemoryTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    vscode.TreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly _storeChangeDisposable: vscode.Disposable;
  private readonly _configChangeDisposable: vscode.Disposable;

  constructor(private readonly workspaceState: vscode.ExtensionContext['workspaceState']) {
    this._storeChangeDisposable = onMemoryDidChange(() => {
      this._onDidChangeTreeData.fire();
    });
    this._configChangeDisposable = vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('agiWorkforce.memory.enabled')) {
        this._onDidChangeTreeData.fire();
      }
    });
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    if (element !== undefined) return [];
    const facts = loadFacts(this.workspaceState).map((f) => new MemoryFactItem(f));
    return Config.memoryEnabled() ? facts : [new MemoryDisabledItem(), ...facts];
  }

  dispose(): void {
    this._configChangeDisposable.dispose();
    this._storeChangeDisposable.dispose();
    this._onDidChangeTreeData.dispose();
  }
}
