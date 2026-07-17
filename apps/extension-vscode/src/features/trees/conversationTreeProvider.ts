/** Workspace-scoped developer-session history backed by the Rust app-server. */

import * as vscode from 'vscode';
import type { ThreadReadResponse, ThreadSummary } from '@agiworkforce/types';
import { type LocalRuntimeClient } from '../../integrations/localRuntimeClient';
import { type LocalRuntimePool } from '../../integrations/localRuntimePool';
import { getAllWorkspaceFolders } from '../../platform/workspaceFolders';

export class ConversationTreeItem extends vscode.TreeItem {
  constructor(public readonly thread: ThreadSummary) {
    super(thread.title, vscode.TreeItemCollapsibleState.None);
    this.description = formatRelativeTime(Date.parse(thread.updatedAt));
    this.tooltip = `${thread.model ?? 'Configured model'} · ${thread.cwd ?? 'workspace'}`;
    this.iconPath = new vscode.ThemeIcon(thread.status === 'running' ? 'loading~spin' : 'comment');
    this.accessibilityInformation = { label: thread.title, role: 'treeitem' };
    this.contextValue = 'conversation';
    this.command = {
      command: 'agi-workforce.openConversation',
      title: 'Open Developer Session',
      arguments: [thread.id],
    };
  }
}

export class ConversationTreeProvider implements vscode.TreeDataProvider<ConversationTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    ConversationTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private readonly runtimeByThread = new Map<string, LocalRuntimeClient>();

  constructor(private readonly runtimes: LocalRuntimePool) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ConversationTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ConversationTreeItem): Promise<ConversationTreeItem[]> {
    if (element !== undefined) return [];
    return (await this.getThreads()).map((thread) => new ConversationTreeItem(thread));
  }

  async getThreads(): Promise<ThreadSummary[]> {
    const folders = getAllWorkspaceFolders();
    this.runtimeByThread.clear();
    if (folders.length === 0) return [];
    const pages = await Promise.all(
      folders.map(async (folder) => {
        const runtime = this.runtimes.forWorkspace(folder.uri.fsPath);
        try {
          const page = await runtime.listThreads({
            cwd: folder.uri.fsPath,
            limit: 100,
            includeArchived: false,
          });
          for (const thread of page.threads) this.runtimeByThread.set(thread.id, runtime);
          return page.threads;
        } catch (error) {
          console.warn(`[AGI Workforce] failed to list sessions for ${folder.uri.fsPath}`, error);
          return [];
        }
      }),
    );
    return pages.flat().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }

  async readThread(threadId: string): Promise<ThreadReadResponse | undefined> {
    let runtime = this.runtimeByThread.get(threadId);
    if (runtime === undefined) {
      await this.getThreads();
      runtime = this.runtimeByThread.get(threadId);
    }
    return runtime?.readThread(threadId);
  }

  async archiveThread(threadId: string): Promise<boolean> {
    let runtime = this.runtimeByThread.get(threadId);
    if (runtime === undefined) {
      await this.getThreads();
      runtime = this.runtimeByThread.get(threadId);
    }
    if (runtime === undefined) return false;
    await runtime.archiveThread(threadId);
    this.runtimeByThread.delete(threadId);
    this.refresh();
    return true;
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
    this.runtimeByThread.clear();
  }
}

function formatRelativeTime(timestamp: number): string {
  const diff = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}
