import * as vscode from 'vscode';
import type { MemoryCategory } from '@agiworkforce/agent-core';
import { type MemoryFact } from './memoryStore';
import type { AccountMemoryStatus, AccountMemoryStore } from './accountMemoryStore';
import type { MemoryScope } from './accountMemoryClient';
import { Config } from '../platform/config';
import { getCloudWebOrigin } from '../utils/api';

const MAX_LABEL_CHARS = 60;

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  preference: 'Preferences',
  fact: 'Facts',
  decision: 'Decisions',
  context: 'Context',
  summary: 'Summaries',
  skill: 'Skills',
};

const SOURCE_LABELS: Record<string, string> = {
  vscode: 'VS Code',
  web: 'the web app',
  chat: 'a chat',
  cli: 'the CLI',
  mobile: 'mobile',
  desktop: 'the desktop app',
  import: 'an import',
};

function provenance(fact: MemoryFact): string {
  const source =
    fact.source === undefined ? undefined : (SOURCE_LABELS[fact.source] ?? fact.source);
  if (fact.sourceConversationTitle !== undefined) {
    return `Saved from the conversation “${fact.sourceConversationTitle}”${source === undefined ? '' : ` in ${source}`}`;
  }
  return source === undefined ? 'Source not recorded' : `Saved from ${source}`;
}

export class MemoryCategoryItem extends vscode.TreeItem {
  constructor(
    readonly category: MemoryCategory,
    readonly facts: readonly MemoryFact[],
  ) {
    super(CATEGORY_LABELS[category], vscode.TreeItemCollapsibleState.Expanded);
    this.id = `memory-category:${category}`;
    this.description = String(facts.length);
    this.iconPath = new vscode.ThemeIcon('folder-library');
    this.contextValue = 'memoryCategory';
    this.accessibilityInformation = {
      label: `${CATEGORY_LABELS[category]}, ${facts.length}`,
      role: 'treeitem',
    };
  }
}

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
      `${fact.text}\n\n---\n${provenance(fact)}\n\n${createdLabel}${updatedLabel}`,
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

const SCOPE_SEPARATION =
  'A memory written inside a workspace stays inside it. Nothing you record at work is read in a personal chat, and nothing personal is read at work.';

export class MemoryScopeItem extends vscode.TreeItem {
  constructor(scope: MemoryScope) {
    const workspace =
      scope.organizationId === null ? undefined : (scope.workspaceName ?? 'Your workspace');
    super(
      workspace === undefined ? 'Personal memory' : `${workspace} memory`,
      vscode.TreeItemCollapsibleState.None,
    );
    this.description =
      workspace === undefined
        ? 'Read in your personal chats on every device'
        : 'Workspace memory, kept apart from your personal memory';
    this.tooltip =
      workspace === undefined
        ? SCOPE_SEPARATION
        : `${SCOPE_SEPARATION} Switch workspaces in Team settings on the web.`;
    this.iconPath = new vscode.ThemeIcon(workspace === undefined ? 'account' : 'organization');
    this.contextValue = 'memoryScope';
    if (workspace !== undefined) {
      this.command = {
        command: 'vscode.open',
        title: 'Open Team settings',
        arguments: [vscode.Uri.parse(`${getCloudWebOrigin()}/settings/team?from=vscode-extension`)],
      };
    }
  }
}

function memorySurfacePlaceholder(scope: MemoryScope | undefined): string {
  if (scope === undefined) return 'Your account memory, shared with every AGI client…';
  if (scope.organizationId === null) return 'Your personal memory, kept apart from any workspace…';
  return `Memory for ${scope.workspaceName ?? 'your workspace'}, kept apart from your personal memory…`;
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

  surfacePlaceholder(): string {
    return memorySurfacePlaceholder(this.store.scope());
  }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    if (element instanceof MemoryCategoryItem) {
      return element.facts.map((fact) => new MemoryFactItem(fact));
    }
    if (element !== undefined) return [];
    if (this._status === 'signed-out') return [new MemorySignedOutItem()];
    const byCategory = new Map<MemoryCategory, MemoryFact[]>();
    for (const fact of this.store.cachedFacts()) {
      const category = fact.category ?? 'fact';
      byCategory.set(category, [...(byCategory.get(category) ?? []), fact]);
    }
    const groups = (Object.keys(CATEGORY_LABELS) as MemoryCategory[])
      .filter((category) => byCategory.has(category))
      .map((category) => new MemoryCategoryItem(category, byCategory.get(category) ?? []));
    const banners: vscode.TreeItem[] = [];
    const scope = this.store.scope();
    if (scope !== undefined) banners.push(new MemoryScopeItem(scope));
    if (this._status === 'unreachable') banners.push(new MemoryUnreachableItem(this._detail));
    if (!Config.memoryEnabled()) banners.push(new MemoryDisabledItem());
    return [...banners, ...groups];
  }

  dispose(): void {
    this._configChangeDisposable.dispose();
    this._storeChangeDisposable.dispose();
    this._onDidChangeTreeData.dispose();
  }
}
