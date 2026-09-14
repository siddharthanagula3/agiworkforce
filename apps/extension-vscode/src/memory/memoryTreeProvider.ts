import * as vscode from 'vscode';
import { type MemoryFact } from './memoryStore';
import type { AccountMemoryStatus, AccountMemoryStore } from './accountMemoryStore';
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

export class MemorySignedOutItem extends vscode.TreeItem {
  constructor() {
    super('Sign in to see your memory', vscode.TreeItemCollapsibleState.None);
    this.description = 'Memory lives in your AGI Cloud account';
    this.tooltip =
      'Your memory is shared with the web app, the CLI and mobile. Sign in to read and change it here.';
    this.iconPath = new vscode.ThemeIcon('account');
    this.contextValue = 'memorySignedOut';
    this.command = { command: 'agi-workforce.signIn', title: 'Sign in to AGI Cloud' };
  }
}

export class MemoryUnreachableItem extends vscode.TreeItem {
  constructor(detail: string) {
    super('Showing the memory this device already had', vscode.TreeItemCollapsibleState.None);
    this.description = 'Your account could not be reached';
    this.tooltip = detail;
    this.iconPath = new vscode.ThemeIcon('cloud-offline');
    this.contextValue = 'memoryUnreachable';
    this.command = { command: 'agi-workforce.memory.refresh', title: 'Retry' };
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
  private _status: AccountMemoryStatus = 'ready';
  private _detail = '';

  constructor(private readonly store: AccountMemoryStore) {
    this._storeChangeDisposable = store.onDidChange(() => {
      this._onDidChangeTreeData.fire();
    });
    this._configChangeDisposable = vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('agiWorkforce.memory.enabled')) {
        this._onDidChangeTreeData.fire();
      }
    });
  }

  /** Pull the account's memory, then redraw with whatever state that left. */
  async refresh(): Promise<void> {
    const state = await this.store.refresh();
    this._status = state.status;
    this._detail = state.detail ?? '';
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    if (element !== undefined) return [];
    if (this._status === 'signed-out') return [new MemorySignedOutItem()];
    const facts = this.store.cachedFacts().map((fact) => new MemoryFactItem(fact));
    const banners: vscode.TreeItem[] = [];
    if (this._status === 'unreachable') banners.push(new MemoryUnreachableItem(this._detail));
    if (!Config.memoryEnabled()) banners.push(new MemoryDisabledItem());
    return [...banners, ...facts];
  }

  dispose(): void {
    this._configChangeDisposable.dispose();
    this._storeChangeDisposable.dispose();
    this._onDidChangeTreeData.dispose();
  }
}
