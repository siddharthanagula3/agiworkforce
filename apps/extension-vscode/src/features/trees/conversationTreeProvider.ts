import * as vscode from 'vscode';
import type { ThreadReadResponse, ThreadSummary } from '@agiworkforce/types';
import {
  CLI_NOT_EXECUTABLE_MARKER,
  CLI_NOT_FOUND_MARKER,
  type LocalRuntimeClient,
} from '../../integrations/localRuntimeClient';
import { type LocalRuntimePool } from '../../integrations/localRuntimePool';
import { isSameWorkspacePath } from '../../integrations/developerSessionValidation';
import { getAllWorkspaceFolders } from '../../platform/workspaceFolders';

export { isSameWorkspacePath } from '../../integrations/developerSessionValidation';

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

const SESSION_LISTING_FAILURE_LABEL = 'Session history unavailable';

export class ConversationTreeErrorItem extends vscode.TreeItem {
  constructor(
    public readonly folderName: string,
    public readonly reason: string,
  ) {
    super(SESSION_LISTING_FAILURE_LABEL, vscode.TreeItemCollapsibleState.None);
    this.description = folderName;
    this.tooltip = new vscode.MarkdownString(
      `${reason}\n\nThe AGI CLI could not list this workspace's developer sessions, so this list is incomplete. Select this item to open runtime setup.`,
    );
    this.iconPath = new vscode.ThemeIcon('warning');
    this.accessibilityInformation = {
      label: `${SESSION_LISTING_FAILURE_LABEL} for ${folderName}: ${reason}`,
      role: 'treeitem',
    };
    this.contextValue = 'conversationListingFailure';
    this.command = {
      command: 'agi-workforce.openSettings',
      title: 'Open Runtime Setup',
      arguments: ['configuration'],
    };
  }
}

export interface ResolvedDeveloperSession {
  response: ThreadReadResponse;
  runtime: LocalRuntimeClient;
  cwd: string;
}

interface SessionListingFailure {
  folderName: string;
  reason: string;
}

export class ConversationTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    vscode.TreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private readonly runtimeByThread = new Map<
    string,
    { runtime: LocalRuntimeClient; cwd: string }
  >();
  private listingFailures: SessionListingFailure[] = [];

  constructor(private readonly runtimes: LocalRuntimePool) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (element !== undefined) return [];
    const threads = await this.getThreads();
    return [
      ...this.listingFailures.map(
        (failure) => new ConversationTreeErrorItem(failure.folderName, failure.reason),
      ),
      ...threads.map((thread) => new ConversationTreeItem(thread)),
    ];
  }

  async getThreads(): Promise<ThreadSummary[]> {
    const folders = getAllWorkspaceFolders();
    this.runtimeByThread.clear();
    this.listingFailures = [];
    if (folders.length === 0) return [];
    const pages = await Promise.all(
      folders.map(async (folder) => {
        try {
          const runtime = this.runtimes.forWorkspace(folder.uri.fsPath);
          const page = await runtime.listThreads({
            cwd: folder.uri.fsPath,
            limit: 100,
            includeArchived: false,
          });
          const ownedThreads = page.threads.filter((thread) => {
            const owned = isSameWorkspacePath(folder.uri.fsPath, thread.cwd);
            if (!owned) {
              console.warn(
                `[AGI Workforce] ignoring developer session ${thread.id} with mismatched workspace metadata`,
              );
            }
            return owned;
          });
          for (const thread of ownedThreads) {
            this.runtimeByThread.set(thread.id, { runtime, cwd: folder.uri.fsPath });
          }
          return ownedThreads;
        } catch (error) {
          console.warn(`[AGI Workforce] failed to list sessions for ${folder.uri.fsPath}`, error);
          this.listingFailures.push({
            folderName: folder.name,
            reason: describeListingFailure(error),
          });
          return [];
        }
      }),
    );
    return pages.flat().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }

  async readThread(threadId: string): Promise<ThreadReadResponse | undefined> {
    return (await this.resolveThread(threadId))?.response;
  }

  async resolveThread(threadId: string): Promise<ResolvedDeveloperSession | undefined> {
    let owner = this.runtimeByThread.get(threadId);
    if (owner === undefined) {
      await this.getThreads();
      owner = this.runtimeByThread.get(threadId);
    }
    if (owner === undefined) return undefined;
    const response = await owner.runtime.readThread(threadId);
    if (response.thread.id !== threadId || !isSameWorkspacePath(owner.cwd, response.thread.cwd)) {
      throw new Error('Developer session ownership metadata does not match the open workspace.');
    }
    return {
      response,
      runtime: owner.runtime,
      cwd: owner.cwd,
    };
  }

  async archiveThread(threadId: string): Promise<boolean> {
    let owner = this.runtimeByThread.get(threadId);
    if (owner === undefined) {
      await this.getThreads();
      owner = this.runtimeByThread.get(threadId);
    }
    if (owner === undefined) return false;
    await owner.runtime.archiveThread(threadId);
    this.runtimeByThread.delete(threadId);
    this.refresh();
    return true;
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
    this.runtimeByThread.clear();
  }
}

const LISTING_FAILURE_REASON_MAX_LENGTH = 240;
const LISTING_FAILURE_MARKERS = [CLI_NOT_FOUND_MARKER, CLI_NOT_EXECUTABLE_MARKER] as const;

function describeListingFailure(error: unknown): string {
  const raw = error instanceof Error ? error.message.trim() : String(error).trim();
  if (raw === '') return 'The AGI CLI did not report why the listing failed.';
  const marker = LISTING_FAILURE_MARKERS.find((candidate) => raw.startsWith(`${candidate}: `));
  const message = marker === undefined ? raw : raw.slice(marker.length + 2);
  return message.length <= LISTING_FAILURE_REASON_MAX_LENGTH
    ? message
    : `${message.slice(0, LISTING_FAILURE_REASON_MAX_LENGTH - 1)}…`;
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
