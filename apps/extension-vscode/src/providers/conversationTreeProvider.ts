/**
 * conversationTreeProvider.ts — TreeDataProvider for conversation history sidebar
 *
 * Shows past conversations grouped by recency in the AGI Workforce sidebar.
 * Supports refresh, delete, and click-to-load actions.
 */

import * as vscode from 'vscode';
import { type ConversationStore, type StoredConversation } from '../storage/conversationStore';

export class ConversationTreeItem extends vscode.TreeItem {
  constructor(public readonly conversation: StoredConversation) {
    super(conversation.title, vscode.TreeItemCollapsibleState.None);

    this.description = formatRelativeTime(conversation.updatedAt);
    this.tooltip = conversation.messages[0]?.content.slice(0, 120) ?? 'Empty conversation';
    this.iconPath = new vscode.ThemeIcon('comment');
    this.accessibilityInformation = {
      label: conversation.title,
      role: 'treeitem',
    };
    this.contextValue = 'conversation';

    // Clicking a conversation item will open it (command registered in extension.ts)
    this.command = {
      command: 'agi-workforce.openConversation',
      title: 'Open Conversation',
      arguments: [conversation.id],
    };
  }
}

export class ConversationTreeProvider implements vscode.TreeDataProvider<ConversationTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    ConversationTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly store: ConversationStore) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ConversationTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(_element?: ConversationTreeItem): ConversationTreeItem[] {
    if (_element !== undefined) return []; // No sub-items in v1
    return this.store.getAll().map((c) => new ConversationTreeItem(c));
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}
